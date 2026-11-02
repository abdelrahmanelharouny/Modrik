"use client";
import {useCallback,useEffect,useState} from "react";
import {api} from "@/lib/api";
import type {ProjectDTO} from "@/lib/rp";
import {useLang} from "@/lib/i18n";
import {HudPanel,Chip,SectionHead} from "@/components/rp/hud";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import {useToast} from "@/hooks/use-toast";
import {ClipboardCheck,RefreshCw,CheckCircle2,XCircle,AlertTriangle} from "lucide-react";

const DIMS=[
 ["atomicity","Atomicity","الذرّية"],["clarity","Clarity","الوضوح"],["completeness","Completeness","الاكتمال"],
 ["testability","Testability","قابلية الاختبار"],["consistency","Consistency","الاتساق"],["traceability","Traceability","التتبّع"],
 ["feasibility","Feasibility","قابلية التنفيذ"],["verifiability","Verifiability","قابلية التحقق"],["nfrCoverage","NFR coverage","تغطية غير الوظيفي"],
] as const;
type Key=typeof DIMS[number][0];type Scores=Record<Key,number>;
const INITIAL:Record<Key,number|"">={atomicity:"",clarity:"",completeness:"",testability:"",consistency:"",traceability:"",feasibility:"",verifiability:"",nfrCoverage:""};
interface Assessment extends Scores {
 id:string;requirementId:string;sourceText:string;sourceHash:string;overallScore:number;issues:string[];
 suggestedRewrite?:string|null;assessmentNote:string;status:string;isCurrent:boolean;createdAt:string;
 requirement:{id:string;refId:string;text:string;type:string;priority:string;language:string};
}

