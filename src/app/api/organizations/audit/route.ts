import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { buildOrganizationAuditQuery, summarizeOrganizationAuditEvent } from "@/lib/organization-audit.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store, max-age=0"};
function fail(error:string,status:number){return NextResponse.json({error},{status,headers:noStore});}
function parseDate(value:string|null):Date|undefined|null{if(value===null)return undefined;if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))return null;const date=new Date(value);return Number.isNaN(date.getTime())?null:date;}
export async function GET(req:NextRequest){
 let identity;try{identity=await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value);}catch{return fail("Identity could not be verified",503);}
 if(!identity)return fail("Authentication required",401);
 const membership={role:identity.role,status:"active",userStatus:"active",organizationStatus:"active"};
 if(!hasOrganizationPermission(membership,"audit:read"))return fail("Audit permission required",403);
 const params=req.nextUrl.searchParams,rawLimit=params.get("limit");
 if(rawLimit!==null&&(!/^\d+$/.test(rawLimit)||Number(rawLimit)<1||Number(rawLimit)>100))return fail("limit must be an integer between 1 and 100",400);
 const from=parseDate(params.get("from")),to=parseDate(params.get("to"));
 if(from===null||to===null||(from&&to&&from>to))return fail("from/to must be valid UTC ISO timestamps and from must not exceed to",400);
 const filters={organizationId:identity.organizationId,eventType:params.get("eventType")??undefined,actorUserId:params.get("actorUserId")??undefined,projectId:params.get("projectId")??undefined,from,to,limit:rawLimit===null?undefined:Number(rawLimit)};
 const query=buildOrganizationAuditQuery(filters),cursor=params.get("cursor");
 if(cursor&&(cursor.length>128||!/^[a-zA-Z0-9_-]+$/.test(cursor)))return fail("Invalid cursor",400);
 try{
  if(cursor){const found=await db.organizationAuditEvent.findFirst({where:{id:cursor,organizationId:identity.organizationId},select:{id:true}});if(!found)return fail("Cursor not found",400);}
  const rows=await db.organizationAuditEvent.findMany({where:query.where,take:query.take+1,orderBy:query.orderBy,...(cursor?{cursor:{id:cursor},skip:1}:{}),include:{actor:{select:{id:true,displayName:true}}}});
  const hasMore=rows.length>query.take,items=rows.slice(0,query.take).map(summarizeOrganizationAuditEvent).filter(Boolean);
  return NextResponse.json({items,page:{limit:query.take,hasMore,nextCursor:hasMore&&items.length?items[items.length-1].id:null},scope:"organization",filters:{eventType:filters.eventType?.slice(0,128)??null,actorUserId:filters.actorUserId?.slice(0,128)??null,projectId:filters.projectId?.slice(0,128)??null,from:from?.toISOString()??null,to:to?.toISOString()??null}},{headers:noStore});
 }catch{return fail("Organization audit is temporarily unavailable",503);}
}
