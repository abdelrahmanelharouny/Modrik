import test from "node:test";
import assert from "node:assert/strict";
import { createOfflineEvidenceOperation } from "../src/lib/evidence/offline-queue.mjs";

test("offline evidence operation preserves explicit consent and stable idempotency identity", () => {
  const payload = { title: "Interview", sourceType: "interview", language: "ar-EG", content: "نحتاج دعم العربية", consent: false };
  const operation = createOfflineEvidenceOperation("project-1", payload, "operation-123");
  assert.equal(operation.operationId, "operation-123");
  assert.equal(operation.projectId, "project-1");
  assert.equal(operation.payload.consent, false);
  assert.equal(operation.attempts, 0);
  assert.ok(Number.isFinite(Date.parse(operation.createdAt)));
});

test("offline operation validation rejects missing project, oversized content and implicit consent", () => {
  assert.throws(() => createOfflineEvidenceOperation("", { title: "a", content: "b", consent: false }));
  assert.throws(() => createOfflineEvidenceOperation("p", { title: "x".repeat(201), content: "b", consent: false }));
  assert.throws(() => createOfflineEvidenceOperation("p", { title: "a", content: "x".repeat(8001), consent: false }));
  assert.throws(() => createOfflineEvidenceOperation("p", { title: "a", content: "b" }));
});
