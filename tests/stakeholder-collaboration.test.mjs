import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStakeholder, normalizeStakeholderPosition, normalizePositionEvidence,
  normalizeNegotiation, normalizeNegotiationDecision, normalizeStakeholderUpdate, normalizeNegotiationResponse, assertNegotiationQuorum, assertNegotiationDecisionAuthority, assertStakeholderCanLeaveEngagement, assertStakeholderApprovalRoleChangeAllowed,
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

test("stakeholder lifecycle updates preserve omitted values and validate transitions",()=>{
  const current={engagementStatus:"active",approvalRole:"consulted"};
  assert.deepEqual(normalizeStakeholderUpdate({engagementStatus:"unavailable"},current),{engagementStatus:"unavailable",approvalRole:"consulted"});
  assert.deepEqual(normalizeStakeholderUpdate({approvalRole:"approver"},current),{engagementStatus:"active",approvalRole:"approver"});
  assert.deepEqual(normalizeStakeholderUpdate({engagementStatus:"withdrawn",approvalRole:"observer"},current),{engagementStatus:"withdrawn",approvalRole:"observer"});
  assert.throws(()=>normalizeStakeholderUpdate({engagementStatus:"deleted"},current),/engagementStatus/);
  assert.throws(()=>normalizeStakeholderUpdate({approvalRole:"superuser"},current),/approvalRole/);
});

test("multi-stakeholder quorum requires 2-30 unique participant identities",()=>{
  assert.throws(()=>assertNegotiationQuorum([]),/2 to 30/);
  assert.throws(()=>assertNegotiationQuorum([{stakeholderId:"a"}]),/2 to 30/);
  assert.throws(()=>assertNegotiationQuorum([{stakeholderId:"a"},{stakeholderId:"a"}]),/unique/);
  assert.equal(assertNegotiationQuorum([{stakeholderId:"a"},{stakeholderId:"b"}]),true);
});
test("participant response requires a supported stance and a rationale",()=>{
  assert.deepEqual(normalizeNegotiationResponse({responseStatus:"conditional",rationale:"Only if audit logs remain exportable."}),{responseStatus:"conditional",responseOptionId:null,rationale:"Only if audit logs remain exportable."});
  assert.throws(()=>normalizeNegotiationResponse({responseStatus:"maybe",rationale:"x"}),/response/);
  assert.throws(()=>normalizeNegotiationResponse({responseStatus:"supports",rationale:"I support it."}),/identify one/);
  assert.throws(()=>normalizeNegotiationResponse({responseStatus:"supports",responseOptionId:"unknown",rationale:"I support it."},JSON.stringify([{id:"a"}])),/recorded/);
  assert.deepEqual(normalizeNegotiationResponse({responseStatus:"supports",responseOptionId:"a",rationale:"Option A meets the need."},JSON.stringify([{id:"a"}])),{responseStatus:"supports",responseOptionId:"a",rationale:"Option A meets the need."});
  assert.throws(()=>normalizeNegotiationResponse({responseStatus:"supports",rationale:""}),/identify one/);
});

test("approved negotiation requires explicit support from a participating decision maker or approver",()=>{
  const participants=[
    {responseStatus:"supports",responseOptionId:"a",stakeholder:{approvalRole:"consulted"}},
    {responseStatus:"opposes",responseOptionId:null,stakeholder:{approvalRole:"approver"}},
  ];
  assert.throws(()=>assertNegotiationDecisionAuthority(participants,{status:"approved",chosenOption:"b"}),/explicit support/);
  assert.throws(()=>assertNegotiationDecisionAuthority([
    ...participants,
    {responseStatus:"supports",responseOptionId:"a",stakeholder:{approvalRole:"decision_maker"}},
  ],{status:"approved",chosenOption:"b"}),/explicit support/);
  assert.equal(assertNegotiationDecisionAuthority([
    ...participants,
    {responseStatus:"supports",responseOptionId:"b",stakeholder:{approvalRole:"decision_maker"}},
  ],{status:"approved",chosenOption:"b"}),true);
  assert.equal(assertNegotiationDecisionAuthority(participants,{status:"rejected"}),true);
});

test("stakeholders cannot withdraw or become unavailable with pending negotiation responses",()=>{
  assert.equal(assertStakeholderCanLeaveEngagement("active",2),true);
  assert.equal(assertStakeholderCanLeaveEngagement("withdrawn",0),true);
  assert.equal(assertStakeholderCanLeaveEngagement("unavailable",0),true);
  assert.throws(()=>assertStakeholderCanLeaveEngagement("withdrawn",1),/Resolve or reject/);
  assert.throws(()=>assertStakeholderCanLeaveEngagement("unavailable",2),/Resolve or reject/);
  assert.throws(()=>assertStakeholderCanLeaveEngagement("invalid",0),/engagementStatus/);
});


test("approval roles cannot change while the stakeholder participates in an open negotiation",()=>{
  assert.equal(assertStakeholderApprovalRoleChangeAllowed("approver","approver",3),true);
  assert.equal(assertStakeholderApprovalRoleChangeAllowed("decision_maker","approver",0),true);
  assert.throws(()=>assertStakeholderApprovalRoleChangeAllowed("approver","consulted",1),/Close or reject open negotiations/);
  assert.throws(()=>assertStakeholderApprovalRoleChangeAllowed("invalid","consulted",0),/approvalRole/);
  assert.throws(()=>assertStakeholderApprovalRoleChangeAllowed("approver","consulted",-1),/openParticipationCount/);
});
