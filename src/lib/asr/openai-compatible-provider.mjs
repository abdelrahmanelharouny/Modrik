function readConfig(env = process.env) {
  const rawEndpoint = String(env.RP_ASR_BASE_URL ?? "").trim();
  const apiKey = String(env.RP_ASR_API_KEY ?? "").trim();
  const model = String(env.RP_ASR_MODEL ?? "openai/whisper-large-v3-turbo").trim();
  if (!rawEndpoint || !model || model.length > 160) throw new Error("The OpenAI-compatible ASR endpoint and model must be configured.");
  let endpoint;
  try { endpoint = new URL(rawEndpoint); } catch { throw new Error("The ASR endpoint must be a valid URL."); }
  const local = ["localhost", "127.0.0.1", "::1"].includes(endpoint.hostname);
  const allowLocalHttp = env.RP_ASR_ALLOW_LOCAL_HTTP === "true";
  if (endpoint.protocol !== "https:" && !(local && allowLocalHttp && endpoint.protocol === "http:")) {
    throw new Error("The ASR endpoint must use HTTPS; loopback HTTP requires explicit opt-in.");
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new Error("The ASR endpoint cannot contain credentials, query parameters or fragments.");
  }
  if (endpoint.protocol === "https:" && local) throw new Error("Use explicit local HTTP configuration for loopback ASR endpoints.");
  return { endpoint: endpoint.toString().replace(/\/$/u, ""), apiKey, model };
}

export function buildEgyptianArabicAsrPrompt(language) {
  if (language === "ar-EG") {
    return "Transcribe verbatim in Egyptian Arabic as spoken. Preserve colloquial Egyptian words, grammar and pronunciation choices; do not convert the speaker's words into Modern Standard Arabic, translate, summarize or paraphrase. Keep product names, technical terms and English words in English when spoken.";
  }
  if (language === "codeswitch") {
    return "Transcribe the speech verbatim. The speaker may code-switch between Egyptian Arabic and English. Preserve both scripts and keep English technical terms in English. Do not translate, summarize, paraphrase or convert Egyptian Arabic into Modern Standard Arabic.";
  }
  return "";
}

/** OpenAI-compatible /audio/transcriptions adapter for a private or hosted Whisper endpoint. */
export async function createOpenAICompatibleAsrProvider(options = {}) {
  const config = readConfig(options.env ?? process.env);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required.");
  const timeoutMs = Number.isSafeInteger(options.timeoutMs) ? Math.max(1000, Math.min(options.timeoutMs, 180_000)) : 60_000;
  return {
    model: config.model,
    async transcribe(audioBase64, expectedLanguage = "unspecified") {
      if (typeof audioBase64 !== "string" || !audioBase64.trim() || audioBase64.length > 20_000_000) {
        throw new TypeError("ASR audio payload is empty or exceeds the configured size limit.");
      }
      const bytes = Buffer.from(audioBase64, "base64");
      if (bytes.length < 44 || bytes.length > 15 * 1024 * 1024 ||
          bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
          bytes.subarray(8, 12).toString("ascii") !== "WAVE") {
        throw new TypeError("ASR audio must be a valid bounded WAV payload.");
      }
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "audio/wav" }), "voice-note.wav");
      form.append("model", config.model);
      if (expectedLanguage === "ar-EG" || expectedLanguage === "codeswitch") form.append("language", "ar");
      else if (expectedLanguage === "en") form.append("language", "en");
      const prompt = buildEgyptianArabicAsrPrompt(expectedLanguage);
      if (prompt) form.append("prompt", prompt);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        let response;
        try {
          response = await fetchImpl(config.endpoint + "/audio/transcriptions", {
            method: "POST",
            headers: config.apiKey ? { authorization: "Bearer " + config.apiKey } : {},
            body: form,
            signal: controller.signal,
          });
        } catch (error) {
          if (error?.name === "AbortError") throw new Error("ASR provider request timed out.");
          throw new Error("ASR provider request failed.");
        }
        if (!response?.ok) {
          const status = Number.isInteger(response?.status) ? response.status : 0;
          throw new Error("ASR provider request failed with HTTP " + status + ".");
        }
        let payload;
        try { payload = await response.json(); }
        catch (error) {
          if (error?.name === "AbortError") throw new Error("ASR provider request timed out.");
          throw new Error("ASR provider returned invalid JSON.");
        }
        const text = typeof payload?.text === "string" ? payload.text.trim() : "";
        if (!text) throw new Error("ASR provider returned an empty transcript.");
        return text.slice(0, 20_000);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
