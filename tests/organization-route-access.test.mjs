import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPublicApiRequest } from "../src/lib/security/api-access.mjs";
import { resolveOrganizationRoutePermission } from "../src/lib/security/organization-route-access.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = path.join(root, "src", "app", "api");

function collectRouteFiles(directory, relative = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relativePath = path.join(relative, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectRouteFiles(absolutePath, relativePath));
    else if (entry.isFile() && entry.name === "route.ts") files.push(relativePath);
  }
  return files;
}

function methodsIn(source) {
  return [...source.matchAll(/export\s+async\s+function\s+(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\s*\(/g)]
    .map((match) => match[1]);
}

test("every non-project API handler has an explicit organization permission or exact public exemption", () => {
  const unclassified = [];
  for (const file of collectRouteFiles(apiRoot)) {
    const pathname = "/api" + file.split(path.sep).slice(0, -1).map((part) => part.replace(/^\[(.*)\]$/, ":$1")).join("/");
    if (pathname.startsWith("/api/projects/") || pathname === "/api/projects") continue;
    const source = fs.readFileSync(path.join(apiRoot, file), "utf8");
    const methods = methodsIn(source);
    assert.ok(methods.length > 0, `${pathname} must export an HTTP method`);
    for (const method of methods) {
      if (isPublicApiRequest(pathname, method)) continue;
      if (!resolveOrganizationRoutePermission(pathname, method)) {
        unclassified.push(`${method} ${pathname}`);
      }
    }
  }
  assert.deepEqual(unclassified, [], `Unclassified API handlers: ${unclassified.join(", ")}`);
});

test("sensitive non-project routes require the intended least-privilege role permission", () => {
  assert.equal(resolveOrganizationRoutePermission("/api/transcribe", "POST"), "requirements:write");
  assert.equal(resolveOrganizationRoutePermission("/api/telemetry", "GET"), "audit:read");
  assert.equal(resolveOrganizationRoutePermission("/api/study", "POST"), "organization:manage");
  assert.equal(resolveOrganizationRoutePermission("/api/providers", "GET"), "organization:read");
  assert.equal(resolveOrganizationRoutePermission("/api/transcribe", "GET"), null);
  assert.equal(resolveOrganizationRoutePermission("/api/unclassified", "POST"), null);
});

test("public API exemptions are restricted to the intended HTTP methods", async () => {
  const { isPublicApiRequest } = await import("../src/lib/security/api-access.mjs");
  assert.equal(isPublicApiRequest("/api/auth/login", "POST"), true);
  assert.equal(isPublicApiRequest("/api/auth/login", "GET"), false);
  assert.equal(isPublicApiRequest("/api/auth/session", "GET"), true);
  assert.equal(isPublicApiRequest("/api/auth/session", "POST"), false);
  assert.equal(isPublicApiRequest("/api/study/respond", "GET"), true);
  assert.equal(isPublicApiRequest("/api/study/respond", "PATCH"), false);
});
