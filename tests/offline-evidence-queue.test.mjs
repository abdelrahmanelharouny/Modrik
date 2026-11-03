import test from "node:test";
import assert from "node:assert/strict";
import { createOfflineEvidenceOperation } from "../src/lib/evidence/offline-queue.mjs";

test("offline evidence operation preserves explicit consent and stable idempotency identity", () => {
  const payload = { title: "Interview", sourceType: "interview", language: "ar-EG", content: "نحتاج دعم العربية", consent: false };
  const operation = createOfflineEvidenceOperation("project-1", payload, "123e4567-e89b-42d3-a456-426614174000");
  assert.equal(operation.operationId, "123e4567-e89b-42d3-a456-426614174000");
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
  assert.throws(() => createOfflineEvidenceOperation("p", { title: "a", content: "b", consent: false }, "not-a-uuid"));
  assert.throws(() => createOfflineEvidenceOperation("p", { title: "a", content: "b", consent: false, sourceType: "unknown" }, "123e4567-e89b-42d3-a456-426614174000"));
  assert.throws(() => createOfflineEvidenceOperation("p", { title: "a", content: "b", consent: false, language: "xx" }, "123e4567-e89b-42d3-a456-426614174000"));
  assert.throws(() => createOfflineEvidenceOperation("p", { title: "  ", content: "b", consent: false }, "123e4567-e89b-42d3-a456-426614174000"));
  assert.throws(() => createOfflineEvidenceOperation("p", { title: "a", content: "  ", consent: false }, "123e4567-e89b-42d3-a456-426614174000"));
});


test("offline persistence shape is allow-listed and does not retain arbitrary payload metadata", () => {
  const operation = createOfflineEvidenceOperation("project-1", {
    title: "Meeting", content: "Discussed launch", consent: true,
    sourceType: "meeting", language: "en", accessToken: "must-not-persist",
    participantEmail: "private@example.test",
  }, "123e4567-e89b-42d3-a456-426614174000");
  assert.deepEqual(Object.keys(operation.payload).sort(), ["consent", "content", "language", "sourceType", "title"]);
  assert.equal("accessToken" in operation.payload, false);
  assert.equal("participantEmail" in operation.payload, false);
});

test("offline operation rejects oversized identifiers and malformed retry metadata", () => {
  const valid = createOfflineEvidenceOperation("project-1", {
    title: "Interview", content: "Notes", consent: false,
  }, "123e4567-e89b-42d3-a456-426614174000");
  assert.throws(() => createOfflineEvidenceOperation("p".repeat(129), valid.payload, valid.operationId));
  assert.throws(() => createOfflineEvidenceOperation("project-1", {
    ...valid.payload, unexpected: "sensitive-extra-field",
  }, valid.operationId));
});
