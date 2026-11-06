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
  response.end("<!doctype html><html><head><meta charset='utf-8'></head><body>Modrik offline queue browser integration</body></html>");
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  // Exercise the IndexedDB lease fallback even in Chromium builds that expose Web Locks.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  });
  const first = await context.newPage();
  const second = await context.newPage();
  const events = [];
  await first.exposeFunction("recordEvent", (event) => events.push(event));
  await second.exposeFunction("recordEvent", (event) => events.push(event));
  await Promise.all([first.goto(origin), second.goto(origin)]);

  const startTask = async (page, projectId, label) => page.evaluate(async ({ projectId, label }) => {
    const { withOfflineEvidenceSyncLock } = await import("/offline-queue.mjs");
    window.syncTask = withOfflineEvidenceSyncLock(projectId, async (lease) => {
      await window.recordEvent(`${label}:start:${lease.fencingToken}`);
      await new Promise((resolve) => { window.releaseSync = resolve; });
      await lease.assertLease();
      await window.recordEvent(`${label}:end:${lease.fencingToken}`);
    });
  }, { projectId, label });

  const waitFor = async (predicate, description) => {
    const deadline = Date.now() + 5_000;
    while (!predicate()) {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}; events=${JSON.stringify(events)}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };

  await startTask(first, "browser-project-shared", "tab-a");
  await waitFor(() => events.some((event) => event.startsWith("tab-a:start:")), "first tab to acquire the shared lease");
  await startTask(second, "browser-project-shared", "tab-b");
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(events.some((event) => event.startsWith("tab-b:start:")), false,
    "a second tab must not enter the same project's sync critical section");

  await first.evaluate(() => window.releaseSync());
  await waitFor(() => events.some((event) => event.startsWith("tab-a:end:")), "first tab to finish");
  await waitFor(() => events.some((event) => event.startsWith("tab-b:start:")), "second tab to acquire after release");
  await second.evaluate(() => window.releaseSync());
  await Promise.all([
    first.evaluate(() => window.syncTask),
    second.evaluate(() => window.syncTask),
  ]);
  assert.equal(events.filter((event) => event.startsWith("tab-a:start:")).length, 1);
  assert.equal(events.filter((event) => event.startsWith("tab-b:start:")).length, 1);
  const firstToken = Number(events.find((event) => event.startsWith("tab-a:start:")).split(":").at(-1));
  const secondToken = Number(events.find((event) => event.startsWith("tab-b:start:")).split(":").at(-1));
  assert.ok(firstToken > 0 && secondToken > firstToken,
    "successive tab owners must receive strictly increasing fencing tokens");

  // Different project scopes must not serialize behind one another.
  events.length = 0;
  await startTask(first, "browser-project-alpha", "alpha");
  await startTask(second, "browser-project-beta", "beta");
  await waitFor(() => events.some((event) => event.startsWith("alpha:start:")) &&
    events.some((event) => event.startsWith("beta:start:")), "independent project leases to run concurrently");
  await Promise.all([first.evaluate(() => window.releaseSync()), second.evaluate(() => window.releaseSync())]);
  await Promise.all([first.evaluate(() => window.syncTask), second.evaluate(() => window.syncTask)]);

  console.log("PASS: IndexedDB fallback serializes same-project tabs, advances fencing tokens, and allows independent projects concurrently.");
  await context.close();
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
