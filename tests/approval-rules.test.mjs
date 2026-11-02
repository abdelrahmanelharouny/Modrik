import test from "node:test";
import assert from "node:assert/strict";
import {
  validateElicitationApproval,
  validateRequirementApproval,
  validateConflictApproval,
  validateStoryApproval,
} from "../src/lib/pipeline/approval-rules.mjs";

test("elicitation gate rejects generated and synthetic-only answers", () => {
  assert.match(validateElicitationApproval([]), /No questions/);
  assert.match(validateElicitationApproval([
    { answered: true, resolution: "answered", answer: "[synthetic · wind tunnel] plausible", answerSource: "synthetic" },
  ]), /real stakeholder answer/);
  assert.equal(validateElicitationApproval([
    { answered: true, resolution: "answered", answer: "A human answer", answerSource: "human" },
  ]), null);
  assert.equal(validateElicitationApproval([
    { answered: true, resolution: "proceed_with_uncertainty", answer: "assumption", answerSource: "assumption" },
  ]), null);
});

test("requirement gate requires every requirement to have trace links and a verifier result", () => {
  assert.match(validateRequirementApproval([]), /No requirements/);
  assert.match(validateRequirementApproval([
    { refId: "REQ-01", verifyStatus: "supported", links: [] },
  ]), /REQ-01/);
  assert.match(validateRequirementApproval([
    { refId: "REQ-01", verifyStatus: "unverified", links: [{ id: "link-1" }] },
  ]), /REQ-01/);
  assert.match(validateRequirementApproval([
    { refId: "REQ-01", verifyStatus: "weak", verificationSource: "agent", links: [{ id: "link-1" }] },
  ]), /explicit human evidence review/);
  assert.equal(validateRequirementApproval([
    { refId: "REQ-01", verifyStatus: "weak", verificationSource: "human", links: [{ id: "link-1" }] },
    { refId: "REQ-02", verifyStatus: "supported", verificationSource: "human", links: [{ id: "link-2" }] },
  ]), null);
});

test("conflict gate blocks unknown or open states and passes only fully resolved conflicts", () => {
  assert.match(validateConflictApproval([{ status: "open" }, { status: "resolved" }]), /1 conflict/);
  assert.match(validateConflictApproval([{ status: "pending" }]), /1 conflict/);
  assert.equal(validateConflictApproval([{ status: "resolved" }]), null);
  assert.equal(validateConflictApproval([]), null);
});

test("story gate requires a meaningful generated story set", () => {
  assert.match(validateStoryApproval(0), /No user stories/);
  assert.equal(validateStoryApproval(1), null);
});
