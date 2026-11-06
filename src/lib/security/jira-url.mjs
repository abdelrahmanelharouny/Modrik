import { isIP } from "node:net";

function allowedOrigins(env = process.env) {
  return new Set(
    String(env.MODRIK_JIRA_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim().replace(/\/$/, "").toLowerCase())
      .filter(Boolean)
  );
}

export function validateJiraBaseUrl(raw, env = process.env) {
  let url;
  try {
    url = new URL(String(raw ?? "").trim());
  } catch {
    throw new Error("Jira URL must be a valid absolute HTTPS URL");
  }

  if (url.protocol !== "https:") throw new Error("Jira connections must use HTTPS");
  if (url.username || url.password) throw new Error("Jira URL must not contain embedded credentials");
  if (url.search || url.hash) throw new Error("Jira base URL must not contain a query string or fragment");

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || isIP(hostname) !== 0 ||
      hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Jira URL must use an approved public DNS hostname, not a local or IP address");
  }

  const origin = url.origin.toLowerCase();
    const isAtlassianCloud = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.atlassian\.net$/.test(hostname);
  // Atlassian 3LO uses the shared API gateway with a tenant-specific cloud ID.
  // Accept only the exact Jira Cloud resource path, never arbitrary api.atlassian.com URLs.
  const isAtlassianOAuthApi = hostname === "api.atlassian.com" &&
    /^\/ex\/jira\/[A-Za-z0-9-]+\/?$/.test(url.pathname);.test(url.pathname);
  const isExplicitlyAllowed = allowedOrigins(env).has(origin);
  if (!isAtlassianCloud && !isAtlassianOAuthApi && !isExplicitlyAllowed) {
    throw new Error("Jira host is not allowlisted. Use an *.atlassian.net tenant or add its exact HTTPS origin to MODRIK_JIRA_ALLOWED_ORIGINS");
  }

  // Only an explicitly configured enterprise origin may use a non-default
  // HTTPS port. Atlassian Cloud is always reached over its standard origin.
  if (url.port && url.port !== "443" && !isExplicitlyAllowed) {
    throw new Error("Non-standard Jira ports must be explicitly allowlisted");
  }

  url.username = "";
  url.password = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url;
}

export function buildJiraUrl(baseUrl, apiPath, env = process.env) {
  const base = validateJiraBaseUrl(baseUrl, env);
  const safePath = String(apiPath ?? "").replace(/^\/+/, "");
  if (!safePath || safePath.includes("..") || safePath.includes("\\")) {
    throw new Error("Invalid Jira API path");
  }
  return new URL(safePath, base.toString().replace(/\/?$/, "/")).toString();
}

export function jiraFetchOptions(options = {}) {
  return { ...options, redirect: "manual" };
}
