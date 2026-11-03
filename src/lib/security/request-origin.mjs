export function isSameOriginMutation(headers, fallbackProtocol = "http:") {
  const origin = headers.get("origin");
  const fetchSite = headers.get("sec-fetch-site");
  const host = headers.get("host")?.trim();
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol = (forwardedProto || fallbackProtocol).replace(/:$/, "");

  if (origin) {
    if (!host || !["http", "https"].includes(protocol)) return false;
    try {
      const parsedOrigin = new URL(origin);
      if (parsedOrigin.origin === `${protocol}://${host}`) return true;
      // Some standalone runtimes expose an internal URL scheme that differs
      // from the browser-facing scheme. Trust Fetch Metadata only when the
      // browser reports same-origin and the Origin host still matches Host.
      return parsedOrigin.host.toLowerCase() === host.toLowerCase() && fetchSite === "same-origin";
    } catch {
      return false;
    }
  }

  return !fetchSite || fetchSite === "same-origin" || fetchSite === "none";
}
