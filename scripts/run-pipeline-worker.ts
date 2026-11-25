#!/usr/bin/env bun
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { analyzeDrift, runStageAgent } from "@/lib/agents";
import { ARMS, runPlanner, type PlannerArm } from "@/lib/planner";
import { STAGES, type Stage } from "@/lib/rp";
import {
  PipelineJobLeaseLostError, buildPipelineJobClaimFilter, buildPipelineJobHeartbeatData,
  buildPipelineJobLease, buildPipelineJobOwnershipFilter, buildPipelineJobRetry,
  isRetryablePipelineFailure, sanitizePipelineJobError,
} from "@/lib/pipeline/job-queue.mjs";

type AgentJob = {
  id:string; projectId:string; pipelineRunId:string; stage:string; status:string; payload:string; jobKind:string; idempotencyKey:string|null;
  attempts:number; maxAttempts:number; lockedAt:Date|null; lockedBy:string|null;
  leaseToken:string|null; leaseExpiresAt:Date|null;
};
const readInt=(name:string,fallback:number,min:number,max:number)=>{
  const value=Number(process.env[name]);return Number.isSafeInteger(value)?Math.max(min,Math.min(value,max)):fallback;
};
const pollMs=readInt("PIPELINE_WORKER_POLL_MS",1500,250,30_000);
const leaseMs=readInt("PIPELINE_JOB_LEASE_MS",120_000,30_000,900_000);
const heartbeatMs=readInt("PIPELINE_WORKER_HEARTBEAT_MS",Math.min(30_000,Math.floor(leaseMs/3)),5_000,Math.max(5_000,Math.floor(leaseMs/2)));
const concurrency=readInt("PIPELINE_WORKER_CONCURRENCY",1,1,16);
const once=process.argv.includes("--once");
const maxAttempts=readInt("PIPELINE_JOB_MAX_ATTEMPTS",5,1,12);
const workerBase=process.env.HOSTNAME?.trim()||"modrik-worker";
let shuttingDown=false,activeJobs=0,jobsCompleted=0,jobsRetried=0,lastError:string|null=null;
const healthServer=createServer(async (request,response)=>{
  if(request.url!=="/health"&&request.url!=="/healthz"){response.writeHead(404).end();return;}
  let databaseHealthy=true;
  try{await db.$queryRaw`SELECT 1`;}catch(error){databaseHealthy=false;lastError=sanitizePipelineJobError(error);}
  const ready=!shuttingDown&&databaseHealthy;
  response.writeHead(ready?200:503,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});
  response.end(JSON.stringify({status:shuttingDown?"draining":databaseHealthy?"ready":"degraded",database:databaseHealthy?"connected":"unavailable",activeJobs,jobsCompleted,jobsRetried,lastError,uptimeSeconds:Math.floor(process.uptime())}));
});
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const ownership=(job:AgentJob)=>{
  if(!job.lockedBy||!job.leaseToken)throw new PipelineJobLeaseLostError();
  return buildPipelineJobOwnershipFilter({jobId:job.id,workerId:job.lockedBy,leaseToken:job.leaseToken});
};

/** Atomic lease renewal inside the same transaction as every agent write. */
async function guardLease(job:AgentJob,tx?:unknown){
  const client=tx?(tx as Prisma.TransactionClient):db;
  const now=new Date();
  const updated=await client.agentJob.updateMany({
    where:{...ownership(job),leaseExpiresAt:{gt:now}},
    data:{leaseExpiresAt:new Date(now.getTime()+leaseMs)},
  });
  if(updated.count!==1)throw new PipelineJobLeaseLostError();
}

/** Claim is compare-and-swap under Serializable isolation; expired leases are reclaimable. */
async function claimOne(workerId:string):Promise<AgentJob|null>{
  return db.$transaction(async tx=>{
    const now=new Date();
    const candidates=await tx.agentJob.findMany({
      where:buildPipelineJobClaimFilter(now),
      orderBy:[{availableAt:"asc"},{createdAt:"asc"}],take:20,
    });
    for(const candidate of candidates){
      const job=candidate as AgentJob;
      const eligible=job.status==="running"
        ?{id:job.id,status:"running",attempts:job.attempts,leaseToken:job.leaseToken,leaseExpiresAt:{lte:now}}
        :{id:job.id,status:job.status,attempts:job.attempts,availableAt:{lte:now}};
      if(job.attempts>=job.maxAttempts){
        const dead=await tx.agentJob.updateMany({where:eligible,data:{
          status:"dead",completedAt:now,lastError:"Job exhausted its retry budget.",
          lockedAt:null,leaseExpiresAt:null,lockedBy:null,leaseToken:null,
        }});
        if(dead.count===1){
          await tx.pipelineRun.update({where:{id:job.pipelineRunId},data:{status:"failed",completedAt:now,log:"agent job exhausted its retry/lease budget"}});
          if(job.jobKind==="change_impact"){
            const payload=JSON.parse(job.payload||"{}") as {syncMapId?:string};
            if(payload.syncMapId)await tx.syncMap.updateMany({where:{id:payload.syncMapId,projectId:job.projectId},data:{direction:"failed",leaseExpiresAt:null,syncedAt:now}});
            await tx.decisionEntry.create({data:{projectId:job.projectId,stage:"DRIFT",actor:"system",action:"change_impact_failed",detail:"Change-impact job "+job.id+" exhausted its retry budget."}});
          }else{
            await tx.project.updateMany({where:{id:job.projectId,currentStage:job.stage,stageStatus:"agent_running"},data:{stageStatus:"awaiting_input",updatedAt:now}});
            await tx.decisionEntry.create({data:{projectId:job.projectId,stage:job.stage,actor:"system",action:"agent_failed",detail:"Agent job "+job.id+" exhausted its retry budget."}});
          }
        }
        continue;
      }
      const leaseToken=randomUUID();
      const lease=buildPipelineJobLease({workerId,leaseToken,now,leaseMs});
      const claimed=await tx.agentJob.updateMany({where:eligible,data:{...lease,attempts:{increment:1}}});
      if(claimed.count!==1)continue;
      return tx.agentJob.findFirst({where:{id:job.id,status:"running",lockedBy:workerId,leaseToken}}) as Promise<AgentJob|null>;
    }
    return null;
  },{isolationLevel:"Serializable"});
}

