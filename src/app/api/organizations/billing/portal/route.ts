import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { stripeApiRequest } from "@/lib/phase4/stripe.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };
function fail(error:string,status:number){return NextResponse.json({error},{status,headers:noStore});}
export async function POST(req:NextRequest){
 const identity=await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value).catch(()=>null);
 if(!identity)return fail("Authentication required",401);
 if(!hasOrganizationPermission({role:identity.role,status:"active",userStatus:"active",organizationStatus:"active"},"organization:manage"))return fail("Only organization owners can manage billing",403);
 const subscription=await db.organizationSubscription.findUnique({where:{organizationId:identity.organizationId},select:{billingProvider:true,externalCustomerId:true}});
 if(subscription?.billingProvider!=="stripe"||!subscription.externalCustomerId)return fail("No Stripe customer is linked to this organization",409);
 const secretKey=process.env.STRIPE_SECRET_KEY?.trim()??"",appUrl=process.env.APP_URL?.trim()??"";
 if(!secretKey||!appUrl)return fail("Stripe Billing Portal is not configured",503);
 let origin:string;try{const parsed=new URL(appUrl);if(process.env.NODE_ENV==="production"&&parsed.protocol!=="https:")return fail("APP_URL must use HTTPS",503);origin=parsed.origin;}catch{return fail("APP_URL is invalid",503);}
 try{
  const session=await stripeApiRequest("billing_portal/sessions",{secretKey,fields:{customer:subscription.externalCustomerId,return_url:origin+"/settings/enterprise"},idempotencyKey:"modrik-portal:"+identity.organizationId+":"+randomUUID()});
  if(typeof session.url!=="string"||!session.url.startsWith("https://"))return fail("Stripe did not return a valid portal URL",502);
  return NextResponse.json({url:session.url,provider:"stripe"},{headers:noStore});
 }catch(error){return fail(error instanceof Error?error.message.slice(0,300):"Billing Portal could not be created",502);}
}
