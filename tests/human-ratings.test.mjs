import test from "node:test";
import assert from "node:assert/strict";
import { analyzeHumanRatings, buildBlindPackets, parseCsv, serializeCsv, weightedQuadraticKappa, RATER_COLUMNS } from "../src/lib/research/human-ratings.mjs";

test("CSV round-trip preserves Arabic, commas, quotes and embedded newlines",()=>{
 const rows=[{value:'مرحبا, "مدرك"\nسطر تاني',empty:"",number:4}],columns=["value","empty","number"];
 const parsed=parseCsv(serializeCsv(rows,columns));assert.deepEqual(parsed,[{value:rows[0].value,empty:"",number:"4"}]);
});
test("quadratic weighted kappa is one for perfect agreement and lower for disagreement",()=>{
 assert.equal(weightedQuadraticKappa([1,2,3,4,5],[1,2,3,4,5]).kappa,1);
 assert.ok(weightedQuadraticKappa([1,1,5,5],[5,5,1,1]).kappa<0);
});
test("blind packets preserve consent, hide arm labels and use one stable key across raters",()=>{
 const scenario={id:"s1",category:"elicitation",domain:"clinic",difficulty:"hard",brief:"brief",evidence:[{code:"E1",title:"ok",sourceType:"interview",language:"en",content:"consented",consent:true},{code:"E2",title:"private",sourceType:"interview",language:"en",content:"excluded",consent:false}]};
 const record={status:"success",scenarioId:"s1",arms:["single_shot","random","llm","impact_aware"].map(arm=>({arm,questions:[{text:"Question",rationale:"Why",priority:"high",askCost:2,utility:100}]}))};
 const packets=buildBlindPackets([record],()=>scenario,{seed:"fixed"});
 assert.equal(packets.rowsPerRater,4);assert.equal(packets.answerKey.length,4);
 assert.equal(packets.raters.R1[0].evidence_json.includes("excluded"),false);
 assert.equal(packets.raters.R1[0].questions_json.includes("utility"),false);
 assert.equal(packets.raters.R1[0].arm,undefined);
 assert.deepEqual(packets.raters.R1.map(x=>x.blind_output_id).sort(),packets.raters.R2.map(x=>x.blind_output_id).sort());
 assert.ok(RATER_COLUMNS.includes("overall_1_5"));
});
function ratingRows(){
 const arms=["single_shot","random","llm","impact_aware"],r1=[],r2=[],key=[];
 for(let s=0;s<10;s++)for(const [i,arm] of arms.entries()){
  const blind="B"+s+"-"+i,score=arm==="impact_aware"?5:3;
  const row={scenario_id:"S"+s,blind_output_id:blind};
  const other={...row};
  for(const field of ["coverage","grounding","relevance","specificity","dialect_fit","non_redundancy","overall","confidence"]){row[field+"_1_5"]=String(score);other[field+"_1_5"]=String(score);}
  r1.push(row);r2.push(other);key.push({scenario_id:"S"+s,blind_output_id:blind,arm});
 }
 return{r1,r2,key};
}
test("two-rater analysis computes agreement, blinded arm comparisons and adjudication",()=>{
 const data=ratingRows(),report=analyzeHumanRatings(data.r1,data.r2,data.key,{seed:"fixed"});
 assert.equal(report.scenarioCount,10);assert.equal(report.interRater.overall.kappa,1);
 assert.equal(report.comparisons.find(x=>x.metric==="overall"&&x.comparator==="single_shot").verdict,"evidence-of-improvement");
 assert.equal(report.adjudicationQueue.length,0);
});
test("human-rating inference is withheld below ten complete scenarios",()=>{
 const data=ratingRows(),report=analyzeHumanRatings(data.r1.filter(x=>x.scenario_id!=="S9"),data.r2.filter(x=>x.scenario_id!=="S9"),data.key.filter(x=>x.scenario_id!=="S9"));
 const row=report.comparisons.find(x=>x.metric==="overall"&&x.comparator==="single_shot");
 assert.equal(report.scenarioCount,9);assert.equal(row.verdict,"insufficient-data");assert.equal(row.ci95,null);
});
