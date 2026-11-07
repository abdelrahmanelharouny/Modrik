import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const moduleSource = await readFile(new URL("../src/lib/evidence/offline-queue.mjs", import.meta.url), "utf8");
const server = createServer((request, response) => {
  if (request.url === "/offline-queue.mjs") {
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
    response.end(moduleSource);
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><html><head><meta charset='utf-8'></head><body>Modrik interrupted offline sync recovery</body></html>");
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  });
  const staleTab = await context.newPage();
  const recoveryTab = await context.newPage();
  await Promise.all([staleTab.goto(origin), recoveryTab.goto(origin)]);

  const operation = await staleTab.evaluate(async () => {
    const queue = await import("/offline-queue.mjs");
    const item = queue.createOfflineEvidenceOperation("interrupted-sync-project", {
      title: "Field interview", content: "The approval must remain auditable.", consent: false,
      sourceType: "interview", language: "en",
    }, "123e4567-e89b-42d3-a456-426614174101");
    await queue.putOfflineEvidenceOperation(item);
    return item;
  });

  let staleTaskStarted;
  const staleStarted = new Promise((resolve) => { staleTaskStarted = resolve; });
  await staleTab.exposeFunction("signalStaleTaskStarted", staleTaskStarted);
  await staleTab.evaluate(async (item) => {
    const { withOfflineEvidenceSyncLock } = await import("/offline-queue.mjs");
    window.staleSyncTask = withOfflineEvidenceSyncLock(item.projectId, async (lease) => {
      window.staleLease = lease;
      await window.signalStaleTaskStarted();
      await new Promise((resolve) => { window.releaseStaleTask = resolve; });
    });
  }, operation);
  await staleStarted;

  // Simulate the original tab being suspended beyond its lease expiry.
  await recoveryTab.evaluate(async (projectId) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("modrik-offline", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("sync-leases", "readwrite");
      const store = tx.objectStore("sync-leases");
      const key = `modrik:offline-evidence-sync:${projectId}`;
      const request = store.get(key);
      request.onsuccess = () => {
        if (!request.result) { tx.abort(); return; }
        store.put({ ...request.result, leaseUntil: Date.now() - 1 });
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Could not expire suspended-tab lease"));
    });
    db.close();
  }, operation.projectId);

  let recoveryAcquired;
  const recoveryReady = new Promise((resolve) => { recoveryAcquired = resolve; });
  await recoveryTab.exposeFunction("signalRecoveryAcquired", recoveryAcquired);
  await recoveryTab.evaluate(async (item) => {
    const { withOfflineEvidenceSyncLock } = await import("/offline-queue.mjs");
    window.recoverySyncTask = withOfflineEvidenceSyncLock(item.projectId, async (lease) => {
      window.recoveryLease = lease;
      await window.signalRecoveryAcquired(lease.fencingToken);
      await new Promise((resolve) => { window.proceedRecovery = resolve; });
      await lease.assertLease();
      const acknowledged = await lease.acknowledge(item);
      window.recoveryResult = { acknowledged, remaining: (await (await import("/offline-queue.mjs")).listOfflineEvidenceOperations(item.projectId)).length };
    });
  }, operation);

  const recoveredToken = await recoveryReady;
  assert.ok(recoveredToken > 1, "recovery must acquire a strictly newer fencing generation");

  const staleResult = await staleTab.evaluate(async (item) => {
    try {
      await window.staleLease.acknowledge(item);
      return { rejected: false };
    } catch (error) {
      return { rejected: true, code: error.code, message: error.message };
    }
  }, operation);
  assert.equal(staleResult.rejected, true, "a suspended former owner must not acknowledge after another tab takes over");
  assert.equal(staleResult.code, "OFFLINE_SYNC_LEASE_LOST");
  const retained = await recoveryTab.evaluate(async (projectId) => {
    const { listOfflineEvidenceOperations } = await import("/offline-queue.mjs");
    return listOfflineEvidenceOperations(projectId);
  }, operation.projectId);
  assert.equal(retained.length, 1, "failed/stale acknowledgement must leave the user-authored operation queued");
  assert.equal(retained[0].operationId, operation.operationId);

  await recoveryTab.evaluate(() => window.proceedRecovery());
  await recoveryTab.evaluate(() => window.recoverySyncTask);
  const recovered = await recoveryTab.evaluate(() => window.recoveryResult);
  assert.deepEqual(recovered, { acknowledged: true, remaining: 0 },
    "the current lease owner must be able to acknowledge and remove the operation after server confirmation");

  await staleTab.evaluate(() => window.releaseStaleTask());
  await staleTab.evaluate(() => window.staleSyncTask);
  await context.close();
  process.stdout.write("PASS: stale offline sync owners cannot acknowledge queued work after lease takeover; recovery owner can acknowledge only after confirmation.\\n");
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
