import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { validateOrganizationPolicyPatch } from "@/lib/phase4/retention.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };
const defaults = { dataRetentionDays:365, evidenceRetentionDays:365, auditRetentionDays:2555, aiProcessingAllowed:true, permittedAiProviders:["zai"], defaultLocale:"en" };
function error(message:string,status:number){return NextResponse.json({error:message},{status,headers:noStore});}
export async function GET(req:NextRequest){
 const identity=await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value).catch(()=>null);
 if(!identity)return error("Authentication required",401);
 if(!hasOrganizationPermission({role:identity.role,status:"active",userStatus:"active",organizationStatus:"active"},"organization:read"))return error("Organization access required",403);
 const [policy,holds]=await Promise.all([
  db.organizationPolicy.findUnique({where:{organizationId:identity.organizationId}}),
  db.retentionHold.findMany({where:{organizationId:identity.organizationId,releasedAt:null},orderBy:{placedAt:"desc"},take:100}),
 ]);
 let providers=defaults.permittedAiProviders;
 try{const parsed=JSON.parse(policy?.permittedAiProviders??"[]");if(Array.isArray(parsed))providers=parsed;}catch{}
 return NextResponse.json({
  policy:policy?{dataRetentionDays:policy.dataRetentionDays,evidenceRetentionDays:policy.evidenceRetentionDays,auditRetentionDays:policy.auditRetentionDays,aiProcessingAllowed:policy.aiProcessingAllowed,permittedAiProviders:providers,defaultLocale:policy.defaultLocale}:defaults,
  holds,retentionAutomation:"preview_only_no_records_are_deleted",
 },{headers:noStore});
}
export async function PATCH(req:NextRequest){
 const identity=await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value).catch(()=>null);
 if(!identity)return error("Authentication required",401);
 if(!hasOrganizationPermission({role:identity.role,status:"active",userStatus:"active",organizationStatus:"active"},"organization:manage"))return error("Organization policy changes require the owner role",403);
 const body=await req.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body))return error("Invalid request body",400);
 const action=body.action;
 try{
  if(action==="update_policy"){
   const patch=validateOrganizationPolicyPatch(body);
   const policy=await db.$transaction(async tx=>{
    const updated=await tx.organizationPolicy.upsert({
     where:{organizationId:identity.organizationId},
     create:{organizationId:identity.organizationId,updatedByUserId:identity.userId,...patch},
     update:{...patch,updatedByUserId:identity.userId},
    });
    await tx.organizationAuditEvent.create({data:{organizationId:identity.organizationId,actorUserId:identity.userId,eventType:"governance.policy_updated",resourceType:"organization_policy",resourceId:updated.id,summary:"Organization governance policy updated",metadata:JSON.stringify({fields:Object.keys(patch)})}});
    return updated;
   },{isolationLevel:"Serializable"});
   return NextResponse.json({policy:{...policy,permittedAiProviders:JSON.parse(policy.permittedAiProviders)}},{headers:noStore});
  }
  if(action==="place_hold"){
   const resourceType=String(body.resourceType??"");
   const resourceId=typeof body.resourceId==="string"?body.resourceId.trim():"";
   const reason=typeof body.reason==="string"?body.reason.trim().slice(0,1000):"";
   if(!["project","evidence","requirement","baseline_snapshot"].includes(resourceType)||!resourceId||resourceId.length>128||reason.length<12)return error("A supported resource, identifier and reason of at least 12 characters are required",400);
   let belongs=false;
   if(resourceType==="project")belongs=Boolean(await db.project.findFirst({where:{id:resourceId,organizationId:identity.organizationId},select:{id:true}}));
   if(resourceType==="evidence")belongs=Boolean(await db.evidence.findFirst({where:{id:resourceId,project:{organizationId:identity.organizationId}},select:{id:true}}));
   if(resourceType==="requirement")belongs=Boolean(await db.requirement.findFirst({where:{id:resourceId,project:{organizationId:identity.organizationId}},select:{id:true}}));
   if(resourceType==="baseline_snapshot")belongs=Boolean(await db.baselineSnapshot.findFirst({where:{id:resourceId,organizationId:identity.organizationId},select:{id:true}}));
   if(!belongs)return error("Resource not found in this organization",404);
   const hold=await db.$transaction(async tx=>{
    const created=await tx.retentionHold.create({data:{organizationId:identity.organizationId,resourceType,resourceId,reason,placedByUserId:identity.userId}});
    await tx.organizationAuditEvent.create({data:{organizationId:identity.organizationId,actorUserId:identity.userId,eventType:"governance.retention_hold_placed",resourceType,resourceId,summary:"Retention hold placed",metadata:JSON.stringify({holdId:created.id,reason})}});
    return created;
   });
   return NextResponse.json({hold},{status:201,headers:noStore});
  }
  if(action==="release_hold"){
   const holdId=typeof body.holdId==="string"?body.holdId:"";
   const hold=await db.retentionHold.findFirst({where:{id:holdId,organizationId:identity.organizationId,releasedAt:null}});
   if(!hold)return error("Active retention hold not found",404);
   const released=await db.$transaction(async tx=>{
    const result=await tx.retentionHold.updateMany({where:{id:hold.id,organizationId:identity.organizationId,releasedAt:null},data:{releasedAt:new Date(),releasedByUserId:identity.userId}});
    if(result.count!==1)throw new Error("HOLD_ALREADY_RELEASED");
    await tx.organizationAuditEvent.create({data:{organizationId:identity.organizationId,actorUserId:identity.userId,eventType:"governance.retention_hold_released",resourceType:hold.resourceType,resourceId:hold.resourceId,summary:"Retention hold released",metadata:JSON.stringify({holdId:hold.id})}});
    return tx.retentionHold.findUnique({where:{id:hold.id}});
   },{isolationLevel:"Serializable"});
   return NextResponse.json({hold:released},{headers:noStore});
  }
  return error("Unknown governance action",400);
 }catch(e){
  if(e instanceof TypeError||e instanceof RangeError)return error(e.message,400);
  return error("Governance operation failed",500);
 }
}
