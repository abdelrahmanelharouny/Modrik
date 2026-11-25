const PROVIDERS = new Set(["zai","glm","model-b","local","openai-compatible"]);
export function validateOrganizationPolicyPatch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Policy payload must be an object.");
  const result = {};
  for (const [key, min, max] of [
    ["dataRetentionDays",30,3650],["auditRetentionDays",365,3650],["evidenceRetentionDays",30,3650],
  ]) {
    if (input[key] === undefined) continue;
    if (!Number.isSafeInteger(input[key]) || input[key] < min || input[key] > max) throw new RangeError(key+" must be an integer between "+min+" and "+max+".");
    result[key] = input[key];
  }
  if (input.aiProcessingAllowed !== undefined) {
    if (typeof input.aiProcessingAllowed !== "boolean") throw new TypeError("aiProcessingAllowed must be boolean.");
    result.aiProcessingAllowed = input.aiProcessingAllowed;
  }
  if (input.defaultLocale !== undefined) {
    if (!["en","ar"].includes(input.defaultLocale)) throw new TypeError("defaultLocale must be en or ar.");
    result.defaultLocale = input.defaultLocale;
  }
  if (input.permittedAiProviders !== undefined) {
    if (!Array.isArray(input.permittedAiProviders) || input.permittedAiProviders.length > PROVIDERS.size ||
        input.permittedAiProviders.some(value => typeof value !== "string" || !PROVIDERS.has(value)) ||
        new Set(input.permittedAiProviders).size !== input.permittedAiProviders.length) {
      throw new TypeError("permittedAiProviders contains an unsupported or duplicate provider.");
    }
    result.permittedAiProviders = JSON.stringify([...input.permittedAiProviders].sort());
  }
  if (!Object.keys(result).length) throw new TypeError("No supported policy fields were supplied.");
  return result;
}
export function isRetentionEligible(input = {}) {
  const createdAt = input.createdAt instanceof Date ? input.createdAt : new Date(input.createdAt);
  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now());
  const days = Number(input.retentionDays);
  if (!Number.isFinite(createdAt.getTime()) || !Number.isFinite(now.getTime()) || !Number.isSafeInteger(days) || days < 1) return false;
  if (input.held === true) return false;
  return createdAt.getTime() <= now.getTime() - days * 86_400_000;
}

/**
 * Re-check organization AI governance inside the worker, not only at the HTTP
 * proxy. Webhooks, cron sweeps and already-queued jobs bypass the browser path.
 * A missing policy uses the documented legacy-safe defaults for existing orgs.
 */
export function assertOrganizationAiProviderAllowed(policy, provider) {
  const selected = typeof provider === "string" ? provider.trim() : "";
  if (!selected) throw new Error("403 ORGANIZATION_AI_PROVIDER_UNCONFIGURED");
  if (!policy) return true;
  if (policy.aiProcessingAllowed !== true) {
    throw new Error("403 ORGANIZATION_AI_PROCESSING_DISABLED");
  }
  let permitted;
  try {
    permitted = Array.isArray(policy.permittedAiProviders)
      ? policy.permittedAiProviders
      : JSON.parse(String(policy.permittedAiProviders ?? "[]"));
  } catch {
    throw new Error("403 ORGANIZATION_AI_POLICY_INVALID");
  }
  if (!Array.isArray(permitted) || !permitted.includes(selected)) {
    throw new Error("403 ORGANIZATION_AI_PROVIDER_NOT_PERMITTED");
  }
  return true;
}
