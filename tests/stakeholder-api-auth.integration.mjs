import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { createSessionToken, SESSION_COOKIE } from "../src/lib/security/session.mjs";

const port = Number(process.env.MODRIK_E2E_PORT || 3187);
const baseUrl = `http://127.0.0.1:${port}`;
const childEnv = { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1" };
const child = spawn(process.execPath, [".next/standalone/server.js"], { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
const prisma = new PrismaClient();
let logs = "";
let browserDiagnostics = { pageErrors: [], failedRequests: [], projectApi: [], pageText: "" };
child.stdout.on("data", chunk => { logs += chunk.toString(); });
child.stderr.on("data", chunk => { logs += chunk.toString(); });
const projectIds = [randomUUID(), randomUUID()];
const secret = process.env.MODRIK_AUTH_SECRET;
const ownerCookie = `${SESSION_COOKIE}=${createSessionToken(process.env.MODRIK_ADMIN_EMAIL, secret)}`;
const headers = { cookie: ownerCookie, "content-type": "application/json" };

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Next server exited early.\n${logs}`);
    try { const response = await fetch(baseUrl); if (response.status < 500) return; } catch {}
    await delay(500);
  }
  throw new Error(`Next server did not become ready.\n${logs}`);
}
async function request(projectId, method, body) {
  return fetch(`${baseUrl}/api/projects/${projectId}/stakeholders`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function json(response) { return response.json(); }
async function expectStatus(response, expected, label) {
  if (response.status !== expected) throw new Error(`${label}: expected HTTP ${expected}, received ${response.status}: ${await response.text()}\n--- server logs ---\n${logs.slice(-12000)}`);
}
async function createStakeholder(projectId, suffix, approvalRole = "consulted", engagementStatus = "active") {
  const response = await request(projectId, "POST", {
    action: "create_stakeholder", stakeholderRef: `ST-${suffix}`,
    displayName: `Stakeholder ${suffix}`, role: "Reviewer", approvalRole, engagementStatus,
  });
  await expectStatus(response, 201, "create stakeholder");
  return (await json(response)).stakeholder;
}

try {
  await waitForServer();
  const unauthorizedEndpoint = `${baseUrl}/api/projects/phase-4-auth-probe/stakeholders`;
  for (const [label, send] of [
    ["GET", () => fetch(unauthorizedEndpoint)],
    ["POST", () => fetch(unauthorizedEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })],
    ["PATCH", () => fetch(unauthorizedEndpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" })],
    ["forged cookie", () => fetch(unauthorizedEndpoint, { headers: { cookie: `${SESSION_COOKIE}=forged.payload` } })],
  ]) {
    const response = await send();
    assert.equal(response.status, 401, `${label} must reject unauthenticated collaboration access`);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.match((await json(response)).error, /authentication required|owner session/i);
  }

  const [projectA, projectB] = projectIds;
  await prisma.project.create({ data: { id: projectA, name: "Phase 4 integration A", brief: "Test project A", currentStage: "CONFLICTS" } });
  await prisma.project.create({ data: { id: projectB, name: "Phase 4 integration B", brief: "Test project B" } });
  const requirement = await prisma.requirement.create({ data: { projectId: projectA, refId: "REQ-INT-1", text: "A testable requirement." } });
  const foreignRequirement = await prisma.requirement.create({ data: { projectId: projectB, refId: "REQ-INT-2", text: "A separate project requirement." } });

  const approver = await createStakeholder(projectA, "A1", "decision_maker");
  const second = await createStakeholder(projectA, "A2", "approver");
  const pending = await createStakeholder(projectA, "A3", "consulted", "pending");
  const foreign = await createStakeholder(projectB, "B1", "approver");

  const foreignParticipantAttempt = await request(projectA, "POST", {
    action: "create_negotiation", requirementId: requirement.id, title: "Cross-project isolation",
    participants: [{ stakeholderId: approver.id }, { stakeholderId: foreign.id }],
    options: [{ id: "a", label: "A", implications: "A impact" }, { id: "b", label: "B", implications: "B impact" }],
  });
  assert.equal(foreignParticipantAttempt.status, 404, "foreign project stakeholder must not join");
  const pendingParticipantAttempt = await request(projectA, "POST", {
    action: "create_negotiation", requirementId: requirement.id, title: "Inactive participant isolation",
    participants: [{ stakeholderId: approver.id }, { stakeholderId: pending.id }],
    options: [{ id: "a", label: "A", implications: "A impact" }, { id: "b", label: "B", implications: "B impact" }],
  });
  assert.equal(pendingParticipantAttempt.status, 404, "pending stakeholder must not join");
  const foreignRequirementAttempt = await request(projectA, "POST", {
    action: "create_negotiation", requirementId: foreignRequirement.id, title: "Foreign requirement",
    participants: [{ stakeholderId: approver.id }, { stakeholderId: second.id }],
    options: [{ id: "a", label: "A", implications: "A impact" }, { id: "b", label: "B", implications: "B impact" }],
  });
  assert.equal(foreignRequirementAttempt.status, 404, "foreign requirement must not be referenced");

  const create = await request(projectA, "POST", {
    action: "create_negotiation", requirementId: requirement.id, title: "Concurrent decision test",
    participants: [{ stakeholderId: approver.id, role: "approver" }, { stakeholderId: second.id, role: "consulted" }],
    options: [{ id: "a", label: "Option A", implications: "A implications" }, { id: "b", label: "Option B", implications: "B implications" }],
  });
  await expectStatus(create, 201, "create negotiation");
  const negotiation = (await json(create)).negotiation;
  const participants = negotiation.participants;
  assert.equal(participants.length, 2);

  const firstResponse = await request(projectA, "PATCH", {
    action: "respond_negotiation", negotiationId: negotiation.id, participantId: participants[0].id,
    responseStatus: "supports", responseOptionId: "a", rationale: "Option A meets the stated need.",
  });
  await expectStatus(firstResponse, 201, "first participant response");

  // Compete the final participant response against approval. If approval wins,
  // the participant write must observe the closed parent and return 409.
  const [lastResponse, approval] = await Promise.all([
    request(projectA, "PATCH", {
      action: "respond_negotiation", negotiationId: negotiation.id, participantId: participants[1].id,
      responseStatus: "supports", responseOptionId: "a", rationale: "Option A is acceptable.",
    }),
    request(projectA, "PATCH", {
      action: "decide_negotiation", negotiationId: negotiation.id, status: "approved",
      chosenOption: "a", rationale: "The decision maker supports option A.",
    }),
  ]);
  assert.ok([201, 409].includes(lastResponse.status), `Unexpected concurrent response status: ${lastResponse.status}`);
  assert.ok([200, 409].includes(approval.status), `Unexpected concurrent decision status: ${approval.status}`);
  assert.ok(!(approval.status === 200 && lastResponse.status === 409), "approval cannot succeed while the final participant response was rejected");

  const finalState = await prisma.negotiationDecision.findUnique({
    where: { id: negotiation.id }, include: { participants: true },
  });
  if (finalState.status === "approved") {
    assert.ok(finalState.participants.every(p => p.responseStatus !== "pending"), "approved negotiation must have no pending participants");
  }
  const isolatedRead = await request(projectB, "GET");
  assert.equal(isolatedRead.status, 200);
  const isolatedBody = await json(isolatedRead);
  assert.equal(isolatedBody.stakeholders.length, 1);
  assert.equal(isolatedBody.stakeholders[0].id, foreign.id);
  // Verify the same HTTP project index used by the client before involving
  // React/Playwright. This separates persistence/API failures from UI rendering.
  const projectIndexResponse = await fetch(`${baseUrl}/api/projects`, { headers });
  await expectStatus(projectIndexResponse, 200, "project index API");
  const projectIndex = await json(projectIndexResponse);
  assert.ok(projectIndex.projects.some(project => project.id === projectA), "project index API must expose the seeded project");

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: SESSION_COOKIE, value: createSessionToken(process.env.MODRIK_ADMIN_EMAIL, secret), url: baseUrl }]);
    const page = await context.newPage();

    page.on("pageerror", error => browserDiagnostics.pageErrors.push(error.message));
    page.on("requestfailed", request => browserDiagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on("response", response => {
      if (response.url().includes("/api/projects")) browserDiagnostics.projectApi.push({ url: response.url(), status: response.status() });
    });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const missionCard = page.getByRole("button", { name: "Open mission Phase 4 integration A" });
    try {
      await missionCard.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      browserDiagnostics.pageText = (await page.locator("body").innerText()).slice(0, 5000);
      throw new Error(`Seeded project exists through API but is not rendered in Mission Control. Browser diagnostics: ${JSON.stringify(browserDiagnostics)}. Server logs: ${logs.slice(-12000)}`);
    }
    await missionCard.click();
    await page.getByText("Stakeholder collaboration", { exact: true }).waitFor();

    await page.getByLabel("Negotiation title").fill("Browser-driven stakeholder negotiation");
    await page.getByRole("combobox", { name: "Negotiation requirement" }).click();
    await page.getByRole("option", { name: "REQ-INT-1" }).click();
    await page.getByRole("textbox", { name: "Option A", exact: true }).fill("Keep the audit trail");
    await page.getByLabel("Implications of option A").fill("Higher retention cost; stronger traceability");
    await page.getByRole("textbox", { name: "Option B", exact: true }).fill("Reduce retention");
    await page.getByLabel("Implications of option B").fill("Lower cost; weaker historical traceability");
    await page.getByLabel("Stakeholder A1").check();
    await page.getByLabel("Stakeholder A2").check();
    await page.getByRole("button", { name: "Create negotiation" }).click();
    await page.getByText("Browser-driven stakeholder negotiation", { exact: true }).waitFor();

    for (const stakeholderName of ["Stakeholder A1", "Stakeholder A2"]) {
      const participantCard = page.locator("div.rounded-md.border").filter({ hasText: stakeholderName }).filter({ has: page.getByRole("button", { name: "Submit response" }) });
      await participantCard.getByLabel("Participant response rationale").fill("I support option A because it preserves auditability.");
      await participantCard.getByRole("button", { name: "Submit response" }).click();
      await participantCard.getByRole("button", { name: "Submit response" }).waitFor({ state: "detached" });
    }

    await page.getByLabel("Decision rationale").fill("The decision makers support the traceable retention option.");
    const optionA = page.getByText("Keep the audit trail", { exact: true }).locator("..");
    await optionA.getByRole("button", { name: "Select this option" }).click();
    await page.getByText("approved", { exact: true }).last().waitFor();

    const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.equal(noHorizontalOverflow, true, "390px mobile viewport must not introduce horizontal page overflow");

    await page.getByRole("button", { name: "Toggle language" }).click();
    const collaborationSection = page.locator('section[dir="rtl"]').filter({ hasText: "التعاون مع أصحاب المصلحة" });
    await collaborationSection.waitFor();
    await page.getByRole("textbox", { name: "الاسم المعروض" }).waitFor();
    await context.close();
  } finally {
    await browser.close();
  }
  process.stdout.write("Stakeholder API integration: auth 4/4; project isolation 3/3; negotiation race invariant passed; browser negotiation E2E + 390px RTL/mobile checks passed.\\n");
} catch (error) {
  await writeFile("/tmp/modrik-phase4-e2e-diagnostics.json", JSON.stringify({ error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error), browserDiagnostics, serverLogs: logs.slice(-30000) }, null, 2));
  throw error;
} finally {
  for (const id of projectIds) {
    try { await prisma.project.delete({ where: { id } }); } catch {}
  }
  await prisma.$disconnect();
  child.kill("SIGTERM");
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(5000)]);
}
