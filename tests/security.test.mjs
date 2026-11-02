import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { isSameOriginMutation } from "../src/lib/security/request-origin.mjs";
import { encryptSecret, decryptSecret, isEncryptedSecret } from "../src/lib/security/secret-box.mjs";
import { csvCell } from "../src/lib/security/csv.mjs";
import { validateJiraBaseUrl, buildJiraUrl, jiraFetchOptions } from "../src/lib/security/jira-url.mjs";
import { isPublicApiPath } from "../src/lib/security/api-access.mjs";
import {
  createSessionToken,
  verifySessionToken,
  verifyAdminCredentials,
  verifyAdminRequest,
  SESSION_TTL_SECONDS,
} from "../src/lib/security/session.mjs";

const key = randomBytes(32).toString("base64");
const secret = randomBytes(32).toString("base64");

test("secret box encrypts at rest and decrypts authenticated ciphertext", () => {
  const encrypted = encryptSecret("ghp_sensitive_token", key);
  assert.ok(isEncryptedSecret(encrypted));
  assert.notEqual(encrypted, "ghp_sensitive_token");
  assert.equal(decryptSecret(encrypted, key), "ghp_sensitive_token");
});

test("secret box rejects a wrong key and tampered ciphertext", () => {
  const encrypted = encryptSecret("jira-sensitive-token", key);
  assert.throws(() => decryptSecret(encrypted, randomBytes(32).toString("base64")));
  const parts = encrypted.split(":");
  const bytes = Buffer.from(parts[4], "base64url");
  bytes[0] ^= 1;
  parts[4] = bytes.toString("base64url");
  assert.throws(() => decryptSecret(parts.join(":"), key));
});

test("secret box keeps legacy plaintext readable for controlled migration", () => {
  assert.equal(decryptSecret("legacy-token"), "legacy-token");
  assert.equal(decryptSecret(""), "");
});

test("Jira accepts only approved HTTPS tenant hosts", () => {
  assert.equal(validateJiraBaseUrl("https://example.atlassian.net").hostname, "example.atlassian.net");
  assert.equal(
    validateJiraBaseUrl("https://jira.corp.example", {
      MODRIK_JIRA_ALLOWED_ORIGINS: "https://jira.corp.example",
    }).hostname,
    "jira.corp.example"
  );
});

test("Jira rejects HTTP, local hosts, IPs and suffix-spoofed domains", () => {
  for (const url of [
    "http://example.atlassian.net",
    "https://localhost",
    "https://127.0.0.1",
    "https://10.0.0.4",
    "https://example.atlassian.net.attacker.example",
    "https://attacker.example",
    "https://user:pass@example.atlassian.net",
    "https://example.atlassian.net?next=https://attacker.example",
  ]) {
    assert.throws(() => validateJiraBaseUrl(url), url);
  }
});

test("Jira URL builder preserves an approved context path and disables redirects", () => {
  const env = { MODRIK_JIRA_ALLOWED_ORIGINS: "https://jira.corp.example" };
  assert.equal(
    buildJiraUrl("https://jira.corp.example/jira", "rest/api/3/myself", env),
    "https://jira.corp.example/jira/rest/api/3/myself"
  );
  assert.equal(jiraFetchOptions({ method: "GET" }).redirect, "manual");
  assert.throws(() => buildJiraUrl("https://example.atlassian.net", "../admin"));
});

test("signed session token verifies and expires", () => {
  const now = Date.now();
  const token = createSessionToken("owner@example.com", secret, now);
  assert.equal(verifySessionToken(token, secret, now)?.email, "owner@example.com");
  assert.equal(verifySessionToken(token, secret, now + (SESSION_TTL_SECONDS + 1) * 1000), null);
  assert.equal(verifySessionToken(token + "x", secret, now), null);
  assert.equal(verifySessionToken(token, randomBytes(32).toString("base64"), now), null);
});