async function heartbeat(job:AgentJob,lost:{value:boolean}){
  if(lost.value)return;
  try{
    await guardLease(job);
  }catch(error){
    if(error instanceof PipelineJobLeaseLostError)lost.value=true;
    else lastError=sanitizePipelineJobError(error);
  }
}
type DriftResult={summary:string;requirements:Array<{refId:string;note:string}>};
async function completeJob(job:AgentJob,impactResult?:DriftResult){
  await db.$transaction(async tx=>{
    await guardLease(job,tx);
    const now=new Date();
    if(job.jobKind==="change_impact"){
      if(!impactResult)throw new Error("Change-impact result is required to complete this job.");
      const payload=JSON.parse(job.payload||"{}") as {syncMapId?:string;source?:string;signal?:string};
      for(const finding of impactResult.requirements.slice(0,100)){
        const requirement=await tx.requirement.findFirst({where:{projectId:job.projectId,refId:finding.refId},select:{id:true,driftStatus:true}});
        if(!requirement)continue;
        await tx.changeImpactFinding.upsert({
          where:{jobId_requirementRef:{jobId:job.id,requirementRef:finding.refId}},
          create:{projectId:job.projectId,jobId:job.id,requirementId:requirement.id,requirementRef:finding.refId,note:finding.note,status:"pending"},
          update:{note:finding.note},
        });
        if(requirement.driftStatus==="none"){
          await tx.requirement.updateMany({where:{id:requirement.id,projectId:job.projectId,driftStatus:"none"},data:{driftStatus:"suspected"}});
        }
      }
      await tx.artifact.create({data:{
        projectId:job.projectId,stage:"DRIFT",kind:"json",
        content:JSON.stringify({source:payload.source||"manual",signal:String(payload.signal||"").slice(0,2000),summary:impactResult.summary,findings:impactResult.requirements.slice(0,100),completedAt:now.toISOString()}).slice(0,24000),
      }});
      if(payload.syncMapId)await tx.syncMap.updateMany({where:{id:payload.syncMapId,projectId:job.projectId},data:{direction:"pulled",leaseExpiresAt:null,syncedAt:now}});
      await tx.pipelineRun.update({where:{id:job.pipelineRunId},data:{status:"done",completedAt:now,log:impactResult.summary.slice(0,1800)}});
      await tx.decisionEntry.create({data:{projectId:job.projectId,stage:"DRIFT",actor:"agent",action:"change_impact_analysis",detail:JSON.stringify({jobId:job.id,source:payload.source||"manual",findingCount:impactResult.requirements.length,summary:impactResult.summary.slice(0,500)})}});
    }else{
      const project=await tx.project.updateMany({where:{id:job.projectId,currentStage:job.stage,stageStatus:"agent_running"},data:{stageStatus:"awaiting_review",updatedAt:now}});
      if(project.count!==1)throw new Error("Project stage ownership changed before results were finalized.");
      await tx.pipelineRun.update({where:{id:job.pipelineRunId},data:{status:"done",completedAt:now,log:"agent completed by durable worker"}});
      await tx.decisionEntry.create({data:{projectId:job.projectId,stage:job.stage,actor:"agent",action:"agent_run",detail:"Durable worker completed job "+job.id+"; result awaits human review."}});
    }
    const done=await tx.agentJob.updateMany({where:{...ownership(job),leaseExpiresAt:{gt:now}},data:{
      status:"completed",completedAt:now,lastError:null,lockedAt:null,leaseExpiresAt:null,lockedBy:null,leaseToken:null,
    }});
    if(done.count!==1)throw new PipelineJobLeaseLostError();
  },{isolationLevel:"Serializable"});
}
async function retryJob(job:AgentJob,error:unknown){
  const message=sanitizePipelineJobError(error);
  const retry=buildPipelineJobRetry({attempts:job.attempts,maxAttempts:job.maxAttempts,error:message,permanent:!isRetryablePipelineFailure(error)});
  const {delayMs:_delayMs,...data}=retry;
  await db.$transaction(async tx=>{
    const changed=await tx.agentJob.updateMany({where:{...ownership(job),leaseExpiresAt:{gt:new Date()}},data});
    if(changed.count!==1)return;
    if(retry.status!=="dead"){jobsRetried+=1;return;}
    await tx.pipelineRun.update({where:{id:job.pipelineRunId},data:{status:"failed",completedAt:retry.completedAt,log:message}});
    if(job.jobKind==="change_impact"){
      const payload=JSON.parse(job.payload||"{}") as {syncMapId?:string};
      if(payload.syncMapId)await tx.syncMap.updateMany({where:{id:payload.syncMapId,projectId:job.projectId},data:{direction:"failed",leaseExpiresAt:null,syncedAt:new Date()}});
      await tx.decisionEntry.create({data:{projectId:job.projectId,stage:"DRIFT",actor:"system",action:"change_impact_failed",detail:"Change-impact job "+job.id+" failed permanently: "+message}});
    }else{
      await tx.project.updateMany({where:{id:job.projectId,currentStage:job.stage,stageStatus:"agent_running"},data:{stageStatus:"awaiting_input",updatedAt:new Date()}});
      await tx.decisionEntry.create({data:{projectId:job.projectId,stage:job.stage,actor:"system",action:"agent_failed",detail:"Agent job "+job.id+" failed permanently: "+message}});
    }
    lastError=message;
  },{isolationLevel:"Serializable"});
}
async function executeJob(job:AgentJob,workerId:string){
  activeJobs+=1;
  const lost={value:false};
  const interval=setInterval(()=>{void heartbeat(job,lost);},heartbeatMs);
  const guard=(tx?:unknown)=>{if(lost.value)return Promise.reject(new PipelineJobLeaseLostError());return guardLease(job,tx);};
  try{
    await guard();
    if(job.jobKind==="change_impact"){
      const payload=JSON.parse(job.payload||"{}") as {signal?:string};
      if(typeof payload.signal!=="string"||!payload.signal.trim())throw new Error("Change-impact job has no valid signal.");
      const result=await analyzeDrift(job.projectId,payload.signal);
      await guard();
      await completeJob(job,result);
    }else{
      if(!STAGES.includes(job.stage as Stage))throw new Error("Unsupported pipeline stage: "+job.stage);
      if(job.stage==="ELICITATION"){
        const payload=JSON.parse(job.payload||"{}") as {arm?:string};
        const arm=payload.arm??"impact_aware";
        if(!ARMS.includes(arm as PlannerArm))throw new Error("Unknown planner arm: "+arm);
        await runPlanner(job.projectId,arm as PlannerArm,job.pipelineRunId,guard);
      }else{
        await runStageAgent(job.stage as Stage,job.projectId,job.pipelineRunId,guard);
      }
      await guard();
      await completeJob(job);
    }
    jobsCompleted+=1;lastError=null;
  }catch(error){
    if(error instanceof PipelineJobLeaseLostError){lastError="A stale worker lost its lease and was fenced from finalization.";}
    else{
      await retryJob(job,error);
      console.error("[pipeline-worker] attempt failed",{jobId:job.id,attempt:job.attempts,workerId,error:sanitizePipelineJobError(error)});
    }
  }finally{clearInterval(interval);activeJobs-=1;}
}
async function workerLoop(slot:number){
  const workerId=`${workerBase}:${process.pid}:${slot}:${randomUUID()}`;
  while(!shuttingDown){
    try{
      const job=await claimOne(workerId);
      if(job){await executeJob(job,workerId);if(once)return;continue;}
      if(once)return;
    }catch(error){
      lastError=sanitizePipelineJobError(error);
      console.error("[pipeline-worker] polling failed",{workerId,error:lastError});
      if(once)throw error;
      await sleep(Math.max(pollMs,5000));
    }
    await sleep(pollMs);
  }
}
async function main(){
  await db.$connect();
  const port=readInt("PORT",8787,1,65_535);
  healthServer.listen(port,"0.0.0.0",()=>console.log("[pipeline-worker] health endpoint listening",{port}));
  console.log("[pipeline-worker] started",{concurrency,pollMs,leaseMs,heartbeatMs,maxAttempts,once});
  await Promise.all(Array.from({length:concurrency},(_,i)=>workerLoop(i+1)));
}
process.on("SIGTERM",()=>{shuttingDown=true;});
process.on("SIGINT",()=>{shuttingDown=true;});
main().catch(error=>{
  console.error("[pipeline-worker] fatal",sanitizePipelineJobError(error));
  process.exitCode=1;
}).finally(async()=>{
  shuttingDown=true;
  await new Promise<void>(resolve=>healthServer.close(()=>resolve()));
  await db.$disconnect();
});
