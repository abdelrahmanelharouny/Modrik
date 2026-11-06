import { NextRequest, NextResponse } from "next/server";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { encryptSecret } from "@/lib/security/secret-box.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { oauthCallbackUrl,oauthCookieName,oauthProviderConfig,oauthStateRecord,verifyOAuthTransaction } from "@/lib/security/oauth-lifecycle.mjs";
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";
export const runtime="nodejs";
type Context={params:Promise<{provider:string}>};
function clearCookie(response:NextResponse,provider:string){
 response.cookies.set(oauthCookieName(provider),"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/integrations/oauth/"+provider+"/callback",maxAge:0});
 response.headers.set("Cache-Control","no-store"); response.headers.set("Referrer-Policy","no-referrer");
 return response;
}
function fail(req:NextRequest,provider:string,message:string){
 const response=NextResponse.redirect(new URL("/?oauth="+provider+"&status=error&message="+encodeURIComponent(message),req.url));
 return clearCookie(response,provider);
}
export async function GET(req:NextRequest,{params}:Context){
 const {provider}=await params;
 if(provider!=="github"&&provider!=="jira") return NextResponse.json({error:"Unsupported OAuth provider"},{status:404});
 const query=req.nextUrl.searchParams, code=query.get("code");
 if(query.has("error")) return fail(req,provider,"Authorization was denied or cancelled.");
 const tx=verifyOAuthTransaction(req.cookies.get(oauthCookieName(provider))?.value,query.get("state")??"",provider);
 if(!code||!tx) return fail(req,provider,"OAuth state is invalid, expired, or already consumed.");
 const identity=await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value);
 if(!identity||identity.userId!==tx.userId||identity.organizationId!==tx.organizationId) return fail(req,provider,"Modrik session changed during authorization. Start again.");
 const project=await db.project.findUnique({where:{id:tx.projectId},select:{id:true,organizationId:true}});
 if(!project||project.organizationId!==identity.organizationId||!hasOrganizationPermission({organizationId:identity.organizationId,status:"active",userStatus:"active",organizationStatus:"active",role:identity.role},"projects:update"))
  return fail(req,provider,"You no longer have permission to connect this project.");
 const config=oauthProviderConfig(provider); if(!config) return fail(req,provider,"OAuth provider credentials are not configured.");
 try{
  const tokenResponse=await fetch(config.tokenUrl,{method:"POST",headers:{Accept:"application/json","Content-Type":"application/json"},body:JSON.stringify({grant_type:"authorization_code",client_id:config.clientId,client_secret:config.clientSecret,code,redirect_uri:oauthCallbackUrl(provider),code_verifier:tx.verifier}),signal:AbortSignal.timeout(20000)});
  const token=await tokenResponse.json().catch(()=>({})) as {access_token?:string;refresh_token?:string;expires_in?:number;scope?:string};
  if(!tokenResponse.ok||!token.access_token) return fail(req,provider,"Provider rejected the authorization code. Reconnect and retry.");
  let account="",baseUrl="",cloudId="",scopes=(token.scope??"").split(/[ ,]+/).filter(Boolean);
  if(provider==="github"){
   const response=await fetch("https://api.github.com/user",{headers:{Authorization:"Bearer "+token.access_token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},signal:AbortSignal.timeout(15000)});
   if(!response.ok) return fail(req,provider,"GitHub account verification failed.");
   const user=await response.json() as {login?:string}; account=user.login??"";
   if(!account) return fail(req,provider,"GitHub did not return an account identity.");
   if(!scopes.length) scopes=(response.headers.get("x-oauth-scopes")??"").split(",").map(s=>s.trim()).filter(Boolean);
  }else{
   const meResponse=await fetch("https://api.atlassian.com/me",{headers:{Authorization:"Bearer "+token.access_token,Accept:"application/json"},signal:AbortSignal.timeout(15000)});
   if(!meResponse.ok) return fail(req,provider,"Atlassian account verification failed.");
   const me=await meResponse.json() as {name?:string;email?:string;account_id?:string}; account=me.email??me.name??me.account_id??"Atlassian account";
   const sitesResponse=await fetch("https://api.atlassian.com/oauth/token/accessible-resources",{headers:{Authorization:"Bearer "+token.access_token,Accept:"application/json"},signal:AbortSignal.timeout(15000)});
   if(!sitesResponse.ok) return fail(req,provider,"No accessible Jira site could be verified.");
   const sites=await sitesResponse.json() as {id:string;url:string;scopes?:string[]}[];
   const site=sites.find(s=>s.id&&s.url); if(!site) return fail(req,provider,"No accessible Jira Cloud site was returned.");
   cloudId=site.id; baseUrl="https://api.atlassian.com/ex/jira/"+encodeURIComponent(cloudId)+"/";
   if(site.scopes?.length) scopes=site.scopes;
  }
  const saved: Record<string, unknown> = {
   authMode:"oauth",oauthPending:true,token:encryptSecret(token.access_token),
   refreshToken:token.refresh_token?encryptSecret(token.refresh_token):"",
   owner:provider==="github"?account:"",repo:"",baseUrl,email:provider==="jira"?account:"",
   projectKey:"",authType:"bearer",account,cloudId,scopes,
   expiresAt:token.expires_in?new Date(Date.now()+token.expires_in*1000).toISOString():null,
   connectedAt:new Date().toISOString(),connectedByUserId:identity.userId,organizationId:identity.organizationId,
  };
  const existing=await db.integration.findFirst({where:{projectId:tx.projectId,kind:provider},orderBy:{createdAt:"desc"}});
  if(existing) {
   // Preserve the independently encrypted webhook secret when credentials are reconnected.
   let webhookSecret:unknown;
   try { const old=JSON.parse(existing.config) as Record<string,unknown>; webhookSecret=old.webhookSecret; } catch { webhookSecret=undefined; }
   if(typeof webhookSecret==="string") saved.webhookSecret=webhookSecret;
   await db.integration.update({where:{id:existing.id},data:{config:JSON.stringify(saved)}});
  } else await db.integration.create({data:{projectId:tx.projectId,kind:provider,config:JSON.stringify(saved)}});
  await logDecision(tx.projectId,"LIFECYCLE","human","oauth_connected",provider+" account connected; target selection is still required.");
  const response=NextResponse.redirect(new URL("/?project="+encodeURIComponent(tx.projectId)+"&oauth="+provider+"&status=connected&target=required",req.url));
  return clearCookie(response,provider);
 }catch{return fail(req,provider,"OAuth exchange failed. Credential details were not exposed; reconnect and retry.");}
}