test("admin credentials use bounded scrypt hashes and reject malformed hashes", async () => {
  const { scrypt: scryptCallback, randomBytes: bytes } = await import("node:crypto");
  const { promisify } = await import("node:util");
  const scrypt = promisify(scryptCallback);
  const salt = bytes(16);
  const derived = await scrypt("Correct-Horse-Battery-42!", salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const env = {
    MODRIK_ADMIN_EMAIL: "owner@example.com",
    MODRIK_ADMIN_PASSWORD_HASH: `$scrypt$16384$8$1$${salt.toString("hex")}$${Buffer.from(derived).toString("hex")}`,
    MODRIK_AUTH_SECRET: secret,
  };
  assert.equal(await verifyAdminCredentials("OWNER@example.com", "Correct-Horse-Battery-42!", env), true);
  assert.equal(await verifyAdminCredentials("owner@example.com", "wrong", env), false);
  assert.equal(await verifyAdminCredentials("owner@example.com", "Correct-Horse-Battery-42!", { ...env, MODRIK_ADMIN_PASSWORD_HASH: "invalid" }), false);
});


test("CSV cells quote delimiters and neutralize spreadsheet formulas", () => {
  const dangerous = csvCell('=HYPERLINK("https://attacker.example")');
  assert.ok(dangerous.startsWith("\"'=HYPERLINK("));
  assert.ok(dangerous.includes('""https://attacker.example""'));
  assert.ok(dangerous.endsWith("\""));
  assert.equal(csvCell("  +SUM(1,2)"), "\"'  +SUM(1,2)\"");
  assert.equal(csvCell("ordinary, text"), "\"ordinary, text\"");
  assert.equal(csvCell('say "hello"'), "\"say \"\"hello\"\"\"");
  assert.equal(csvCell(-10), "\"-10\"");
});

test("API owner authorization rejects missing, expired, misconfigured and non-owner sessions",()=>{
  const now=Date.now();
  const env={MODRIK_ADMIN_EMAIL:"owner@example.com",MODRIK_ADMIN_PASSWORD_HASH:"configured",MODRIK_AUTH_SECRET:secret};
  const token=createSessionToken("owner@example.com",secret,now);
  assert.equal(verifyAdminRequest(token,env,now)?.role,"owner");
  assert.equal(verifyAdminRequest(undefined,env,now),null);
  assert.equal(verifyAdminRequest(token,{...env,MODRIK_ADMIN_EMAIL:"other@example.com"},now),null);
  assert.equal(verifyAdminRequest(token,{...env,MODRIK_AUTH_SECRET:"short"},now),null);
  assert.equal(verifyAdminRequest(token,env,now+(SESSION_TTL_SECONDS+1)*1000),null);
  const other=createSessionToken("other@example.com",secret,now);
  assert.equal(verifyAdminRequest(other,env,now),null);
});


test("public API access is an exact, minimal allowlist", () => {
  const publicPaths = [
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/session",
    "/api/study/respond",
  ];
  for (const path of publicPaths) assert.equal(isPublicApiPath(path), true, path);

  const protectedPaths = [
    "/api/projects",
    "/api/projects/project-1",
    "/api/projects/project-1/evidence",
    "/api/projects/project-1/stakeholders",
    "/api/study",
    "/api/telemetry",
    "/api/missions",
    "/api/providers",
    "/api/auth/login/",
    "/api/auth/login/extra",
    "/api/study/respond/",
    "/api/study/respond/extra",
    "",
    null,
    undefined,
  ];
  for (const path of protectedPaths) assert.equal(isPublicApiPath(path), false, String(path));
});


test("state-changing request origin validation uses the actual request host", () => {
  const sameOrigin = new Headers({ host: "127.0.0.1:3187", origin: "http://127.0.0.1:3187", "sec-fetch-site": "same-origin" });
  assert.equal(isSameOriginMutation(sameOrigin, "http:"), true);
  const crossOrigin = new Headers({ host: "127.0.0.1:3187", origin: "https://attacker.example", "sec-fetch-site": "cross-site" });
  assert.equal(isSameOriginMutation(crossOrigin, "http:"), false);
  const crossSiteWithoutOrigin = new Headers({ host: "127.0.0.1:3187", "sec-fetch-site": "cross-site" });
  assert.equal(isSameOriginMutation(crossSiteWithoutOrigin, "http:"), false);
  const trustedProxyHttps = new Headers({ host: "app.example.com", origin: "https://app.example.com", "x-forwarded-proto": "https" });
  assert.equal(isSameOriginMutation(trustedProxyHttps, "http:"), true);
  const malformedOrigin = new Headers({ host: "app.example.com", origin: "not a URL" });
  assert.equal(isSameOriginMutation(malformedOrigin, "https:"), false);
  const protocolMismatch = new Headers({ host: "app.example.com", origin: "http://app.example.com", "x-forwarded-proto": "https" });
  assert.equal(isSameOriginMutation(protocolMismatch, "http:"), false);
  const hostMismatch = new Headers({ host: "internal.example", origin: "https://app.example.com", "x-forwarded-proto": "https" });
  assert.equal(isSameOriginMutation(hostMismatch, "http:"), false);
  const missingHost = new Headers({ origin: "https://app.example.com", "x-forwarded-proto": "https" });
  assert.equal(isSameOriginMutation(missingHost, "http:"), false);
});
