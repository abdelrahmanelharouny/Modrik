import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateOrganizationEntitlements, resolveOrganizationPlan } from "../src/lib/phase4/plans.mjs";
import { compareBaselineSnapshots } from "../src/lib/phase4/baseline-diff.mjs";
import { assertOrganizationAiProviderAllowed, isRetentionEligible, validateOrganizationPolicyPatch } from "../src/lib/phase4/retention.mjs";
import { buildCompliancePackage } from "../src/lib/phase4/compliance-package.mjs";
import { resolveOrganizationRoutePermission } from "../src/lib/security/organization-route-access.mjs";

test("plan catalogue has bounded defaults and unknown plans fail closed to Free", () => {
  assert.equal(resolveOrganizationPlan("free").monthlyTokenLimit, 250_000);
  assert.equal(resolveOrganizationPlan("enterprise").memberLimit, 10_000);
  assert.equal(resolveOrganizationPlan("unknown").key, "free");
});

test("entitlements expose near-limit and exceeded states without pretending estimated usage is billing", () => {
  const near = evaluateOrganizationEntitlements({ planKey: "free", monthlyTokens: 200_000, activeMembers: 3, activeProjects: 2 });
  assert.equal(near.tokenState, "near_limit");
  assert.equal(near.memberState, "at_limit");
  assert.equal(near.projectState, "within_limit");
  assert.match(near.enforcement, /advisory/);
  const exceeded = evaluateOrganizationEntitlements({ planKey: "free", monthlyTokens: 250_001, activeMembers: 4, activeProjects: 4 });
  assert.equal(exceeded.tokenState, "exceeded");
  assert.equal(exceeded.memberState, "exceeded");
  assert.equal(exceeded.projectState, "exceeded");
});

test("baseline comparison reports added, removed and modified records by stable key", () => {
  const result = compareBaselineSnapshots(
    { version: 1, requirements: [{ refId: "REQ-1", text: "Old" }, { refId: "REQ-2", text: "Removed" }], stories: [{ refId: "US-1", title: "Old" }], conflicts: [{ id: "C-1", status: "open" }] },
    { version: 2, requirements: [{ refId: "REQ-1", text: "New" }, { refId: "REQ-3", text: "Added" }], stories: [{ refId: "US-1", title: "New" }, { refId: "US-2", title: "Added" }], conflicts: [{ id: "C-1", status: "resolved" }] },
  );
  assert.equal(result.from, 1);
  assert.equal(result.to, 2);
  assert.equal(result.requirements.added.length, 1);
  assert.equal(result.requirements.removed.length, 1);
  assert.equal(result.requirements.changed.length, 1);
  assert.equal(result.stories.added.length, 1);
  assert.equal(result.stories.changed.length, 1);
  assert.equal(result.conflicts.changed.length, 1);
  assert.equal(result.totalChanges, 6);
});

test("governance policy validation rejects unsafe retention windows and unknown providers", () => {
  assert.deepEqual(validateOrganizationPolicyPatch({ dataRetentionDays: 180, auditRetentionDays: 730, aiProcessingAllowed: false, permittedAiProviders: ["glm", "zai"] }), {
    dataRetentionDays: 180, auditRetentionDays: 730, aiProcessingAllowed: false, permittedAiProviders: '["glm","zai"]',
  });
  assert.throws(() => validateOrganizationPolicyPatch({ dataRetentionDays: 7 }), /between/);
  assert.throws(() => validateOrganizationPolicyPatch({ permittedAiProviders: ["unknown"] }), /unsupported/);
  assert.throws(() => validateOrganizationPolicyPatch({ permittedAiProviders: ["glm", "glm"] }), /duplicate/);
});

test("retention evaluator never marks a legally held resource eligible", () => {
  const now = new Date("2026-11-25T00:00:00.000Z");
  const createdAt = new Date("2025-01-01T00:00:00.000Z");
  assert.equal(isRetentionEligible({ createdAt, retentionDays: 365, now, held: false }), true);
  assert.equal(isRetentionEligible({ createdAt, retentionDays: 365, now, held: true }), false);
  assert.equal(isRetentionEligible({ createdAt, retentionDays: 365, now: new Date("2025-02-01T00:00:00.000Z") }), false);
});

test("compliance package is deterministic for a fixed timestamp and canonical payload", () => {
  const at = new Date("2026-11-25T00:00:00.000Z");
  const first = buildCompliancePackage({ z: 1, a: { y: 2, x: 3 } }, at);
  const second = buildCompliancePackage({ a: { x: 3, y: 2 }, z: 1 }, at);
  assert.equal(first.manifest.sha256, second.manifest.sha256);
  assert.equal(first.manifest.hashAlgorithm, "SHA-256");
  assert.equal(first.body.schemaVersion, "modrik.enterprise-compliance.v1");
});

test("enterprise API route permissions are explicit and least-privilege", () => {
  assert.equal(resolveOrganizationRoutePermission("/api/organizations", "POST"), "organizations:create");
  assert.equal(resolveOrganizationRoutePermission("/api/organizations/portfolio", "GET"), "organization:read");
  assert.equal(resolveOrganizationRoutePermission("/api/organizations/usage", "GET"), "organization:read");
  assert.equal(resolveOrganizationRoutePermission("/api/organizations/policies", "PATCH"), "organization:manage");
  assert.equal(resolveOrganizationRoutePermission("/api/organizations/compliance/export", "GET"), "audit:read");
  assert.equal(resolveOrganizationRoutePermission("/api/organizations/portfolio", "DELETE"), null);
});

