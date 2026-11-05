const DB_NAME = "modrik-offline";
const DB_VERSION = 2;
const STORE = "evidence-operations";
const LOCK_STORE = "sync-leases";
const SYNC_LEASE_MS = 60_000;
const SYNC_HEARTBEAT_MS = 15_000;
const MAX_PENDING = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function validateOfflineEvidenceOperation(operation) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) throw new TypeError("Offline evidence operation is required");
  const allowedOperationKeys = new Set(["operationId", "projectId", "kind", "evidenceId", "expectedRevisionVersion", "payload", "changeNote", "createdAt", "attempts", "lastError"]);
  if (Object.keys(operation).some((key) => !allowedOperationKeys.has(key))) throw new TypeError("Offline operation contains unsupported metadata");
  if (typeof operation.projectId !== "string" || !operation.projectId.trim() || operation.projectId.length > 128) throw new TypeError("projectId must contain 1–128 characters");
  if (typeof operation.operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operation.operationId)) throw new TypeError("operationId must be a UUID");
  const kind = operation.kind ?? "create";
  if (!["create", "update", "delete"].includes(kind)) throw new TypeError("Unsupported offline evidence operation kind");
  if (kind === "create" && (operation.evidenceId !== undefined || operation.expectedRevisionVersion !== undefined)) throw new TypeError("Create operations cannot target an existing evidence revision");
  if (kind !== "create" && (typeof operation.evidenceId !== "string" || !operation.evidenceId.trim() || operation.evidenceId.length > 128)) throw new TypeError("evidenceId is required for evidence mutations");
  if (kind !== "create" && (!Number.isSafeInteger(operation.expectedRevisionVersion) || operation.expectedRevisionVersion < 0)) throw new TypeError("Expected revision version is required for evidence mutations");
  if (operation.changeNote !== undefined && (typeof operation.changeNote !== "string" || operation.changeNote.length > 500)) throw new TypeError("Revision note is invalid");
  if (kind === "delete") {
    if (operation.payload !== undefined) throw new TypeError("Delete operations cannot contain evidence payloads");
  } else {
    const payload = operation.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("Evidence payload is required");
    const allowedPayloadKeys = new Set(["title", "sourceType", "language", "content", "consent"]);
    if (Object.keys(payload).some((key) => !allowedPayloadKeys.has(key))) throw new TypeError("Offline evidence payload contains unsupported fields");
    if (typeof payload.title !== "string" || typeof payload.content !== "string") throw new TypeError("Evidence title and content are required");
    if (!payload.title.trim() || !payload.content.trim() || payload.title.length > 200 || payload.content.length > 8000) throw new RangeError("Evidence title/content are empty or exceed supported limits");
    if (typeof payload.consent !== "boolean") throw new TypeError("Consent must be explicit");
    if (payload.sourceType !== undefined && !["interview", "document", "meeting", "survey", "observation", "transcript", "whiteboard_ocr"].includes(payload.sourceType)) throw new TypeError("Unsupported evidence source type");
    if (payload.language !== undefined && !["en", "ar-EG", "codeswitch"].includes(payload.language)) throw new TypeError("Unsupported evidence language");
  }
  const createdAt = Date.parse(operation.createdAt);
  if (!Number.isFinite(createdAt) || createdAt > Date.now() + 5 * 60 * 1000) throw new TypeError("Offline operation timestamp is invalid");
  if (!Number.isSafeInteger(operation.attempts) || operation.attempts < 0 || operation.attempts > 1_000_000) throw new TypeError("Offline operation retry count is invalid");
  if (operation.lastError !== undefined && (typeof operation.lastError !== "string" || operation.lastError.length > 240)) throw new TypeError("Offline operation error metadata is invalid");
  return operation;
}

export function createOfflineEvidenceMutationOperation(projectId, kind, evidenceId, expectedRevisionVersion, payload, operationId = globalThis.crypto.randomUUID(), changeNote = "") {
  if (!["update", "delete"].includes(kind)) throw new TypeError("Mutation kind must be update or delete");
  const base = { operationId, projectId, kind, evidenceId, expectedRevisionVersion, createdAt: new Date().toISOString(), attempts: 0 };
  if (kind === "delete") return validateOfflineEvidenceOperation(base);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("Evidence payload is required");
  const normalized = { title: payload.title, sourceType: payload.sourceType ?? "interview", language: payload.language ?? "en", content: payload.content, consent: payload.consent };
  return validateOfflineEvidenceOperation({ ...base, payload: normalized, changeNote: typeof changeNote === "string" ? changeNote.slice(0, 500) : "" });
}

