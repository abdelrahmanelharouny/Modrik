"use client";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useLang } from "@/lib/i18n";
import { ArrowLeft, Building2, ChartNoAxesCombined, ClipboardCheck, Download, RefreshCw, ShieldCheck, Users, Wallet } from "lucide-react";

type Project={id:string;name:string;status:string;currentStage:string;stageStatus:string;progress:number;_count:{evidences:number;reqs:number;stories:number;conflicts:number;stakeholders:number;baselineSnapshots:number}};
type Baseline={id:string;version:number;label:string;contentHash:string;requirementCount:number;storyCount:number;conflictCount:number;createdAt:string};
type Policy={dataRetentionDays:number;evidenceRetentionDays:number;auditRetentionDays:number;aiProcessingAllowed:boolean;permittedAiProviders:string[];defaultLocale:string};
type Portfolio={summary:{totalProjects:number;completedProjects:number;activeMembers:number;pendingFindings:number;deadJobs:number};usage:{monthlyTokens:number;estimatedCostUsd:number};subscription:{planKey:string;status:string};entitlements:{limits:{monthlyTokens:number;members:number;projects:number}};projects:Project[]};
async function call<T,>(url:string,init?:RequestInit):Promise<T>{
 const response=await fetch(url,{...init,cache:"no-store",credentials:"same-origin",headers:{"Content-Type":"application/json",...(init?.headers??{})}});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(payload.error||"Request failed ("+response.status+")");
 return payload as T;
}
export function EnterpriseManager(){
 const {lang,toggle}=useLang(),ar=lang==="ar",tx=(en:string,arabic:string)=>ar?arabic:en;
 const [portfolio,setPortfolio]=useState<Portfolio|null>(null),[policy,setPolicy]=useState<Policy|null>(null);
 const [organizations,setOrganizations]=useState<Array<{id:string;name:string;role:string;active:boolean}>>([]);
 const [baselines,setBaselines]=useState<Record<string,Baseline[]>>({});
 const [expanded,setExpanded]=useState<string|null>(null);
 const [compare,setCompare]=useState<Record<string,{from:string;to:string;result?:any}>>({});
 const [name,setName]=useState(""),[slug,setSlug]=useState("");
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const [p,o,g]=await Promise.all([
    call<Portfolio>("/api/organizations/portfolio"),
    call<{organizations:Array<{id:string;name:string;role:string;active:boolean}>}>("/api/organizations"),
    call<{policy:Policy}>("/api/organizations/policies"),
   ]);
   setPortfolio(p);setOrganizations(o.organizations||[]);setPolicy(g.policy);
  }catch(e){setError(e instanceof Error?e.message:"Unable to load enterprise workspace");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 async function createOrganization(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError("");
  try{
   const created=await call<{organization:{id:string}}>("/api/organizations",{method:"POST",body:JSON.stringify({name,slug:slug||undefined})});
   await call("/api/auth/organization/switch",{method:"POST",body:JSON.stringify({organizationId:created.organization.id})});
   window.location.assign("/");
  }catch(err){setError(err instanceof Error?err.message:"Organization creation failed");}
  finally{setBusy(false);}
 }
 async function savePolicy(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(!policy)return;setBusy(true);setError("");setNotice("");
  try{
   const result=await call<{policy:Policy}>("/api/organizations/policies",{method:"PATCH",body:JSON.stringify({action:"update_policy",...policy})});
   setPolicy(result.policy);setNotice(tx("Policy saved and audit-recorded.","تم حفظ السياسة وتسجيلها في سجل التدقيق."));
  }catch(err){setError(err instanceof Error?err.message:"Policy update failed");}
  finally{setBusy(false);}
 }
 async function loadBaselines(projectId:string){
  setExpanded(projectId);
  try{const data=await call<{snapshots:Baseline[]}>("/api/projects/"+projectId+"/baselines");setBaselines(v=>({...v,[projectId]:data.snapshots||[]}));}
  catch(err){setError(err instanceof Error?err.message:"Unable to load baselines");}
 }
 async function captureBaseline(projectId:string){
  setBusy(true);setError("");setNotice("");
  try{
   await call("/api/projects/"+projectId+"/baselines",{method:"POST",body:JSON.stringify({label:"Baseline snapshot"})});
   await loadBaselines(projectId);setNotice(tx("Immutable baseline captured.","تم حفظ نسخة ثابتة من خط الأساس."));await load();
  }catch(err){setError(err instanceof Error?err.message:"Baseline capture failed");}
  finally{setBusy(false);}
 }
 async function compareBaselines(projectId:string){
  const selected=compare[projectId];if(!selected?.from||!selected?.to)return;
  setBusy(true);setError("");
  try{
   const params=new URLSearchParams({compareFrom:selected.from,compareTo:selected.to});
   const data=await call<{comparison:any}>("/api/projects/"+projectId+"/baselines?"+params.toString());
   setCompare(v=>({...v,[projectId]:{...selected,result:data.comparison}}));
  }catch(err){setError(err instanceof Error?err.message:"Comparison failed");}
  finally{setBusy(false);}
 }
 async function exportPackage(){
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/organizations/compliance/export",{cache:"no-store",credentials:"same-origin"});
   const payload=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(payload.error||"Export failed");
   const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
   const url=URL.createObjectURL(blob),anchor=document.createElement("a");anchor.href=url;anchor.download="modrik-compliance-package.json";
   document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
   setNotice(tx("Integrity-manifested package exported.","تم تصدير حزمة الامتثال ببصمة سلامة."));
  }catch(err){setError(err instanceof Error?err.message:"Compliance export failed");}
  finally{setBusy(false);}
 }
 return <main dir={ar?"rtl":"ltr"} lang={ar?"ar":"en"} className="mx-auto min-h-screen w-full max-w-7xl px-4 py-10 text-foreground sm:px-6">
  <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
   <div><Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft className="h-4 w-4"/>{tx("Mission Control","مركز التحكم")}</Link>
    <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">{tx("Phase 4 · Product & Business","المرحلة الرابعة · المنتج والأعمال")}</p>
    <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold"><Building2 className="h-8 w-8 text-primary"/>{tx("Enterprise workspace","مساحة العمل المؤسسية")}</h1>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{tx("Portfolio intelligence, organization onboarding, immutable baselines, governance controls and transparent usage metering.","تحليلات المحفظة، وإنشاء المؤسسات، وخطوط أساس ذات إصدارات ثابتة، وضوابط الحوكمة وقياس الاستخدام.")}</p>
   </div>
   <div className="flex gap-2"><button type="button" onClick={toggle} className="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground">{ar?"English":"العربية"}</button><button type="button" onClick={()=>void load()} disabled={loading||busy} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"><RefreshCw className="h-4 w-4"/>{tx("Refresh","تحديث")}</button></div>
  </div>
  {error?<p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>:null}
  {notice?<p role="status" className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">{notice}</p>:null}
  {loading||!portfolio?<div className="rounded-2xl border border-border bg-card p-8 text-sm text-muted-foreground">{tx("Loading organization intelligence…","جارٍ تحميل بيانات المؤسسة…")}</div>:<>
   <section className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
    <Metric icon={ChartNoAxesCombined} label={tx("Projects","المشروعات")} value={portfolio.summary.totalProjects}/>
    <Metric icon={ClipboardCheck} label={tx("Completed","مكتمل")} value={portfolio.summary.completedProjects}/>
    <Metric icon={Users} label={tx("Active members","الأعضاء النشطون")} value={portfolio.summary.activeMembers}/>
    <Metric icon={FileClockIcon} label={tx("Pending drift reviews","مراجعات الانحراف")} value={portfolio.summary.pendingFindings}/>
    <Metric icon={ShieldCheck} label={tx("Dead agent jobs","مهام متوقفة")} value={portfolio.summary.deadJobs}/>
   </section>
   <section className="mb-7 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
    <div className="rounded-2xl border border-border bg-card p-5">
     <div className="mb-4 flex items-center gap-2"><ChartNoAxesCombined className="h-5 w-5 text-primary"/><h2 className="font-semibold">{tx("Project portfolio","محفظة المشروعات")}</h2></div>
     <div className="space-y-3">{portfolio.projects.map(project=><div key={project.id} className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">{project.name}</p><p className="mt-1 text-xs text-muted-foreground">{project.currentStage.replaceAll("_"," ")} · {project.stageStatus}</p></div><span className="rounded-full border border-border px-2 py-1 text-xs">{project.status}</span></div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{width:project.progress+"%"}}/></div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{project._count.evidences} {tx("evidence","دليل")}</span><span>{project._count.reqs} {tx("requirements","متطلب")}</span><span>{project._count.stakeholders} {tx("stakeholders","صاحب مصلحة")}</span><span>{project._count.baselineSnapshots} {tx("baselines","إصدار")}</span></div>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>void loadBaselines(project.id)} className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-secondary">{tx("Baseline registry","سجل خطوط الأساس")}</button>{project.status==="complete"?<button type="button" disabled={busy} onClick={()=>void captureBaseline(project.id)} className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50">{tx("Capture baseline","حفظ إصدار")}</button>:null}</div>
      {expanded===project.id?<div className="mt-4 border-t border-border pt-4">
       {(baselines[project.id]||[]).map(b=><p key={b.id} className="py-1 text-xs"><strong>{b.label} · v{b.version}</strong><span className="text-muted-foreground"> · {b.requirementCount} req · {b.contentHash.slice(0,12)}…</span></p>)}
       {!(baselines[project.id]||[]).length?<p className="text-xs text-muted-foreground">{tx("No snapshots captured yet.","لم يتم حفظ إصدارات بعد.")}</p>:null}
       {(baselines[project.id]||[]).length>1?<div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-xs text-muted-foreground">{tx("From","من")}<select value={compare[project.id]?.from||""} onChange={e=>setCompare(v=>({...v,[project.id]:{from:e.target.value,to:v[project.id]?.to||""}}))} className="h-9 rounded-lg border border-border bg-background px-2 text-foreground">{baselines[project.id].map(b=><option key={b.id} value={b.version}>v{b.version}</option>)}</select></label>
        <label className="grid gap-1 text-xs text-muted-foreground">{tx("To","إلى")}<select value={compare[project.id]?.to||""} onChange={e=>setCompare(v=>({...v,[project.id]:{from:v[project.id]?.from||"",to:e.target.value}}))} className="h-9 rounded-lg border border-border bg-background px-2 text-foreground">{baselines[project.id].map(b=><option key={b.id} value={b.version}>v{b.version}</option>)}</select></label>
        <button type="button" onClick={()=>void compareBaselines(project.id)} disabled={busy} className="h-9 rounded-lg border border-primary/40 px-3 text-xs hover:bg-primary/5 disabled:opacity-50">{tx("Compare","مقارنة")}</button>
       </div>:null}
       {compare[project.id]?.result?<p className="mt-3 text-xs text-muted-foreground">{compare[project.id].result.totalChanges} {tx("total changes","إجمالي التغييرات")} · {compare[project.id].result.requirements.totalChanges} {tx("requirement changes","تغييرات المتطلبات")} · {compare[project.id].result.stories.totalChanges} {tx("story changes","تغييرات القصص")}</p>:null}
      </div>:null}
     </div>)}</div>
    </div>
    <div className="space-y-4">
     <div className="rounded-2xl border border-border bg-card p-5"><div className="mb-4 flex items-center gap-2"><Wallet className="h-5 w-5 text-primary"/><h2 className="font-semibold">{tx("Usage & plan","الاستخدام والخطة")}</h2></div>
      <p className="text-sm text-muted-foreground">{tx("Current plan","الخطة الحالية")}: <strong className="text-foreground">{portfolio.subscription.planKey}</strong></p>
      <div className="mt-4 flex items-end justify-between"><span className="text-xs text-muted-foreground">{tx("Monthly estimated tokens","الرموز المقدرة شهريًا")}</span><strong className="font-mono text-xl">{portfolio.usage.monthlyTokens.toLocaleString()}</strong></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{width:Math.min(100,portfolio.usage.monthlyTokens/Math.max(1,portfolio.entitlements.limits.monthlyTokens)*100)+"%"}}/></div>
      <p className="mt-2 text-xs text-muted-foreground">{tx("of","من")} {portfolio.entitlements.limits.monthlyTokens.toLocaleString()} · {tx("estimated cost","التكلفة التقديرية")} $ {portfolio.usage.estimatedCostUsd.toFixed(4)}</p>
      <p className="mt-3 text-xs text-muted-foreground">{tx("Metering only; no payment provider or invoice is active.","قياس الاستخدام فقط؛ لا يوجد مزود دفع أو فاتورة نشطة.")}</p>
     </div>
     <div className="rounded-2xl border border-border bg-card p-5"><div className="mb-4 flex items-center gap-2"><Building2 className="h-5 w-5 text-primary"/><h2 className="font-semibold">{tx("Create organization","إنشاء مؤسسة")}</h2></div>
      <form onSubmit={createOrganization} className="space-y-3">
       <label className="grid gap-1 text-xs text-muted-foreground">{tx("Workspace name","اسم مساحة العمل")}<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"/></label>
       <label className="grid gap-1 text-xs text-muted-foreground">{tx("Slug (optional)","المعرّف (اختياري)")}<input maxLength={62} value={slug} onChange={e=>setSlug(e.target.value)} placeholder="acme-team" className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"/></label>
       <button type="submit" disabled={busy||!name.trim()} className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{tx("Create & switch","إنشاء وتبديل")}</button>
      </form>
      <div className="mt-4 space-y-2 border-t border-border pt-4">{organizations.map(org=><p key={org.id} className="flex justify-between text-xs"><span>{org.name}</span><span className="text-muted-foreground">{org.active?tx("Active","نشطة"):org.role}</span></p>)}</div>
     </div>
    </div>
   </section>
   <section className="mb-7 rounded-2xl border border-border bg-card p-5">
    <div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/><h2 className="font-semibold">{tx("Governance & retention","الحوكمة والاحتفاظ")}</h2></div>
    {policy?<form onSubmit={savePolicy} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
     <PolicyNumber label="dataRetentionDays" value={policy.dataRetentionDays} min={30} onChange={v=>setPolicy(p=>p?({...p,dataRetentionDays:v}):p)}/>
     <PolicyNumber label="evidenceRetentionDays" value={policy.evidenceRetentionDays} min={30} onChange={v=>setPolicy(p=>p?({...p,evidenceRetentionDays:v}):p)}/>
     <PolicyNumber label="auditRetentionDays" value={policy.auditRetentionDays} min={365} onChange={v=>setPolicy(p=>p?({...p,auditRetentionDays:v}):p)}/>
     <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.aiProcessingAllowed} onChange={e=>setPolicy(p=>p?({...p,aiProcessingAllowed:e.target.checked}):p)}/>{tx("Allow AI processing","السماح بمعالجة AI")}</label>
     <label className="grid gap-1 text-xs text-muted-foreground sm:col-span-2">{tx("Allowed AI providers (comma separated)","مزودو AI المسموحون")}<input value={policy.permittedAiProviders.join(",")} onChange={e=>setPolicy(p=>p?({...p,permittedAiProviders:e.target.value.split(",").map(x=>x.trim()).filter(Boolean)}):p)} className="h-10 rounded-lg border border-border bg-background px-3 text-foreground"/></label>
     <button type="submit" disabled={busy} className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{tx("Save governance policy","حفظ سياسة الحوكمة")}</button>
     <p className="text-xs text-muted-foreground sm:col-span-2 xl:col-span-4">{tx("Policies are recorded and audited. Automated deletion is intentionally disabled until a reviewed retention executor and legal approval are available.","يتم تسجيل السياسات وتدقيقها. الحذف الآلي معطل لحين اعتماد آلية تنفيذ وموافقة قانونية.")}</p>
    </form>:null}
   </section>
   <section className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary"/><h2 className="font-semibold">{tx("Enterprise audit & compliance package","حزمة تدقيق وامتثال المؤسسات")}</h2></div><p className="mt-2 text-sm text-muted-foreground">{tx("A SHA-256 integrity-manifested export of the organization roster, portfolio, baselines, audit events, usage and holds.","تصدير ببصمة SHA-256 لعضويات المؤسسة ومحفظتها وخطوط أساسها وسجل التدقيق والاستخدام وأوامر الحفظ.")}</p></div><button type="button" disabled={busy} onClick={()=>void exportPackage()} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"><Download className="h-4 w-4"/>{tx("Export package","تصدير الحزمة")}</button></div></section>
  </>}
 </main>;
}
function Metric({icon:Icon,label,value}:{icon:React.ElementType;label:string;value:number}){return <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span><Icon className="h-4 w-4"/></div><p className="mt-3 font-mono text-2xl font-semibold tabular-nums">{value}</p></div>}
function PolicyNumber({label,value,min,onChange}:{label:string;value:number;min:number;onChange:(value:number)=>void}){return <label className="grid gap-1 text-xs text-muted-foreground">{label}<input type="number" min={min} max={3650} value={value} onChange={e=>onChange(Number(e.target.value))} className="h-10 rounded-lg border border-border bg-background px-3 text-foreground"/></label>}
import { FileClock as FileClockIcon } from "lucide-react";
