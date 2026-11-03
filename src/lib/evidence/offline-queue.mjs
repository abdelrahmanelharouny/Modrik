const DB_NAME = "modrik-offline";
const DB_VERSION = 1;
const STORE = "evidence-operations";
const MAX_PENDING = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function validateOfflineEvidenceOperation(operation) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) throw new TypeError("Offline evidence operation is required");
  const allowedOperationKeys = new Set(["operationId", "projectId", "payload", "createdAt", "attempts", "lastError"]);
  if (Object.keys(operation).some((key) => !allowedOperationKeys.has(key))) throw new TypeError("Offline operation contains unsupported metadata");
  if (typeof operation.projectId !== "string" || !operation.projectId.trim() || operation.projectId.length > 128) throw new TypeError("projectId must contain 1–128 characters");
  if (typeof operation.operationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operation.operationId)) throw new TypeError("operationId must be a UUID");
  const payload = operation.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new TypeError("Evidence payload is required");
  const allowedPayloadKeys = new Set(["title", "sourceType", "language", "content", "consent"]);
  if (Object.keys(payload).some((key) => !allowedPayloadKeys.has(key))) throw new TypeError("Offline evidence payload contains unsupported fields");
  if (typeof payload.title !== "string" || typeof payload.content !== "string") throw new TypeError("Evidence title and content are required");
  if (!payload.title.trim() || !payload.content.trim() || payload.title.length > 200 || payload.content.length > 8000) throw new RangeError("Evidence title/content are empty or exceed supported limits");
  if (typeof payload.consent !== "boolean") throw new TypeError("Consent must be explicit");
  if (payload.sourceType !== undefined && !["interview", "document", "meeting", "survey", "observation", "transcript", "whiteboard_ocr"].includes(payload.sourceType)) throw new TypeError("Unsupported evidence source type");
  if (payload.language !== undefined && !["en", "ar-EG", "codeswitch"].includes(payload.language)) throw new TypeError("Unsupported evidence language");
  const createdAt = Date.parse(operation.createdAt);
  if (!Number.isFinite(createdAt) || createdAt > Date.now() + 5 * 60 * 1000) throw new TypeError("Offline operation timestamp is invalid");
  if (!Number.isSafeInteger(operation.attempts) || operation.attempts < 0 || operation.attempts > 1_000_000) throw new TypeError("Offline operation retry count is invalid");
  if (operation.lastError !== undefined && (typeof operation.lastError !== "string" || operation.lastError.length > 240)) throw new TypeError("Offline operation error metadata is invalid");
  return operation;
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
  return validateOfflineEvidenceOperation({ operationId, projectId, payload: normalized, createdAt: new Date().toISOString(), attempts: 0 });
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
    };
    request.onsuccess = () => resolve(request.result);
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

export async function putOfflineEvidenceOperation(operation) {
  validateOfflineEvidenceOperation(operation);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const request = store.index("projectId").getAll(operation.projectId);
    let queueFull = false;
    request.onsuccess = () => {
      const now = Date.now();
      const existing = request.result ?? [];
      for (const item of existing) {
        if (!Number.isFinite(Date.parse(item.createdAt)) || now - Date.parse(item.createdAt) > MAX_AGE_MS) {
          store.delete(item.operationId);
        }
      }
      const fresh = existing.filter((item) => Number.isFinite(Date.parse(item.createdAt)) && now - Date.parse(item.createdAt) <= MAX_AGE_MS);
      if (fresh.length >= MAX_PENDING && !fresh.some((item) => item.operationId === operation.operationId)) {
        queueFull = true;
        tx.abort();
        return;
      }
      store.put(operation);
    };
    request.onerror = () => { tx.abort(); };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(queueFull ? new Error("Offline queue is full (100 pending sources). Sync or remove pending items before adding more.") : tx.error ?? new Error("Could not save offline evidence")); };
    tx.onabort = () => { db.close(); reject(queueFull ? new Error("Offline queue is full (100 pending sources). Sync or remove pending items before adding more.") : tx.error ?? new Error("Offline queue transaction aborted")); };
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


// Serialize queue synchronization across tabs where the Web Locks API exists.
// The in-process promise queue is a safe fallback for older browsers and tests.
const inProcessSyncLocks = new Map();

export async function withOfflineEvidenceSyncLock(projectId, task) {
  if (typeof projectId !== "string" || !projectId.trim() || projectId.length > 128) {
    throw new TypeError("projectId must contain 1–128 characters");
  }
  if (typeof task !== "function") throw new TypeError("A sync task is required");
  const lockName = `modrik:offline-evidence-sync:${projectId}`;
  const locks = globalThis.navigator?.locks;
  if (locks?.request) {
    return locks.request(lockName, { mode: "exclusive" }, task);
  }

  const previous = inProcessSyncLocks.get(lockName) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  inProcessSyncLocks.set(lockName, current);
  await previous;
  try {
    return await task();
  } finally {
    release();
    if (inProcessSyncLocks.get(lockName) === current) inProcessSyncLocks.delete(lockName);
  }
}
