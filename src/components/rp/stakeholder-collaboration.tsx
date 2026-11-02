"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { HudPanel, SectionHead, Chip, EmptyBay } from "@/components/rp/hud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, ShieldCheck, GitMerge, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";

type Stakeholder = { id:string; stakeholderRef:string; displayName:string; role:string; approvalRole:string; engagementStatus:string; influenceScore:number; interestScore:number; };
type Position = { id:string; position:string; rationale:string; confidence:number; status:string; evidence:{id:string;relationship:string;note:string;claim:{id:string;claimRef:string;quote:string;status:string}}[]; stakeholder: { displayName:string; stakeholderRef:string }; requirement:{refId:string;text:string}; };
type Negotiation = { id:string; title:string; status:string; chosenOption:string|null; rationale:string; tradeoffs:string; dissent:string[]; participants:{role:string;note:string;stakeholder:{displayName:string;stakeholderRef:string}}[]; options:{id:string;label:string;implications:string}[]; requirement:{refId:string}; };
type AcceptedClaim = {id:string;claimRef:string;claimText:string;quote:string;evidence:{code:string;title:string}};
type Data = { stakeholders:Stakeholder[]; positions:Position[]; negotiations:Negotiation[]; acceptedClaims:AcceptedClaim[] };

export function StakeholderCollaboration({projectId, requirements, refresh}:{projectId:string;requirements:{id:string;refId:string;text:string}[];refresh:()=>Promise<void>}) {
  const {toast}=useToast();
  const {lang}=useLang();
  const ar=lang==="ar";
  const [data,setData]=useState<Data>({stakeholders:[],positions:[],negotiations:[],acceptedClaims:[]});
  const [busy,setBusy]=useState(false);
  const [name,setName]=useState("");
  const [role,setRole]=useState("");
  const [org,setOrg]=useState("");
  const [approvalRole,setApprovalRole]=useState("consulted");
  const [stakeholderId,setStakeholderId]=useState("");
  const [requirementId,setRequirementId]=useState("");
  const [stance,setStance]=useState("supports");
  const [rationale,setRationale]=useState("");
  const [negTitle,setNegTitle]=useState("");
  const [optionA,setOptionA]=useState("");
  const [impactA,setImpactA]=useState("");
  const [optionB,setOptionB]=useState("");
  const [impactB,setImpactB]=useState("");
  const [decisionRationale,setDecisionRationale]=useState("");
  const [selectedParticipants,setSelectedParticipants]=useState<string[]>([]);
  const [selectedClaim,setSelectedClaim]=useState<Record<string,string>>({});
  const [evidenceRelationship,setEvidenceRelationship]=useState<Record<string,string>>({});
  const [evidenceNote,setEvidenceNote]=useState<Record<string,string>>({});
  const [decisionTradeoffs,setDecisionTradeoffs]=useState("");
  const [decisionDissent,setDecisionDissent]=useState("");

  const load=async()=>{const result=await api<Data>(`/api/projects/${projectId}/stakeholders`);setData(result);};
  useEffect(()=>{load().catch(e=>toast({title:"Could not load collaboration data",description:(e as Error).message,variant:"destructive"}));},[projectId]);
  const send=async(payload:Record<string,unknown>)=>{setBusy(true);try{await api(`/api/projects/${projectId}/stakeholders`,{method:"POST",body:JSON.stringify(payload)});await load();await refresh();toast({title:ar?"تم الحفظ":"Saved",description:ar?"تم تسجيل التغيير في سجل القرارات":"Change recorded in the decision journal."});}catch(e){toast({title:ar?"تعذر الحفظ":"Could not save",description:(e as Error).message,variant:"destructive"});}finally{setBusy(false);}};
  const decide=async(negotiationId:string,chosenOption:string)=>{setBusy(true);try{await api(`/api/projects/${projectId}/stakeholders`,{method:"PATCH",body:JSON.stringify({action:"decide_negotiation",negotiationId,status:"approved",chosenOption,rationale:decisionRationale,tradeoffs:decisionTradeoffs,dissent:decisionDissent.split("\\n").map(x=>x.trim()).filter(Boolean)})});await load();await refresh();setDecisionRationale("");setDecisionTradeoffs("");setDecisionDissent("");toast({title:"Decision recorded",description:"Rationale, trade-offs and dissent were recorded."});}catch(e){toast({title:"Decision not saved",description:(e as Error).message,variant:"destructive"});}finally{setBusy(false);}};

  return <section className="mt-6 space-y-4">
    <SectionHead icon={Users} title={ar?"التعاون مع أصحاب المصلحة":"Stakeholder collaboration"} blurb={ar?"سجّل أصحاب المصلحة ومواقفهم، واربطها بأدلة معتمدة. القرار النهائي للإنسان.":"Map decision authority, capture requirement positions, and ground them in accepted evidence. Humans retain the final say."} right={<Chip tone="aura">{data.stakeholders.length} stakeholders</Chip>}/>
    <div className="grid gap-4 xl:grid-cols-2">
      <HudPanel className="space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4"/> {ar?"إضافة صاحب مصلحة":"Add stakeholder"}</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input value={name} onChange={e=>setName(e.target.value)} placeholder={ar?"الاسم المعروض":"Display name"}/>
          <Input value={role} onChange={e=>setRole(e.target.value)} placeholder={ar?"الدور الوظيفي":"Role / title"}/>
          <Input value={org} onChange={e=>setOrg(e.target.value)} placeholder={ar?"المؤسسة (اختياري)":"Organization (optional)"}/>
          <Select value={approvalRole} onValueChange={setApprovalRole}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["decision_maker","approver","contributor","consulted","informed","observer"].map(x=><SelectItem key={x} value={x}>{x.replace("_"," ")}</SelectItem>)}</SelectContent></Select>
        </div>
        <Button disabled={busy||!name.trim()||!role.trim()} onClick={()=>{const stakeholderRef="ST-"+Math.random().toString(36).slice(2,8).toUpperCase();send({action:"create_stakeholder",stakeholderRef,displayName:name,role,organization:org,approvalRole}).then(()=>{setName("");setRole("");setOrg("");});}}>{ar?"حفظ صاحب المصلحة":"Save stakeholder"}</Button>
      </HudPanel>
      <HudPanel className="space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4"/> {ar?"تسجيل موقف من متطلب":"Capture requirement position"}</h3>
        <Select value={stakeholderId} onValueChange={setStakeholderId}><SelectTrigger><SelectValue placeholder={ar?"اختر صاحب المصلحة":"Select stakeholder"}/></SelectTrigger><SelectContent>{data.stakeholders.filter(s=>s.engagementStatus!=="withdrawn").map(s=><SelectItem key={s.id} value={s.id}>{s.displayName} · {s.stakeholderRef}</SelectItem>)}</SelectContent></Select>
        <Select value={requirementId} onValueChange={setRequirementId}><SelectTrigger><SelectValue placeholder={ar?"اختر المتطلب":"Select requirement"}/></SelectTrigger><SelectContent>{requirements.map(r=><SelectItem key={r.id} value={r.id}>{r.refId} · {r.text.slice(0,72)}</SelectItem>)}</SelectContent></Select>
        <Select value={stance} onValueChange={setStance}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["supports","opposes","neutral","conditional"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent></Select>
        <Textarea value={rationale} onChange={e=>setRationale(e.target.value)} placeholder={ar?"اشرح سبب الموقف والشروط":"Rationale and conditions"} />
        <Button disabled={busy||!stakeholderId||!requirementId||!rationale.trim()} onClick={()=>send({action:"create_position",stakeholderId,requirementId,position:stance,rationale})}>{ar?"تسجيل الموقف":"Record position"}</Button>
      </HudPanel>
    </div>
    <HudPanel className="space-y-3 p-4">
      <SectionHead icon={Users} title={ar?"خريطة أصحاب المصلحة":"Stakeholder map"} blurb={ar?"الأدوار وحالة المشاركة":"Roles and engagement status"}/>
      {data.stakeholders.length===0?<EmptyBay>{ar?"لم تتم إضافة أصحاب مصلحة بعد.":"No stakeholders captured yet."}</EmptyBay>:<div className="grid gap-2 md:grid-cols-2">{data.stakeholders.map(s=><div key={s.id} className="rounded-lg border border-border/70 p-3"><div className="flex items-center justify-between gap-2"><b className="text-sm">{s.displayName}</b><Chip tone={s.engagementStatus==="active"?"verify":"muted"}>{s.engagementStatus}</Chip></div><p className="mt-1 text-xs text-muted-foreground">{s.stakeholderRef} · {s.role} · {s.approvalRole.replace("_"," ")}</p><p className="mt-2 text-[11px] text-muted-foreground">Influence {s.influenceScore}/100 · Interest {s.interestScore}/100</p></div>)}</div>}
    </HudPanel>
    <HudPanel className="space-y-3 p-4">
      <SectionHead icon={ShieldCheck} title={ar?"مواقف أصحاب المصلحة":"Requirement positions"} blurb={ar?"كل موقف يظل مقترحًا حتى يراجعه إنسان.":"Positions remain proposed until a human reviews them."}/>
      {data.positions.length===0?<EmptyBay>{ar?"لا توجد مواقف مسجلة.":"No positions captured."}</EmptyBay>:data.positions.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 p-3"><div className="min-w-0"><b className="text-sm">{p.stakeholder.displayName} · {p.requirement.refId}</b><p className="text-xs text-muted-foreground">{p.position} · confidence {(p.confidence*100).toFixed(0)}% · {p.rationale}</p>
      {p.evidence.length>0&&<div className="mt-2 space-y-1">{p.evidence.map(e=><p key={e.id} className="text-xs text-muted-foreground">{e.claim.claimRef} · {e.relationship} · {e.claim.quote}</p>)}</div>}
      {p.status==="accepted"&&<div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px]">
        <Select value={selectedClaim[p.id]??""} onValueChange={v=>setSelectedClaim(old=>({...old,[p.id]:v}))}><SelectTrigger><SelectValue placeholder="Link an accepted evidence claim"/></SelectTrigger><SelectContent>{data.acceptedClaims.filter(c=>!p.evidence.some(e=>e.claim.id===c.id)).map(c=><SelectItem key={c.id} value={c.id}>{c.claimRef} · {c.evidence.code} · {c.claimText.slice(0,48)}</SelectItem>)}</SelectContent></Select>
        <Select value={evidenceRelationship[p.id]??"supports"} onValueChange={v=>setEvidenceRelationship(old=>({...old,[p.id]:v}))}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{["supports","contradicts","qualifies","context"].map(v=><SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select>
        <Textarea className="sm:col-span-2" value={evidenceNote[p.id]??""} onChange={e=>setEvidenceNote(old=>({...old,[p.id]:e.target.value}))} placeholder="Evidence relationship note (optional)"/>
        <Button className="sm:col-span-2" size="sm" disabled={busy||!selectedClaim[p.id]} onClick={async()=>{setBusy(true);try{await api(`/api/projects/${projectId}/stakeholders`,{method:"POST",body:JSON.stringify({action:"link_position_evidence",positionId:p.id,claimId:selectedClaim[p.id],relationship:evidenceRelationship[p.id]??"supports",note:evidenceNote[p.id]??""})});await load();await refresh();setSelectedClaim(old=>({...old,[p.id]:""}));}catch(e){toast({title:"Evidence link failed",description:(e as Error).message,variant:"destructive"});}finally{setBusy(false);}}}>Link accepted claim</Button>
      </div>}
    </div><div className="flex items-center gap-2"><Chip tone={p.status==="accepted"?"verify":p.status==="rejected"?"coral":"signal"}>{p.status}</Chip>{p.status==="proposed"&&<><Button size="sm" disabled={busy} onClick={async()=>{setBusy(true);try{await api(`/api/projects/${projectId}/stakeholders`,{method:"PATCH",body:JSON.stringify({action:"review_position",positionId:p.id,status:"accepted"})});await load();await refresh();}catch(e){toast({title:"Review failed",description:(e as Error).message,variant:"destructive"});}finally{setBusy(false);}}}>Accept</Button><Button size="sm" variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{await api(`/api/projects/${projectId}/stakeholders`,{method:"PATCH",body:JSON.stringify({action:"review_position",positionId:p.id,status:"rejected"})});await load();await refresh();}catch(e){toast({title:"Review failed",description:(e as Error).message,variant:"destructive"});}finally{setBusy(false);}}}>Reject</Button></>}</div></div>}
    </HudPanel>
    <HudPanel className="space-y-3 p-4">
      <SectionHead icon={GitMerge} title={ar?"جلسات التفاوض":"Negotiation decisions"} blurb={ar?"الخيارات تعرض آثارها فقط؛ لا يوجد اختيار آلي.":"Options expose implications only. No automated recommendation or selection."}/>
      <div className="grid gap-2 sm:grid-cols-2"><Input value={negTitle} onChange={e=>setNegTitle(e.target.value)} placeholder="Decision title"/><Select value={requirementId} onValueChange={setRequirementId}><SelectTrigger><SelectValue placeholder="Select requirement"/></SelectTrigger><SelectContent>{requirements.map(r=><SelectItem key={r.id} value={r.id}>{r.refId}</SelectItem>)}</SelectContent></Select></div>
      <div className="grid gap-2 sm:grid-cols-2"><Input value={optionA} onChange={e=>setOptionA(e.target.value)} placeholder="Option A"/><Input value={impactA} onChange={e=>setImpactA(e.target.value)} placeholder="Implications of A"/><Input value={optionB} onChange={e=>setOptionB(e.target.value)} placeholder="Option B"/><Input value={impactB} onChange={e=>setImpactB(e.target.value)} placeholder="Implications of B"/></div>
      <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">Participants</p><div className="flex flex-wrap gap-3">{data.stakeholders.filter(x=>x.engagementStatus!=="withdrawn").map(x=><label key={x.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selectedParticipants.includes(x.id)} onChange={e=>setSelectedParticipants(old=>e.target.checked?[...old,x.id]:old.filter(id=>id!==x.id))}/>{x.displayName}</label>)}</div></div><Button disabled={busy||!negTitle.trim()||!requirementId.trim()||!optionA.trim()||!optionB.trim()||!impactA.trim()||!impactB.trim()} onClick={()=>send({action:"create_negotiation",requirementId,title:negTitle,participants:selectedParticipants.map(stakeholderId=>({stakeholderId,role:"consulted"})),options:[{id:"a",label:optionA,implications:impactA},{id:"b",label:optionB,implications:impactB}]})}>Create negotiation</Button>
      <Textarea value={decisionRationale} onChange={e=>setDecisionRationale(e.target.value)} placeholder="Human decision rationale (required before selecting an option)"/><Textarea value={decisionTradeoffs} onChange={e=>setDecisionTradeoffs(e.target.value)} placeholder="Trade-offs accepted (optional)"/><Textarea value={decisionDissent} onChange={e=>setDecisionDissent(e.target.value)} placeholder="Dissent / unresolved objections (one per line, optional)"/>{data.negotiations.map(n=><div key={n.id} className="rounded-lg border border-border/70 p-3"><div className="flex items-center justify-between"><b className="text-sm">{n.requirement.refId} · {n.title}</b><Chip tone={n.status==="approved"?"verify":"signal"}>{n.status}</Chip></div><div className="mt-2 space-y-2"><p className="text-xs text-muted-foreground">Participants: {n.participants.map(p=>`${p.stakeholder.displayName} (${p.role})`).join(" · ")||"No participants recorded"}</p><div className="grid gap-2 sm:grid-cols-2">{n.options.map(o=><div key={o.id} className="rounded-md bg-secondary/40 p-2"><p className="text-xs font-semibold">{o.label}</p><p className="mt-1 text-xs text-muted-foreground">{o.implications}</p>{n.status==="proposed"&&<Button size="sm" className="mt-2" disabled={busy||!decisionRationale.trim()} onClick={()=>decide(n.id,o.id)}>Select this option</Button>}</div>)}</div>{n.status!=="proposed"&&<div className="rounded-md border border-border/70 p-3 text-xs"><p><b>Selected:</b> {n.options.find(o=>o.id===n.chosenOption)?.label??"Rejected"}</p><p className="mt-1"><b>Rationale:</b> {n.rationale}</p>{n.tradeoffs&&<p className="mt-1"><b>Trade-offs:</b> {n.tradeoffs}</p>}{n.dissent.length>0&&<p className="mt-1"><b>Dissent:</b> {n.dissent.join(" · ")}</p>}</div>}</div></div>)}
    </HudPanel>
    <div className="flex justify-end"><Button size="sm" variant="ghost" onClick={()=>load()}><RefreshCw className="mr-2 h-3.5 w-3.5"/> Refresh collaboration data</Button></div>
  </section>;
}
