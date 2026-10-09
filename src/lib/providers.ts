// ─────────────────────────────────────────────────────────────
// Modrik (مدرك) — LLM PROVIDER INTERFACE (dev item 12)
//
// Design contract ("strategy fixed, model swappable"):
//   • The FIXED STRATEGY lives in agents.ts — retry policy, JSON
//     repair, usage accounting, prompt versioning, evidence
//     budgets. It never changes per provider.
//   • The SWAPPABLE MODEL is any class implementing LlmProvider:
//       glm      — GLM via z-ai-web-dev-sdk (default provider)
//       model-b  — any OpenAI-compatible endpoint (env-configured)
//       local    — a local OpenAI-compatible server e.g. Ollama
//
// The active provider is resolved once per call from RP_LLM_PROVIDER
// (env), defaulting to "glm". Nothing here is hardcoded per project —
// credentials arrive from the environment at runtime (dynamicity rule).
// ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderResult {
  content: string;
  provider: ProviderId;
  model: string;
}

export type ProviderId = "glm" | "model-b" | "local";

export interface LlmProvider {
  readonly id: ProviderId;
  readonly model: string;
  complete(messages: ChatMessage[]): Promise<string>;
}

// ── GLM (default provider) ─────────────────────────────────

class GlmProvider implements LlmProvider {
  readonly id: ProviderId = "glm";
  readonly model = "GLM (default)";

  async complete(messages: ChatMessage[]): Promise<string> {
    let zai: import("z-ai-web-dev-sdk").default | undefined;
    try {
      const { default: ZAI } = await import("z-ai-web-dev-sdk");
      zai = await ZAI.create();
    } catch (err) {
      // Graceful degradation: z-ai-web-dev-sdk resolves its credentials
      // from its own sandbox environment. On foreign runtimes (e.g. a
      // Vercel deployment) it cannot — surface a HUMAN-READABLE fix
      // instead of a cryptic transport error (HITL honesty contract).
      throw new Error(
        "GLM provider unavailable — z-ai-web-dev-sdk could not initialize " +
          "outside its native sandbox. Configure a swappable provider instead: " +
          "set RP_LLM_PROVIDER=model-b plus RP_MODEL_B_BASE_URL, RP_MODEL_B_API_KEY " +
          "and RP_MODEL_B_MODEL (any OpenAI-compatible endpoint), or RP_LLM_PROVIDER=local " +
          "for an on-prem Ollama server. See README → Provider configuration." +
          (err instanceof Error ? ` [cause: ${err.message.slice(0, 140)}]` : ""),
      );
    }
    const completion = await zai.chat.completions.create({
      messages: messages as never,
    });
    return completion.choices[0]?.message?.content ?? "";
  }
}

// ── OpenAI-compatible endpoint (Model B / local share one shape) ──

class OpenAICompatProvider implements LlmProvider {
  readonly id: ProviderId;
  readonly model: string;
  private baseUrl: string;
  private apiKey: string;

  constructor(id: ProviderId, baseUrl: string, apiKey: string, model: string) {
    this.id = id;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.model = model;
  }

  async complete(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: this.model, messages, temperature: 0.4 }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      throw new Error(`Provider ${this.id} HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? "";
  }
}

// ── Registry (qualitative metadata for the UI) ───────────────

export const PROVIDER_META: Record<
  ProviderId,
  { label: string; labelAr: string; note: string; envKeys: string[] }
> = {
  glm: {
    label: "GLM",
    labelAr: "GLM",
    note: "Default production model",
    envKeys: [],
  },
  "model-b": {
    label: "Model B",
    labelAr: "النموذج B",
    note: "Any OpenAI-compatible endpoint — A/B research comparisons",
    envKeys: ["RP_MODEL_B_BASE_URL", "RP_MODEL_B_API_KEY", "RP_MODEL_B_MODEL"],
  },
  local: {
    label: "Local model",
    labelAr: "نموذج محلي",
    note: "Local OpenAI-compatible server (e.g. Ollama) — air-gapped / PDPL-resident runs",
    envKeys: ["RP_LOCAL_BASE_URL", "RP_LOCAL_MODEL"],
  },
};

export function listProviders(): { id: ProviderId; label: string; model: string; configured: boolean; active: boolean }[] {
  const active = resolveProviderId();
  return (Object.keys(PROVIDER_META) as ProviderId[]).map((id) => ({
    id,
    label: PROVIDER_META[id].label,
    model: describeProvider(id).model,
    configured: isConfigured(id),
    active: id === active,
  }));
}

export function resolveProviderId(): ProviderId {
  const raw = (process.env.RP_LLM_PROVIDER ?? "glm").toLowerCase();
  return raw === "model-b" || raw === "modelb" ? "model-b" : raw === "local" ? "local" : "glm";
}

function isConfigured(id: ProviderId): boolean {
  switch (id) {
    case "glm":
      return true; // z-ai-web-dev-sdk resolves its own credentials
    case "model-b":
      return Boolean(process.env.RP_MODEL_B_BASE_URL && process.env.RP_MODEL_B_MODEL);
    case "local":
      return Boolean(process.env.RP_LOCAL_BASE_URL && process.env.RP_LOCAL_MODEL);
  }
}

export function describeProvider(id: ProviderId): { id: ProviderId; label: string; model: string } {
  switch (id) {
    case "glm":
      return { id, label: "GLM", model: "GLM (default)" };
    case "model-b":
      return {
        id,
        label: "Model B",
        model: process.env.RP_MODEL_B_MODEL ?? "(RP_MODEL_B_MODEL not set)",
      };
    case "local":
      return {
        id,
        label: "Local model",
        model: process.env.RP_LOCAL_MODEL ?? "(RP_LOCAL_MODEL not set)",
      };
  }
}

// ── Resolution (single entry point used by agents.ts) ────────

export async function getProvider(id?: ProviderId): Promise<LlmProvider> {
  const chosen = id ?? resolveProviderId();
  switch (chosen) {
    case "glm":
      return new GlmProvider();
    case "model-b": {
      const base = process.env.RP_MODEL_B_BASE_URL;
      const model = process.env.RP_MODEL_B_MODEL;
      if (!base || !model) {
        throw new Error("Provider model-b not configured — set RP_MODEL_B_BASE_URL and RP_MODEL_B_MODEL");
      }
      return new OpenAICompatProvider("model-b", base, process.env.RP_MODEL_B_API_KEY ?? "", model);
    }
    case "local": {
      const base = process.env.RP_LOCAL_BASE_URL;
      const model = process.env.RP_LOCAL_MODEL;
      if (!base || !model) {
        throw new Error("Provider local not configured — set RP_LOCAL_BASE_URL and RP_LOCAL_MODEL");
      }
      return new OpenAICompatProvider("local", base, "", model);
    }
  }
}