test("baseline registry is immutable at the API boundary and snapshots require an approved final baseline", () => {
  const route = fs.readFileSync(new URL("../src/app/api/projects/[id]/baselines/route.ts", import.meta.url), "utf8");
  assert.match(route, /organizationId:identity\.organizationId/);
  assert.match(route, /project\.status!=="complete"\|\|project\.currentStage!=="CONFLICTS"/);
  assert.match(route, /BASELINE_HAS_UNAPPROVED_REQUIREMENTS/);
  assert.match(route, /BASELINE_HAS_OPEN_CONFLICTS/);
  assert.match(route, /createHash\("sha256"\)/);
  assert.match(route, /baseline_snapshot_created/);
  assert.doesNotMatch(route, /export async function (PUT|PATCH|DELETE)\(/);
});

test("tenant AI policy blocks disabled processing and provider mismatches in the proxy", () => {
  const proxy = fs.readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /AI_PROCESSING_DISABLED/);
  assert.match(proxy, /AI_PROVIDER_NOT_PERMITTED/);
  assert.match(proxy, /organizationPolicy\.findUnique/);
});

test("agent usage metering is written idempotently in the worker completion transaction", () => {
  const worker = fs.readFileSync(new URL("../scripts/run-pipeline-worker.ts", import.meta.url), "utf8");
  assert.match(worker, /pipeline-run:/);
  assert.match(worker, /tx\.usageEvent\.upsert/);
  assert.match(worker, /idempotencyKey/);
});

test("plan limits are enforced for project creation and member invitations", () => {
  const projects = fs.readFileSync(new URL("../src/app/api/projects/route.ts", import.meta.url), "utf8");
  const invitations = fs.readFileSync(new URL("../src/app/api/invitations/route.ts", import.meta.url), "utf8");
  assert.match(projects, /PLAN_LIMIT_PROJECTS/);
  assert.match(projects, /isolationLevel: "Serializable"/);
  assert.match(invitations, /PLAN_LIMIT_MEMBERS/);
  assert.match(invitations, /isolationLevel: "Serializable"/);
});

test("organization portfolio and compliance exports disclose estimate and truncation semantics", () => {
  const portfolio = fs.readFileSync(new URL("../src/app/api/organizations/portfolio/route.ts", import.meta.url), "utf8");
  const usage = fs.readFileSync(new URL("../src/app/api/organizations/usage/route.ts", import.meta.url), "utf8");
  const compliance = fs.readFileSync(new URL("../src/app/api/organizations/compliance/export/route.ts", import.meta.url), "utf8");
  assert.match(portfolio, /usageCost: "estimated"/);
  assert.match(usage, /metering_only/);
  assert.match(compliance, /auditTruncated/);
  assert.match(compliance, /not a legal certification/i);
});

test("AI governance is re-enforced inside the durable worker for queued, webhook and cron jobs", () => {
  const retention = fs.readFileSync(new URL("../src/lib/phase4/retention.mjs", import.meta.url), "utf8");
  const worker = fs.readFileSync(new URL("../scripts/run-pipeline-worker.ts", import.meta.url), "utf8");
  assert.equal(assertOrganizationAiProviderAllowed(null, "glm"), true);
  assert.equal(assertOrganizationAiProviderAllowed({ aiProcessingAllowed: true, permittedAiProviders: '["zai","glm"]' }, "glm"), true);
  assert.throws(() => assertOrganizationAiProviderAllowed({ aiProcessingAllowed: false, permittedAiProviders: '["glm"]' }, "glm"), /403 ORGANIZATION_AI_PROCESSING_DISABLED/);
  assert.throws(() => assertOrganizationAiProviderAllowed({ aiProcessingAllowed: true, permittedAiProviders: '["zai"]' }, "glm"), /403 ORGANIZATION_AI_PROVIDER_NOT_PERMITTED/);
  assert.throws(() => assertOrganizationAiProviderAllowed({ aiProcessingAllowed: true, permittedAiProviders: "invalid" }, "glm"), /403 ORGANIZATION_AI_POLICY_INVALID/);
  assert.match(retention, /assertOrganizationAiProviderAllowed/);
  assert.match(worker, /await assertProjectAiPolicy\(job\.projectId\)/);
});

test("retention holds are project-scoped and destructive APIs enforce active holds transactionally", () => {
  const schema = fs.readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  const projectDelete = fs.readFileSync(new URL("../src/app/api/projects/[id]/route.ts", import.meta.url), "utf8");
  const evidenceDelete = fs.readFileSync(new URL("../src/app/api/projects/[id]/evidence/route.ts", import.meta.url), "utf8");
  const itemDelete = fs.readFileSync(new URL("../src/app/api/projects/[id]/items/route.ts", import.meta.url), "utf8");
  const policyRoute = fs.readFileSync(new URL("../src/app/api/organizations/policies/route.ts", import.meta.url), "utf8");
  assert.match(schema, /projectId\s+String\?/);
  assert.match(schema, /project\s+Project\? @relation\(fields: \[projectId\], references: \[id\], onDelete: SetNull\)/);
  assert.match(projectDelete, /findActiveProjectRetentionHold/);
  assert.match(projectDelete, /isolationLevel: "Serializable"/);
  assert.match(evidenceDelete, /findActiveResourceRetentionHold/);
  assert.match(evidenceDelete, /RETENTION_HOLD_ACTIVE/);
  assert.match(itemDelete, /findActiveResourceRetentionHold/);
  assert.match(itemDelete, /RETENTION_HOLD_ACTIVE/);
  assert.match(policyRoute, /projectId,resourceType,resourceId/);
  assert.match(policyRoute, /isolationLevel:"Serializable"/);
});
