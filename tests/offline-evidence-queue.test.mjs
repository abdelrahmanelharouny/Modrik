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
  const sanitized = createOfflineEvidenceOperation("project-1", {
    ...valid.payload, unexpected: "sensitive-extra-field",
  }, "123e4567-e89b-42d3-a456-426614174001");
  assert.equal("unexpected" in sanitized.payload, false);
  assert.equal(sanitized.payload.sourceType, "interview");
  assert.equal(sanitized.payload.language, "en");
});


test("offline evidence sync lock serializes work for the same project", async () => {
  const { withOfflineEvidenceSyncLock } = await import("../src/lib/evidence/offline-queue.mjs");
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const first = withOfflineEvidenceSyncLock("project-lock", async () => {
    events.push("first-start");
    await firstGate;
    events.push("first-end");
  });
  const second = withOfflineEvidenceSyncLock("project-lock", async () => {
    events.push("second-start");
    events.push("second-end");
  });
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(events, ["first-start"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first-start", "first-end", "second-start", "second-end"]);
});

test("offline evidence sync locks do not block independent projects", async () => {
  const { withOfflineEvidenceSyncLock } = await import("../src/lib/evidence/offline-queue.mjs");
  const events = [];
  await Promise.all([
    withOfflineEvidenceSyncLock("project-a", async () => { events.push("a"); }),
    withOfflineEvidenceSyncLock("project-b", async () => { events.push("b"); }),
  ]);
  assert.deepEqual(events.sort(), ["a", "b"]);
});

test("offline evidence sync lock validates its project and task", async () => {
  const { withOfflineEvidenceSyncLock } = await import("../src/lib/evidence/offline-queue.mjs");
  await assert.rejects(() => withOfflineEvidenceSyncLock("", async () => {}), /projectId/);
  await assert.rejects(() => withOfflineEvidenceSyncLock("project-a", null), /task/);
});
