import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { buildCompliancePackage } from "@/lib/phase4/compliance-package.mjs";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(req:NextRequest){
 const identity=await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value).catch(()=>null);
 if(!identity)return NextResponse.json({error:"Authentication required"},{status:401,headers:{"Cache-Control":"no-store"}});
 if(!hasOrganizationPermission({role:identity.role,status:"active",userStatus:"active",organizationStatus:"active"},"audit:read"))return NextResponse.json({error:"Audit permission required"},{status:403,headers:{"Cache-Control":"no-store"}});
 const fromRaw=req.nextUrl.searchParams.get("from");
 let from:Date|undefined;
 if(fromRaw){from=new Date(fromRaw);if(!Number.isFinite(from.getTime()))return NextResponse.json({error:"from must be a valid ISO date"},{status:400});}
 const organizationId=identity.organizationId;
 const [organization,members,projects,events,baselines,usage,holds]=await Promise.all([
  db.organization.findUnique({where:{id:organizationId},select:{id:true,name:true,slug:true,status:true,createdAt:true}}),
  db.membership.findMany({where:{organizationId},orderBy:{createdAt:"asc"},take:1000,select:{id:true,role:true,status:true,createdAt:true,activatedAt:true,user:{select:{id:true,displayName:true,status:true}}}}),
  db.project.findMany({where:{organizationId},orderBy:{createdAt:"asc"},take:1000,select:{id:true,name:true,status:true,currentStage:true,stageStatus:true,createdAt:true,updatedAt:true,_count:{select:{evidences:true,reqs:true,stories:true,conflicts:true,stakeholders:true}}}}),
  db.organizationAuditEvent.findMany({where:{organizationId,...(from?{createdAt:{gte:from}}:{})},orderBy:[{createdAt:"asc"},{id:"asc"}],take:10001,select:{id:true,eventType:true,resourceType:true,resourceId:true,projectId:true,summary:true,metadata:true,createdAt:true,actor:{select:{id:true,displayName:true}}}}),
  db.baselineSnapshot.findMany({where:{organizationId},orderBy:[{projectId:"asc"},{version:"asc"}],take:5000,select:{id:true,projectId:true,version:true,label:true,contentHash:true,requirementCount:true,storyCount:true,conflictCount:true,createdByUserId:true,createdAt:true}}),
  db.usageEvent.aggregate({where:{organizationId,...(from?{occurredAt:{gte:from}}:{})},_sum:{quantity:true,estimatedCostUsd:true},_count:{_all:true}}),
  db.retentionHold.findMany({where:{organizationId},orderBy:{placedAt:"asc"},take:2000,select:{id:true,resourceType:true,resourceId:true,reason:true,placedAt:true,releasedAt:true,placedByUserId:true,releasedByUserId:true}}),
 ]);
 if(!organization)return NextResponse.json({error:"Organization not found"},{status:404});
 const auditTruncated=events.length>10000;
 const payload={
  organization,generatedFor:{actorUserId:identity.userId,from:from?.toISOString()??null},
  accessRoster:members.map(m=>({membershipId:m.id,userId:m.user.id,displayName:m.user.displayName,userStatus:m.user.status,role:m.role,status:m.status,createdAt:m.createdAt.toISOString(),activatedAt:m.activatedAt?.toISOString()??null})),
  projects:projects.map(p=>({...p,createdAt:p.createdAt.toISOString(),updatedAt:p.updatedAt.toISOString()})),
  baselines:baselines.map(b=>({...b,createdAt:b.createdAt.toISOString()})),
  audit:{events:events.slice(0,10000).map(e=>({...e,metadata:(()=>{try{return JSON.parse(e.metadata)}catch{return {unparseable:true}}})(),createdAt:e.createdAt.toISOString(),actor:e.actor})),truncated:auditTruncated},
  usage:{eventCount:usage._count._all,quantity:usage._sum.quantity??0,estimatedCostUsd:usage._sum.estimatedCostUsd??0,costIsEstimate:true},
  retentionHolds:holds.map(h=>({...h,placedAt:h.placedAt.toISOString(),releasedAt:h.releasedAt?.toISOString()??null})),
  limitations:["This export is an evidence package, not a legal certification.","Usage cost is estimated, not an invoice.","Retention holds are recorded; automatic erasure is not enabled.","Audit records are capped at 10,000 per export; truncated is explicit."],
 };
 const result=buildCompliancePackage(payload);
 const filename="modrik-compliance-"+organization.slug+"-"+new Date().toISOString().slice(0,10)+".json";
 return NextResponse.json(result,{headers:{"Cache-Control":"no-store, max-age=0","Content-Disposition":'attachment; filename="'+filename+'"',"X-Modrik-Integrity-SHA256":result.manifest.sha256}});
}
