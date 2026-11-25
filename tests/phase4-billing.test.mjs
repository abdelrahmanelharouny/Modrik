import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import {
  normalizeStripeSubscriptionStatus,
  planForStripePrice,
  stripeApiRequest,
  stripeEpochDate,
  stripeEventOrganizationId,
  stripeEventPlanKey,
  stripeForm,
  stripePriceForPlan,
  verifyStripeWebhookSignature,
} from "../src/lib/phase4/stripe.mjs";
import { isPublicApiRequest } from "../src/lib/security/api-access.mjs";
import { resolveOrganizationRoutePermission } from "../src/lib/security/organization-route-access.mjs";

const secret = "whsec_unit_test_secret";
function signature(raw, timestamp) {
  const digest = createHmac("sha256", secret).update(timestamp + "." + raw, "utf8").digest("hex");
  return "t=" + timestamp + ",v1=" + digest;
}

test("Stripe webhook signature verifies exact raw bytes and enforces timestamp tolerance", () => {
  const raw = '{"id":"evt_test","type":"invoice.paid"}';
  const timestamp = 1_800_000_000;
  const valid = signature(raw, timestamp);
  assert.equal(verifyStripeWebhookSignature(raw, valid, secret, timestamp), true);
  assert.equal(verifyStripeWebhookSignature(raw + " ", valid, secret, timestamp), false);
  assert.equal(verifyStripeWebhookSignature(raw, valid, secret, timestamp + 301), false);
  assert.equal(verifyStripeWebhookSignature(raw, "t=bad,v1=abc", secret, timestamp), false);
  assert.equal(verifyStripeWebhookSignature(raw, valid, "", timestamp), false);
});

test("subscription states are normalized fail-closed", () => {
  assert.equal(normalizeStripeSubscriptionStatus("active"), "active");
  assert.equal(normalizeStripeSubscriptionStatus("trialing"), "trialing");
  assert.equal(normalizeStripeSubscriptionStatus("past_due"), "past_due");
  assert.equal(normalizeStripeSubscriptionStatus("incomplete"), "past_due");
  assert.equal(normalizeStripeSubscriptionStatus("canceled"), "canceled");
  assert.equal(normalizeStripeSubscriptionStatus("paused"), "suspended");
  assert.equal(normalizeStripeSubscriptionStatus("unknown"), "suspended");
});

test("paid plan price IDs map only from configured server-side values", () => {
  const env = { STRIPE_PRICE_TEAM:"price_team", STRIPE_PRICE_BUSINESS:"price_business", STRIPE_PRICE_ENTERPRISE:"price_enterprise" };
  assert.equal(stripePriceForPlan("team", env), "price_team");
  assert.equal(stripePriceForPlan("free", env), null);
  assert.equal(planForStripePrice("price_business", env), "business");
  assert.equal(planForStripePrice("price_forged", env), null);
  assert.equal(stripeEventPlanKey({ metadata:{ planKey:"enterprise" } }, env), "enterprise");
  assert.equal(stripeEventPlanKey({ metadata:{ planKey:"unknown" }, items:{data:[{price:{id:"price_team"}}]} }, env), "team");
});

test("Stripe event organization metadata is bounded and never reads untrusted top-level IDs", () => {
  assert.equal(stripeEventOrganizationId({ metadata:{organizationId:"org-1"} }), "org-1");
  assert.equal(stripeEventOrganizationId({ metadata:{orgId:"org-2"} }), "org-2");
  assert.equal(stripeEventOrganizationId({ organizationId:"org-3" }), null);
  assert.equal(stripeEventOrganizationId({ metadata:{organizationId:"x".repeat(129)} }), null);
});

test("Stripe forms omit empty values and preserve indexed field names", () => {
  const form = stripeForm({ customer:"cus_1", "line_items[0][price]":"price_1", optional:"", missing:null });
  assert.equal(form.get("customer"), "cus_1");
  assert.equal(form.get("line_items[0][price]"), "price_1");
  assert.equal(form.has("optional"), false);
  assert.equal(form.has("missing"), false);
});

test("Stripe API client uses server secret, idempotency and rejects provider errors", async () => {
  let request;
  const result = await stripeApiRequest("checkout/sessions", {
    secretKey:"sk_test_unit",
    fields:{mode:"subscription"},
    idempotencyKey:"idem-1",
    fetchImpl:async(url,init)=>{request={url,init};return {ok:true,json:async()=>({id:"cs_1",url:"https://checkout.stripe.com/cs_1"})};},
  });
  assert.equal(result.id,"cs_1");
  assert.equal(request.init.headers.Authorization,"Bearer sk_test_unit");
  assert.equal(request.init.headers["Idempotency-Key"],"idem-1");
  assert.equal(request.init.body,"mode=subscription");
  await assert.rejects(()=>stripeApiRequest("checkout/sessions",{secretKey:"sk_test_unit",fetchImpl:async()=>({ok:false,status:400,json:async()=>({error:{message:"card declined"}})})}),/STRIPE_API_400/);
  await assert.rejects(()=>stripeApiRequest("checkout/sessions",{secretKey:"invalid"}),/STRIPE_SECRET_KEY/);
});

test("Stripe epoch timestamps reject invalid values", () => {
  assert.equal(stripeEpochDate(1_800_000_000).toISOString(),"2027-01-15T08:00:00.000Z");
  assert.equal(stripeEpochDate(-1),null);
  assert.equal(stripeEpochDate("1800000000"),null);
});

test("Stripe public webhook and billing mutation routes have explicit authorization", () => {
  assert.equal(isPublicApiRequest("/api/webhooks/stripe","POST"),true);
  assert.equal(isPublicApiRequest("/api/webhooks/stripe","GET"),false);
  assert.equal(resolveOrganizationRoutePermission("/api/organizations/billing/checkout","POST"),"organization:manage");
  assert.equal(resolveOrganizationRoutePermission("/api/organizations/billing/portal","POST"),"organization:manage");
  const webhook = fs.readFileSync(new URL("../src/app/api/webhooks/stripe/route.ts",import.meta.url),"utf8");
  assert.match(webhook,/verifyStripeWebhookSignature/);
  assert.match(webhook,/providerEventId:eventId/);
  assert.match(webhook,/isolationLevel:"Serializable"/);
  assert.match(webhook,/billingEvent\.findUnique/);
  const checkout = fs.readFileSync(new URL("../src/app/api/organizations/billing/checkout/route.ts",import.meta.url),"utf8");
  assert.match(checkout,/identity\.organizationId/);
  assert.match(checkout,/subscription_data\[metadata\]\[organizationId\]/);
  assert.match(checkout,/idempotencyKey/);
  assert.match(checkout,/externalSubscriptionId/);
  assert.match(checkout,/subscription\.status!==\"canceled\"/,
    "checkout must not create a second subscription while a Stripe subscription is unresolved");
  assert.match(webhook,/eventType\.startsWith\(\"customer\.subscription\.\"\)/);
  assert.doesNotMatch(webhook,/data:\{status:eventType===\"invoice\.paid\"\?/
    , "invoice events must not mutate subscription access state");
});

test("invoice and billing event models use unique provider IDs", () => {
  const schema = fs.readFileSync(new URL("../prisma/schema.prisma",import.meta.url),"utf8");
  assert.match(schema,/model BillingEvent \{[\s\S]*providerEventId String\s+@unique/);
  assert.match(schema,/model BillingInvoice \{[\s\S]*externalInvoiceId String\s+@unique/);
});
