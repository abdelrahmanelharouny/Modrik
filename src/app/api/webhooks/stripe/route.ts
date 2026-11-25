import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
 normalizeStripeSubscriptionStatus, stripeEpochDate, stripeEventOrganizationId, stripeEventPlanKey,
 verifyStripeWebhookSignature,
} from "@/lib/phase4/stripe.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore={"Cache-Control":"no-store, max-age=0"};
function fail(error:string,status:number){return NextResponse.json({error},{status,headers:noStore});}
function idOf(value:any):string|null{return typeof value==="string"?value:typeof value?.id==="string"?value.id:null;}
function validAmount(value:any):number{return Number.isSafeInteger(value)&&value>=0?value:0;}
function metadataString(value:any):string|null{return typeof value==="string"&&value.length<=128?value:null;}
export async function POST(req:NextRequest){
 const secret=process.env.STRIPE_WEBHOOK_SECRET?.trim()??"";
 if(!secret)return fail("Stripe webhook is not configured",503);
 const signature=req.headers.get("stripe-signature")??"";
 const rawBody=await req.text();
 if(rawBody.length>1_000_000)return fail("Webhook payload exceeds 1 MB",413);
 if(!verifyStripeWebhookSignature(rawBody,signature,secret))return fail("Invalid Stripe webhook signature",400);
 let event:any;try{event=JSON.parse(rawBody);}catch{return fail("Invalid JSON payload",400);}
 if(typeof event?.id!=="string"||typeof event?.type!=="string"||!event.data?.object||typeof event.data.object!=="object")return fail("Malformed Stripe event",400);
 const object=event.data.object,payloadHash=createHash("sha256").update(rawBody,"utf8").digest("hex");
 const eventId=event.id,eventType=event.type;
 try{
  const result=await db.$transaction(async tx=>{
   const previous=await tx.billingEvent.findUnique({where:{providerEventId:eventId},select:{id:true,processingState:true}});
   if(previous)return {duplicate:true,organizationId:null};
   let organizationId=stripeEventOrganizationId(object);
   const customerId=idOf(object.customer),subscriptionId=idOf(object.subscription)??(eventType.startsWith("customer.subscription.")?idOf(object.id):null);
   if(!organizationId&&subscriptionId){
    const record=await tx.organizationSubscription.findFirst({where:{billingProvider:"stripe",externalSubscriptionId:subscriptionId},select:{organizationId:true}});
    organizationId=record?.organizationId??null;
   }
   if(!organizationId&&customerId){
    const record=await tx.organizationSubscription.findFirst({where:{billingProvider:"stripe",externalCustomerId:customerId},select:{organizationId:true}});
    organizationId=record?.organizationId??null;
   }
   const organization=organizationId?await tx.organization.findUnique({where:{id:organizationId},select:{id:true}}):null;
   if(!organization)organizationId=null;
   const ignored=!["checkout.session.completed","customer.subscription.created","customer.subscription.updated","customer.subscription.deleted","invoice.paid","invoice.payment_failed"].includes(eventType);
   await tx.billingEvent.create({data:{
    organizationId,provider:"stripe",providerEventId:eventId,eventType,payloadHash,
    processingState:ignored||!organizationId?"ignored":"processed",
   }});
   if(ignored||!organizationId)return {duplicate:false,organizationId};
   if(eventType==="checkout.session.completed"){
    const planKey=stripeEventPlanKey({metadata:object.metadata});
    if(!planKey||planKey==="free")return {duplicate:false,organizationId};
    await tx.organizationSubscription.upsert({
     where:{organizationId},
     create:{organizationId,planKey,status:"incomplete",billingProvider:"stripe",externalCustomerId:customerId,externalSubscriptionId:subscriptionId},
     update:{planKey,billingProvider:"stripe",externalCustomerId:customerId??undefined,externalSubscriptionId:subscriptionId??undefined},
    });
   }else if(eventType.startsWith("customer.subscription.")){
    const planKey=stripeEventPlanKey(object)??"free";
    const status=eventType==="customer.subscription.deleted"?"canceled":normalizeStripeSubscriptionStatus(object.status);
    await tx.organizationSubscription.upsert({
     where:{organizationId},
     create:{
      organizationId,planKey,status,billingProvider:"stripe",externalCustomerId:customerId,externalSubscriptionId:idOf(object.id),
      currentPeriodStart:stripeEpochDate(object.current_period_start),currentPeriodEnd:stripeEpochDate(object.current_period_end),
      cancelAtPeriodEnd:object.cancel_at_period_end===true,
     },
     update:{
      planKey,status,billingProvider:"stripe",externalCustomerId:customerId??undefined,externalSubscriptionId:idOf(object.id)??undefined,
      currentPeriodStart:stripeEpochDate(object.current_period_start),currentPeriodEnd:stripeEpochDate(object.current_period_end),
      cancelAtPeriodEnd:object.cancel_at_period_end===true,
     },
    });
   }else if(eventType==="invoice.paid"||eventType==="invoice.payment_failed"){
    const invoiceId=idOf(object.id);
    if(invoiceId){
     const status=eventType==="invoice.paid"?"paid":"payment_failed";
     await tx.billingInvoice.upsert({
      where:{externalInvoiceId:invoiceId},
      create:{
       organizationId,externalInvoiceId:invoiceId,invoiceNumber:metadataString(object.number),status,
       currency:typeof object.currency==="string"?object.currency.toLowerCase():"usd",
       amountDue:validAmount(object.amount_due),amountPaid:validAmount(object.amount_paid),
       hostedInvoiceUrl:typeof object.hosted_invoice_url==="string"?object.hosted_invoice_url:null,
       invoicePdfUrl:typeof object.invoice_pdf==="string"?object.invoice_pdf:null,
       periodStart:stripeEpochDate(object.period_start),periodEnd:stripeEpochDate(object.period_end),
       issuedAt:stripeEpochDate(object.created),paidAt:eventType==="invoice.paid"?new Date():null,
      },
      update:{
       invoiceNumber:metadataString(object.number),status,
       currency:typeof object.currency==="string"?object.currency.toLowerCase():"usd",
       amountDue:validAmount(object.amount_due),amountPaid:validAmount(object.amount_paid),
       hostedInvoiceUrl:typeof object.hosted_invoice_url==="string"?object.hosted_invoice_url:null,
       invoicePdfUrl:typeof object.invoice_pdf==="string"?object.invoice_pdf:null,
       periodStart:stripeEpochDate(object.period_start),periodEnd:stripeEpochDate(object.period_end),
       issuedAt:stripeEpochDate(object.created),paidAt:eventType==="invoice.paid"?new Date():null,
      },
     });
    }
    // Invoice delivery is not ordered with subscription lifecycle events.
    // Never let a late invoice.paid event resurrect a canceled subscription;
    // subscription access state is owned only by customer.subscription.* events.
   }
   await tx.organizationAuditEvent.create({data:{
    organizationId,eventType:"billing.stripe_event_processed",resourceType:"billing_event",resourceId:eventId,
    summary:"Verified Stripe billing event processed",
    metadata:JSON.stringify({providerEventType:eventType,payloadHash}),
   }});
   return {duplicate:false,organizationId};
  },{isolationLevel:"Serializable"});
  return NextResponse.json({received:true,duplicate:result.duplicate},{headers:noStore});
 }catch(error){
  if(error&&typeof error==="object"&&"code"in error&&error.code==="P2002"){
   return NextResponse.json({received:true,duplicate:true},{headers:noStore});
  }
  return fail("Stripe event could not be committed; provider retry is safe",500);
 }
}
