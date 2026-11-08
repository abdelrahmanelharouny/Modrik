import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { createHash, randomUUID, scryptSync } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import { createSessionToken, createIdentitySessionToken, SESSION_COOKIE, SESSION_TTL_SECONDS, verifyPasswordHash } from "../src/lib/security/session.mjs";
import { createPasswordResetToken, hashPasswordResetToken } from "../src/lib/security/password-reset.mjs";

const bootstrapSalt = Buffer.alloc(16, 7);
process.env.MODRIK_ADMIN_PASSWORD_HASH = "$scrypt$16384$8$1$" + bootstrapSalt.toString("hex") + "$" + scryptSync("Integration-Owner-Password-42!", bootstrapSalt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");
const port = Number(process.env.MODRIK_E2E_PORT || 3187);
const baseUrl = `http://127.0.0.1:${port}`;

function mockAgentCompletion(prompt) {
  if (prompt.includes("A requirements project just completed.")) {
    return { glossary: [{ term: "Approval owner", definition: "The person accountable for a workflow decision." }], lessons: [{ term: "Retain provenance", detail: "Keep every approved requirement linked to its source evidence." }] };
  }
  if (prompt.includes("You are the VERIFIER in a propose-verify requirements pipeline.")) {
    return { verdicts: Array.from({ length: 8 }, (_, i) => ({ refId: `REQ-${String(i + 1).padStart(2, "0")}`, verdict: "supported", note: "Directly supported by the cited interview evidence." })) };
  }
  if (prompt.includes("TASK: Generate") && prompt.includes("candidate clarifying questions")) {
    return { questions: Array.from({ length: 12 }, (_, i) => ({ text: `Which operational constraint ${i + 1} must the approval workflow respect?`, rationale: "Clarifies a downstream implementation constraint.", priority: i < 3 ? "high" : "medium", askCost: 2, fallbackAssumption: "Assume the operations lead owns this decision.", language: "en" })) };
  }
  if (prompt.includes("CANDIDATE QUESTIONS TO SCORE:")) {
    return { scores: Array.from({ length: 12 }, (_, i) => ({ index: i + 1, infoGain: 4, impact: 4, uncertainty: 4, risk: 3 })) };
  }
  if (prompt.includes("QUESTION SET UNDER EVALUATION:")) {
    return { evidenceCoverage: 90, redundancyRate: 5, dialectFit: 100 };
  }
  if (prompt.includes("TASK: Propose 3-4 candidate problem statements")) {
    return { candidates: [
      { title: "Slow manual approvals", description: "Requests wait for manual routing and ownership confirmation.", evidenceCodes: ["E-AGENT-01"], suggestedImpact: 4, suggestedEffort: 2 },
      { title: "Missing approval history", description: "Teams cannot consistently inspect previous decisions.", evidenceCodes: ["E-AGENT-01"], suggestedImpact: 3, suggestedEffort: 2 },
      { title: "Unclear request ownership", description: "Requests can arrive without an accountable owner.", evidenceCodes: ["E-AGENT-01"], suggestedImpact: 4, suggestedEffort: 3 },
    ] };
  }
  if (prompt.includes("TASK: Extract 8-12 atomic requirements")) {
    return { requirements: Array.from({ length: 8 }, (_, i) => ({
      text: `The system shall record approval decision ${i + 1} with its responsible operations lead.`,
      type: "functional", priority: i < 5 ? "Must" : "Should", evidenceCodes: ["E-AGENT-01"], confidence: 92, language: "en",
    })) };
  }
  if (prompt.includes("TASK: Score each requirement for ambiguity")) {
    return { assessments: Array.from({ length: 8 }, (_, i) => ({ refId: `REQ-${String(i + 1).padStart(2, "0")}`, score: 12, issues: "No material ambiguity detected.", suggestion: "" })) };
  }
  if (prompt.includes("TASK: Write one user story per requirement")) {
    return { stories: Array.from({ length: 8 }, (_, i) => ({
      refId: `REQ-${String(i + 1).padStart(2, "0")}`, title: `Record approval decision ${i + 1}`,
      narrative: "As an operations lead, I want the approval decision recorded so that the team can audit the workflow.",
      acceptance: ["Given a pending request when the operations lead approves it then the decision is recorded."],
      investScore: 88, investNote: "Independent, testable and valuable.",
    })) };
  }
  if (prompt.includes("TASK: Cross-check all requirement pairs")) return { conflicts: [] };
  throw new Error(`Unexpected mock LLM prompt: ${prompt.slice(0, 240)}`);
}

const mockProvider = createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  try {
    const payload = JSON.parse(raw);
    const prompt = (payload.messages ?? []).map(message => String(message.content ?? "")).join("\\n");
    const content = JSON.stringify(mockAgentCompletion(prompt));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content } }] }));
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
  }
});
await new Promise((resolve, reject) => {
  mockProvider.once("error", reject);
  mockProvider.listen(0, "127.0.0.1", resolve);
});
const mockProviderPort = mockProvider.address().port;

