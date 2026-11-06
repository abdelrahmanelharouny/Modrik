import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";

export const OAUTH_STATE_TTL_SECONDS = 600;
const providers = new Set(["github", "jira"]);
const keyFor = (env) => {
  const key = env.MODRIK_AUTH_SECRET;
  if (!key || Buffer.byteLength(key, "utf8") < 32) throw new Error("MODRIK_AUTH_SECRET must contain at least 32 bytes");
  return key;
};
const equal = (a,b) => { const x=Buffer.from(String(a??"")); const y=Buffer.from(String(b??"")); return x.length===y.length && timingSafeEqual(x,y); };
export const oauthCookieName = (provider) => {
  if (!providers.has(provider)) throw new TypeError("Unsupported OAuth provider");
  return "modrik_oauth_" + provider;
};
export function createOAuthTransaction({provider,projectId,userId,organizationId}, env=process.env, now=Date.now()) {
  if (!providers.has(provider) || ![projectId,userId,organizationId].every(v=>typeof v==="string"&&v.trim())) throw new TypeError("OAuth transaction context is incomplete");
  const state=randomBytes(32).toString("base64url");
  const verifier=randomBytes(48).toString("base64url");
  const payload={v:1,provider,projectId,userId,organizationId,state,verifier,iat:Math.floor(now/1000),exp:Math.floor(now/1000)+OAUTH_STATE_TTL_SECONDS};
  const encoded=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature=createHmac("sha256",keyFor(env)).update(encoded).digest("base64url");
  return {state,verifier,cookieValue:encoded+"."+signature,challenge:createHash("sha256").update(verifier).digest("base64url")};
}
export function verifyOAuthTransaction(cookieValue,suppliedState,provider,env=process.env,now=Date.now()) {
  if(typeof cookieValue!=="string"||cookieValue.length>4096||typeof suppliedState!=="string"||!providers.has(provider)) return null;
  const parts=cookieValue.split(".");
  if(parts.length!==2) return null;
  const expected=createHmac("sha256",keyFor(env)).update(parts[0]).digest("base64url");
  if(!equal(parts[1],expected)) return null;
  try {
    const p=JSON.parse(Buffer.from(parts[0],"base64url").toString("utf8")), seconds=Math.floor(now/1000);
    if(p?.v!==1||p.provider!==provider||!equal(p.state,suppliedState)||!Number.isInteger(p.iat)||!Number.isInteger(p.exp)||
      p.iat>seconds+30||p.exp<=seconds||p.exp-p.iat>OAUTH_STATE_TTL_SECONDS||
      ![p.projectId,p.userId,p.organizationId,p.verifier].every(v=>typeof v==="string"&&v.length>0)) return null;
    return p;
  } catch { return null; }
}
export function oauthProviderConfig(provider,env=process.env) {
  if(provider==="github") {
    const clientId=env.MODRIK_GITHUB_CLIENT_ID?.trim(),clientSecret=env.MODRIK_GITHUB_CLIENT_SECRET?.trim();
    return clientId&&clientSecret?{clientId,clientSecret,authorizationUrl:"https://github.com/login/oauth/authorize",tokenUrl:"https://github.com/login/oauth/access_token",scopes:["repo","read:user"]}:null;
  }
  if(provider==="jira") {
    const clientId=env.MODRIK_ATLASSIAN_CLIENT_ID?.trim(),clientSecret=env.MODRIK_ATLASSIAN_CLIENT_SECRET?.trim();
    return clientId&&clientSecret?{clientId,clientSecret,authorizationUrl:"https://auth.atlassian.com/authorize",tokenUrl:"https://auth.atlassian.com/oauth/token",scopes:["offline_access","read:me","read:jira-user","read:jira-work","write:jira-work"]}:null;
  }
  return null;
}
export function oauthCallbackUrl(provider,appUrl=process.env.MODRIK_APP_URL) {
  if(!providers.has(provider)||!appUrl) throw new Error("OAuth callback URL configuration is missing");
  const base=new URL(appUrl);
  if(base.protocol!=="https:"&&base.hostname!=="localhost") throw new Error("MODRIK_APP_URL must use HTTPS outside localhost");
  return new URL("/api/integrations/oauth/"+provider+"/callback",base).toString();
}
