"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { EvidenceClaimDTO, ProjectDTO } from "@/lib/rp";
import { useLang } from "@/lib/i18n";
import { HudPanel, SectionHead, EmptyBay } from "@/components/rp/hud";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Network, Plus, Link2, CheckCircle2, XCircle, Archive, RefreshCw, Search } from "lucide-react";

const NODE_KINDS = ["stakeholder","goal","assumption","constraint","decision","risk","metric","system","domain_concept","process","policy"];
const RELATIONS = ["influences","depends_on","constrains","contradicts","mitigates","implements","affects","informs","owns","part_of","derived_from","supersedes","collaborates_with"];
const KIND_LABEL: Record<string,string> = {
  stakeholder:"Stakeholder",goal:"Goal",assumption:"Assumption",constraint:"Constraint",decision:"Decision",
  risk:"Risk",metric:"Metric",system:"System",domain_concept:"Domain concept",process:"Process",policy:"Policy",
};

interface KGNode {
  id:string; nodeRef:string; kind:string; label:string; description:string; status:string;
  origin:string; confidence:number; owner?:string|null; attributes:Record<string,unknown>;
  claims:{id:string;relationship:string;claim:{id:string;claimRef:string;claimText:string;status:string;quote:string}}[];
  _count?:{outgoing:number};
  requirements:{id:string;role:string;requirement:{id:string;refId:string;text:string;status:string}}[];
}
interface KGEdge {
  id:string; fromNodeId:string; toNodeId:string; relationType:string; status:string; confidence:number; note:string;
  fromNode:{id:string;nodeRef:string;kind:string;label:string};
  toNode:{id:string;nodeRef:string;kind:string;label:string};
}
interface KGResponse { nodes:KGNode[]; edges:KGEdge[]; summary:{nodes:number;acceptedNodes:number;proposedNodes:number;edges:number;acceptedEdges:number;proposedEdges:number} }

