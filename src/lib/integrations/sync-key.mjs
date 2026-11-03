import { createHash } from "node:crypto";

export function makeSyncKey(projectId, kind, localItemId) {
  const values = [projectId, kind, localItemId];
  if (values.some((value) => typeof value !== "string" || !value.trim())) {
    throw new TypeError("Sync keys require project, tracker kind and local item identifiers");
  }
  return createHash("sha256").update(values.join("\u0000")).digest("hex");
}

export function makeSyncMarker(syncKey) {
  if (typeof syncKey !== "string" || !/^[a-f0-9]{64}$/i.test(syncKey)) {
    throw new TypeError("Sync marker requires a SHA-256 sync key");
  }
  return "modrik-sync-" + syncKey.slice(0, 24).toLowerCase();
}
