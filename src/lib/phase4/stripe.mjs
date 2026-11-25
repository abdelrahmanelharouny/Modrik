import { createHmac, timingSafeEqual } from "node:crypto";

const PLAN_KEYS = new Set(["free", "team", "business", "enterprise"]);
const PRICE_ENV = Object.freeze({
  team: "STRIPE_PRICE_TEAM",
  business: "STRIPE_PRICE_BUSINESS",
  enterprise: "STRIPE_PRICE_ENTERPRISE",
});

export function stripePriceForPlan(planKey, env = process.env) {
  if (!["team", "business", "enterprise"].includes(planKey)) return null;
  const key = PRICE_ENV[planKey];
  const value = typeof env[key] === "string" ? env[key].trim() : "";
  return value || null;
}

export function planForStripePrice(priceId, env = process.env) {
  if (typeof priceId !== "string" || !priceId) return null;
  for (const [planKey, envKey] of Object.entries(PRICE_ENV)) {
    const configured = typeof env[envKey] === "string" ? env[envKey].trim() : "";
    if (configured && configured === priceId) return planKey;
  }
  return null;
}

export function normalizeStripeSubscriptionStatus(value) {
  switch (value) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "past_due":
    case "unpaid":
    case "incomplete": return "past_due";
    case "canceled":
    case "incomplete_expired": return "canceled";
    case "paused": return "suspended";
    default: return "suspended";
  }
}

export function verifyStripeWebhookSignature(rawBody, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300) {
  if (typeof rawBody !== "string" || typeof signatureHeader !== "string" || typeof secret !== "string" || !secret) return false;
  if (!Number.isSafeInteger(nowSeconds) || !Number.isSafeInteger(toleranceSeconds) || toleranceSeconds < 1) return false;
  const parts = signatureHeader.split(",").map(part => part.trim());
  const timestampPart = parts.find(part => part.startsWith("t="));
  const signatures = parts.filter(part => part.startsWith("v1=")).map(part => part.slice(3)).filter(value => /^[a-f0-9]{64}$/i.test(value));
  if (!timestampPart || !signatures.length) return false;
  const timestamp = Number(timestampPart.slice(2));
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(String(timestamp) + "." + rawBody, "utf8").digest();
  return signatures.some(signature => {
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export function stripeEventOrganizationId(object) {
  const value = object?.metadata?.organizationId ?? object?.metadata?.orgId ?? null;
  return typeof value === "string" && value.length > 0 && value.length <= 128 ? value : null;
}

export function stripeEventPlanKey(object, env = process.env) {
  const metadata = object?.metadata?.planKey;
  if (typeof metadata === "string" && PLAN_KEYS.has(metadata)) return metadata;
  const items = object?.items?.data;
  const priceId = Array.isArray(items) ? items.find(item => item?.price?.id)?.price?.id : null;
  return planForStripePrice(priceId, env);
}

export function stripeEpochDate(value) {
  return Number.isSafeInteger(value) && value > 0 ? new Date(value * 1000) : null;
}

export function stripeForm(fields) {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(fields ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    form.set(key, String(value));
  }
  return form;
}

export async function stripeApiRequest(path, { secretKey, method = "POST", fields = {}, idempotencyKey, fetchImpl = fetch } = {}) {
  if (typeof secretKey !== "string" || !/^sk_(test|live)_/.test(secretKey)) throw new Error("STRIPE_SECRET_KEY is not configured");
  const response = await fetchImpl("https://api.stripe.com/v1/" + path.replace(/^\/+/, ""), {
    method,
    headers: {
      Authorization: "Bearer " + secretKey,
      ...(method === "GET" ? {} : { "Content-Type": "application/x-www-form-urlencoded" }),
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    ...(method === "GET" ? {} : { body: stripeForm(fields).toString() }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error?.message === "string" ? payload.error.message : "Stripe API request failed";
    throw new Error("STRIPE_API_" + response.status + ": " + message.slice(0, 240));
  }
  return payload;
}
