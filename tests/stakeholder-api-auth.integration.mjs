import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID, scryptSync } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { createSessionToken, createIdentitySessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS } from "../src/lib/security/session.mjs";

const bootstrapSalt = Buffer.alloc(16, 7);
process.env.MODRIK_ADMIN_PASSWORD_HASH = "$scrypt$16384$8$1$" + bootstrapSalt.toString("hex") + "$" + scryptSync("Integration-Owner-Password-42!", bootstrapSalt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");
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
const identityCleanup = { projects: [], users: [], organizations: [] };
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

  // Exercise the global Next.js proxy boundary, not only route-local guards.
  // All application APIs must fail closed without the owner cookie; only the
  // deliberately narrow auth and participant endpoints remain public.
  for (const [label, send] of [
    ["project index", () => fetch(`${baseUrl}/api/projects`)],
    ["telemetry", () => fetch(`${baseUrl}/api/telemetry`)],
    ["project detail", () => fetch(`${baseUrl}/api/projects/proxy-auth-probe`)],
    ["project creation", () => fetch(`${baseUrl}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "unauthorized" }) })],
    ["evidence mutation", () => fetch(`${baseUrl}/api/projects/proxy-auth-probe/evidence`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })],
  ]) {
    const response = await send();
    assert.equal(response.status, 401, `${label} must be protected by the global proxy`);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal((await json(response)).code, "AUTH_REQUIRED");
  }

  const publicSession = await fetch(`${baseUrl}/api/auth/session`);
  await expectStatus(publicSession, 200, "public auth session status");
  assert.deepEqual(await json(publicSession), { configured: true, authenticated: false });
  const publicLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "wrong@example.invalid", password: "wrong" }),
  });
  await expectStatus(publicLogin, 401, "public login endpoint");
  const publicStudy = await fetch(`${baseUrl}/api/study/respond`);
  await expectStatus(publicStudy, 401, "public study endpoint must require its own bearer token");

  const crossOriginLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.example" },
    body: JSON.stringify({ email: process.env.MODRIK_ADMIN_EMAIL, password: "Integration-Owner-Password-42!" }),
  });
  await expectStatus(crossOriginLogin, 403, "cross-origin login rejection");

  const bootstrapLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: process.env.MODRIK_ADMIN_EMAIL, password: "Integration-Owner-Password-42!" }),
  });
  await expectStatus(bootstrapLogin, 200, "configured owner identity bootstrap login");
  const loginCookie = bootstrapLogin.headers.get("set-cookie")?.match(/modrik_session=([^;]+)/)?.[1];
  assert.ok(loginCookie, "successful login must issue an HttpOnly session cookie");
  const bootstrapSessionStatus = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: `modrik_session=${loginCookie}` } });
  await expectStatus(bootstrapSessionStatus, 200, "bootstrapped identity session status");
  const bootstrapStatus = await json(bootstrapSessionStatus);
  assert.equal(bootstrapStatus.authenticated, true);
  assert.equal(bootstrapStatus.role, "owner");
  const bootstrapUser = await prisma.user.findUnique({ where: { email: process.env.MODRIK_ADMIN_EMAIL.toLowerCase() } });
  assert.ok(bootstrapUser, "owner login must provision a database user");
  identityCleanup.users.push(bootstrapUser.id);
  const bootstrapOrganization = await prisma.organization.findUnique({ where: { slug: "modrik-default" } });
  assert.ok(bootstrapOrganization, "owner login must provision the default organization");
  identityCleanup.organizations.push(bootstrapOrganization.id);
  const bootstrapProject = await fetch(`${baseUrl}/api/projects`, {
    method: "POST",
    headers: { cookie: `modrik_session=${loginCookie}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "Bootstrap-owned project", brief: "Identity context test" }),
  });
  await expectStatus(bootstrapProject, 201, "identity-backed project creation");
  const bootstrapProjectBody = (await json(bootstrapProject)).project;
  identityCleanup.projects.push(bootstrapProjectBody.id);
  assert.equal(bootstrapProjectBody.organizationId, bootstrapOrganization.id);
  assert.equal(bootstrapProjectBody.createdByUserId, bootstrapUser.id);
  const crossOriginLogout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST", headers: { cookie: `modrik_session=${loginCookie}`, origin: "https://attacker.example" },
  });
  await expectStatus(crossOriginLogout, 403, "cross-origin logout rejection");
  const bootstrapLogout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST", headers: { cookie: `modrik_session=${loginCookie}`, origin: baseUrl },
  });
  await expectStatus(bootstrapLogout, 200, "bootstrap owner logout");
  const bootstrapRevokedStatus = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: `modrik_session=${loginCookie}` } });
  assert.equal((await json(bootstrapRevokedStatus)).authenticated, false);
  // Identity-backed session + tenant boundary integration.
  const tenantA = await prisma.organization.create({ data: { name: "Identity Tenant A", slug: `identity-a-${randomUUID()}` } });
  identityCleanup.organizations.push(tenantA.id);
  const tenantB = await prisma.organization.create({ data: { name: "Identity Tenant B", slug: `identity-b-${randomUUID()}` } });
  identityCleanup.organizations.push(tenantB.id);
  const identityUser = await prisma.user.create({ data: { email: `identity-owner-${randomUUID()}@example.invalid`, status: "active" } });
  identityCleanup.users.push(identityUser.id);
  const identityMembership = await prisma.membership.create({
    data: { userId: identityUser.id, organizationId: tenantA.id, role: "owner", status: "active", activatedAt: new Date() },
  });
  const identitySessionId = randomUUID().replaceAll("-", "");
  await prisma.authSession.create({
    data: { id: identitySessionId, userId: identityUser.id, membershipId: identityMembership.id, expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) },
  });
  const identityCookie = `${SESSION_COOKIE}=${createIdentitySessionToken({
    email: identityUser.email, userId: identityUser.id, organizationId: tenantA.id,
    membershipId: identityMembership.id, role: "owner", sessionId: identitySessionId,
  }, secret)}`;
  const tenantProjectA = await prisma.project.create({ data: { name: "Tenant A private", brief: "A", organizationId: tenantA.id, createdByUserId: identityUser.id } });
  identityCleanup.projects.push(tenantProjectA.id);
  const tenantProjectB = await prisma.project.create({ data: { name: "Tenant B private", brief: "B", organizationId: tenantB.id } });
  identityCleanup.projects.push(tenantProjectB.id);
  const tenantDemoB = await prisma.project.create({ data: { name: "Tenant B demo", brief: "private demo", organizationId: tenantB.id, isDemo: true } });
  identityCleanup.projects.push(tenantDemoB.id);
  const tenantHeaders = { cookie: identityCookie, "content-type": "application/json" };
  const identitySessionStatus = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: identityCookie } });
  await expectStatus(identitySessionStatus, 200, "identity session status");
  const identityStatusBody = await json(identitySessionStatus);
  assert.equal(identityStatusBody.authenticated, true);
  assert.equal(identityStatusBody.organizationId, tenantA.id);
  assert.equal(identityStatusBody.role, "owner");

  const tenantIndex = await fetch(`${baseUrl}/api/projects`, { headers: tenantHeaders });
  await expectStatus(tenantIndex, 200, "identity tenant project index");
  const tenantIndexBody = await json(tenantIndex);
  assert.deepEqual(tenantIndexBody.projects.map(project => project.id), [tenantProjectA.id], "project index must be tenant-scoped");
  const ownTenantProject = await fetch(`${baseUrl}/api/projects/${tenantProjectA.id}`, { headers: tenantHeaders });
  await expectStatus(ownTenantProject, 200, "same-tenant project access");
  const foreignTenantProject = await fetch(`${baseUrl}/api/projects/${tenantProjectB.id}`, { headers: tenantHeaders });
  await expectStatus(foreignTenantProject, 404, "cross-tenant project access must be hidden");
  const tenantCreate = await fetch(`${baseUrl}/api/projects`, {
    method: "POST", headers: tenantHeaders, body: JSON.stringify({ name: "Tenant A created", brief: "scoped" }),
  });
  await expectStatus(tenantCreate, 201, "tenant-scoped project creation");
  const createdTenantProject = (await json(tenantCreate)).project;
  identityCleanup.projects.push(createdTenantProject.id);
  assert.equal(createdTenantProject.organizationId, tenantA.id);
  assert.equal(createdTenantProject.createdByUserId, identityUser.id);
  const tenantDemoLookup = await fetch(`${baseUrl}/api/demo`, { headers: tenantHeaders });
  await expectStatus(tenantDemoLookup, 200, "tenant demo lookup");
  assert.equal((await json(tenantDemoLookup)).projectId, null, "demo lookup must not reveal another tenant's demo");
  const tenantTelemetry = await fetch(`${baseUrl}/api/telemetry`, { headers: tenantHeaders });
  await expectStatus(tenantTelemetry, 200, "tenant telemetry");
  assert.equal((await json(tenantTelemetry)).fleet.missions, 2, "telemetry must count only this tenant's projects");

  const viewerUser = await prisma.user.create({ data: { email: `identity-viewer-${randomUUID()}@example.invalid`, status: "active" } });
  identityCleanup.users.push(viewerUser.id);
  const viewerMembership = await prisma.membership.create({
    data: { userId: viewerUser.id, organizationId: tenantA.id, role: "viewer", status: "active", activatedAt: new Date() },
  });
  const viewerSessionId = randomUUID().replaceAll("-", "");
  await prisma.authSession.create({
    data: { id: viewerSessionId, userId: viewerUser.id, membershipId: viewerMembership.id, expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) },
  });
  const viewerCookie = `${SESSION_COOKIE}=${createIdentitySessionToken({
    email: viewerUser.email, userId: viewerUser.id, organizationId: tenantA.id,
    membershipId: viewerMembership.id, role: "viewer", sessionId: viewerSessionId,
  }, secret)}`;
  const viewerCreate = await fetch(`${baseUrl}/api/projects`, {
    method: "POST", headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Forbidden viewer project", brief: "must not be created" }),
  });
  await expectStatus(viewerCreate, 403, "viewer cannot create projects");
  const viewerTelemetry = await fetch(`${baseUrl}/api/telemetry`, { headers: { cookie: viewerCookie } });
  await expectStatus(viewerTelemetry, 403, "viewer cannot read audit telemetry");
  await prisma.user.update({ where: { id: viewerUser.id }, data: { status: "disabled" } });
  const disabledViewer = await fetch(`${baseUrl}/api/projects`, { headers: { cookie: viewerCookie } });
  await expectStatus(disabledViewer, 401, "disabled user session must be rejected");
  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: identityCookie, origin: baseUrl },
  });
  await expectStatus(logoutResponse, 200, "identity logout");
  const revokedSessionRequest = await fetch(`${baseUrl}/api/projects`, { headers: tenantHeaders });
  await expectStatus(revokedSessionRequest, 401, "revoked identity session must be rejected");
  const revokedSessionStatus = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: identityCookie } });
  await expectStatus(revokedSessionStatus, 200, "revoked session status");
  assert.equal((await json(revokedSessionStatus)).authenticated, false);

  const unauthorizedEndpoint = `${baseUrl}/api/projects/phase-4-auth-probe/stakeholders`;
  for (const [label, send] of [
    ["GET", () => fetch(unauthorizedEndpoint)],
    ["POST", () => fetch(unauthorizedEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })],
    ["PATCH", () => fetch(unauthorizedEndpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" })],
    ["forged cookie", () => fetch(unauthorizedEndpoint, { headers: { cookie: `${SESSION_COOKIE}=forged.payload` } })],
    ["cross-origin mutation", () => fetch(unauthorizedEndpoint, {
      method: "POST",
      headers: { ...headers, origin: "https://attacker.example" },
      body: JSON.stringify({}),
    })],
  ]) {
    const response = await send();
    assert.equal(response.status, label === "cross-origin mutation" ? 403 : 401, `${label} must be rejected at the expected security boundary`);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    const body = await json(response);
    assert.match(
      body.error,
      label === "cross-origin mutation" ? /cross-origin state change rejected/i : /authentication required|owner session/i
    );
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
    page.on("response", async response => {
      if (response.url().includes("/api/projects")) {
        const requestHeaders = await response.request().allHeaders();
        browserDiagnostics.projectApi.push({
          url: response.url(),
          status: response.status(),
          origin: requestHeaders.origin ?? null,
          host: requestHeaders.host ?? null,
          secFetchSite: requestHeaders["sec-fetch-site"] ?? null,
          responseBody: response.status() >= 400 ? (await response.text().catch(() => "")).slice(0, 2000) : undefined,
        });
      }
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
    await page.getByText("Browser-driven stakeholder negotiation", { exact: false }).waitFor();

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
  for (const id of [...projectIds, ...identityCleanup.projects]) {
    try { await prisma.project.delete({ where: { id } }); } catch {}
  }
  for (const id of identityCleanup.organizations) { try { await prisma.organization.delete({ where: { id } }); } catch {} }
  for (const id of identityCleanup.users) { try { await prisma.user.delete({ where: { id } }); } catch {} }
  await prisma.$disconnect();
  child.kill("SIGTERM");
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(5000)]);
}
