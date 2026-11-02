import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = Number(process.env.MODRIK_E2E_PORT || 3187);
const baseUrl = `http://127.0.0.1:${port}`;
const childEnv = { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1" };
const child = spawn(process.execPath, [".next/standalone/server.js"], {
  env: childEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
child.stdout.on("data", chunk => { logs += chunk.toString(); });
child.stderr.on("data", chunk => { logs += chunk.toString(); });

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Next server exited early.\n${logs}`);
    try {
      const response = await fetch(baseUrl);
      if (response.status < 500) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`Next server did not become ready.\n${logs}`);
}

try {
  await waitForServer();
  const endpoint = `${baseUrl}/api/projects/phase-4-auth-probe/stakeholders`;
  const requests = [
    ["GET", () => fetch(endpoint)],
    ["POST", () => fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create_stakeholder" }) })],
    ["PATCH", () => fetch(endpoint, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "update_stakeholder" }) })],
    ["GET with forged cookie", () => fetch(endpoint, { headers: { cookie: "modrik_session=forged.payload" } })],
  ];
  for (const [label, send] of requests) {
    const response = await send();
    assert.equal(response.status, 401, `${label} must reject unauthenticated collaboration access`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.match(body.error, /owner session/i);
  }
  process.stdout.write("Stakeholder API auth integration: 4/4 unauthorized request cases passed.\n");
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise(resolve => child.once("exit", resolve)),
    delay(5000),
  ]);
}
