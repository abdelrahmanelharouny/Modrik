const DB_NAME = "modrik-offline";
const DB_VERSION = 1;
const STORE = "evidence-operations";
const MAX_PENDING = 100;
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function createOfflineEvidenceOperation(projectId, payload, operationId = globalThis.crypto.randomUUID()) {
  if (typeof projectId !== "string" || !projectId.trim()) throw new TypeError("projectId is required");
  if (!payload || typeof payload.title !== "string" || typeof payload.content !== "string") throw new TypeError("Evidence title and content are required");
  if (payload.title.length > 200 || payload.content.length > 8000) throw new RangeError("Evidence exceeds the supported offline size");
  if (typeof payload.consent !== "boolean") throw new TypeError("Consent must be explicit");
  return { operationId, projectId, payload: { ...payload }, createdAt: new Date().toISOString(), attempts: 0 };
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
  const existing = await listOfflineEvidenceOperations(operation.projectId);
  const now = Date.now();
  const fresh = existing.filter((item) => now - Date.parse(item.createdAt) <= MAX_AGE_MS);
  if (fresh.length >= MAX_PENDING && !fresh.some((item) => item.operationId === operation.operationId)) {
    throw new Error("Offline queue is full (100 pending sources). Sync or remove pending items before adding more.");
  }
  await transaction("readwrite", (store) => store.put(operation));
}

export async function listOfflineEvidenceOperations(projectId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).index("projectId").getAll(projectId);
    request.onsuccess = () => {
      db.close();
      const now = Date.now();
      const items = (request.result ?? []).filter((item) => now - Date.parse(item.createdAt) <= MAX_AGE_MS)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(items);
    };
    request.onerror = () => { db.close(); reject(request.error ?? new Error("Could not read offline queue")); };
  });
}

export async function removeOfflineEvidenceOperation(operationId) {
  await transaction("readwrite", (store) => store.delete(operationId));
}

export async function updateOfflineEvidenceOperation(operation) {
  await transaction("readwrite", (store) => store.put(operation));
}