export function KnowledgeGraphExplorer({project}:{project:ProjectDTO}) {
  const {lang}=useLang(); const ar=lang==="ar"; const {toast}=useToast();
  const [graph,setGraph]=useState<KGResponse|null>(null);
  const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false);
  const [selectedId,setSelectedId]=useState("");
  const [search,setSearch]=useState(""); const [kindFilter,setKindFilter]=useState("all");
  const [nodeKind,setNodeKind]=useState("goal"); const [nodeLabel,setNodeLabel]=useState(""); const [nodeDescription,setNodeDescription]=useState("");
  const [fromId,setFromId]=useState(""); const [toId,setToId]=useState(""); const [relation,setRelation]=useState("informs"); const [edgeNote,setEdgeNote]=useState("");
  const [claimId,setClaimId]=useState(""); const [requirementId,setRequirementId]=useState(""); const [linkRole,setLinkRole]=useState("informs");

  const claims=useMemo<EvidenceClaimDTO[]>(()=>project.evidences.flatMap(e=>e.claims??[]).filter(c=>c.status==="accepted"),[project.evidences]);
  const refresh=useCallback(async()=>{
    setLoading(true);
    try { const data=await api<KGResponse>(`/api/projects/${project.id}/knowledge-graph`); setGraph(data); }
    catch(e){toast({title:ar?"تعذر تحميل الرسم المعرفي":"Knowledge graph could not load",description:(e as Error).message,variant:"destructive"});}
    finally{setLoading(false);}
  },[project.id,toast,ar]);
  useEffect(()=>{void refresh();},[refresh]);

  const selected=graph?.nodes.find(n=>n.id===selectedId)??null;
  const filtered=useMemo(()=> (graph?.nodes??[]).filter(n=>(kindFilter==="all"||n.kind===kindFilter)&&(!search.trim()||[n.nodeRef,n.label,n.description].join(" ").toLowerCase().includes(search.trim().toLowerCase()))),[graph,kindFilter,search]);
  const relatedEdges=useMemo(()=>graph?.edges.filter(e=>e.fromNodeId===selectedId||e.toNodeId===selectedId)??[],[graph,selectedId]);
  const nodePositions=useMemo(()=>{
    const nodes=(graph?.nodes??[]).slice(0,24);
    const positions=new Map<string,{x:number;y:number}>();
    nodes.forEach((node,index)=>{
      const angle=(index/Math.max(1,nodes.length))*Math.PI*2-Math.PI/2;
      const radius=nodes.length<=8?125:155;
      positions.set(node.id,{x:360+radius*Math.cos(angle),y:215+radius*Math.sin(angle)});
    });
    return positions;
  },[graph]);

  const mutate=async(action:string,payload:Record<string,unknown>)=>{
    setBusy(true);
    try { await api(`/api/projects/${project.id}/knowledge-graph`,{method:"POST",body:JSON.stringify({action,...payload})}); await refresh(); }
    catch(e){toast({title:ar?"تعذر حفظ التغيير":"Could not save graph change",description:(e as Error).message,variant:"destructive"});}
    finally{setBusy(false);}
  };
  const createNode=async()=>{
    if(!nodeLabel.trim())return;
    setBusy(true);
    try{
      const result=await api<{node:KGNode}>(`/api/projects/${project.id}/knowledge-graph`,{method:"POST",body:JSON.stringify({action:"create_node",kind:nodeKind,label:nodeLabel,description:nodeDescription})});
      setNodeLabel("");setNodeDescription("");await refresh();setSelectedId(result.node.id);
      toast({title:ar?"تم إنشاء الكيان":"Knowledge node created",description:result.node.nodeRef});
    }catch(e){toast({title:ar?"تعذر إنشاء الكيان":"Node creation failed",description:(e as Error).message,variant:"destructive"});}
    finally{setBusy(false);}
  };
  const createEdge=async()=>{
    if(!fromId||!toId)return;
    await mutate("add_edge",{fromNodeId:fromId,toNodeId:toId,relationType:relation,note:edgeNote});
    setEdgeNote("");
  };
  const changeStatus=(node:KGNode,status:string)=>mutate("update_node",{nodeId:node.id,status});
  const reviewEdge=(edge:KGEdge,status:string)=>mutate("review_edge",{edgeId:edge.id,status});
  const linkClaim=async()=>{if(!selectedId||!claimId)return;await mutate("link_claim",{nodeId:selectedId,claimId,relationship:"supports"});setClaimId("");};
  const linkRequirement=async()=>{if(!selectedId||!requirementId)return;await mutate("link_requirement",{nodeId:selectedId,requirementId,role:linkRole});setRequirementId("");};

  return <section className="space-y-4" aria-label={ar?"مستكشف الرسم المعرفي":"Knowledge graph explorer"}>
    <SectionHead icon={Network} title={ar?"الرسم المعرفي للمشروع":"Project knowledge graph"} blurb={ar?"اربط أصحاب المصلحة والأهداف والافتراضات والقرارات والمخاطر والقيود بالأدلة والمتطلبات. كل علاقة قابلة للمراجعة والتدقيق.":"Connect stakeholders, goals, assumptions, decisions, risks and constraints to accepted evidence and requirements. Every relationship is reviewable and journaled."}
      right={<Button size="sm" variant="outline" onClick={()=>void refresh()} disabled={loading} className="h-8"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading?"animate-spin":""}`}/>{ar?"تحديث":"Refresh"}</Button>}/>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[
        {label:ar?"الكيانات":"Nodes",value:graph?.summary.nodes??0},
        {label:ar?"مقبولة":"Accepted",value:graph?.summary.acceptedNodes??0},
        {label:ar?"العلاقات":"Relationships",value:graph?.summary.edges??0},
        {label:ar?"بانتظار المراجعة":"Awaiting review",value:(graph?.summary.proposedNodes??0)+(graph?.summary.proposedEdges??0)},
      ].map(item=><HudPanel key={item.label} className="p-3 text-center" as="div"><div className="font-display text-xl font-bold tabular-nums">{item.value}</div><div className="mt-1 font-mono text-[9px] uppercase text-muted-foreground">{item.label}</div></HudPanel>)}
    </div>

    <HudPanel className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4 text-aura"/>{ar?"إضافة كيان معرفي":"Add a knowledge node"}</div>
      <div className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]">
        <select value={nodeKind} onChange={e=>setNodeKind(e.target.value)} aria-label="Node type" className="h-10 rounded-md border border-input bg-background px-2 text-xs">{NODE_KINDS.map(k=><option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        <Input value={nodeLabel} onChange={e=>setNodeLabel(e.target.value)} maxLength={180} placeholder={ar?"اسم الكيان، مثل: مدير العمليات":"Node label, e.g. Operations manager"} dir="auto"/>
      </div>
      <Textarea value={nodeDescription} onChange={e=>setNodeDescription(e.target.value)} maxLength={5000} rows={2} placeholder={ar?"الوصف والسياق":"Description and context"} dir="auto"/>
      <div className="flex justify-end"><Button size="sm" onClick={createNode} disabled={busy||!nodeLabel.trim()}><Plus className="mr-1.5 h-3.5 w-3.5"/>{ar?"إنشاء كيان مقترح":"Create proposed node"}</Button></div>
    </HudPanel>

    <HudPanel className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4 text-aura"/>{ar?"إنشاء علاقة":"Connect two nodes"}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select value={fromId} onChange={e=>setFromId(e.target.value)} aria-label="Relationship source node" className="h-10 min-w-0 rounded-md border border-input bg-background px-2 text-xs"><option value="">From node…</option>{(graph?.nodes??[]).map(n=><option key={n.id} value={n.id}>{n.nodeRef} · {n.label}</option>)}</select>
        <select value={toId} onChange={e=>setToId(e.target.value)} aria-label="Relationship target node" className="h-10 min-w-0 rounded-md border border-input bg-background px-2 text-xs"><option value="">To node…</option>{(graph?.nodes??[]).map(n=><option key={n.id} value={n.id}>{n.nodeRef} · {n.label}</option>)}</select>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <select value={relation} onChange={e=>setRelation(e.target.value)} aria-label="Relationship type" className="h-10 min-w-0 rounded-md border border-input bg-background px-2 text-xs">{RELATIONS.map(r=><option key={r} value={r}>{r.replaceAll("_"," ")}</option>)}</select>
        <Input value={edgeNote} onChange={e=>setEdgeNote(e.target.value)} maxLength={500} placeholder="Why does this relationship exist?"/>
        <Button size="sm" onClick={createEdge} disabled={busy||!fromId||!toId||fromId===toId}>{ar?"إضافة علاقة":"Propose edge"}</Button>
      </div>
      <p className="text-[10px] text-muted-foreground">{ar?"العلاقات الجديدة تبدأ كمقترحات ولا تدخل في المعرفة المعتمدة قبل مراجعتها.":"New relationships begin as proposals and do not become accepted knowledge until reviewed."}</p>
    </HudPanel>

    <HudPanel className="overflow-hidden p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold">{ar?"العلاقات المرئية":"Relationship map"}</div>
        <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-verify"/>Accepted node</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-aura"/>Proposed node</span>
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-coral"/>Contradiction</span>
        </div>
      </div>
      {(graph?.nodes.length??0)===0?<EmptyBay>{ar?"ستظهر الشبكة هنا بعد إضافة الكيانات والعلاقات.":"The network appears here after nodes and relationships are added."}</EmptyBay>:<>
        <div className="overflow-x-auto rounded-md border border-border/50 bg-abyss/40">
          <svg viewBox="0 0 720 430" role="img" aria-label="Project knowledge graph showing typed nodes and relationships" className="mx-auto block h-[300px] w-full min-w-[560px] sm:h-[390px]">
            <circle cx="360" cy="215" r="190" fill="none" stroke="rgba(126,150,176,0.12)" strokeDasharray="3 7"/>
            {graph?.edges.map(edge=>{
              const a=nodePositions.get(edge.fromNodeId),b=nodePositions.get(edge.toNodeId);
              if(!a||!b)return null;
              const color=edge.relationType==="contradicts"?"#ff6b7a":edge.relationType==="constrains"?"#ffb454":edge.status==="accepted"?"#2ce8c8":"#a78bfa";
              const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
              return <g key={edge.id}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={edge.status==="accepted"?2:1.2} strokeOpacity={edge.status==="accepted"?0.85:0.4} strokeDasharray={edge.status==="accepted"?"none":"4 4"}/><text x={mx} y={my-4} textAnchor="middle" fill={color} fontSize="8" fontFamily="monospace">{edge.relationType.replaceAll("_"," ")}</text></g>;
            })}
            {[...(graph?.nodes??[])].slice(0,24).map(node=>{
              const p=nodePositions.get(node.id);if(!p)return null;
              const active=node.id===selectedId;
              const color=node.status==="accepted"?"#2ce8c8":node.status==="rejected"?"#ff6b7a":"#a78bfa";
              return <g key={node.id} opacity={node.status==="archived"?0.4:1}>
                {active&&<circle cx={p.x} cy={p.y} r="27" fill="none" stroke="#f5d76e" strokeWidth="1.5" strokeDasharray="3 3"/>}
                <circle cx={p.x} cy={p.y} r="20" fill={color} fillOpacity="0.12" stroke={color} strokeWidth={active?2.5:1.2}/>
                <text x={p.x} y={p.y+3} textAnchor="middle" fill={color} fontSize="8" fontFamily="monospace">{node.nodeRef}</text>
                <text x={p.x} y={p.y+34} textAnchor="middle" fill="rgba(230,238,245,0.88)" fontSize="9">{node.label.length>18?node.label.slice(0,17)+"…":node.label}</text>
              </g>;
            })}
            <circle cx="360" cy="215" r="4" fill="#2ce8c8" opacity="0.8"/>
          </svg>
        </div>
        {(graph?.nodes.length??0)>24&&<p className="mt-2 text-[10px] text-muted-foreground">Map shows the first 24 nodes; the searchable list below contains every node.</p>}
      </>}
    </HudPanel>

    <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <HudPanel className="min-w-0 p-3">
        <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px]">
          <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground"/><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder={ar?"ابحث في الكيانات":"Search nodes"} className="pl-8"/></div>
          <select value={kindFilter} onChange={e=>setKindFilter(e.target.value)} aria-label="Filter node kind" className="h-10 rounded-md border border-input bg-background px-2 text-xs"><option value="all">{ar?"كل الأنواع":"All types"}</option>{NODE_KINDS.map(k=><option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
        </div>
        {loading?<p className="p-4 text-center text-xs text-muted-foreground">Loading graph…</p>:filtered.length===0?<EmptyBay>{ar?"لا توجد كيانات مطابقة. ابدأ بإضافة كيان.":"No matching nodes. Add the first knowledge node above."}</EmptyBay>:
          <ul className="max-h-[520px] space-y-1.5 overflow-y-auto">
            {filtered.map(n=><li key={n.id}><button type="button" onClick={()=>setSelectedId(n.id)} aria-pressed={selectedId===n.id} className={`w-full rounded-md border p-3 text-left transition-colors ${selectedId===n.id?"border-aura/50 bg-aura/10":"border-border/60 bg-background/30 hover:border-aura/30"}`}>
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-[10px] text-aura">{n.nodeRef}</span><Badge variant="outline">{KIND_LABEL[n.kind]??n.kind}</Badge><Badge variant={n.status==="accepted"?"default":"secondary"}>{n.status}</Badge></div>
              <p className="mt-1 text-sm font-medium" dir="auto">{n.label}</p>
              {n.description&&<p className="mt-1 line-clamp-2 text-xs text-muted-foreground" dir="auto">{n.description}</p>}
              <p className="mt-2 text-[10px] text-muted-foreground">{n.claims.length} claims · {n.requirements.length} requirements · {n._count?.outgoing??0} outgoing</p>
            </button></li>)}
          </ul>}
      </HudPanel>

      <HudPanel className="min-w-0 p-4">
        {!selected?<EmptyBay>{ar?"اختر كيانًا لعرض تفاصيله ومراجعة علاقاته.":"Select a node to inspect its provenance, requirement links and relationships."}</EmptyBay>:<>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="font-mono text-aura">{selected.nodeRef}</Badge><Badge variant="secondary">{KIND_LABEL[selected.kind]??selected.kind}</Badge></div><h3 className="mt-2 text-base font-semibold" dir="auto">{selected.label}</h3></div>
            <Badge variant={selected.status==="accepted"?"default":"secondary"}>{selected.status}</Badge>
          </div>
          {selected.description&&<p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground" dir="auto">{selected.description}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {selected.status!=="accepted"&&<Button size="sm" disabled={busy} onClick={()=>changeStatus(selected,"accepted")}><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>Accept node</Button>}
            {selected.status==="proposed"&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>changeStatus(selected,"rejected")}><XCircle className="mr-1 h-3.5 w-3.5"/>Reject</Button>}
            {selected.status!=="archived"&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>changeStatus(selected,"archived")}><Archive className="mr-1 h-3.5 w-3.5"/>Archive</Button>}
          </div>
          <div className="mt-4 space-y-3 border-t border-border/70 pt-3">
            <div className="text-xs font-semibold">Evidence provenance</div>
            {selected.claims.length===0?<p className="text-xs text-muted-foreground">No accepted claims linked yet.</p>:selected.claims.map(link=><div key={link.id} className="rounded border border-border/60 p-2"><div className="flex items-center gap-2"><span className="font-mono text-[10px] text-aura">{link.claim.claimRef}</span><Badge variant="outline">{link.relationship}</Badge></div><p className="mt-1 text-xs" dir="auto">{link.claim.claimText}</p><p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground" dir="auto">“{link.claim.quote}”</p></div>)}
            {claims.length>0&&<div className="flex gap-2"><select value={claimId} onChange={e=>setClaimId(e.target.value)} aria-label="Accepted evidence claim" className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"><option value="">Link accepted claim…</option>{claims.map(c=><option key={c.id} value={c.id}>{c.claimRef} · {c.claimText.slice(0,55)}</option>)}</select><Button size="sm" variant="outline" disabled={busy||!claimId} onClick={linkClaim}>Link</Button></div>}
          </div>
          <div className="mt-4 space-y-2 border-t border-border/70 pt-3">
            <div className="text-xs font-semibold">Requirement traceability</div>
            {selected.requirements.map(link=><div key={link.id} className="flex flex-wrap items-center gap-2 text-xs"><Badge variant="outline" className="font-mono">{link.requirement.refId}</Badge><Badge variant="secondary">{link.role}</Badge><span className="min-w-0 flex-1" dir="auto">{link.requirement.text}</span></div>)}
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
              <select value={requirementId} onChange={e=>setRequirementId(e.target.value)} aria-label="Requirement to link" className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-xs"><option value="">Link requirement…</option>{project.requirements.map(r=><option key={r.id} value={r.id}>{r.refId} · {r.text.slice(0,45)}</option>)}</select>
              <select value={linkRole} onChange={e=>setLinkRole(e.target.value)} aria-label="Requirement relationship role" className="h-9 rounded-md border border-input bg-background px-2 text-xs">{["implements","constrains","mitigates","affects","informs","validates"].map(role=><option key={role}>{role}</option>)}</select>
              <Button size="sm" variant="outline" disabled={busy||!requirementId} onClick={linkRequirement}>Link</Button>
            </div>
          </div>
          <div className="mt-4 space-y-2 border-t border-border/70 pt-3">
            <div className="text-xs font-semibold">Relationships ({relatedEdges.length})</div>
            {relatedEdges.length===0?<p className="text-xs text-muted-foreground">No relationships yet.</p>:relatedEdges.map(edge=><div key={edge.id} className="rounded border border-border/60 p-2">
              <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-mono text-aura">{edge.fromNode.nodeRef}</span><span>— {edge.relationType.replaceAll("_"," ")} →</span><span className="font-mono text-aura">{edge.toNode.nodeRef}</span><Badge variant={edge.status==="accepted"?"default":"secondary"}>{edge.status}</Badge></div>
              {edge.note&&<p className="mt-1 text-[10px] text-muted-foreground">{edge.note}</p>}
              {edge.status==="proposed"&&<div className="mt-2 flex gap-2"><Button size="sm" className="h-7" disabled={busy} onClick={()=>reviewEdge(edge,"accepted")}>Accept relation</Button><Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={()=>reviewEdge(edge,"rejected")}>Reject</Button></div>}
            </div>)}
          </div>
        </>}
      </HudPanel>
    </div>
  </section>;
}
