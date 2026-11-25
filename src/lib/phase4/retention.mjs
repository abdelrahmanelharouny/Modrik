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
