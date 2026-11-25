import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { buildPipelineJobClaimFilter,buildPipelineJobHeartbeatData,buildPipelineJobLease,buildPipelineJobOwnershipFilter,buildPipelineJobRetry } from "../src/lib/pipeline/job-queue.mjs";
const prisma=new PrismaClient();
test("agent jobs persist, claim once, renew, retry, reclaim and complete",async()=>{
 const suffix=`${Date.now()}-${Math.random().toString(16).slice(2)}`;let projectId;
 try{
  const project=await prisma.project.create({data:{name:`queue ${suffix}`,brief:"durable worker integration",stageStatus:"agent_running"}});
  projectId=project.id;
  const run=await prisma.pipelineRun.create({data:{projectId,stage:"ELICITATION",status:"running"}});
  const job=await prisma.agentJob.create({data:{projectId,pipelineRunId:run.id,stage:"ELICITATION",payload:'{"arm":"impact_aware"}',maxAttempts:5}});
  const now=new Date(),lease=buildPipelineJobLease({workerId:"worker-a",leaseToken:`a-${suffix}`,now,leaseMs:60_000});
  const [a,b]=await Promise.all(["worker-a","worker-b"].map((worker,i)=>prisma.agentJob.updateMany({
    where:{id:job.id,...buildPipelineJobClaimFilter(now),attempts:0},
    data:{...buildPipelineJobLease({workerId:worker,leaseToken:`${i}-${suffix}`,now}),attempts:{increment:1}},
  })));
  assert.equal(a.count+b.count,1,"exactly one competing worker can claim the queued job");
  const claimed=await prisma.agentJob.findUniqueOrThrow({where:{id:job.id}});
  const owner=buildPipelineJobOwnershipFilter({jobId:job.id,workerId:claimed.lockedBy,leaseToken:claimed.leaseToken});
  assert.equal((await prisma.agentJob.updateMany({where:owner,data:buildPipelineJobHeartbeatData({leaseMs:60_000})})).count,1);
  const retry=buildPipelineJobRetry({attempts:1,maxAttempts:5,baseDelayMs:1,error:"timeout"});
  const {delayMs:_delay,...retryData}=retry;
  assert.equal((await prisma.agentJob.updateMany({where:owner,data:retryData})).count,1);
  await prisma.agentJob.update({where:{id:job.id},data:{availableAt:new Date(Date.now()-1000)}});
  const lease2=buildPipelineJobLease({workerId:"worker-c",leaseToken:`c-${suffix}`,leaseMs:60_000});
  assert.equal((await prisma.agentJob.updateMany({where:{id:job.id,status:"retry_wait",attempts:1,availableAt:{lte:new Date()}},data:{...lease2,attempts:{increment:1}}})).count,1);
  assert.equal((await prisma.agentJob.updateMany({where:owner,data:{status:"completed"}})).count,0,"old lease cannot complete after reclaim");
  assert.equal((await prisma.agentJob.updateMany({where:buildPipelineJobOwnershipFilter({jobId:job.id,workerId:"worker-c",leaseToken:lease2.leaseToken}),data:{status:"completed",completedAt:new Date(),lockedAt:null,leaseExpiresAt:null,lockedBy:null,leaseToken:null}})).count,1);
  assert.equal((await prisma.agentJob.findUniqueOrThrow({where:{id:job.id}})).status,"completed");
 }finally{if(projectId)await prisma.project.delete({where:{id:projectId}}).catch(()=>undefined);await prisma.$disconnect();}
});
