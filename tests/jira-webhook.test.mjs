import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { normalizeJiraWebhook, verifyJiraWebhookSignature } from "../src/lib/integrations/jira-webhook.mjs";

test("Jira Cloud X-Hub-Signature validates the exact body using the declared HMAC method", () => {
  const secret = "It's a Secret to Everybody", body = "Hello World!";
  const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(signature, "sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9");
  assert.equal(verifyJiraWebhookSignature(body, signature, secret), true);
  assert.equal(verifyJiraWebhookSignature(body + " ", signature, secret), false);
  assert.equal(verifyJiraWebhookSignature(body, "sha1=" + signature.slice(7), secret), false);
  assert.equal(verifyJiraWebhookSignature(body, null, secret), false);
});

test("Jira issue updates normalize bounded ADF descriptions into untrusted drift signals", () => {
  const payload = {
    webhookEvent: "jira:issue_updated",
    issue: { id: "10001", key: "MOD-42", fields: {
      project: { key: "MOD" }, summary: "Auth contract changed", status: { name: "In Progress" },
      description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "New token rotation requirement" }] }] },
    } },
  };
  const result = normalizeJiraWebhook(payload, "MOD", "https://example.atlassian.net");
  assert.equal(result.key, "MOD-42");
  assert.equal(result.url, "https://example.atlassian.net/browse/MOD-42");
  assert.match(result.signal, /New token rotation requirement/);
  assert.match(result.signal, /untrusted project data/);
});

test("foreign projects, unsupported events and malformed issue keys are ignored", () => {
  const payload = { webhookEvent: "jira:issue_updated", issue: { key: "MOD-1", fields: { project: { key: "OTHER" } } } };
  assert.equal(normalizeJiraWebhook(payload, "MOD", "https://example.atlassian.net"), null);
  assert.equal(normalizeJiraWebhook({ ...payload, webhookEvent: "jira:worklog_updated" }, "MOD", "https://example.atlassian.net"), null);
  assert.equal(normalizeJiraWebhook({ webhookEvent: "jira:issue_created", issue: { key: "bad key", fields: { project: { key: "MOD" } } } }, "MOD", "https://example.atlassian.net"), null);
});
