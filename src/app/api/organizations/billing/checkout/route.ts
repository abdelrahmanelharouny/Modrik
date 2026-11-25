import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { stripeApiRequest, stripePriceForPlan } from "@/lib/phase4/stripe.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store, max-age=0" };
function fail(error:string,status:number){return NextResponse.json({error},{status,headers:noStore});}
export async function POST(req:NextRequest){
 const identity=await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value).catch(()=>null);
 if(!identity)return fail("Authentication required",401);
 if(!hasOrganizationPermission({role:identity.role,status:"active",userStatus:"active",organizationStatus:"active"},"organization:manage"))return fail("Only organization owners can manage billing",403);
 const body=await req.json().catch(()=>null);
 const planKey=body&&typeof body==="object"&&!Array.isArray(body)?String(body.planKey??""):"";
 if(!["team","business","enterprise"].includes(planKey))return fail("Select a supported paid plan",400);
 const secretKey=process.env.STRIPE_SECRET_KEY?.trim()??"";
 const priceId=stripePriceForPlan(planKey);
 const appUrl=process.env.APP_URL?.trim()??"";
 if(!secretKey||!priceId||!appUrl)return fail("Stripe billing is not configured for this plan",503);
 let origin:string;
 try{const parsed=new URL(appUrl);if(process.env.NODE_ENV==="production"&&parsed.protocol!=="https:")return fail("APP_URL must use HTTPS",503);origin=parsed.origin;}catch{return fail("APP_URL is invalid",503);}
 const subscription=await db.organizationSubscription.findUnique({where:{organizationId:identity.organizationId},select:{externalCustomerId:true,externalSubscriptionId:true,status:true,billingProvider:true,planKey:true}});
 if(subscription?.billingProvider==="stripe"&&subscription.status!=="canceled")return fail("A Stripe subscription is already linked or needs attention. Use the Billing Portal before starting another subscription.",409);
 const fields:Record<string,string>={
  mode:"subscription",
  "line_items[0][price]":priceId,
  "line_items[0][quantity]":"1",
  success_url:origin+"/settings/enterprise?billing=success",
  cancel_url:origin+"/settings/enterprise?billing=cancelled",
  client_reference_id:identity.organizationId,
  "metadata[organizationId]":identity.organizationId,
  "metadata[planKey]":planKey,
  "subscription_data[metadata][organizationId]":identity.organizationId,
  "subscription_data[metadata][planKey]":planKey,
  "allow_promotion_codes":"true",
 };
 if(subscription?.externalCustomerId)fields.customer=subscription.externalCustomerId;
 else fields.customer_email=identity.email;
 try{
  const session=await stripeApiRequest("checkout/sessions",{secretKey,fields,idempotencyKey:"modrik-checkout:"+identity.organizationId+":"+planKey+":"+randomUUID()});
  if(typeof session.url!=="string"||!session.url.startsWith("https://checkout.stripe.com/"))return fail("Stripe did not return a valid Checkout URL",502);
  return NextResponse.json({url:session.url,sessionId:session.id,provider:"stripe"},{headers:noStore});
 }catch(error){return fail(error instanceof Error?error.message.slice(0,300):"Stripe Checkout could not be created",502);}
}
