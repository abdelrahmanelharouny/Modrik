import {appendFile,mkdir,open,readFile,unlink} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {db} from "../src/lib/db";
import {runPlannerExperiment} from "../src/lib/planner";
import {getProvider} from "../src/lib/providers";
import {PROMPT_VERSION} from "../src/lib/agents";
import {loadPlannerFixtures} from "./validate-planner-benchmark.mjs";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const arg=(a:string[],n:string,d?:string)=>{const i=a.indexOf(n);return i>=0?a[i+1]:d;};
const safe=(e:unknown)=>String(e instanceof Error?e.message:e).replace(/(api[_-]?key|token|authorization)\s*[:=]\s*\S+/gi,"$1=[REDACTED]").replace(/https?:\/\/\S+/gi,"[URL]").slice(0,300);
const pause=(n:number)=>n>0?new Promise(r=>setTimeout(r,n)):Promise.resolve();
async function main(){
 const args=process.argv.slice(2);if(args.includes("--help")){process.stdout.write("Usage: bun scripts/run-planner-benchmark.ts [--validate-only] [--ids id,id] [--limit n] [--seed value] [--out path] [--delay-ms n]\n");return;}
 const fixtures=loadPlannerFixtures(ROOT);if(fixtures.errors.length)throw new Error("Fixture validation failed:\n"+fixtures.errors.join("\n"));if(args.includes("--validate-only")){process.stdout.write("Validated "+fixtures.scenarios.length+" planner scenarios in the 120-scenario corpus.\n");return;}
 let scenarios=fixtures.scenarios;const ids=arg(args,"--ids");if(ids){const wanted=ids.split(",").map(x=>x.trim()).filter(Boolean),map=new Map<string,any>(scenarios.map((s:any)=>[s.id,s] as const)),unknown=wanted.filter(id=>!map.has(id));if(new Set(wanted).size!==wanted.length)throw new Error("--ids cannot contain duplicate scenario ids");if(unknown.length)throw new Error("Unknown planner scenario ids: "+unknown.join(", "));scenarios=wanted.map(id=>map.get(id)!);}
 const limit=Number(arg(args,"--limit",String(scenarios.length)));if(!Number.isInteger(limit)||limit<1||limit>30)throw new Error("--limit must be 1..30");scenarios=scenarios.slice(0,limit);
 const baseSeed=arg(args,"--seed","arbench-v2-planner-h2.1-v1")!;if(!baseSeed.trim()||baseSeed.length>60)throw new Error("--seed must be 1..60 characters");
 const delayMs=Number(arg(args,"--delay-ms","0"));if(!Number.isInteger(delayMs)||delayMs<0||delayMs>120000)throw new Error("--delay-ms must be 0..120000");
 const out=path.resolve(ROOT,arg(args,"--out","bench/results/arbench-v2-planner-runs.jsonl")!);await mkdir(path.dirname(out),{recursive:true});const lockPath=out+".lock";let lock;try{lock=await open(lockPath,"wx");}catch{throw new Error("Another benchmark run holds the output lock: "+lockPath);}
 let failures=0;try{
  let existing="";try{existing=await readFile(out,"utf8");}catch{}const done=new Set<string>(),successfulSeedByScenario=new Map<string,string>();for(const line of existing.split(/\r?\n/).filter(Boolean)){const row=JSON.parse(line);if(row.status==="success"){const prior=successfulSeedByScenario.get(row.scenarioId);if(prior&&prior!==row.seed)throw new Error("Output already contains another successful seed for "+row.scenarioId+"; use a separate output file for replicates");successfulSeedByScenario.set(row.scenarioId,row.seed);done.add(row.scenarioId+"::"+row.seed);}}
  const provider=await getProvider();process.stdout.write("Provider: "+provider.id+" / "+provider.model+"\nSelected scenarios: "+scenarios.length+"\nOutput: "+out+"\n");
  for(const s of scenarios){const seed=baseSeed+":"+s.id,key=s.id+"::"+seed,priorSeed=successfulSeedByScenario.get(s.id);if(priorSeed&&priorSeed!==seed)throw new Error("Output already contains another successful seed for "+s.id+"; use a separate output file");if(done.has(key)){process.stdout.write("SKIP "+s.id+"\n");continue;}const startedAt=new Date().toISOString(),started=Date.now();let projectId:string|null=null;
   try{
    const project=await db.project.create({data:{name:"[ARBench v2] "+s.id,brief:s.brief,isDemo:true,currentStage:"ELICITATION",stageStatus:"awaiting_input"},select:{id:true}});projectId=project.id;
    await db.evidence.createMany({data:s.evidence.map((e:any)=>({projectId:project.id,code:e.code,title:e.title,sourceType:e.sourceType,language:e.language||"en",content:e.content,consent:e.consent===true,origin:"synthetic"}))});
    const result=await runPlannerExperiment(project.id,{seed,materializeArm:"impact_aware"});
    const persisted=await db.plannerRun.findMany({where:{projectId:project.id,experimentId:result.experimentId},orderBy:{createdAt:"asc"}});
    if(persisted.length!==4)throw new Error("Expected four persisted arms; found "+persisted.length);
    const map=new Map(persisted.map((r:any)=>[r.arm,r])),hashes=["random","llm","impact_aware"].map(a=>map.get(a)?.candidatePoolHash);
    if(hashes.some(h=>!h)||new Set(hashes).size!==1)throw new Error("Pool-based arms did not share a candidate-pool hash");
    const arms=result.arms.map((a:any)=>{const row=map.get(a.arm);if(!row)throw new Error("Missing persisted arm "+a.arm);return{arm:a.arm,candidatePoolHash:row.candidatePoolHash,candidatePoolUsed:row.candidatePoolUsed,metrics:a.metrics,candidates:a.candidates,estTokens:a.estTokens,latencyMs:a.latencyMs,questions:a.questions};});
    const record={schemaVersion:1,status:"success",scenarioId:s.id,category:s.category,domain:s.domain,difficulty:s.difficulty,languages:s.languages,seed,startedAt,durationMs:Date.now()-started,experimentId:result.experimentId,candidatePoolHash:result.candidatePoolHash,candidateCount:result.candidateCount,promptVersion:persisted[0].promptVersion||PROMPT_VERSION,provider:{id:provider.id,model:provider.model},goldQuestions:s.gold.payload.questions,arms};
    await appendFile(out,JSON.stringify(record)+"\n","utf8");done.add(key);successfulSeedByScenario.set(s.id,seed);process.stdout.write("PASS "+s.id+" ("+arms.length+" arms, "+record.durationMs+"ms)\n");
   }catch(error){failures++;const record={schemaVersion:1,status:"failed",scenarioId:s.id,category:s.category,domain:s.domain,difficulty:s.difficulty,seed,startedAt,durationMs:Date.now()-started,error:safe(error)};await appendFile(out,JSON.stringify(record)+"\n","utf8");process.stderr.write("FAIL "+s.id+": "+record.error+"\n");}
   finally{if(projectId){try{await db.project.delete({where:{id:projectId}});}catch(error){process.stderr.write("WARN cleanup "+s.id+": "+safe(error)+"\n");}}}
   await pause(delayMs);
  }
  process.stdout.write("Benchmark finished. Failures: "+failures+".\n");if(failures)process.exitCode=1;
 }finally{await db.$disconnect();await lock.close();await unlink(lockPath).catch(()=>{});}
}
main().catch(async e=>{process.stderr.write("Planner benchmark aborted: "+safe(e)+"\n");try{await db.$disconnect();}catch{}process.exitCode=1;});
