import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { validatePlannerBenchmarkRecords } from "../src/lib/benchmark/planner-analysis.mjs";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
function hash(value){return crypto.createHash("sha256").update(value).digest("hex");}
function rng(seed){let s=2166136261;for(const c of seed){s^=c.charCodeAt(0);s=Math.imul(s,16777619);}if(!s)s=0x6d2b79f5;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function shuffle(items,random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function createBlindedEvaluation(records,scenarioReader,{seed="modrik-human-eval-v1"}={}){
 const errors=validatePlannerBenchmarkRecords(records);if(errors.length)throw new Error("Invalid benchmark records:\n- "+errors.join("\n- "));
 if(typeof seed!=="string"||!seed.trim()||seed.length>120)throw new Error("Blinding seed must contain 1 to 120 characters.");
 const packetId="hev_"+hash(seed+":"+records.map(r=>r.scenarioId).sort().join("|")).slice(0,16);
 const packet={schemaVersion:1,packetId,createdAt:new Date().toISOString(),method:"within-scenario four-arm blinded review",seedFingerprint:hash(seed).slice(0,12),rubric:{scale:"1 (poor) to 5 (excellent), except redundancy where 1 (low) to 5 (high)",criteria:["overallUtility","evidenceGrounding","coverage","clarity","dialectFit","redundancy"],instruction:"Rate each anonymous question set against the brief and consented evidence. Do not infer system identity. Use the same standards for every set. Higher redundancy is worse. Add a concise rationale for unusually high or low scores."},scenarios:[]};
 const key={schemaVersion:1,packetId,packetSha256:null,seedFingerprint:packet.seedFingerprint,mapping:[]};
 for(const record of [...records].sort((a,b)=>a.scenarioId.localeCompare(b.scenarioId))){
  const scenario=scenarioReader(record.scenarioId);if(!scenario||scenario.id!==record.scenarioId)throw new Error("Missing or mismatched fixture: "+record.scenarioId);
  const evidence=(scenario.evidence||[]).filter(e=>e.consent===true).map(e=>({code:e.code,title:e.title,sourceType:e.sourceType,language:e.language||"en",content:e.content}));
  const random=rng(seed+":"+record.scenarioId),permuted=shuffle(record.arms,random),labels=["A","B","C","D"],blindArms=[];
  for(let i=0;i<permuted.length;i++){const arm=permuted[i],blindArmId=record.scenarioId+"_"+labels[i];blindArms.push({blindArmId,label:labels[i],questions:arm.questions.map((q,index)=>({questionId:"q"+(index+1),text:q.text,language:q.language||"unspecified"}))});key.mapping.push({scenarioId:record.scenarioId,blindArmId,arm:arm.arm});}
  packet.scenarios.push({scenarioId:record.scenarioId,category:record.category,domain:record.domain,difficulty:record.difficulty,brief:scenario.brief,evidence,arms:blindArms});
 }
 const packetText=JSON.stringify(packet,null,2)+"\n";key.packetSha256=hash(packetText);
 return{packet,key,packetText,keyText:JSON.stringify(key,null,2)+"\n"};
}
function main(){const args=process.argv.slice(2),get=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:undefined;},input=get("--input"),prefix=get("--out")||"bench/results/human-evaluation",seed=get("--seed")||"modrik-human-eval-v1";if(!input){process.stderr.write("Usage: node scripts/export-human-evaluation.mjs --input <runs.jsonl> [--out <prefix>] [--seed <value>]\n");process.exitCode=2;return;}
 const records=fs.readFileSync(path.resolve(input),"utf8").split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)).filter(r=>r.status==="success");
 const result=createBlindedEvaluation(records,id=>JSON.parse(fs.readFileSync(path.join(ROOT,"bench","scenarios",id+".json"),"utf8")),{seed});
 const out=path.resolve(prefix);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out+".packet.json",result.packetText,{flag:"w"});fs.writeFileSync(out+".key.json",result.keyText,{flag:"wx"});
 process.stdout.write("Created blinded packet for "+result.packet.scenarios.length+" scenarios.\nPacket: "+out+".packet.json\nMapping key: "+out+".key.json (restrict access; do not share with raters)\n");
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){try{main();}catch(error){process.stderr.write("Human evaluation export failed: "+(error instanceof Error?error.message:String(error))+"\n");process.exitCode=1;}}