const childEnv = {
  ...process.env,
  PORT: String(port),
  HOSTNAME: "127.0.0.1",
  APP_URL: "https://modrik.example.invalid",
  UPSTASH_REDIS_REST_URL: "https://upstash-ci.invalid",
  UPSTASH_REDIS_REST_TOKEN: "ci-only-mock-token",
  RP_LLM_PROVIDER: "local",
  RP_LOCAL_BASE_URL: `http://127.0.0.1:${mockProviderPort}/v1`,
  RP_LOCAL_MODEL: "modrik-ci-agent-fixture",
  NODE_OPTIONS: [process.env.NODE_OPTIONS, "--import=./tests/support/mock-upstash-rest.mjs"].filter(Boolean).join(" "),
};
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

  // Public deployment readiness is read-only, checks the actual database
  // connection, and returns no infrastructure details to unauthenticated callers.
  const readiness = await fetch(`${baseUrl}/api/health`);
  await expectStatus(readiness, 200, "public database readiness probe");
  assert.deepEqual(await json(readiness), { status: "ok" });
  assert.equal(readiness.headers.get("cache-control"), "no-store, max-age=0");
  const readinessHead = await fetch(`${baseUrl}/api/health`, { method: "HEAD" });
  await expectStatus(readinessHead, 200, "HEAD database readiness probe");
  const readinessMutation = await fetch(`${baseUrl}/api/health`, { method: "POST" });
  await expectStatus(readinessMutation, 401, "readiness endpoint must not permit unauthenticated mutation");

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


  // Password recovery: token is hashed, single-use, short-lived, and revokes sessions.
  const resetUser = await prisma.user.create({
    data: { email: `password-reset-${randomUUID()}@example.invalid`, passwordHash: process.env.MODRIK_ADMIN_PASSWORD_HASH, status: "active" },
  });
  identityCleanup.users.push(resetUser.id);
  const resetMembership = await prisma.membership.create({
    data: { userId: resetUser.id, organizationId: tenantA.id, role: "viewer", status: "active" },
  });
  const resetSessionId = randomUUID().replaceAll("-", "");
  await prisma.authSession.create({
    data: { id: resetSessionId, userId: resetUser.id, membershipId: resetMembership.id, expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) },
  });
  const resetCookie = `${SESSION_COOKIE}=${createIdentitySessionToken({
    email: resetUser.email, userId: resetUser.id, organizationId: tenantA.id,
    membershipId: resetMembership.id, role: "viewer", sessionId: resetSessionId,
  }, secret)}`;
  const resetToken = createPasswordResetToken();
  const resetTokenHash = hashPasswordResetToken(resetToken);
  const resetRecord = await prisma.passwordResetToken.create({
    data: { userId: resetUser.id, tokenHash: resetTokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
  });
  const otherResetToken = createPasswordResetToken();
  const otherResetRecord = await prisma.passwordResetToken.create({
    data: { userId: resetUser.id, tokenHash: hashPasswordResetToken(otherResetToken), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
  });
  assert.notEqual(resetRecord.tokenHash, resetToken);
  const resetComplete = await fetch(`${baseUrl}/api/auth/password-reset/complete`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: "Recovered-Password-2026!" }),
  });
  await expectStatus(resetComplete, 200, "complete password reset");
  const resetUserAfter = await prisma.user.findUnique({ where: { id: resetUser.id } });
  assert.equal(await verifyPasswordHash("Recovered-Password-2026!", resetUserAfter.passwordHash), true);
  const usedReset = await prisma.passwordResetToken.findUnique({ where: { id: resetRecord.id } });
  assert.ok(usedReset.usedAt);
  const otherResetAfter = await prisma.passwordResetToken.findUnique({ where: { id: otherResetRecord.id } });
  assert.ok(otherResetAfter.revokedAt, "successful reset revokes every other outstanding reset token");
  const revokedResetSession = await fetch(`${baseUrl}/api/projects`, { headers: { cookie: resetCookie } });
  await expectStatus(revokedResetSession, 401, "password reset revokes previous sessions");
  const replayReset = await fetch(`${baseUrl}/api/auth/password-reset/complete`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: resetToken, password: "Another-Replay-Password-2026!" }),
  });
  assert.equal(replayReset.status, 400, "password reset token cannot be reused");

  // Organization invitation lifecycle: authorized issuance, hashed one-time token,
  // password bootstrap for new accounts, atomic acceptance, session issuance and revocation.
  const inviteEmail = `invitee-${randomUUID()}@example.invalid`;
  const createInvitation = await fetch(`${baseUrl}/api/invitations`, {
    method: "POST", headers: tenantHeaders,
    body: JSON.stringify({ email: inviteEmail, role: "viewer" }),
  });
  await expectStatus(createInvitation, 201, "create organization invitation");
  const invitationPayload = await json(createInvitation);
  assert.equal(invitationPayload.delivery, "manual");
  assert.match(invitationPayload.inviteUrl, /^https:\/\/modrik\.example\.invalid\/invite\/accept\?token=/);
  const invitationToken = new URL(invitationPayload.inviteUrl).searchParams.get("token");
  assert.ok(invitationToken);
  const invitationHash = createHash("sha256").update(invitationToken, "utf8").digest("hex");
  const storedInvitation = await prisma.organizationInvitation.findUnique({ where: { id: invitationPayload.invitation.id } });
  assert.equal(storedInvitation.tokenHash, invitationHash);
  assert.notEqual(storedInvitation.tokenHash, invitationToken);
  const invitedUser = await prisma.user.findUnique({ where: { email: inviteEmail } });
  assert.ok(invitedUser);
  identityCleanup.users.push(invitedUser.id);
  const invitedMembership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: invitedUser.id, organizationId: tenantA.id } },
  });
  assert.equal(invitedMembership.status, "invited");
  const shortPassword = await fetch(`${baseUrl}/api/auth/invitations/accept`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: invitationToken, password: "too-short" }),
  });
  await expectStatus(shortPassword, 400, "reject weak invitation password");
  const crossOriginAccept = await fetch(`${baseUrl}/api/auth/invitations/accept`, {
    method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" },
    body: JSON.stringify({ token: invitationToken, password: "Invitation-Password-2026!" }),
  });
  await expectStatus(crossOriginAccept, 403, "cross-origin invitation acceptance rejected");
  const competingAccepts = await Promise.all([1, 2].map(() => fetch(`${baseUrl}/api/auth/invitations/accept`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: invitationToken, password: "Invitation-Password-2026!", displayName: "Invited Member" }),
  })));
  const acceptedInvitation = competingAccepts.find((response) => response.status === 200);
  const losingAccept = competingAccepts.find((response) => response.status !== 200);
  assert.ok(acceptedInvitation, "exactly one concurrent invitation acceptance must succeed");
  assert.ok(losingAccept && [400, 409].includes(losingAccept.status), "competing invitation acceptance must be rejected");
  const invitedSessionCookie = acceptedInvitation.headers.get("set-cookie")?.match(/modrik_session=([^;]+)/)?.[1];
  assert.ok(invitedSessionCookie, "accepted invitation must issue an HttpOnly session");
  const acceptedBody = await json(acceptedInvitation);
  assert.equal(acceptedBody.email, inviteEmail);
  assert.equal(acceptedBody.role, "viewer");

  // Existing accounts keep their password when joining another organization.
  const existingPassword = "Existing-Account-Password-2026!";
  const existingSalt = Buffer.alloc(16, 9);
  const existingHash = "$scrypt$16384$8$1$" + existingSalt.toString("hex") + "$" + scryptSync(existingPassword, existingSalt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex");
  const existingInvitee = await prisma.user.create({
    data: { email: `existing-invitee-${randomUUID()}@example.invalid`, passwordHash: existingHash, status: "active" },
  });
  identityCleanup.users.push(existingInvitee.id);
  const existingInviteResponse = await fetch(`${baseUrl}/api/invitations`, {
    method: "POST", headers: tenantHeaders,
    body: JSON.stringify({ email: existingInvitee.email, role: "reviewer" }),
  });
  await expectStatus(existingInviteResponse, 201, "invite an existing account");
  const existingInvite = await json(existingInviteResponse);
  const existingToken = new URL(existingInvite.inviteUrl).searchParams.get("token");
  const existingAccept = await fetch(`${baseUrl}/api/auth/invitations/accept`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: existingToken }),
  });
  await expectStatus(existingAccept, 200, "existing account accepts invitation without resetting password");
  const unchangedInvitee = await prisma.user.findUnique({ where: { id: existingInvitee.id } });
  assert.equal(unchangedInvitee.passwordHash, existingHash, "invitation acceptance must never overwrite an existing password");

  // Re-inviting a revoked membership must revoke every old session before
  // the membership can become active again.
  const formerMember = await prisma.user.create({
    data: { email: `former-member-${randomUUID()}@example.invalid`, status: "active" },
  });
  identityCleanup.users.push(formerMember.id);
  const formerMembership = await prisma.membership.create({
    data: { userId: formerMember.id, organizationId: tenantA.id, role: "viewer", status: "revoked" },
  });
  const formerSessionId = randomUUID().replaceAll("-", "");
  await prisma.authSession.create({
    data: { id: formerSessionId, userId: formerMember.id, membershipId: formerMembership.id, expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) },
  });
  const formerCookie = `${SESSION_COOKIE}=${createIdentitySessionToken({
    email: formerMember.email, userId: formerMember.id, organizationId: tenantA.id,
    membershipId: formerMembership.id, role: "viewer", sessionId: formerSessionId,
  }, secret)}`;
  const formerInviteResponse = await fetch(`${baseUrl}/api/invitations`, {
    method: "POST", headers: tenantHeaders,
    body: JSON.stringify({ email: formerMember.email, role: "reviewer" }),
  });
  await expectStatus(formerInviteResponse, 201, "re-invite a revoked former member");
  const formerInvite = await json(formerInviteResponse);
  const formerToken = new URL(formerInvite.inviteUrl).searchParams.get("token");
  const oldSessionRecord = await prisma.authSession.findUnique({ where: { id: formerSessionId } });
  assert.ok(oldSessionRecord.revokedAt, "re-invitation must revoke stale sessions before membership reactivation");
  const formerAccept = await fetch(`${baseUrl}/api/auth/invitations/accept`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: formerToken, password: "Former-Member-Password-2026!" }),
  });
  await expectStatus(formerAccept, 200, "former member accepts a fresh invitation");
  const staleFormerSession = await fetch(`${baseUrl}/api/projects`, { headers: { cookie: formerCookie } });
  await expectStatus(staleFormerSession, 401, "previously revoked session must remain revoked after re-invitation");
  const activeInvitedMembership = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: invitedUser.id, organizationId: tenantA.id } },
  });
  assert.equal(activeInvitedMembership.status, "active");
  assert.equal(activeInvitedMembership.role, "viewer");
  const savedInvitee = await prisma.user.findUnique({ where: { id: invitedUser.id } });
  assert.equal(await verifyPasswordHash("Invitation-Password-2026!", savedInvitee.passwordHash), true);
  const invitedSession = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie: `modrik_session=${invitedSessionCookie}` } });
  await expectStatus(invitedSession, 200, "invited member session");
  assert.equal((await json(invitedSession)).organizationId, tenantA.id);
  const replayedInvitation = await fetch(`${baseUrl}/api/auth/invitations/accept`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: invitationToken, password: "Invitation-Password-2026!" }),
  });
  assert.equal(replayedInvitation.status, 400, "accepted invitation token must not be reusable");

  const revokeEmail = `revoked-invite-${randomUUID()}@example.invalid`;
  const revokeCreate = await fetch(`${baseUrl}/api/invitations`, {
    method: "POST", headers: tenantHeaders,
    body: JSON.stringify({ email: revokeEmail, role: "reviewer" }),
  });
  await expectStatus(revokeCreate, 201, "create revocable invitation");
  const revokePayload = await json(revokeCreate);
  const revokeToken = new URL(revokePayload.inviteUrl).searchParams.get("token");
  const revokeInvitee = await prisma.user.findUnique({ where: { email: revokeEmail } });
  identityCleanup.users.push(revokeInvitee.id);
  const revoked = await fetch(`${baseUrl}/api/invitations/revoke`, {
    method: "POST", headers: tenantHeaders,
    body: JSON.stringify({ invitationId: revokePayload.invitation.id }),
  });
  await expectStatus(revoked, 200, "revoke pending invitation");
  const revokedRecord = await prisma.organizationInvitation.findUnique({ where: { id: revokePayload.invitation.id } });
  assert.ok(revokedRecord.revokedAt);
  const revokedAccept = await fetch(`${baseUrl}/api/auth/invitations/accept`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: revokeToken, password: "Invitation-Password-2026!" }),
  });
  assert.equal(revokedAccept.status, 400, "revoked invitation cannot be accepted");

  const ownerRoleAttempt = await fetch(`${baseUrl}/api/invitations`, {
    method: "POST", headers: tenantHeaders,
    body: JSON.stringify({ email: `owner-role-${randomUUID()}@example.invalid`, role: "owner" }),
  });
  await expectStatus(ownerRoleAttempt, 400, "invitation must not grant owner role");

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
  const viewerInvitationList = await fetch(`${baseUrl}/api/invitations`, { headers: { cookie: viewerCookie } });
  await expectStatus(viewerInvitationList, 403, "viewer cannot list organization invitations");
  const viewerInvitationCreate = await fetch(`${baseUrl}/api/invitations`, {
    method: "POST", headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({ email: `forbidden-${randomUUID()}@example.invalid`, role: "viewer" }),
  });
  await expectStatus(viewerInvitationCreate, 403, "viewer cannot create organization invitations");
  const crossOriginInvitation = await fetch(`${baseUrl}/api/invitations`, {
    method: "POST", headers: { ...tenantHeaders, origin: "https://attacker.example" },
    body: JSON.stringify({ email: `csrf-${randomUUID()}@example.invalid`, role: "viewer" }),
  });
  await expectStatus(crossOriginInvitation, 403, "cross-origin invitation creation rejected");

  const viewerCreate = await fetch(`${baseUrl}/api/projects`, {
    method: "POST", headers: {
      cookie: viewerCookie,
      "content-type": "application/json",
      "x-modrik-role": "owner",
      "x-modrik-organization-id": tenantB.id,
      "x-modrik-user-id": identityUser.id,
    },
    body: JSON.stringify({ name: "Forbidden viewer project", brief: "must not be created" }),
  });
  await expectStatus(viewerCreate, 403, "viewer cannot create projects");
  const viewerStakeholders = await fetch(`${baseUrl}/api/projects/${tenantProjectA.id}/stakeholders`, {
    headers: { cookie: viewerCookie },
  });
  await expectStatus(viewerStakeholders, 200, "viewer can read project collaboration data");
  const viewerEvidenceWrite = await fetch(`${baseUrl}/api/projects/${tenantProjectA.id}/evidence`, {
    method: "POST",
    headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  await expectStatus(viewerEvidenceWrite, 403, "viewer cannot write project evidence");

  const reviewerUser = await prisma.user.create({ data: { email: `identity-reviewer-${randomUUID()}@example.invalid`, status: "active" } });
  identityCleanup.users.push(reviewerUser.id);
  const reviewerMembership = await prisma.membership.create({
    data: { userId: reviewerUser.id, organizationId: tenantA.id, role: "reviewer", status: "active", activatedAt: new Date() },
  });
  const reviewerSessionId = randomUUID().replaceAll("-", "");
  await prisma.authSession.create({
    data: { id: reviewerSessionId, userId: reviewerUser.id, membershipId: reviewerMembership.id, expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) },
  });
  const reviewerCookie = `${SESSION_COOKIE}=${createIdentitySessionToken({
    email: reviewerUser.email, userId: reviewerUser.id, organizationId: tenantA.id,
    membershipId: reviewerMembership.id, role: "reviewer", sessionId: reviewerSessionId,
  }, secret)}`;
  const reviewerClaimReview = await fetch(`${baseUrl}/api/projects/${tenantProjectA.id}/claims`, {
    method: "PATCH",
    headers: { cookie: reviewerCookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  await expectStatus(reviewerClaimReview, 400, "reviewer may enter the claim review action");

  const approverUser = await prisma.user.create({ data: { email: `identity-approver-${randomUUID()}@example.invalid`, status: "active" } });
  identityCleanup.users.push(approverUser.id);
  const approverMembership = await prisma.membership.create({
    data: { userId: approverUser.id, organizationId: tenantA.id, role: "approver", status: "active", activatedAt: new Date() },
  });
  const approverSessionId = randomUUID().replaceAll("-", "");
  await prisma.authSession.create({
    data: { id: approverSessionId, userId: approverUser.id, membershipId: approverMembership.id, expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) },
  });
  const approverCookie = `${SESSION_COOKIE}=${createIdentitySessionToken({
    email: approverUser.email, userId: approverUser.id, organizationId: tenantA.id,
    membershipId: approverMembership.id, role: "approver", sessionId: approverSessionId,
  }, secret)}`;
  const approverDecision = await fetch(`${baseUrl}/api/projects/${tenantProjectA.id}/stakeholders`, {
    method: "PATCH",
    headers: { cookie: approverCookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "decide_negotiation" }),
  });
  await expectStatus(approverDecision, 400, "approver may enter stakeholder decision action");

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

  // Exercise the actual six-stage human approval API against a disposable
  // project. Agent outputs are seeded as fixture records; no live LLM is needed.
  const pipelineProjectId = randomUUID();
  projectIds.push(pipelineProjectId);
  await prisma.project.create({
    data: {
      id: pipelineProjectId,
      name: "Six-stage approval contract",
      brief: "Disposable API integration fixture for the human approval gates.",
      currentStage: "ELICITATION",
      stageStatus: "awaiting_review",
    },
  });
  const approvePipeline = () => fetch(`${baseUrl}/api/projects/${pipelineProjectId}/pipeline`, {
    method: "POST", headers, body: JSON.stringify({ action: "approve" }),
  });
  const setPipelineReview = () => prisma.project.update({
    where: { id: pipelineProjectId }, data: { stageStatus: "awaiting_review" },
  });
  const approveAndExpect = async (nextStage, label) => {
    const response = await approvePipeline();
    await expectStatus(response, 200, label);
    const body = await json(response);
    assert.equal(body.nextStage, nextStage, `${label} must advance to the expected next stage`);
  };

  const emptyElicitation = await approvePipeline();
  await expectStatus(emptyElicitation, 422, "elicitation gate rejects empty questions");
  assert.equal((await prisma.project.findUnique({ where: { id: pipelineProjectId } })).stageStatus, "awaiting_review",
    "failed preflight must leave the stage available for correction");
  await prisma.question.create({
    data: {
      projectId: pipelineProjectId,
      text: "Which user group owns the approval?",
      answer: "The operations lead owns approval.",
      answered: true,
      resolution: "answered",
      answerSource: "human",
    },
  });
  await approveAndExpect("PROBLEM_SELECTION", "human elicitation approval");

  await setPipelineReview();
  const emptyProblem = await approvePipeline();
  await expectStatus(emptyProblem, 422, "problem selection gate rejects zero selected candidates");
  await prisma.problemCandidate.create({
    data: {
      projectId: pipelineProjectId,
      title: "Reduce manual approval delays",
      description: "The approval handoff is currently manual.",
      impact: 4,
      effort: 2,
      selected: true,
      humanEdited: true,
    },
  });
  await approveAndExpect("EXTRACTION", "single selected problem approval");

  await setPipelineReview();
  const emptyExtraction = await approvePipeline();
  await expectStatus(emptyExtraction, 422, "extraction gate rejects empty requirements");
  const pipelineEvidence = await prisma.evidence.create({
    data: {
      projectId: pipelineProjectId,
      code: "E-PIPE-01",
      title: "Operations interview",
      sourceType: "interview",
      language: "en",
      content: "The operations lead must approve requests before they proceed.",
      consent: true,
    },
  });
  const pipelineRequirement = await prisma.requirement.create({
    data: {
      projectId: pipelineProjectId,
      refId: "REQ-PIPE-01",
      text: "The system shall route each request to the operations lead for approval.",
      verifyStatus: "supported",
      verificationSource: "human",
      language: "en",
    },
  });
  const secondPipelineRequirement = await prisma.requirement.create({
    data: {
      projectId: pipelineProjectId,
      refId: "REQ-PIPE-02",
      text: "The system shall record the approval outcome.",
      verifyStatus: "supported",
      verificationSource: "human",
      language: "en",
    },
  });
  await prisma.traceLink.create({
    data: {
      projectId: pipelineProjectId,
      requirementId: pipelineRequirement.id,
      evidenceId: pipelineEvidence.id,
      evidenceCode: pipelineEvidence.code,
      note: "Human-reviewed source link for approval-gate integration.",
    },
  });
  await prisma.traceLink.create({
    data: {
      projectId: pipelineProjectId,
      requirementId: secondPipelineRequirement.id,
      evidenceId: pipelineEvidence.id,
      evidenceCode: pipelineEvidence.code,
      note: "Second requirement grounded in the same interview source.",
    },
  });
  await approveAndExpect("AMBIGUITY", "evidence-grounded human-verified requirements approval");

  await setPipelineReview();
  await approveAndExpect("STORIES", "ambiguity stage human approval");

  await setPipelineReview();
  const emptyStories = await approvePipeline();
  await expectStatus(emptyStories, 422, "story gate rejects an empty story set");
  await prisma.userStory.create({
    data: {
      projectId: pipelineProjectId,
      requirementId: pipelineRequirement.id,
      refId: "US-PIPE-01",
      title: "Approve a request",
      narrative: "As an operations lead, I want to approve a request so that the workflow can proceed.",
      acceptance: "Given a pending request\\nWhen the operations lead approves it\\nThen the request is marked approved",
      investScore: 82,
    },
  });
  await approveAndExpect("CONFLICTS", "reviewed user story approval");

  await setPipelineReview();
  const openConflict = await prisma.conflict.create({
    data: {
      projectId: pipelineProjectId,
      reqAId: pipelineRequirement.id,
      reqBId: secondPipelineRequirement.id,
      description: "The requirements disagree about the approval outcome.",
      severity: "medium",
      status: "open",
    },
  });
  const unresolved = await approvePipeline();
  await expectStatus(unresolved, 422, "conflict gate rejects unresolved findings");
  await prisma.conflict.update({
    where: { id: openConflict.id },
    data: { status: "resolved", resolution: "Use the operations lead's recorded approval outcome." },
  });

  // Two concurrent final approvals must never create two completed transitions.
  const finalApprovals = await Promise.all([approvePipeline(), approvePipeline()]);
  assert.deepEqual(finalApprovals.map(response => response.status).sort(), [200, 409],
    "exactly one concurrent final approval must own the transition");
  const finalPipelineProject = await prisma.project.findUnique({ where: { id: pipelineProjectId } });
  assert.equal(finalPipelineProject.status, "complete");
  assert.equal(finalPipelineProject.currentStage, "CONFLICTS");
  assert.equal(finalPipelineProject.stageStatus, "approved");
  const pipelineRuns = await prisma.pipelineRun.findMany({ where: { projectId: pipelineProjectId } });
  assert.equal(pipelineRuns.length, 6, "one pipeline run must be recorded for each successful human gate");
  assert.ok(pipelineRuns.every(run => run.status === "done"), "all six approved stage runs must be complete");

  // Reopening a completed baseline is also a compare-and-swap operation:
  // two tabs racing to reopen must not both claim the lifecycle transition.
  const reopenUrl = `${baseUrl}/api/projects/${pipelineProjectId}/pipeline`;
  const reopen = () => fetch(reopenUrl, {
    method: "POST", headers, body: JSON.stringify({ action: "reopen" }),
  });
  const reopenRace = await Promise.all([reopen(), reopen()]);
  assert.deepEqual(reopenRace.map(response => response.status).sort(), [200, 409],
    "exactly one concurrent reopen must own the completed-baseline transition");
  const reopenedProject = await prisma.project.findUnique({ where: { id: pipelineProjectId } });
  assert.equal(reopenedProject.status, "active");
  assert.equal(reopenedProject.currentStage, "CONFLICTS", "reopen must preserve the approved stage position");
  assert.equal(reopenedProject.stageStatus, "awaiting_input");
  const duplicateReopen = await reopen();
  await expectStatus(duplicateReopen, 409, "an already reopened baseline cannot be reopened again");
  const runsAfterReopen = await prisma.pipelineRun.findMany({ where: { projectId: pipelineProjectId } });
  assert.equal(runsAfterReopen.length, 6, "reopening must not fabricate an agent or approval run");

  process.stdout.write("Pipeline approval integration: six human gates, blocked preflights, concurrent final-approval and reopen protection passed.\\n");

  // Full data-populated product pipeline using the real stage agents and a
  // deterministic OpenAI-compatible fixture provider. Only the model transport
  // is mocked; routing, persistence, evidence links, human gates and memory
  // harvesting all execute through the real application code.
  const agentProjectId = randomUUID();
  projectIds.push(agentProjectId);
  await prisma.project.create({
    data: {
      id: agentProjectId,
      name: "Full agent pipeline acceptance",
      brief: "An operations team needs an evidence-grounded request approval workflow with auditable ownership and decisions.",
      currentStage: "ELICITATION",
      stageStatus: "awaiting_input",
      status: "active",
    },
  });
  await prisma.evidence.create({
    data: {
      projectId: agentProjectId,
      code: "E-AGENT-01",
      title: "Operations lead interview",
      sourceType: "interview",
      language: "en",
      content: "The operations lead owns request approvals. Every approval decision must be recorded with its owner so the team can audit the workflow.",
      consent: true,
    },
  });
  const agentPipelineUrl = `${baseUrl}/api/projects/${agentProjectId}/pipeline`;
  const pipelineAction = action => fetch(agentPipelineUrl, {
    method: "POST", headers, body: JSON.stringify({ action }),
  });
  const runAgentStage = async expectedStage => {
    const response = await pipelineAction("run");
    await expectStatus(response, 200, `run real ${expectedStage} stage agent`);
    const project = await prisma.project.findUnique({ where: { id: agentProjectId } });
    assert.equal(project.currentStage, expectedStage);
    assert.equal(project.stageStatus, "awaiting_review", `${expectedStage} agent output must wait for human review`);
    const latestRun = await prisma.pipelineRun.findFirst({
      where: { projectId: agentProjectId, stage: expectedStage },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(latestRun.status, "done", `${expectedStage} agent run must be persisted as done`);
  };
  const approveAgentStage = async expectedNextStage => {
    const response = await pipelineAction("approve");
    await expectStatus(response, 200, `human approval advances to ${expectedNextStage ?? "completed baseline"}`);
    const body = await json(response);
    assert.equal(body.nextStage, expectedNextStage);
  };

  await runAgentStage("ELICITATION");
  const generatedQuestions = await prisma.question.findMany({ where: { projectId: agentProjectId } });
  assert.equal(generatedQuestions.length, 5, "impact-aware planner must materialize its five selected questions");
  await prisma.question.updateMany({
    where: { projectId: agentProjectId },
    data: {
      answer: "The operations lead is accountable for each approval.",
      answered: true,
      resolution: "answered",
      answerSource: "human",
    },
  });
  await approveAgentStage("PROBLEM_SELECTION");

  await runAgentStage("PROBLEM_SELECTION");
  const generatedCandidates = await prisma.problemCandidate.findMany({ where: { projectId: agentProjectId } });
  assert.equal(generatedCandidates.length, 3);
  await prisma.problemCandidate.update({
    where: { id: generatedCandidates[0].id },
    data: { selected: true, humanEdited: true },
  });
  await approveAgentStage("EXTRACTION");

  await runAgentStage("EXTRACTION");
  const generatedRequirements = await prisma.requirement.findMany({ where: { projectId: agentProjectId }, include: { links: true } });
  assert.equal(generatedRequirements.length, 8);
  assert.ok(generatedRequirements.every(requirement => requirement.links.some(link => link.evidenceId)),
    "extraction agent must persist evidence trace links for every requirement");
  assert.ok(generatedRequirements.every(requirement => requirement.verifyStatus === "supported" && requirement.verificationSource === "agent"),
    "critic-verifier pass must return supported verdicts before human review");
  await prisma.requirement.updateMany({
    where: { projectId: agentProjectId },
    data: { verifyStatus: "supported", verificationSource: "human" },
  });
  await approveAgentStage("AMBIGUITY");

  await runAgentStage("AMBIGUITY");
  const assessedRequirements = await prisma.requirement.findMany({ where: { projectId: agentProjectId } });
  assert.ok(assessedRequirements.every(requirement => requirement.ambiguity === 12),
    "ambiguity agent must persist scores for the complete requirement set");
  await approveAgentStage("STORIES");

  await runAgentStage("STORIES");
  const generatedStories = await prisma.userStory.findMany({ where: { projectId: agentProjectId } });
  assert.equal(generatedStories.length, 8, "story agent must produce one story per eligible requirement");
  await approveAgentStage("CONFLICTS");

  await runAgentStage("CONFLICTS");
  const detectedConflicts = await prisma.conflict.findMany({ where: { projectId: agentProjectId } });
  assert.equal(detectedConflicts.length, 0, "fixture provider reports no unsupported conflict");
  await approveAgentStage(null);

  const completedAgentProject = await prisma.project.findUnique({ where: { id: agentProjectId } });
  assert.equal(completedAgentProject.status, "complete");
  assert.equal(completedAgentProject.currentStage, "CONFLICTS");
  assert.equal(completedAgentProject.stageStatus, "approved");
  const allAgentRuns = await prisma.pipelineRun.findMany({ where: { projectId: agentProjectId } });
  assert.equal(allAgentRuns.length, 12, "six agent runs and six human approvals must be persisted");
  assert.ok(allAgentRuns.every(run => run.status === "done"), "every real stage-agent and approval run must finish successfully");
  assert.ok(await prisma.memoryEntry.count({ where: { projectId: agentProjectId } }) > 0,
    "completed baseline must run project-scoped memory harvesting");
  assert.ok(await prisma.artifact.count({ where: { projectId: agentProjectId } }) >= 6,
    "each stage must persist its generated artifact");
  process.stdout.write("Full agent pipeline E2E: six real stage runners, planner, critic-verifier, evidence traceability, six human approvals, final memory harvest passed using a deterministic local provider.\\n");

  const browser = await chromium.launch({ headless: true });
  try {
    const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`${baseUrl}/login`, { waitUntil: "networkidle" });
    await guestPage.getByRole("heading", { name: "Secure mission access" }).waitFor();
    assert.equal(await guestPage.getByRole("button", { name: "Switch language to Arabic" }).count(), 1, "login should render exactly one language switch");
    await guestPage.getByRole("button", { name: "Switch language to Arabic" }).click();
    await guestPage.getByRole("heading", { name: "دخول آمن إلى مساحة العمل" }).waitFor();
    await guestPage.getByText("البريد الإلكتروني", { exact: true }).waitFor();
    assert.equal(await guestPage.locator("main").getAttribute("dir"), "rtl", "Arabic login shell must use RTL direction");
    assert.equal(await guestPage.locator("form").getAttribute("dir"), "rtl", "Arabic login controls must use RTL direction");
    assert.equal(await guestPage.locator("html").getAttribute("lang"), "ar", "Arabic language switch must update the document language");
    assert.equal(await guestPage.locator("html").getAttribute("dir"), "rtl", "Arabic language switch must update document direction");
    const loginFieldAudit = await guestPage.locator("form input, form textarea, form select").evaluateAll((fields) => fields.map((field) => {
      const labelledBy = field.getAttribute("aria-labelledby");
      const label = field.closest("label") || (field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`) : null);
      return { type: field.getAttribute("type") || field.tagName.toLowerCase(), named: Boolean(field.getAttribute("aria-label") || labelledBy || label?.textContent?.trim()) };
    }));
    assert.ok(loginFieldAudit.length >= 2, "login form must expose both credential controls");
    assert.ok(loginFieldAudit.every((field) => field.named), `every login control must have an accessible name: ${JSON.stringify(loginFieldAudit)}`);
    assert.equal(await guestPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      "Arabic login page must not introduce horizontal overflow at 390px");


    // Public invitation and recovery shells must preserve native Arabic/RTL
    // direction at the narrow mobile breakpoint, including invalid-link states.
    await guestPage.goto(`${baseUrl}/invite/accept`, { waitUntil: "networkidle" });
    await guestPage.getByRole("heading", { name: "انضم إلى مؤسستك" }).waitFor();
    assert.equal(await guestPage.locator("main").getAttribute("dir"), "rtl", "invitation shell must inherit Arabic RTL");
    await guestPage.getByText("رابط الدعوة غير مكتمل. اطلب من مسؤول المؤسسة إصدار دعوة جديدة.", { exact: true }).waitFor();
    assert.ok((await guestPage.locator("body").innerText()).includes("رابط الدعوة غير مكتمل"), "invalid invitation must explain recovery in Arabic");
    const recoveryResponse = await guestPage.goto(`${baseUrl}/reset-password`, { waitUntil: "networkidle" });
    console.log("Password recovery navigation:", JSON.stringify({ status: recoveryResponse?.status(), url: guestPage.url(), title: await guestPage.title(), body: (await guestPage.locator("body").innerText().catch(() => "")).slice(0, 500) }));
    await guestPage.getByRole("heading", { name: "استعادة حسابك" }).waitFor();
    assert.equal(await guestPage.locator("main").getAttribute("dir"), "rtl", "password recovery shell must inherit Arabic RTL");
    await guestPage.getByText("البريد الإلكتروني", { exact: true }).waitFor();
    assert.equal(await guestPage.locator("form").getAttribute("dir"), "rtl", "password recovery controls must use RTL direction");
    assert.equal(await guestPage.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth), true, "public auth routes must not overflow horizontally at 390px");
    await guestContext.close();

    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: SESSION_COOKIE, value: createSessionToken(process.env.MODRIK_ADMIN_EMAIL, secret), url: baseUrl }]);
    const page = await context.newPage();

    // Exercise IndexedDB cross-tab serialization using two real same-origin pages.
    const leasePageA = await context.newPage();
    const leasePageB = await context.newPage();
    await Promise.all([leasePageA.goto(baseUrl), leasePageB.goto(baseUrl)]);
    const leaseName = `modrik:e2e:lease:${randomUUID()}`;
    async function browserLeaseTransition(targetPage, input) {
      return targetPage.evaluate(async ({ name, owner, now, leaseMs, mode, fencingToken }) => {
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open("modrik-offline", 2);
          request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains("evidence-operations")) {
              const operations = database.createObjectStore("evidence-operations", { keyPath: "operationId" });
              operations.createIndex("projectId", "projectId", { unique: false });
              operations.createIndex("createdAt", "createdAt", { unique: false });
            }
            if (!database.objectStoreNames.contains("sync-leases")) {
              database.createObjectStore("sync-leases", { keyPath: "name" });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise((resolve, reject) => {
            const tx = db.transaction("sync-leases", "readwrite");
            const store = tx.objectStore("sync-leases");
            const request = store.get(name);
            let outcome = null;
            request.onsuccess = () => {
              const current = request.result ?? null;
              let next = null;
              if (mode === "acquire") {
                if (current && current.owner && current.owner !== owner && current.leaseUntil > now) {
                  outcome = { acquired: false, lease: current };
                } else if (current?.owner === owner && current.leaseUntil > now) {
                  next = { ...current, leaseUntil: now + leaseMs };
                  outcome = { acquired: true, lease: next };
                } else {
                  next = { name, owner, leaseUntil: now + leaseMs, fencingToken: (Number.isSafeInteger(current?.fencingToken) ? current.fencingToken : 0) + 1 };
                  outcome = { acquired: true, lease: next };
                }
              } else if (mode === "heartbeat") {
                if (current?.owner === owner && current?.fencingToken === fencingToken && current.leaseUntil > now) {
                  next = { ...current, leaseUntil: now + leaseMs };
                  outcome = { acquired: true, lease: next };
                } else outcome = { acquired: false, lease: current };
              } else if (mode === "release") {
                if (current?.owner === owner && current?.fencingToken === fencingToken) {
                  next = { ...current, owner: null, leaseUntil: 0 };
                  outcome = { acquired: true, lease: next };
                } else outcome = { acquired: false, lease: current };
              } else if (mode === "expire") {
                next = { ...(current ?? { name, fencingToken: 0 }), owner: null, leaseUntil: 0 };
                outcome = { acquired: true, lease: next };
              }
              if (next) store.put(next);
            };
            request.onerror = () => tx.abort();
            tx.oncomplete = () => resolve(outcome);
            tx.onerror = () => reject(tx.error ?? new Error("Cross-tab lease transaction failed"));
            tx.onabort = () => reject(tx.error ?? new Error("Cross-tab lease transaction aborted"));
          });
        } finally { db.close(); }
      }, { name: leaseName, ...input });
    }
    const leaseNow = Date.now();
    const [tabAAcquire, tabBAcquire] = await Promise.all([
      browserLeaseTransition(leasePageA, { owner: "tab-a", now: leaseNow, leaseMs: 5_000, mode: "acquire" }),
      browserLeaseTransition(leasePageB, { owner: "tab-b", now: leaseNow, leaseMs: 5_000, mode: "acquire" }),
    ]);
    assert.equal(Number(tabAAcquire.acquired) + Number(tabBAcquire.acquired), 1, "two tabs must never acquire the same live lease");
    const firstOwner = tabAAcquire.acquired ? "tab-a" : "tab-b";
    const secondOwner = firstOwner === "tab-a" ? "tab-b" : "tab-a";
    const firstToken = (tabAAcquire.acquired ? tabAAcquire : tabBAcquire).lease.fencingToken;
    const ownerPage = firstOwner === "tab-a" ? leasePageA : leasePageB;
    const contenderPage = secondOwner === "tab-a" ? leasePageA : leasePageB;
    const blockedContender = firstOwner === "tab-a" ? tabBAcquire : tabAAcquire;
    assert.equal(blockedContender.acquired, false, "the losing tab must observe the active owner");
    await browserLeaseTransition(ownerPage, { owner: firstOwner, now: leaseNow + 5_001, leaseMs: 1, mode: "expire" });
    const takeover = await browserLeaseTransition(contenderPage, { owner: secondOwner, now: leaseNow + 5_002, leaseMs: 5_000, mode: "acquire" });
    assert.equal(takeover.acquired, true, "the second tab must acquire after expiry");
    assert.equal(takeover.lease.fencingToken, firstToken + 1, "lease generations must increase monotonically");
    const staleHeartbeat = await browserLeaseTransition(ownerPage, { owner: firstOwner, now: leaseNow + 5_003, leaseMs: 5_000, mode: "heartbeat", fencingToken: firstToken });
    const staleRelease = await browserLeaseTransition(ownerPage, { owner: firstOwner, now: leaseNow + 5_004, leaseMs: 5_000, mode: "release", fencingToken: firstToken });
    assert.equal(staleHeartbeat.acquired, false, "stale tab cannot renew the new owner's lease");
    assert.equal(staleRelease.acquired, false, "stale tab cannot release the new owner's lease");
    assert.equal(staleRelease.lease.owner, secondOwner);
    await ownerPage.close(); // Simulate a crashed/suspended lease owner.
    const recovered = await browserLeaseTransition(contenderPage, { owner: "recovery-tab", now: leaseNow + 10_004, leaseMs: 5_000, mode: "acquire" });
    assert.equal(recovered.acquired, true, "another tab must recover after the crashed owner's lease expires");
    assert.equal(recovered.lease.fencingToken, firstToken + 2);
    await contenderPage.close();

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
    await page.keyboard.press("Tab");
    assert.match(await page.evaluate(() => document.activeElement?.textContent?.trim() || ""), /Skip to main content/,
      "keyboard users must reach the skip-navigation link first");
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), "none",
      "skip-navigation focus must be visibly indicated");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.location.hash === "#main-content");
    const missionControlLanguageToggle = page.getByRole("button", { name: "Toggle language" });
    await missionControlLanguageToggle.click();
    await page.waitForFunction(() => document.documentElement.lang === "ar" && document.documentElement.dir === "rtl");
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.lang), "ar", "workspace must expose Arabic document language");
    assert.equal(await page.evaluate(() => document.documentElement.dir), "rtl", "workspace must expose RTL document direction");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      "Arabic Mission Control must not overflow horizontally at 390px");
    await page.setViewportSize({ width: 1280, height: 900 });
    await missionControlLanguageToggle.click();
    await page.waitForFunction(() => document.documentElement.lang === "en" && document.documentElement.dir === "ltr");

    // Start a fresh project through the real Mission Control UI, capture an
    // evidence source through the elicitation cockpit, and launch the first
    // agent from the human-gated workspace. The remaining five agent stages
    // and approval gates are exercised below through the real HTTP pipeline.
    await page.getByRole("button", { name: "New Mission" }).click();
    await page.getByPlaceholder("Mission name").fill("Browser-created acceptance journey");
    await page.getByPlaceholder(/Project brief/).fill("A support team needs an auditable intake and approval workflow. Every request must have a named owner and a recorded decision.");
    const createProjectResponse = page.waitForResponse(response =>
      response.url().endsWith("/api/projects") && response.request().method() === "POST" && response.status() === 201
    );
    await page.getByRole("button", { name: "Launch", exact: true }).click();
    const createdProjectResponse = await createProjectResponse;
    const browserCreatedProject = (await createdProjectResponse.json()).project;
    assert.ok(browserCreatedProject?.id, "Mission Control must create a persisted project");
    projectIds.push(browserCreatedProject.id);
    await page.getByRole("heading", { name: "Browser-created acceptance journey" }).waitFor();

    await page.getByRole("button", { name: "Add evidence" }).click();
    await page.getByPlaceholder(/Source title/).fill("Support team discovery interview");
    await page.getByPlaceholder(/Paste transcript/).fill("The support lead owns every incoming request. The team needs each decision recorded with the responsible person and a clear approval outcome.");
    await page.getByLabel("I have permission to send this source's content to the configured AI provider").check();
    await page.getByRole("button", { name: "Add source", exact: true }).click();
    await page.getByText("Support team discovery interview", { exact: true }).waitFor();
    const persistedBrowserEvidence = await prisma.evidence.findMany({ where: { projectId: browserCreatedProject.id } });
    assert.equal(persistedBrowserEvidence.length, 1, "evidence intake must persist exactly one source");
    assert.equal(persistedBrowserEvidence[0].consent, true, "the UI consent choice must be persisted with the source");

    await page.getByRole("button", { name: "Run Questioner Agent" }).click();
    await page.getByRole("button", { name: "Approve & continue" }).waitFor({ state: "visible", timeout: 30000 });
    const browserCreatedAfterAgent = await prisma.project.findUnique({ where: { id: browserCreatedProject.id } });
    assert.equal(browserCreatedAfterAgent.currentStage, "ELICITATION");
    assert.equal(browserCreatedAfterAgent.stageStatus, "awaiting_review",
      "the first browser-launched agent must stop at the human approval gate");
    assert.equal(await prisma.pipelineRun.count({ where: { projectId: browserCreatedProject.id, stage: "ELICITATION", status: "done" } }), 1,
      "the browser-launched agent run must be persisted");

    // Return to Mission Control before opening the independent seeded
    // stakeholder-collaboration fixture used by the remainder of this test.
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "New Mission" }).waitFor();

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

    // Return to English before reloading Mission Control so the seeded
    // project's accessible name is deterministic across persisted locales.
    await page.getByRole("button", { name: /Toggle language/ }).click();
    await page.waitForFunction(() => document.documentElement.lang === "en" && document.documentElement.dir === "ltr");

    // Promote the disposable fixture to a completed baseline, then exercise
    // the authenticated workspace's six stage cockpits and the Debrief view.
    await prisma.project.update({ where: { id: projectA }, data: { status: "complete" } });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const completedMission = page.getByRole("button", { name: "Open mission Phase 4 integration A" });
    await completedMission.waitFor({ state: "visible" });
    await completedMission.click();
    await page.getByRole("heading", { name: /Instruments, Health & Integrations/ }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });

    const workspaceViews = [
      "Briefing",
      "Route Plot",
      "Airframe",
      "Turbulence Scan",
      "Payload",
      "Clearance",
      "Debrief",
    ];
    for (const view of workspaceViews) {
      const navigationItem = page.getByRole("button", { name: new RegExp(view) });
      await navigationItem.click();
      await page.getByRole("heading", { name: new RegExp(view) }).waitFor();
      assert.equal(await navigationItem.getAttribute("aria-current"), "step",
        `${view} navigation item must expose the active step`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
        `${view} workspace view must not overflow at 390px`);
    }

    await page.setViewportSize({ width: 768, height: 1024 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      "authenticated workspace must not overflow at tablet width");
    await page.setViewportSize({ width: 1440, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      "authenticated workspace must not overflow at desktop width");

    // Connect the already-exercised six-agent + six-approval backend journey
    // to the authenticated browser workspace. This proves the persisted,
    // completed project can be reopened from Mission Control and its
    // evidence-grounded outputs reach the real Debrief UI.
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const completedAgentMission = page.getByRole("button", { name: "Open mission Full agent pipeline acceptance" });
    await completedAgentMission.waitFor({ state: "visible" });
    await completedAgentMission.click();
    await page.getByRole("heading", { name: "Full agent pipeline acceptance" }).waitFor();
    await page.getByRole("heading", { name: /Debrief/ }).waitFor();
    await page.getByRole("img", { name: "Requirement constellation" }).waitFor();
    const constellationLabels = await page.locator('svg[aria-label="Requirement constellation"] text').allTextContents();
    assert.ok(constellationLabels.some(label => label.includes("E-AGENT-01")),
      "Debrief constellation must render the source evidence code");
    assert.ok(constellationLabels.some(label => label.includes("REQ-01")),
      "Debrief constellation must render the generated requirement references");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      "completed agent pipeline Debrief must not overflow at desktop width");

    // Reopen the completed deterministic six-agent baseline, then inspect all
    // six real stage cockpits through the authenticated browser workspace.
    // The API journey above already proves each agent run and human approval;
    // this browser pass proves the persisted outputs render in their own views.
    const reopenAgentBaseline = await fetch(`${baseUrl}/api/projects/${agentProjectId}/pipeline`, {
      method: "POST", headers, body: JSON.stringify({ action: "reopen" }),
    });
    await expectStatus(reopenAgentBaseline, 200, "reopen completed agent baseline for stage cockpit verification");
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Open mission Full agent pipeline acceptance" }).click();
    await page.getByRole("heading", { name: "Full agent pipeline acceptance" }).waitFor();

    const agentStageViews = ["Briefing", "Route Plot", "Airframe", "Turbulence Scan", "Payload", "Clearance"];
    for (const stageTitle of agentStageViews) {
      const stageNavigation = page.getByRole("button", { name: new RegExp(stageTitle) });
      await stageNavigation.click();
      await page.getByRole("heading", { name: new RegExp(stageTitle) }).waitFor();
      assert.equal(await stageNavigation.getAttribute("aria-current"), "step",
        `${stageTitle} must expose the selected stage in the flight plan`);
      const stageContent = await page.locator("main").innerText();
      assert.ok(stageContent.trim().length > 100,
        `${stageTitle} cockpit must render its authenticated stage workspace`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
        `${stageTitle} cockpit must render without horizontal overflow`);
    }

    await page.getByRole("button", { name: /Toggle language/ }).click();
    await page.waitForFunction(() => document.documentElement.lang === "ar" && document.documentElement.dir === "rtl");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: /الإحاطة/ }).click();
    await page.getByRole("heading", { name: /الإحاطة/ }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      "Arabic authenticated workspace must not overflow at 390px");
    // Extend RTL coverage from the two critical screens above to every
    // authenticated workspace view. Toggle per view so navigation remains
    // deterministic while the content itself is rendered in Arabic.
    const rtlWorkspaceViews = [
      "Briefing",
      "Route Plot",
      "Airframe",
      "Turbulence Scan",
      "Payload",
      "Clearance",
    ];
    await page.getByRole("button", { name: /Toggle language/ }).click();
    await page.waitForFunction(() => document.documentElement.lang === "en" && document.documentElement.dir === "ltr");
    for (const view of rtlWorkspaceViews) {
      await page.getByRole("button", { name: new RegExp(view) }).click();
      await page.getByRole("heading", { name: new RegExp(view) }).waitFor();
      await page.getByRole("button", { name: /Toggle language/ }).click();
      await page.waitForFunction(() => document.documentElement.lang === "ar" && document.documentElement.dir === "rtl");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
        `Arabic ${view} view must not overflow at 390px`);
      assert.ok(await page.locator("main h1, main h2").first().isVisible(),
        `Arabic ${view} view must retain a visible main heading`);
      await page.getByRole("button", { name: /Toggle language/ }).click();
      await page.waitForFunction(() => document.documentElement.lang === "en" && document.documentElement.dir === "ltr");
    }

    // Locale preference must survive a full browser reload, not only SPA state.
    await page.getByRole("button", { name: /Toggle language/ }).click();
    await page.waitForFunction(() => document.documentElement.lang === "ar" && document.documentElement.dir === "rtl");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction(() => document.documentElement.lang === "ar" && document.documentElement.dir === "rtl");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
      "persisted Arabic locale must remain overflow-free after reload at 390px");
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
  await new Promise(resolve => mockProvider.close(resolve));
}
