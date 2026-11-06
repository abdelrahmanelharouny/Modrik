import test from "node:test";
import assert from "node:assert/strict";
import {createOAuthTransaction,verifyOAuthTransaction,oauthCookieName,oauthCallbackUrl,oauthStateRecord,oauthActivationReady} from "../src/lib/security/oauth-lifecycle.mjs";
const env={MODRIK_AUTH_SECRET:"s".repeat(48),MODRIK_APP_URL:"https://modrik.example"};
test("OAuth transaction binds identity, project, provider and PKCE verifier",()=>{
 const tx=createOAuthTransaction({provider:"github",projectId:"p",userId:"u",organizationId:"o"},env,1800000000000);
 const value=verifyOAuthTransaction(tx.cookieValue,tx.state,"github",env,1800000001000);
 assert.equal(value.projectId,"p"); assert.equal(value.userId,"u"); assert.equal(value.organizationId,"o");
 assert.equal(value.verifier,tx.verifier); assert.equal(tx.challenge.length,43);
 const record=oauthStateRecord(value);
 assert.equal(oauthStateRecord(tx),record);
 assert.equal(record.includes(tx.state),false);
 assert.equal(JSON.parse(record).userId,"u");
});
test("OAuth transaction rejects wrong provider, state, signature and expiry",()=>{
 const tx=createOAuthTransaction({provider:"jira",projectId:"p",userId:"u",organizationId:"o"},env,1800000000000);
 assert.equal(verifyOAuthTransaction(tx.cookieValue,tx.state,"github",env,1800000001000),null);
 assert.equal(verifyOAuthTransaction(tx.cookieValue,"incorrect-state-value-long-enough","jira",env,1800000001000),null);
 assert.equal(verifyOAuthTransaction(tx.cookieValue+"x",tx.state,"jira",env,1800000001000),null);
 assert.equal(verifyOAuthTransaction(tx.cookieValue,tx.state,"jira",env,1800001000000),null);
});
test("OAuth callback URLs require HTTPS outside localhost",()=>{
 assert.equal(oauthCookieName("github"),"modrik_oauth_github");
 assert.equal(oauthCallbackUrl("github","https://modrik.example"),"https://modrik.example/api/integrations/oauth/github/callback");
 assert.throws(()=>oauthCallbackUrl("jira","http://example.com"));
});

test("OAuth activation requires provider, app URL, signing secret and encryption key",()=>{
 const ready={
  ...env,
  MODRIK_GITHUB_CLIENT_ID:"github-client",
  MODRIK_GITHUB_CLIENT_SECRET:"github-secret",
  MODRIK_ENCRYPTION_KEY:Buffer.alloc(32,7).toString("base64"),
 };
 assert.equal(oauthActivationReady("github",ready),true);
 assert.equal(oauthActivationReady("github",{...ready,MODRIK_APP_URL:""}),false);
 assert.equal(oauthActivationReady("github",{...ready,MODRIK_AUTH_SECRET:"short"}),false);
 assert.equal(oauthActivationReady("github",{...ready,MODRIK_ENCRYPTION_KEY:"invalid"}),false);
 assert.equal(oauthActivationReady("jira",ready),false);
});
