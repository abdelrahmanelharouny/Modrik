import { NextRequest, NextResponse } from "next/server";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { createOAuthTransaction, oauthCallbackUrl, oauthCookieName, oauthProviderConfig, oauthStateRecord } from "@/lib/security/oauth-lifecycle.mjs";
import { db } from "@/lib/db";
export const runtime="nodejs";
type Context={params:Promise<{id:string;provider:string}>};
export async function GET(req:NextRequest,{params}:Context) {
 const {id:projectId,provider}=await params;
 if(provider!=="github"&&provider!=="jira") return NextResponse.json({error:"Unsupported OAuth provider"},{status:404});
 const identity=await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value);
 if(!identity) return NextResponse.json({error:"Authentication required"},{status:401});
 const project=await db.project.findUnique({where:{id:projectId},select:{id:true,organizationId:true}});
 if(!project) return NextResponse.json({error:"Project not found"},{status:404});
 if(!project.organizationId||project.organizationId!==identity.organizationId) return NextResponse.json({error:"Project is outside the active organization"},{status:403});
 if(!hasOrganizationPermission({organizationId:identity.organizationId,status:"active",userStatus:"active",organizationStatus:"active",role:identity.role},"projects:update"))
  return NextResponse.json({error:"Insufficient permission to manage integrations"},{status:403});
 const config=oauthProviderConfig(provider);
 if(!config) return NextResponse.json({error:"OAuth provider activation is deferred. Configure the provider client credentials when enabling external connections.",code:"OAUTH_PROVIDER_NOT_CONFIGURED"},{status:503});
 try {
  const tx=createOAuthTransaction({provider,projectId,userId:identity.userId,organizationId:identity.organizationId});
  // Keep only a hash of state server-side. Atomic deletion in the callback makes it one-use.
  await db.integration.deleteMany({where:{projectId,kind:"oauth_state_"+provider}});
  await db.integration.create({data:{projectId,kind:"oauth_state_"+provider,config:oauthStateRecord(tx)}});
  const url=new URL(config.authorizationUrl);
  url.searchParams.set("client_id",config.clientId); url.searchParams.set("redirect_uri",oauthCallbackUrl(provider));
  url.searchParams.set("response_type","code"); url.searchParams.set("state",tx.state);
  url.searchParams.set("code_challenge",tx.challenge); url.searchParams.set("code_challenge_method","S256");
  url.searchParams.set("scope",config.scopes.join(" "));
  if(provider==="jira"){url.searchParams.set("audience","api.atlassian.com");url.searchParams.set("prompt","consent");}
  const response=NextResponse.redirect(url);
  response.cookies.set(oauthCookieName(provider),tx.cookieValue,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/integrations/oauth/"+provider+"/callback",maxAge:600});
  response.headers.set("Cache-Control","no-store"); response.headers.set("Referrer-Policy","no-referrer");
  return response;
 } catch(e){return NextResponse.json({error:String(e instanceof Error?e.message:e).slice(0,240)},{status:503});}
}
