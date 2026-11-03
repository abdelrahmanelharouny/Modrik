import test from "node:test";
import assert from "node:assert/strict";
import { makeSyncKey, makeSyncMarker } from "../src/lib/integrations/sync-key.mjs";

test("sync keys are deterministic and scoped by project, tracker and local item", () => {
  const a = makeSyncKey("project-1", "jira", "story-1");
  assert.equal(a, makeSyncKey("project-1", "jira", "story-1"));
  assert.notEqual(a, makeSyncKey("project-2", "jira", "story-1"));
  assert.notEqual(a, makeSyncKey("project-1", "github", "story-1"));
  assert.notEqual(a, makeSyncKey("project-1", "jira", "story-2"));
});

test("sync marker is stable and safe to embed in tracker text/labels", () => {
  const marker = makeSyncMarker("a".repeat(64));
  assert.equal(marker, "modrik-sync-" + "a".repeat(24));
  assert.match(marker, /^[a-z0-9-]+$/);
  assert.throws(() => makeSyncMarker("bad"));
  assert.throws(() => makeSyncKey("", "jira", "id"));
});
