import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const route = fs.readFileSync(new URL("../src/app/api/projects/[id]/asr-feedback/route.ts", import.meta.url), "utf8");
test("ASR human corrections are opt-in, text-only, redacted and journaled", () => {
  assert.match(route, /prepareAsrHumanCorrection/);
  assert.match(route, /Object\.hasOwn\(body, "audio"\)/);
  assert.match(route, /organizationId: identity\.organizationId/);
  assert.match(route, /requirements:write/);
  assert.match(route, /kind: "asr_human_correction"/);
  assert.match(route, /originalTranscript: correction\.originalTranscript/);
  assert.match(route, /correctedTranscript: correction\.correctedTranscript/);
  assert.match(route, /audioStored: false/);
  assert.match(route, /asr_text_correction_consent/);
});
