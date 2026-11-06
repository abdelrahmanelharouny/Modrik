import test from "node:test";
import assert from "node:assert/strict";
import { validateJiraBaseUrl, buildJiraUrl } from "../src/lib/security/jira-url.mjs";

test("accepts only tenant-scoped Atlassian OAuth Jira API base URLs",()=>{
 const base="https://api.atlassian.com/ex/jira/abc123-456/";
 assert.equal(validateJiraBaseUrl(base).hostname,"api.atlassian.com");
 assert.equal(buildJiraUrl(base,"rest/api/3/myself"),"https://api.atlassian.com/ex/jira/abc123-456/rest/api/3/myself");
 assert.throws(()=>validateJiraBaseUrl("https://api.atlassian.com/"));
 assert.throws(()=>validateJiraBaseUrl("https://api.atlassian.com/oauth/token"));
});