export function createOfflineEvidenceOperation(projectId, payload, operationId = globalThis.crypto.randomUUID()) {
  if (typeof projectId !== "string" || !projectId.trim() || projectId.length > 128) throw new TypeError("projectId must contain 1–128 characters");
  if (typeof operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)) {
    throw new TypeError("operationId must be a UUID so the server can safely deduplicate retries");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("Evidence payload is required");
  if (typeof payload.title !== "string" || typeof payload.content !== "string") throw new TypeError("Evidence title and content are required");
  if (payload.title.length > 200 || payload.content.length > 8000) throw new RangeError("Evidence exceeds the supported offline size");
  if (typeof payload.consent !== "boolean") throw new TypeError("Consent must be explicit");
  const normalized = {
    title: payload.title,
    sourceType: payload.sourceType ?? "interview",
    language: payload.language ?? "en",
    content: payload.content,
    consent: payload.consent,
  };
  if (!["interview", "document", "meeting", "survey", "observation", "transcript", "whiteboard_ocr"].includes(normalized.sourceType)) throw new TypeError("Unsupported evidence source type");
  if (!["en", "ar-EG", "codeswitch"].includes(normalized.language)) throw new TypeError("Unsupported evidence language");
  return validateOfflineEvidenceOperation({ operationId, projectId, kind: "create", payload: normalized, createdAt: new Date().toISOString(), attempts: 0 });
}


/**
 * Preserve deterministic FIFO ordering when multiple operations are created
 * within the same millisecond. Re-putting an existing operation keeps its
 * original position; new operations are placed strictly after current rows.
 */
export function orderOfflineEvidenceOperation(existingOperations, operation) {
  validateOfflineEvidenceOperation(operation);
  if (!Array.isArray(existingOperations)) throw new TypeError("Existing offline operations must be an array");
  const prior = existingOperations.find((item) => item?.operationId === operation.operationId);
  if (prior) return { ...operation, createdAt: prior.createdAt };
  const latest = existingOperations.reduce((max, item) => {
    const timestamp = Date.parse(item?.createdAt);
    return Number.isFinite(timestamp) ? Math.max(max, timestamp) : max;
  }, Number.NEGATIVE_INFINITY);
  const requested = Date.parse(operation.createdAt);
  return {
    ...operation,
    createdAt: new Date(Number.isFinite(latest) ? Math.max(requested, latest + 1) : requested).toISOString(),
  };
}

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Offline storage is unavailable in this browser"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "operationId" });
        store.createIndex("projectId", "projectId", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(LOCK_STORE)) db.createObjectStore(LOCK_STORE, { keyPath: "name" });
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error ?? new Error("Could not open offline evidence storage"));
    request.onblocked = () => reject(new Error("Offline storage upgrade is blocked by another Modrik tab"));
  });
}

async function transaction(mode, action) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try { result = action(store); } catch (error) { db.close(); reject(error); return; }
    tx.oncomplete = () => { db.close(); resolve(result?.result); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Offline storage transaction failed")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Offline storage transaction aborted")); };
  });
}

/**
 * Explicitly rebase a conflicted queued update onto a reviewed server revision.
 * The content payload and idempotency key remain unchanged; only the expected
 * revision advances, and retry metadata is cleared after user confirmation.
 */
export function rebaseOfflineEvidenceUpdateOperation(operation, latestRevisionVersion) {
  validateOfflineEvidenceOperation(operation);
  if (operation.kind !== "update") throw new TypeError("Only queued updates can be rebased");
  if (!Number.isSafeInteger(latestRevisionVersion) || latestRevisionVersion < 0) throw new TypeError("Latest revision version must be a nonnegative safe integer");
  const { lastError: _discardedError, ...retryable } = operation;
  return validateOfflineEvidenceOperation({
    ...retryable,
    expectedRevisionVersion: latestRevisionVersion,
    attempts: 0,
  });
}

