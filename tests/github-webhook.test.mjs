import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { normalizeGitHubWebhook, verifyGitHubWebhookSignature } from "../src/lib/integrations/github-webhook.mjs";

test("GitHub webhook signature validates exact raw bytes and rejects malformed or incorrect signatures", () => {
 const body='{"action":"opened"}', secret="a sufficiently long webhook secret";
 const signature="sha256="+createHmac("sha256",secret).update(body).digest("hex");
 assert.equal(verifyGitHubWebhookSignature(body,signature,secret),true);
 assert.equal(verifyGitHubWebhookSignature(body+" ",signature,secret),false);
 assert.equal(verifyGitHubWebhookSignature(body,"sha1="+signature.slice(7),secret),false);
 assert.equal(verifyGitHubWebhookSignature(body,null,secret),false);
 assert.equal(verifyGitHubWebhookSignature(body,signature,""),false);
});
test("issue events become bounded drift signals while pull requests and unsupported actions are ignored", () => {
 const payload={repository:{full_name:"acme/product"},issue:{number:42,title:"API changed",body:"The auth contract changed",state:"open",html_url:"https://github.com/acme/product/issues/42"}};
 const result=normalizeGitHubWebhook("issues","edited",payload);
 assert.equal(result.repository,"acme/product"); assert.equal(result.key,"#42"); assert.match(result.signal,/auth contract changed/);
 assert.equal(normalizeGitHubWebhook("issues","labeled",payload),null);
 assert.equal(normalizeGitHubWebhook("issues","opened",{...payload,issue:{...payload.issue,pull_request:{url:"x"}}}),null);
});
test("push events summarize commit messages and changed paths without unbounded payload growth", () => {
 const result=normalizeGitHubWebhook("push",null,{repository:{full_name:"acme/product"},ref:"refs/heads/main",compare:"https://github.com/acme/product/compare/a...b",commits:[{message:"Breaking API change\nmore",added:["src/a.ts"],modified:["src/b.ts"],removed:[]}]});
 assert.equal(result.key,"refs/heads/main"); assert.match(result.signal,/Breaking API change/); assert.match(result.signal,/src\/a.ts/);
 assert.equal(normalizeGitHubWebhook("push",null,{repository:{full_name:"acme/product"},ref:"refs/heads/main",commits:[]}),null);
});
test("malformed and foreign-shaped payloads are rejected", () => {
 assert.equal(normalizeGitHubWebhook("issues","opened",null),null);
 assert.equal(normalizeGitHubWebhook("issues","opened",{repository:{full_name:"not a repo"},issue:{number:1}}),null);
});