export function RequirementQualityPanel({project,isCurrent,onRefresh}:{project:ProjectDTO;isCurrent:boolean;onRefresh:()=>Promise<void>}){
 const {lang}=useLang(),ar=lang==="ar";const {toast}=useToast();
 const [items,setItems]=useState<Assessment[]>([]),[selectedId,setSelectedId]=useState(project.requirements[0]?.id??"");
 const [scores,setScores]=useState<Record<Key,number|"">>(INITIAL),[issues,setIssues]=useState(""),[rewrite,setRewrite]=useState(""),[note,setNote]=useState("");
 const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false);
 const selected=project.requirements.find(r=>r.id===selectedId)??null;
 const reload=useCallback(async()=>{setLoading(true);try{const d=await api<{assessments:Assessment[]}>(`/api/projects/${project.id}/quality`);setItems(d.assessments)}catch(e){toast({title:"Could not load assessments",description:(e as Error).message,variant:"destructive"})}finally{setLoading(false)}},[project.id,toast]);
 useEffect(()=>{void reload()},[reload]);
 useEffect(()=>{if(!project.requirements.some(r=>r.id===selectedId))setSelectedId(project.requirements[0]?.id??"")},[project.requirements,selectedId]);
 const complete=DIMS.every(([key])=>scores[key]!=="");\n const average=complete?Math.round(DIMS.reduce((sum,[key])=>sum+Number(scores[key]),0)/DIMS.length):null;
 const save=async()=>{if(!selected)return;setBusy(true);try{await api(`/api/projects/${project.id}/quality`,{method:"POST",body:JSON.stringify({requirementId:selected.id,...scores,issues:issues.split("\n").map(x=>x.trim()).filter(Boolean),suggestedRewrite,reassessmentNote:note,assessmentNote:note})});await reload();await onRefresh();toast({title:ar?"تم حفظ التقييم":"Assessment saved"})}catch(e){toast({title:"Save failed",description:(e as Error).message,variant:"destructive"})}finally{setBusy(false)}};
 const review=async(item:Assessment,status:"accepted"|"rejected")=>{setBusy(true);try{await api(`/api/projects/${project.id}/quality`,{method:"PATCH",body:JSON.stringify({assessmentId:item.id,status})});await reload()}catch(e){toast({title:"Review failed",description:(e as Error).message,variant:"destructive"})}finally{setBusy(false)}};
 return <HudPanel className="space-y-4 p-4">
  <SectionHead icon={ClipboardCheck} title={ar?"ذكاء جودة المتطلبات":"Requirement quality intelligence"} blurb={ar?"تقييم تسعة أبعاد مع حفظ نسخة النص. أي تعديل لاحق يجعل التقييم السابق قديمًا.":"Nine-dimensional reviews preserve the assessed text. Later edits automatically make earlier assessments stale."} right={<Button size="sm" variant="outline" onClick={()=>void reload()} disabled={loading}><RefreshCw className={`mr-1 h-3.5 w-3.5 ${loading?"animate-spin":""}`}/>Refresh</Button>}/>
  <p className="rounded border border-signal/25 bg-signal/5 p-3 text-xs text-muted-foreground">{ar?"هذه درجات مراجعة بشرية وليست حكمًا آليًا أو شهادة جودة.":"Scores are reviewer judgments, not automated verdicts or quality certification."}</p>
  {project.requirements.length===0?<p className="text-xs text-muted-foreground">No requirements to assess.</p>:<>
   <div className="flex flex-wrap items-center gap-2"><select value={selectedId} onChange={e=>setSelectedId(e.target.value)} aria-label="Requirement to assess" className="h-10 min-w-0 flex-1 rounded border border-input bg-background px-2 text-xs">{project.requirements.map(r=><option key={r.id} value={r.id}>{r.refId} · {r.text.slice(0,75)}</option>)}</select><Chip tone={average>=80?"verify":average>=60?"signal":"coral"}>{average===null?"—":average+"/100"} draft</Chip></div>
   {selected&&<div className="rounded border border-border/60 bg-background/30 p-3"><span className="font-mono text-[10px] text-aura">{selected.refId}</span><p className="mt-1 text-sm" dir="auto">{selected.text}</p></div>}
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{DIMS.map(([key,en,arabic])=><label key={key} className="space-y-1 text-xs"><span className="flex justify-between"><span>{ar?arabic:en}</span><span className="font-mono text-aura">{scores[key]}</span></span><Input type="number" min={0} max={100} step={1} value={scores[key]} onChange={e=>setScores(s=>({...s,[key]:e.target.value===""?"":Math.max(0,Math.min(100,Number(e.target.value)||0))}))} aria-label={ar?arabic:en} className="h-9"/></label>)}</div>
   <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs">Issues (one per line)<Textarea rows={3} value={issues} onChange={e=>setIssues(e.target.value)} maxLength={5000} dir="auto"/></label><label className="space-y-1 text-xs">Suggested rewrite<Textarea rows={3} value={rewrite} onChange={e=>setRewrite(e.target.value)} maxLength={5000} dir="auto" placeholder="Optional; never applied automatically"/></label></div>
   <label className="block space-y-1 text-xs">Reviewer note<Textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} maxLength={1000} dir="auto"/></label>
   <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-muted-foreground">Source text and SHA-256 snapshot will be preserved.</span><Button size="sm" onClick={save} disabled={busy||!selected||!isCurrent||!complete}>Save proposed assessment</Button></div>
  </>}
  {items.length>0&&<div className="space-y-2 border-t border-border/70 pt-3"><div className="text-xs font-semibold">Assessment history</div>{items.map(item=><div key={item.id} className="rounded border border-border/60 p-3">
   <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="font-mono">{item.requirement.refId}</Badge><Chip tone={item.overallScore>=80?"verify":item.overallScore>=60?"signal":"coral"}>{item.overallScore}/100</Chip><Badge variant={item.status==="accepted"?"default":"secondary"}>{item.status}</Badge>{!item.isCurrent&&<Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3"/>Stale</Badge>}</div>
   <p className="mt-2 text-xs" dir="auto">{item.sourceText}</p>{item.issues.length>0&&<ul className="mt-2 list-disc pl-4 text-[11px] text-muted-foreground">{item.issues.map((v,i)=><li key={i}>{v}</li>)}</ul>}
   {item.suggestedRewrite&&<p className="mt-2 rounded bg-secondary/40 p-2 text-xs" dir="auto">{item.suggestedRewrite}</p>}
   <p className="mt-2 font-mono text-[9px] text-muted-foreground">SHA-256 {item.sourceHash.slice(0,20)}…</p>
   {item.status==="proposed"&&<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" className="h-7" disabled={busy||!isCurrent||!item.isCurrent} onClick={()=>review(item,"accepted")}><CheckCircle2 className="mr-1 h-3 w-3"/>Accept</Button><Button size="sm" variant="outline" className="h-7" disabled={busy||!isCurrent} onClick={()=>review(item,"rejected")}><XCircle className="mr-1 h-3 w-3"/>Reject</Button>{!item.isCurrent&&<span className="self-center text-[10px] text-coral">Stale assessments cannot be accepted.</span>}</div>}
  </div>)}</div>}
 </HudPanel>;
}
