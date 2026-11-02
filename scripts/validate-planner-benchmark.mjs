import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
export function validatePlannerFixtureSet(manifest,readScenario){
 const errors=[];if(!manifest||!Array.isArray(manifest.scenarios))return{errors:["manifest.scenarios must be an array"],scenarios:[],summary:null};
 if(manifest.name!=="arbench-v2"||manifest.scenario_count!==120||manifest.scenarios.length!==120)errors.push("arbench-v2 manifest must contain exactly 120 scenarios");
 const entries=manifest.scenarios.filter(e=>e?.gold_type==="question_utility_json");if(entries.length!==30)errors.push("expected exactly 30 question_utility_json planner fixtures; found "+entries.length);
 const categories={},domains={},difficulties={},scenarios=[];
 for(const entry of entries){categories[entry.category]=(categories[entry.category]||0)+1;domains[entry.domain]=(domains[entry.domain]||0)+1;difficulties[entry.difficulty]=(difficulties[entry.difficulty]||0)+1;let s;try{s=readScenario(entry.id);}catch{errors.push(entry.id+": scenario file missing or invalid JSON");continue;}
 if(!s||s.id!==entry.id)errors.push(entry.id+": scenario id mismatch");
 if(s?.category!==entry.category||s?.domain!==entry.domain||s?.difficulty!==entry.difficulty)errors.push(entry.id+": manifest metadata mismatch");
 if(s?.gold?.type!=="question_utility_json"||!Array.isArray(s?.gold?.payload?.questions)||!s.gold.payload.questions.length)errors.push(entry.id+": question utility gold payload is missing");
 else for(const [i,q] of s.gold.payload.questions.entries()){if(typeof q.text!=="string"||!q.text.trim())errors.push(entry.id+": gold question "+i+" has no text");if(!Number.isInteger(q.askCost)||q.askCost<1||q.askCost>5)errors.push(entry.id+": gold question "+i+" has invalid askCost");const u=q.utility;if(!u||!["infoGain","impact","uncertainty","risk","askCost","utility"].every(k=>Number.isFinite(u[k])))errors.push(entry.id+": gold question "+i+" has incomplete utility labels");}
 if(!Array.isArray(s?.evidence)||!s.evidence.length)errors.push(entry.id+": evidence pack is empty");else for(const e of s.evidence){if(typeof e.consent!=="boolean")errors.push(entry.id+": evidence consent must be an explicit boolean");if(typeof e.content!=="string"||!e.content.trim())errors.push(entry.id+": evidence content is empty");if(typeof e.code!=="string"||!e.code.trim())errors.push(entry.id+": evidence code is missing");}
 if(typeof s?.brief!=="string"||!s.brief.trim())errors.push(entry.id+": project brief is missing");scenarios.push(s);}
 if(categories.elicitation!==15||categories.dialect_ar_eg!==15||Object.keys(categories).length!==2)errors.push("planner subset must cover 15 elicitation and 15 dialect_ar_eg scenarios");
 if(Object.keys(domains).length!==5||Object.values(domains).some(n=>n!==6))errors.push("planner subset must contain six scenarios per domain across five domains");
 if(difficulties.hard!==10||difficulties.medium!==20||Object.keys(difficulties).length!==2)errors.push("planner subset must contain 10 hard and 20 medium scenarios");
 return{errors,scenarios,summary:{totalCorpus:manifest.scenario_count,plannerScenarios:entries.length,categories,domains,difficulties}};
}
export function loadPlannerFixtures(root=ROOT){const m=JSON.parse(fs.readFileSync(path.join(root,"bench","manifest.json"),"utf8"));return validatePlannerFixtureSet(m,id=>JSON.parse(fs.readFileSync(path.join(root,"bench","scenarios",id+".json"),"utf8")));}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){const r=loadPlannerFixtures();if(r.errors.length){process.stderr.write("Planner fixture validation failed:\n- "+r.errors.join("\n- ")+"\n");process.exitCode=1;}else{process.stdout.write("Validated "+r.summary.plannerScenarios+" planner scenarios from "+r.summary.totalCorpus+" arbench-v2 fixtures.\n");process.stdout.write("Categories: "+JSON.stringify(r.summary.categories)+"\n");process.stdout.write("Domains: "+JSON.stringify(r.summary.domains)+"\n");process.stdout.write("Difficulty: "+JSON.stringify(r.summary.difficulties)+"\n");}}
