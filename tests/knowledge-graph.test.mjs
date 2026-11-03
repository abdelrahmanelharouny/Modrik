import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNodeInput, normalizeEdgeInput, parseNodeAttributes, validateNodeStatus } from "../src/lib/knowledge-graph/validation.mjs";

test("node validation enforces supported kinds and bounded fields", () => {
  assert.throws(() => normalizeNodeInput({kind:"unknown",label:"A"}), /kind/);
  assert.throws(() => normalizeNodeInput({kind:"goal",label:" ".repeat(3)}), /label/);
  assert.throws(() => normalizeNodeInput({kind:"goal",label:"Goal",confidence:1.2}), /Confidence/);
  assert.throws(() => normalizeNodeInput({kind:"goal",label:"Goal",attributes:[]}), /attributes/);
});
test("node normalization serializes safe extensible attributes", () => {
  const node = normalizeNodeInput({kind:"stakeholder",label:"Finance lead",description:"Owns budget approval",confidence:0.8,attributes:{department:"Finance"}});
  assert.equal(node.kind,"stakeholder");
  assert.deepEqual(JSON.parse(node.attributes),{department:"Finance"});
});
test("edge validation rejects unknown relations and invalid confidence", () => {
  assert.throws(() => normalizeEdgeInput({relationType:"teleports_to"}), /relationship/);
  assert.throws(() => normalizeEdgeInput({relationType:"informs",confidence:-0.1}), /Confidence/);
  assert.deepEqual(normalizeEdgeInput({relationType:"contradicts",note:"Evidence conflicts"}),{relationType:"contradicts",confidence:0.5,note:"Evidence conflicts"});
});
test("attribute parser fails closed for malformed or non-object JSON", () => {
  assert.deepEqual(parseNodeAttributes("{"),{});
  assert.deepEqual(parseNodeAttributes("[]"),{});
  assert.deepEqual(parseNodeAttributes('{"key":"value"}'),{key:"value"});
});
test("node lifecycle only accepts known states", () => {
  assert.equal(validateNodeStatus("accepted"),true);
  assert.equal(validateNodeStatus("deleted"),false);
});
