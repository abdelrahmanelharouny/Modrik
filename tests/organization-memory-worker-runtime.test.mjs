import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("worker strips helper-only retry metadata and asserts lease ownership", () => {
  const source = fs.readFileSync(new URL("../scripts/run-organization-memory-embedding-worker.mjs", import.meta.url), "utf8");
  assert.match(source, /delete retryData\.delayMs/);
  assert.match(source, /result\.count !== 1/);
  assert.match(source, /lease ownership was lost before completion/);
});

test("worker revalidates project, accepted status, and source hash after provider latency", () => {
  const source = fs.readFileSync(new URL("../scripts/run-organization-memory-embedding-worker.mjs", import.meta.url), "utf8");
  const providerCall = source.indexOf("const embedding = await provider.embed(canonical.content)");
  const transaction = source.indexOf("return prisma.$transaction(async (tx) => {", providerCall);
  const projectCheck = source.indexOf("const latestProject =", transaction);
  const nodeCheck = source.indexOf("const latestNode =", transaction);
  const hashCheck = source.indexOf("latestContent.contentHash !== job.contentHash", transaction);
  const persist = source.indexOf("persistOrganizationMemoryEmbedding(tx", transaction);
  assert.ok(providerCall >= 0 && transaction > providerCall);
  assert.ok(projectCheck > transaction && nodeCheck > projectCheck);
  assert.ok(hashCheck > nodeCheck && persist > hashCheck);
  assert.match(source.slice(hashCheck, persist), /superseded_source_changed/);
});
