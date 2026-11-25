import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { compareBaselineSnapshots, verifyBaselineSnapshotIntegrity } from "@/lib/phase4/baseline-diff.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
const noStore = { "Cache-Control": "no-store, max-age=0" };
function fail(error:string,status:number){return NextResponse.json({error},{status,headers:noStore});}
function safeSnapshot(content:string){try{const value=JSON.parse(content);return value&&typeof value==="object"&&!Array.isArray(value)?value:null;}catch{return null;}}
export async function GET(req:NextRequest,{params}:Params){
 const identity=await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value).catch(()=>null);
 if(!identity)return fail("Authentication required",401);
 const {id}=await params;
 const project=await db.project.findFirst({where:{id,organizationId:identity.organizationId},select:{id:true,name:true,status:true}});
 if(!project)return fail("Project not found",404);
 const compareFrom=req.nextUrl.searchParams.get("compareFrom"),compareTo=req.nextUrl.searchParams.get("compareTo");
 if(compareFrom||compareTo){
  const from=Number(compareFrom),to=Number(compareTo);
  if(!Number.isSafeInteger(from)||from<1||!Number.isSafeInteger(to)||to<1||from===to)return fail("compareFrom and compareTo must be distinct positive version numbers",400);
  const [before,after]=await Promise.all([
   db.baselineSnapshot.findFirst({where:{projectId:id,organizationId:identity.organizationId,version:from}}),
   db.baselineSnapshot.findFirst({where:{projectId:id,organizationId:identity.organizationId,version:to}}),
  ]);
  if(!before||!after)return fail("One or both baseline versions were not found",404);
  if (!verifyBaselineSnapshotIntegrity(before.snapshotJson, before.contentHash) || !verifyBaselineSnapshotIntegrity(after.snapshotJson, after.contentHash)) {
   return fail("Baseline integrity verification failed; comparison was blocked", 409);
  }
  const left=safeSnapshot(before.snapshotJson),right=safeSnapshot(after.snapshotJson);
  if(!left||!right)return fail("A stored baseline snapshot is invalid",500);
  return NextResponse.json({comparison:compareBaselineSnapshots(left,right),hashes:{from:before.contentHash,to:after.contentHash}},{headers:noStore});
 }
 const versionRaw=req.nextUrl.searchParams.get("version");
 if(versionRaw){
  const version=Number(versionRaw);
  if(!Number.isSafeInteger(version)||version<1)return fail("version must be a positive integer",400);
  const snapshot=await db.baselineSnapshot.findFirst({where:{projectId:id,organizationId:identity.organizationId,version}});
  if(!snapshot)return fail("Baseline version not found",404);
  if (!verifyBaselineSnapshotIntegrity(snapshot.snapshotJson, snapshot.contentHash)) return fail("Baseline integrity verification failed", 409);
  const content=safeSnapshot(snapshot.snapshotJson);
  if(!content)return fail("Stored baseline snapshot is invalid",500);
  return NextResponse.json({snapshot:{...snapshot,snapshotJson:undefined,content},integrity:{algorithm:"SHA-256",verified:true,contentHash:snapshot.contentHash}},{headers:noStore});
 }
 const snapshots=await db.baselineSnapshot.findMany({
  where:{projectId:id,organizationId:identity.organizationId},orderBy:{version:"desc"},take:100,
  select:{id:true,version:true,label:true,note:true,contentHash:true,requirementCount:true,storyCount:true,conflictCount:true,createdByUserId:true,createdAt:true},
 });
 return NextResponse.json({project,snapshots},{headers:noStore});
}
export async function POST(req:NextRequest,{params}:Params){
 const identity=await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value).catch(()=>null);
 if(!identity)return fail("Authentication required",401);
 const {id}=await params;
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))return fail("Invalid request body",400);
 const label=typeof body.label==="string"?body.label.trim().slice(0,120):"";
 const note=typeof body.note==="string"?body.note.trim().slice(0,1000):"";
 try{
  const created=await db.$transaction(async tx=>{
   const project=await tx.project.findFirst({where:{id,organizationId:identity.organizationId},select:{id:true,name:true,brief:true,status:true,currentStage:true,stageStatus:true,createdAt:true,updatedAt:true}});
   if(!project)throw new Error("PROJECT_NOT_FOUND");
   if(project.status!=="complete"||project.currentStage!=="CONFLICTS")throw new Error("BASELINE_NOT_FINAL");
   const [requirements,stories,conflicts,evidence,decisions,last]=await Promise.all([
    tx.requirement.findMany({where:{projectId:id},orderBy:[{order:"asc"},{refId:"asc"}],select:{refId:true,text:true,type:true,priority:true,status:true,ambiguity:true,confidence:true,verifyStatus:true,driftStatus:true,language:true,links:{select:{evidenceCode:true,note:true}}}}),
    tx.userStory.findMany({where:{projectId:id},orderBy:{refId:"asc"},select:{refId:true,requirementId:true,title:true,narrative:true,acceptance:true,investScore:true,status:true}}),
    tx.conflict.findMany({where:{projectId:id},orderBy:{id:"asc"},select:{id:true,kind:true,severity:true,description:true,resolution:true,status:true}}),
    tx.evidence.findMany({where:{projectId:id},orderBy:{code:"asc"},select:{code:true,title:true,sourceType:true,language:true,consent:true,origin:true,createdAt:true}}),
    tx.decisionEntry.findMany({where:{projectId:id},orderBy:[{createdAt:"asc"},{id:"asc"}],take:3000,select:{id:true,stage:true,actor:true,action:true,detail:true,createdAt:true}}),
    tx.baselineSnapshot.findFirst({where:{projectId:id},orderBy:{version:"desc"},select:{version:true}}),
   ]);
   if(requirements.some(item=>item.status!=="approved"))throw new Error("BASELINE_HAS_UNAPPROVED_REQUIREMENTS");
   if(conflicts.some(item=>item.status!=="resolved"))throw new Error("BASELINE_HAS_OPEN_CONFLICTS");
   const version=(last?.version??0)+1;
   const snapshot={
    schemaVersion:1,version,project:{id:project.id,name:project.name,brief:project.brief,status:project.status,currentStage:project.currentStage,createdAt:project.createdAt.toISOString()},
    capturedAt:new Date().toISOString(),requirements,stories,conflicts,evidenceReferences:evidence,
    decisionJournal:{entries:decisions.map(d=>({...d,createdAt:d.createdAt.toISOString()})),truncated:decisions.length===3000},
   };
   const snapshotJson=JSON.stringify(snapshot);
   if(snapshotJson.length>2_000_000)throw new Error("BASELINE_SNAPSHOT_TOO_LARGE");
   const contentHash=createHash("sha256").update(snapshotJson,"utf8").digest("hex");
   const record=await tx.baselineSnapshot.create({data:{
    organizationId:identity.organizationId,projectId:id,version,label:label||("Baseline v"+version),note,
    snapshotJson,contentHash,requirementCount:requirements.length,storyCount:stories.length,conflictCount:conflicts.length,createdByUserId:identity.userId,
   }});
   await tx.decisionEntry.create({data:{projectId:id,stage:"DEBRIEF",actor:"human",action:"baseline_snapshot_created",detail:JSON.stringify({version,contentHash})}});
   await tx.organizationAuditEvent.create({data:{organizationId:identity.organizationId,actorUserId:identity.userId,eventType:"baseline.snapshot_created",resourceType:"baseline_snapshot",resourceId:record.id,projectId:id,summary:"Immutable baseline snapshot created",metadata:JSON.stringify({version,contentHash,requirementCount:requirements.length,storyCount:stories.length,conflictCount:conflicts.length})}});
   return record;
  },{isolationLevel:"Serializable"});
  return NextResponse.json({snapshot:{...created,snapshotJson:undefined},integrity:{algorithm:"SHA-256",contentHash:created.contentHash}},{status:201,headers:noStore});
 }catch(error){
  const message=error instanceof Error?error.message:"BASELINE_CREATE_FAILED";
  if(message==="PROJECT_NOT_FOUND")return fail("Project not found",404);
  if(message==="BASELINE_NOT_FINAL")return fail("A baseline can only be captured after the project reaches its completed final gate",409);
  if(message==="BASELINE_HAS_UNAPPROVED_REQUIREMENTS")return fail("Every requirement must be approved before snapshotting",409);
  if(message==="BASELINE_HAS_OPEN_CONFLICTS")return fail("All conflicts must be resolved before snapshotting",409);
  if(message==="BASELINE_SNAPSHOT_TOO_LARGE")return fail("Snapshot exceeds the 2 MB safety limit",413);
  if(error&&typeof error==="object"&&"code"in error&&error.code==="P2002")return fail("Concurrent baseline version allocation detected; retry the snapshot",409);
  return fail("Baseline snapshot could not be created",500);
 }
}
