import {randomBytes} from "node:crypto";
import {readFileSync} from "node:fs";
import {mkdir,writeFile,unlink} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {buildBlindPackets,RATER_COLUMNS,serializeCsv} from "../src/lib/research/human-ratings.mjs";
import {validatePlannerBenchmarkRecords} from "../src/lib/benchmark/planner-analysis.mjs";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const arg=(args,name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
async function main(){
 const args=process.argv.slice(2),input=arg(args,"--input");
 if(!input){process.stderr.write("Usage: node scripts/create-human-rating-packets.mjs --input <planner-runs.jsonl> [--out <directory>] [--seed value] [--min-scenarios 10]\n");process.exitCode=2;return;}
 const raw=await readFile(path.resolve(input),"utf8"),records=raw.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)).filter(row=>row.status==="success");
 const errors=validatePlannerBenchmarkRecords(records);if(errors.length)throw new Error("Planner benchmark records are invalid:\n- "+errors.join("\n- "));
 const min=Number(arg(args,"--min-scenarios","10"));if(!Number.isInteger(min)||min<2||min>30)throw new Error("--min-scenarios must be between 2 and 30");if(records.length<min)throw new Error("Need at least "+min+" completed scenarios to create a blind rating packet; found "+records.length);
 const seed=arg(args,"--seed",randomBytes(16).toString("hex")),out=path.resolve(ROOT,arg(args,"--out","bench/results/human-ratings"));
 const packet=buildBlindPackets(records,id=>JSON.parse(readFileSync(path.join(ROOT,"bench","scenarios",id+".json"),"utf8")),{seed});
 await mkdir(path.join(out,"rater-1"),{recursive:true,mode:0o700});await mkdir(path.join(out,"rater-2"),{recursive:true,mode:0o700});await mkdir(path.join(out,"coordinator-only"),{recursive:true,mode:0o700});
 const artifacts=[
  [path.join(out,"rater-1","packet.csv"),serializeCsv(packet.raters.R1,RATER_COLUMNS),0o600],
  [path.join(out,"rater-2","packet.csv"),serializeCsv(packet.raters.R2,RATER_COLUMNS),0o600],
  [path.join(out,"coordinator-only","answer-key.csv"),serializeCsv(packet.answerKey,["scenario_id","blind_output_id","arm"]),0o600],
  [path.join(out,"coordinator-only","manifest.json"),JSON.stringify({schemaVersion:1,seed:packet.seed,scenarioCount:packet.scenarioCount,outputsPerRater:packet.rowsPerRater,createdAt:new Date().toISOString(),raterFiles:["rater-1/packet.csv","rater-2/packet.csv"],restrictedKey:"coordinator-only/answer-key.csv"},null,2)+"\n",0o600],
 ];
 const created=[];
 try{for(const [file,data,mode] of artifacts){await writeFile(file,data,{flag:"wx",mode});created.push(file);}}
 catch(error){await Promise.all(created.map(file=>unlink(file).catch(()=>{})));throw new Error("Packet creation aborted without overwriting existing artifacts; partial files were cleaned up. "+(error instanceof Error?error.message:String(error)));}
 process.stdout.write("Created two blind rating packets for "+packet.scenarioCount+" scenarios ("+packet.rowsPerRater+" outputs per rater).\n");
 process.stdout.write("Rater 1: "+path.join(out,"rater-1","packet.csv")+"\nRater 2: "+path.join(out,"rater-2","packet.csv")+"\nCoordinator-only key: "+path.join(out,"coordinator-only","answer-key.csv")+"\n");
}
main().catch(error=>{process.stderr.write("Human-rating packet creation failed: "+(error instanceof Error?error.message:String(error))+"\n");process.exitCode=1;});