export async function putOfflineEvidenceOperation(operation) {
  validateOfflineEvidenceOperation(operation);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const request = store.index("projectId").getAll(operation.projectId);
    let queueFull = false;
    let duplicateMutation = false;
    request.onsuccess = () => {
      const now = Date.now();
      const existing = request.result ?? [];
      for (const item of existing) {
        if (!Number.isFinite(Date.parse(item.createdAt)) || now - Date.parse(item.createdAt) > MAX_AGE_MS) {
          store.delete(item.operationId);
        }
      }
      const fresh = existing.filter((item) => Number.isFinite(Date.parse(item.createdAt)) && now - Date.parse(item.createdAt) <= MAX_AGE_MS);
      const duplicateTarget = operation.kind && operation.kind !== "create"
        ? fresh.find((item) => item.operationId !== operation.operationId && item.kind !== "create" && item.evidenceId === operation.evidenceId)
        : null;
      if (duplicateTarget) {
        duplicateMutation = true;
        tx.abort();
        return;
      }
      if (fresh.length >= MAX_PENDING && !fresh.some((item) => item.operationId === operation.operationId)) {
        queueFull = true;
        tx.abort();
        return;
      }
      store.put(orderOfflineEvidenceOperation(fresh, operation));
    };
    request.onerror = () => { tx.abort(); };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(duplicateMutation ? new Error("A mutation for this evidence source is already queued. Sync or resolve it before queuing another change.") : queueFull ? new Error("Offline queue is full (100 pending sources). Sync or remove pending items before adding more.") : tx.error ?? new Error("Could not save offline evidence")); };
    tx.onabort = () => { db.close(); reject(duplicateMutation ? new Error("A mutation for this evidence source is already queued. Sync or resolve it before queuing another change.") : queueFull ? new Error("Offline queue is full (100 pending sources). Sync or remove pending items before adding more.") : tx.error ?? new Error("Offline queue transaction aborted")); };
  });
}

export async function listOfflineEvidenceOperations(projectId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const request = store.index("projectId").getAll(projectId);
    let items = [];
    request.onsuccess = () => {
      const now = Date.now();
      const all = request.result ?? [];
      for (const item of all) {
        if (!Number.isFinite(Date.parse(item.createdAt)) || now - Date.parse(item.createdAt) > MAX_AGE_MS) {
          store.delete(item.operationId);
        } else {
          items.push(item);
        }
      }
      items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    };
    request.onerror = () => { tx.abort(); };
    tx.oncomplete = () => { db.close(); resolve(items); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Could not read offline queue")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Offline queue read aborted")); };
  });
}

export async function removeOfflineEvidenceOperation(operationId) {
  await transaction("readwrite", (store) => store.delete(operationId));
}

export async function updateOfflineEvidenceOperation(operation) {
  validateOfflineEvidenceOperation(operation);
  await transaction("readwrite", (store) => store.put(operation));
}


// Serialize queue synchronization across tabs. Web Locks is preferred; an
// IndexedDB lease provides a cross-tab fallback for browsers without Web Locks.
const inProcessSyncLocks = new Map();

function withInProcessSyncLock(lockName, task) {
  const previous = inProcessSyncLocks.get(lockName) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  inProcessSyncLocks.set(lockName, current);
  return previous.then(async () => {
    try { return await task({ fencingToken: 0, assertLease: async () => 0 }); }
    finally {
      release();
      if (inProcessSyncLocks.get(lockName) === current) inProcessSyncLocks.delete(lockName);
    }
  });
}

/**
 * Pure lease transition with a monotonically increasing fencing token.
 * A released lease keeps its token so the next owner cannot reuse a generation.
 */
