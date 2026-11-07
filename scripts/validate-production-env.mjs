import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const SCRYPT_HASH = /^\$scrypt\$(16384|32768|65536|131072)\$(8|9|10|11|12|13|14|15|16)\$(1|2|3|4)\$[a-f0-9]{32,128}\$[a-f0-9]{64,128}$/i;

function hasValue(env, key) {
  return typeof env[key] === "string" && env[key].trim().length > 0;
}
function validEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
function validEncryptionKey(value) {
  if (typeof value !== "string") return false;
  if (!/^[a-f0-9]{64}$/i.test(value) && !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const bytes = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  return bytes.length === 32;
}
function validHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

export function validateProductionEnv(env = process.env) {
  const errors = [];
  const required = [
    "DATABASE_URL", "MODRIK_ADMIN_EMAIL", "MODRIK_ADMIN_PASSWORD_HASH",
    "MODRIK_AUTH_SECRET", "MODRIK_ENCRYPTION_KEY", "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN", "RESEND_API_KEY", "PASSWORD_RESET_EMAIL_FROM", "APP_URL", "RP_LLM_PROVIDER",
  ];
  for (const key of required) if (!hasValue(env, key)) errors.push(`${key} is required`);
  if (hasValue(env, "DATABASE_URL") && !/^postgres(?:ql)?:\/\//i.test(env.DATABASE_URL.trim())) errors.push("DATABASE_URL must use PostgreSQL in production");
  if (hasValue(env, "MODRIK_ADMIN_EMAIL") && !validEmail(env.MODRIK_ADMIN_EMAIL)) errors.push("MODRIK_ADMIN_EMAIL must be a valid email address");
  if (hasValue(env, "MODRIK_ADMIN_PASSWORD_HASH") && !SCRYPT_HASH.test(env.MODRIK_ADMIN_PASSWORD_HASH.trim())) errors.push("MODRIK_ADMIN_PASSWORD_HASH must be a supported scrypt hash");
  if (hasValue(env, "MODRIK_AUTH_SECRET") && Buffer.byteLength(env.MODRIK_AUTH_SECRET, "utf8") < 32) errors.push("MODRIK_AUTH_SECRET must contain at least 32 bytes");
  if (hasValue(env, "MODRIK_ENCRYPTION_KEY") && !validEncryptionKey(env.MODRIK_ENCRYPTION_KEY.trim())) errors.push("MODRIK_ENCRYPTION_KEY must decode to exactly 32 bytes");
  if (hasValue(env, "UPSTASH_REDIS_REST_URL") && !validHttpsUrl(env.UPSTASH_REDIS_REST_URL.trim())) errors.push("UPSTASH_REDIS_REST_URL must be an HTTPS URL without embedded credentials");
  if (hasValue(env, "PASSWORD_RESET_EMAIL_FROM") &&
      !/^[^<>]+<[^<>@\s]+@[^<>@\s]+>$/.test(env.PASSWORD_RESET_EMAIL_FROM.trim()) &&
      !validEmail(env.PASSWORD_RESET_EMAIL_FROM.trim())) errors.push("PASSWORD_RESET_EMAIL_FROM must be an email address or Name <email> sender");
  if (hasValue(env, "APP_URL") && !validHttpsUrl(env.APP_URL.trim())) errors.push("APP_URL must be an HTTPS URL without embedded credentials");
  const provider = hasValue(env, "RP_LLM_PROVIDER") ? env.RP_LLM_PROVIDER.trim().toLowerCase() : "";
  if (provider && !["glm", "model-b", "local"].includes(provider)) {
    errors.push("RP_LLM_PROVIDER must be one of glm, model-b, or local");
  }
  if (provider === "glm" && env.RP_GLM_NATIVE_RUNTIME_CONFIRMED !== "true") {
    errors.push("RP_GLM_NATIVE_RUNTIME_CONFIRMED must be true only when the deployment runtime supports z-ai-web-dev-sdk credentials; otherwise select model-b or local");
  }
  if (provider === "model-b") {
    if (!hasValue(env, "RP_MODEL_B_BASE_URL")) errors.push("RP_MODEL_B_BASE_URL is required when RP_LLM_PROVIDER=model-b");
    else if (!validHttpsUrl(env.RP_MODEL_B_BASE_URL.trim())) errors.push("RP_MODEL_B_BASE_URL must be an HTTPS URL without embedded credentials in production");
    if (!hasValue(env, "RP_MODEL_B_MODEL")) errors.push("RP_MODEL_B_MODEL is required when RP_LLM_PROVIDER=model-b");
  }
  if (provider === "local") {
    if (!hasValue(env, "RP_LOCAL_BASE_URL")) errors.push("RP_LOCAL_BASE_URL is required when RP_LLM_PROVIDER=local");
    else {
      try {
        const url = new URL(env.RP_LOCAL_BASE_URL.trim());
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
          errors.push("RP_LOCAL_BASE_URL must be an HTTP(S) URL without embedded credentials");
        }
      } catch { errors.push("RP_LOCAL_BASE_URL must be a valid HTTP(S) URL"); }
    }
    if (!hasValue(env, "RP_LOCAL_MODEL")) errors.push("RP_LOCAL_MODEL is required when RP_LLM_PROVIDER=local");
  }
  return { ok: errors.length === 0, errors };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (!process.argv.includes("--production")) {
    process.stderr.write("Usage: node scripts/validate-production-env.mjs --production\n");
    process.exitCode = 2;
  } else {
    const result = validateProductionEnv();
    if (result.ok) process.stdout.write("Production environment configuration shape is valid.\n");
    else {
      process.stderr.write("Production environment validation failed:\n" + result.errors.map((error) => `- ${error}`).join("\n") + "\n");
      process.exitCode = 1;
    }
  }
}
