import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStakeholder, normalizeStakeholderPosition, normalizePositionEvidence,
  normalizeNegotiation, normalizeNegotiationDecision,
} from "../src/lib/stakeholders/collaboration.mjs";

const profile = { stakeholderRef:"ST-01",displayName:"Product owner",role:"Owner",approvalRole:"approver",goals:["Reduce onboarding time"] };
test("stakeholder profile validates bounded scores, roles, language and arrays",()=>{
  const result=normalizeStakeholder(profile);
  assert.equal(result.authorityScore,50);
  assert.equal(result.approvalRole,"approver");
  assert.deepEqual(JSON.parse(result.goals),["Reduce onboarding time"]);
  assert.throws(()=>normalizeStakeholder({...profile,authorityScore:101}),/authorityScore/);
  assert.throws(()=>normalizeStakeholder({...profile,approvalRole:"superuser"}),/approvalRole/);
  assert.throws(()=>normalizeStakeholder({...profile,goals:Array(21).fill("x")}),/goals/);
});
test("stakeholder position validates stance, rationale and confidence",()=>{
  const result=normalizeStakeholderPosition({stakeholderId:"s1",requirementId:"r1",position:"conditional",confidence:0.7,rationale:"Only if the audit trail is retained."});
  assert.equal(result.confidence,0.7);
  assert.throws(()=>normalizeStakeholderPosition({stakeholderId:"s1",requirementId:"r1",position:"maybe",rationale:"x"}),/position/);
  assert.throws(()=>normalizeStakeholderPosition({stakeholderId:"s1",requirementId:"r1",position:"supports",confidence:1.2,rationale:"x"}),/confidence/);
});
test("position evidence accepts only known relationship types",()=>{
  assert.equal(normalizePositionEvidence({claimId:"c1",relationship:"contradicts"}).relationship,"contradicts");
  assert.throws(()=>normalizePositionEvidence({claimId:"c1",relationship:"invented"}),/relationship/);
});
test("negotiation requires distinct options and never chooses an option at creation",()=>{
  const result=normalizeNegotiation({requirementId:"r1",title:"Retention policy",options:[{id:"a",label:"Short retention",implications:"Lower storage cost"},{id:"b",label:"Long retention",implications:"More audit history"}]});
  assert.equal(JSON.parse(result.options).length,2);
  assert.equal("chosenOption" in result,false);
  assert.throws(()=>normalizeNegotiation({requirementId:"r1",title:"x",options:[{id:"a",label:"A",implications:"x"}]}),/2 to 10/);
});
test("human decision must select a recorded option and provide rationale",()=>{
  const options=JSON.stringify([{id:"a"},{id:"b"}]);
  assert.equal(normalizeNegotiationDecision({status:"approved",chosenOption:"b",rationale:"The audit need outweighs cost."},options).chosenOption,"b");
  assert.throws(()=>normalizeNegotiationDecision({status:"approved",chosenOption:"c",rationale:"x"},options),/recorded options/);
  assert.throws(()=>normalizeNegotiationDecision({status:"approved",chosenOption:"a"},options),/rationale/);
});

test("rejects malformed objects, unsupported language and oversized text",()=>{
  assert.throws(()=>normalizeStakeholder(null),/object/);
  assert.throws(()=>normalizeStakeholder({...profile,preferredLanguage:"xx"}),/preferredLanguage/);
  assert.throws(()=>normalizeStakeholder({...profile,displayName:"x".repeat(121)}),/displayName/);
  assert.throws(()=>normalizeStakeholderPosition({stakeholderId:"s",requirementId:"r",position:"supports",rationale:"x".repeat(2001)}),/rationale/);
});
test("rejects duplicate option identifiers and malformed participant-independent payloads",()=>{
  assert.throws(()=>normalizeNegotiation({requirementId:"r1",title:"Policy",options:[{id:"same",label:"A",implications:"A"},{id:"same",label:"B",implications:"B"}]}),/unique/);
});
test("rejected negotiation requires a rationale and records dissent without a selected option",()=>{
  const result=normalizeNegotiationDecision({status:"rejected",rationale:"Neither option meets the retention obligation.",tradeoffs:"Delay pending legal review.",dissent:["Security team disagrees."]},JSON.stringify([{id:"a"},{id:"b"}]));
  assert.equal(result.status,"rejected");
  assert.equal(result.chosenOption,null);
  assert.deepEqual(JSON.parse(result.dissent),["Security team disagrees."]);
  assert.throws(()=>normalizeNegotiationDecision({status:"rejected",rationale:""},JSON.stringify([])),/rationale/);
});