export function transitionOfflineEvidenceLease(current, owner, now, leaseMs, { release = false, fencingToken } = {}) {
  if (typeof owner !== "string" || !owner || !Number.isFinite(now) || !Number.isSafeInteger(leaseMs) || leaseMs < 1) {
    throw new TypeError("Invalid offline sync lease transition");
  }
  if (release) {
    if (current?.owner !== owner || current?.fencingToken !== fencingToken) return { acquired: false, lease: current ?? null };
    return { acquired: true, lease: { ...current, owner: null, leaseUntil: 0 } };
  }
  if (fencingToken !== undefined) {
    if (current?.owner !== owner || current?.fencingToken !== fencingToken || !Number.isFinite(current.leaseUntil) || current.leaseUntil <= now) {
      return { acquired: false, lease: current ?? null };
    }
    return { acquired: true, lease: { ...current, leaseUntil: now + leaseMs } };
  }
  if (current && current.owner !== owner && Number.isFinite(current.leaseUntil) && current.leaseUntil > now) {
    return { acquired: false, lease: current };
  }
  if (current?.owner === owner && Number.isFinite(current.leaseUntil) && current.leaseUntil > now) {
    return { acquired: true, lease: { ...current, leaseUntil: now + leaseMs } };
  }
  const nextToken = (Number.isSafeInteger(current?.fencingToken) && current.fencingToken >= 0 ? current.fencingToken : 0) + 1;
  return { acquired: true, lease: { name: current?.name, owner, leaseUntil: now + leaseMs, fencingToken: nextToken } };
}

async function updateSyncLease(name, owner, leaseUntil, { release = false, fencingToken } = {}) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCK_STORE, "readwrite");
    const store = tx.objectStore(LOCK_STORE);
    const request = store.get(name);
    let result = null;
    request.onsuccess = () => {
      const current = request.result ?? null;
      const transition = transitionOfflineEvidenceLease(current, owner, Date.now(), Math.max(1, Math.floor(leaseUntil - Date.now())), { release, fencingToken });
      if (transition.acquired) {
        const next = { ...(transition.lease ?? {}), name };
        store.put(next);
        result = next.fencingToken ?? fencingToken ?? true;
      }
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Could not update offline sync lease")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Offline sync lease transaction aborted")); };
  });
}

async function isSyncLeaseCurrent(name, owner, fencingToken) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCK_STORE, "readonly");
    const request = tx.objectStore(LOCK_STORE).get(name);
    let valid = false;
    request.onsuccess = () => {
      const lease = request.result;
      valid = lease?.owner === owner && lease?.fencingToken === fencingToken &&
        Number.isFinite(lease.leaseUntil) && lease.leaseUntil > Date.now();
    };
    request.onerror = () => tx.abort();
    tx.oncomplete = () => { db.close(); resolve(valid); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error("Could not verify offline sync lease")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Offline sync lease verification aborted")); };
  });
}

async function withIndexedDbSyncLease(lockName, task) {
  const owner = globalThis.crypto?.randomUUID?.() ?? `lease-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let fencingToken = null;
  while (fencingToken === null) {
    fencingToken = await updateSyncLease(lockName, owner, Date.now() + SYNC_LEASE_MS);
    if (fencingToken === null) await new Promise((resolve) => setTimeout(resolve, 120));
  }
  let heartbeatBusy = false;
  let leaseLost = false;
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy || leaseLost) return;
    heartbeatBusy = true;
    try {
      const renewed = await updateSyncLease(lockName, owner, Date.now() + SYNC_LEASE_MS, { fencingToken });
      if (renewed === null) leaseLost = true;
    } catch { leaseLost = true; }
    finally { heartbeatBusy = false; }
  }, SYNC_HEARTBEAT_MS);
  const assertLease = async () => {
    if (leaseLost || !(await isSyncLeaseCurrent(lockName, owner, fencingToken))) {
      leaseLost = true;
      const error = new Error("Offline sync lease was lost; stop processing and leave unconfirmed queue items intact");
      error.code = "OFFLINE_SYNC_LEASE_LOST";
      throw error;
    }
    return fencingToken;
  };
  try {
    await assertLease();
    return await task({ fencingToken, assertLease });
  } finally {
    clearInterval(heartbeat);
    await updateSyncLease(lockName, owner, 0, { release: true, fencingToken }).catch(() => {});
  }
}

export async function withOfflineEvidenceSyncLock(projectId, task) {
  if (typeof projectId !== "string" || !projectId.trim() || projectId.length > 128) throw new TypeError("projectId must contain 1–128 characters");
  if (typeof task !== "function") throw new TypeError("A sync task is required");
  const lockName = `modrik:offline-evidence-sync:${projectId}`;
  const locks = globalThis.navigator?.locks;
  if (locks?.request) return locks.request(lockName, { mode: "exclusive" }, () => task({ fencingToken: 0, assertLease: async () => 0 }));
  if (typeof indexedDB !== "undefined") return withIndexedDbSyncLease(lockName, task);
  return withInProcessSyncLock(lockName, task);
}
