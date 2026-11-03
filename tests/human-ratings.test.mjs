import test from "node:test";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import { analyzeHumanRatings, buildBlindPackets, parseCsv, serializeCsv, weightedQuadraticKappa, RATER_COLUMNS, verifyHumanRatingArtifacts, RATING_FIELDS } from "../src/lib/research/human-ratings.mjs";

test("CSV round-trip preserves Arabic, commas, quotes and embedded newlines",()=>{
 const rows=[{value:'مرحبا, "مدرك"\nسطر تاني',empty:"",number:4}],columns=["value","empty","number"];
 const parsed=parseCsv(serializeCsv(rows,columns));assert.deepEqual(parsed,[{value:rows[0].value,empty:"",number:"4"}]);
});
test("quadratic weighted kappa is one for perfect agreement and lower for disagreement",()=>{
 assert.equal(weightedQuadraticKappa([1,2,3,4,5],[1,2,3,4,5]).kappa,1);
 assert.equal(weightedQuadraticKappa([3,3,3],[3,3,3]).kappa,null);
 assert.ok(weightedQuadraticKappa([1,1,5,5],[5,5,1,1]).kappa<0);
});
test("blind packets preserve consent, hide arm labels and use one stable key across raters",()=>{
 const scenario={id:"s1",category:"elicitation",domain:"clinic",difficulty:"hard",brief:"brief",evidence:[{code:"E1",title:"ok",sourceType:"interview",language:"en",content:"consented",consent:true},{code:"E2",title:"private",sourceType:"interview",language:"en",content:"excluded",consent:false}]};
 const record={status:"success",scenarioId:"s1",arms:["single_shot","random","llm","impact_aware"].map(arm=>({arm,questions:[{text:"Question",rationale:"Why",priority:"high",askCost:2,utility:100}]}))};
 const packets=buildBlindPackets([record],()=>scenario,{seed:"fixed"});
 assert.equal(packets.rowsPerRater,4);assert.equal(packets.answerKey.length,4);
 assert.equal(packets.raters.R1[0].evidence_json.includes("excluded"),false);
 assert.equal(packets.raters.R1[0].questions_json.includes("utility"),false);
 assert.equal(packets.raters.R1[0].questions_json.includes("rationale"),false);
 assert.equal(packets.raters.R1[0].questions_json.includes("priority"),false);
 assert.equal(packets.raters.R1[0].questions_json.includes("askCost"),false);
 assert.equal(packets.raters.R1[0].questions_json.includes("fallbackAssumption"),false);
 assert.equal(packets.raters.R1[0].arm,undefined);
 assert.deepEqual(packets.raters.R1.map(x=>x.blind_output_id).sort(),packets.raters.R2.map(x=>x.blind_output_id).sort());
 assert.ok(RATER_COLUMNS.includes("overall_1_5"));
});
function ratingRows(){
 const arms=["single_shot","random","llm","impact_aware"],r1=[],r2=[],key=[];
 for(let s=0;s<10;s++)for(const [i,arm] of arms.entries()){
  const blind="B"+s+"-"+i,score=arm==="impact_aware"?5:3;
  const row={rater_code:"R1",scenario_id:"S"+s,blind_output_id:blind};
  const other={...row,rater_code:"R2"};
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

test("human-rating analysis reports expected per-rater coverage and rejects unknown blind IDs",()=>{
 const data=ratingRows();
 const missing=data.r1.pop();
 const report=analyzeHumanRatings(data.r1,data.r2,data.key,{seed:"coverage"});
 assert.equal(report.coverage.expectedOutputs,40);
 assert.equal(report.coverage.rater1Submitted,39);
 assert.equal(report.coverage.rater2Submitted,40);
 assert.equal(report.coverage.missingFromRater1,1);
 assert.equal(report.coverage.missingFromRater2,0);
 assert.throws(()=>analyzeHumanRatings([...data.r1,{...missing,blind_output_id:"UNKNOWN"}],data.r2,data.key),/absent from the answer key/);
});

test("human-rating manifest binds exact canonical packet, both rater exports and answer key bytes",()=>{
 const digest=value=>createHash("sha256").update(value,"utf8").digest("hex");
 const artifacts={canonicalPacketText:"{}",rater1CsvText:"a\\n1\\n",rater2CsvText:"a\\n2\\n",answerKeyCsvText:"a\\n3\\n"};
 const manifest={schemaVersion:1,rubricVersion:"modrik-human-ratings-v1",canonicalPacketSha256:digest(artifacts.canonicalPacketText),rater1CsvSha256:digest(artifacts.rater1CsvText),rater2CsvSha256:digest(artifacts.rater2CsvText),answerKeyCsvSha256:digest(artifacts.answerKeyCsvText)};
 assert.equal(verifyHumanRatingArtifacts({...artifacts,manifest}),true);
 assert.throws(()=>verifyHumanRatingArtifacts({...artifacts,rater2CsvText:artifacts.rater2CsvText+"tamper",manifest}),/integrity check failed/);
 assert.throws(()=>verifyHumanRatingArtifacts({...artifacts,manifest:{...manifest,rubricVersion:"unknown"} }),/Unsupported/);
});

test("human-rating analysis rejects swapped or forged rater identities",()=>{
 const data=ratingRows();data.r1[0].rater_code="R2";
 assert.throws(()=>analyzeHumanRatings(data.r1,data.r2,data.key),/mismatched rater_code/);
});

test("human-rating manifest accepts filled score columns but rejects changes to the blinded packet payload",()=>{
 const digest=value=>createHash("sha256").update(value,"utf8").digest("hex");
 const base={rater_code:"R1",scenario_id:"S1",blind_output_id:"B1",category:"elicitation",domain:"clinic",difficulty:"medium",brief:"brief",evidence_json:"[]",questions_json:"[]",notes:""};
 for(const field of RATING_FIELDS)base[field+"_1_5"]="";
 const r1=serializeCsv([base],RATER_COLUMNS);
 const other={...base,rater_code:"R2"};
 const r2=serializeCsv([other],RATER_COLUMNS);
 const artifacts={canonicalPacketText:"{}",rater1CsvText:r1,rater2CsvText:r2,answerKeyCsvText:"scenario_id,blind_output_id,arm\\r\\nS1,B1,single_shot\\r\\n"};
 const manifest={schemaVersion:1,rubricVersion:"modrik-human-ratings-v1",canonicalPacketSha256:digest(artifacts.canonicalPacketText),rater1CsvSha256:digest(r1),rater2CsvSha256:digest(r2),answerKeyCsvSha256:digest(artifacts.answerKeyCsvText)};
 const rated1={...base,overall_1_5:"5",confidence_1_5:"4",notes:"rater comment"};
 const rated2={...other,overall_1_5:"4",confidence_1_5:"4",notes:"second rater comment"};
 assert.equal(verifyHumanRatingArtifacts({...artifacts,rater1CsvText:serializeCsv([rated1],RATER_COLUMNS),rater2CsvText:serializeCsv([rated2],RATER_COLUMNS),manifest}),true);
 assert.throws(()=>verifyHumanRatingArtifacts({...artifacts,rater1CsvText:serializeCsv([{...rated1,brief:"tampered brief"}],RATER_COLUMNS),manifest}),/integrity check failed/);
});

test("human-rating analysis rejects nonblank ordinal values outside the 1-5 rubric",()=>{
 const data=ratingRows();data.r1[0].overall_1_5="6";
 assert.throws(()=>analyzeHumanRatings(data.r1,data.r2,data.key),/invalid overall_1_5.*integer from 1 to 5/);
});
