import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAICompatibleAsrProvider, buildEgyptianArabicAsrPrompt } from "../src/lib/asr/openai-compatible-provider.mjs";

const wav = Buffer.concat([
  Buffer.from("RIFF"), Buffer.from([36,0,0,0]), Buffer.from("WAVE"),
  Buffer.from("fmt "), Buffer.from([16,0,0,0,1,0,1,0,0x80,0x3e,0,0,0,0x7d,0,0,2,0,16,0]),
  Buffer.from("data"), Buffer.from([0,0,0,0]),
]).toString("base64");
const env = {
  RP_ASR_BASE_URL: "https://asr.example.test/v1",
  RP_ASR_API_KEY: "test-secret",
  RP_ASR_MODEL: "openai/whisper-large-v3-turbo",
};

test("provider submits WAV to the OpenAI-compatible transcription route with an Egyptian-Arabic prompt", async () => {
  let request;
  const provider = await createOpenAICompatibleAsrProvider({
    env,
    fetch: async (url, init) => {
      request = { url, init };
      return { ok: true, json: async () => ({ text: "إحنا عايزين نراجع الـAPI" }) };
    },
  });
  const transcript = await provider.transcribe(wav, "ar-EG");
  const form = request.init.body;
  assert.equal(request.url, "https://asr.example.test/v1/audio/transcriptions");
  assert.equal(request.init.headers.authorization, "Bearer test-secret");
  assert.equal(form.get("model"), "openai/whisper-large-v3-turbo");
  assert.equal(form.get("language"), "ar");
  assert.match(form.get("prompt"), /Egyptian Arabic/);
  assert.equal(transcript, "إحنا عايزين نراجع الـAPI");
});
test("code-switching receives a different verbatim prompt and Arabic language hint", async () => {
  assert.match(buildEgyptianArabicAsrPrompt("codeswitch"), /code-switch/);
  assert.match(buildEgyptianArabicAsrPrompt("codeswitch"), /English/);
  const provider = await createOpenAICompatibleAsrProvider({ env, fetch: async (_url, init) => {
    assert.equal(init.body.get("language"), "ar");
    assert.match(init.body.get("prompt"), /code-switch/);
    return { ok: true, json: async () => ({ text: "تمام, use the API" }) };
  } });
  assert.equal(await provider.transcribe(wav, "codeswitch"), "تمام, use the API");
});
test("provider refuses remote HTTP, malformed WAV and reports sanitized provider errors", async () => {
  await assert.rejects(() => createOpenAICompatibleAsrProvider({ env: { ...env, RP_ASR_BASE_URL: "http://remote.example.test/v1" } }), /HTTPS/);
  const provider = await createOpenAICompatibleAsrProvider({ env, fetch: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(() => provider.transcribe("bm90LXdhcg==", "ar-EG"), /WAV/);
  await assert.rejects(() => provider.transcribe(wav, "ar-EG"), /HTTP 503/);
});
test("provider rejects credentials or search parameters embedded in its endpoint", async () => {
  await assert.rejects(() => createOpenAICompatibleAsrProvider({ env: { ...env, RP_ASR_BASE_URL: "https://user:pass@asr.example.test/v1?token=x" } }), /cannot contain credentials/);
});
