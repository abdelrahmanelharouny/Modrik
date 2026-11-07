export function isSameOriginMutation(headers, fallbackProtocol = "http:") {
  const origin = headers.get("origin");
  const fetchSite = headers.get("sec-fetch-site");
  const host = headers.get("host")?.trim();
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = (forwardedProto || fallbackProtocol).replace(/:$/, "");

  if (origin) {
    if (!host || !["http", "https"].includes(protocol)) return false;
    try {
      return new URL(origin).origin === `${protocol}://${host}`;
    } catch {
      return false;
    }
  }

  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}
