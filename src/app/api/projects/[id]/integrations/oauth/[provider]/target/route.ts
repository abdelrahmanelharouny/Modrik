import { NextRequest, NextResponse } from "next/server";
import { resolveIdentitySession } from "@/lib/security/identity";
import { hasOrganizationPermission } from "@/lib/security/organization-access.mjs";
import { SESSION_COOKIE } from "@/lib/security/session.mjs";
import { decryptSecret } from "@/lib/security/secret-box.mjs";
import { logDecision } from "@/lib/journal";
import { db } from "@/lib/db";
import { buildJiraUrl, validateJiraBaseUrl } from "@/lib/security/jira-url.mjs";
export const runtime="nodejs";
type Context={params:Promise<{id:string;provider:string}>};
async function authorized(req:NextRequest,projectId:string){
 const identity=await resolveIdentitySession(req.cookies.get(SESSION_COOKIE)?.value);
 if(!identity) return {error:NextResponse.json({error:"Authentication required"},{status:401})} as const;
 const project=await db.project.findUnique({where:{id:projectId},select:{id:true,organizationId:true}});
 if(!project) return {error:NextResponse.json({error:"Project not found"},{status:404})} as const;
 if(!project.organizationId||project.organizationId!==identity.organizationId||
 !hasOrganizationPermission({organizationId:identity.organizationId,status:"active",userStatus:"active",organizationStatus:"active",role:identity.role},"projects:update"))
  return {error:NextResponse.json({error:"Insufficient permission for this project"},{status:403})} as const;
 return {identity,project} as const;
}
export async function POST(req:NextRequest,{params}:Context){
 const {id:projectId,provider}=await params;
 if(provider!=="github"&&provider!=="jira") return NextResponse.json({error:"Unsupported OAuth provider"},{status:404});
 const auth=await authorized(req,projectId); if("error" in auth) return auth.error;
 const body=await req.json().catch(()=>({}));
 const row=await db.integration.findFirst({where:{projectId,kind:provider},orderBy:{createdAt:"desc"}});
 if(!row) return NextResponse.json({error:"No OAuth connection found"},{status:404});
 let config:Record<string,unknown>;
 try{config=JSON.parse(row.config) as Record<string,unknown>;}catch{return NextResponse.json({error:"Saved OAuth connection is corrupt"},{status:409});}
 if(config.authMode!=="oauth") return NextResponse.json({error:"This integration is not OAuth-backed"},{status:409});
 if(config.organizationId!==auth.identity.organizationId) return NextResponse.json({error:"OAuth connection belongs to another organization"},{status:403});
 let token=""; try{token=decryptSecret(String(config.token??""));}catch{return NextResponse.json({error:"OAuth credential cannot be decrypted"},{status:409});}
 if(!token) return NextResponse.json({error:"OAuth access token is missing"},{status:409});
 if(provider==="github"){
  const owner=String(body.owner??config.owner??"").trim(),repo=String(body.repo??"").trim();
  if(!/^[A-Za-z0-9-]{1,39}$/.test(owner)||!/^[A-Za-z0-9_.-]{1,100}$/.test(repo)||repo==="."||repo==="..")
   return NextResponse.json({error:"A valid GitHub owner and repository are required"},{status:400});
  const check=await fetch("https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repo),{headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"},signal:AbortSignal.timeout(15000)});
  if(!check.ok) return NextResponse.json({error:"The selected GitHub repository is not accessible to this account"},{status:422});
  config={...config,owner,repo,oauthPending:false};
 }else{
  const projectKey=String(body.projectKey??"").trim().toUpperCase();
  if(!/^[A-Z][A-Z0-9_]{0,9}$/.test(projectKey)) return NextResponse.json({error:"A valid Jira project key is required"},{status:400});
  const baseUrl=String(config.baseUrl??"");
  let safeBase: URL;
  try { safeBase=validateJiraBaseUrl(baseUrl); } catch { return NextResponse.json({error:"The connected Jira Cloud site is invalid"},{status:409}); }
  if(safeBase.hostname!=="api.atlassian.com"||!safeBase.pathname.startsWith("/ex/jira/")) return NextResponse.json({error:"The connected Jira Cloud site is invalid"},{status:409});
  const check=await fetch(buildJiraUrl(baseUrl,"rest/api/3/project/"+encodeURIComponent(projectKey)),{headers:{Authorization:"Bearer "+token,Accept:"application/json"},signal:AbortSignal.timeout(15000)});
  if(!check.ok) return NextResponse.json({error:"The selected Jira project is not accessible to this account"},{status:422});
  config={...config,projectKey,oauthPending:false,authType:"bearer"};
 }
 await db.integration.update({where:{id:row.id},data:{config:JSON.stringify(config)}});
 await logDecision(projectId,"LIFECYCLE","human","oauth_target_selected",provider+" OAuth connection target selected.");
 return NextResponse.json({ok:true,provider,targetConfigured:true});
}
export async function DELETE(req:NextRequest,{params}:Context){
 const {id:projectId,provider}=await params;
 if(provider!=="github"&&provider!=="jira") return NextResponse.json({error:"Unsupported OAuth provider"},{status:404});
 const auth=await authorized(req,projectId); if("error" in auth) return auth.error;
 const row=await db.integration.findFirst({where:{projectId,kind:provider},orderBy:{createdAt:"desc"}});
 if(!row) return NextResponse.json({ok:true,disconnected:true});
 let config:Record<string,unknown>;
 try{config=JSON.parse(row.config) as Record<string,unknown>;}catch{return NextResponse.json({error:"Saved integration is corrupt"},{status:409});}
 if(config.authMode!=="oauth") return NextResponse.json({error:"Static-token integrations must be removed through their credential settings"},{status:409});
 if(config.organizationId!==auth.identity.organizationId) return NextResponse.json({error:"OAuth connection belongs to another organization"},{status:403});
 const clientId=provider==="github"?process.env.MODRIK_GITHUB_CLIENT_ID:process.env.MODRIK_ATLASSIAN_CLIENT_ID;
 const clientSecret=provider==="github"?process.env.MODRIK_GITHUB_CLIENT_SECRET:process.env.MODRIK_ATLASSIAN_CLIENT_SECRET;
 if(!clientId||!clientSecret) return NextResponse.json({error:"Provider revocation is unavailable until OAuth application credentials are configured"},{status:503});
 let token="";try{token=decryptSecret(String(config.token??""));}catch{return NextResponse.json({error:"OAuth credential cannot be decrypted"},{status:409});}
 try{
  const response=provider==="github"
   ? await fetch("https://api.github.com/applications/"+encodeURIComponent(clientId)+"/grant",{method:"DELETE",headers:{Authorization:"Basic "+Buffer.from(clientId+":"+clientSecret).toString("base64"),Accept:"application/vnd.github+json","Content-Type":"application/json"},body:JSON.stringify({access_token:token}),signal:AbortSignal.timeout(15000)})
   : await fetch("https://auth.atlassian.com/oauth/revoke",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({client_id:clientId,client_secret:clientSecret,token}),signal:AbortSignal.timeout(15000)});
  if(!response.ok) return NextResponse.json({error:"Provider token revocation failed; the local connection was retained"},{status:502});
  await db.integration.delete({where:{id:row.id}});
  await logDecision(projectId,"LIFECYCLE","human","oauth_disconnected",provider+" OAuth connection revoked and removed.");
  return NextResponse.json({ok:true,disconnected:true});
 }catch{return NextResponse.json({error:"Provider revocation could not be confirmed; the local connection was retained"},{status:502});}
}
