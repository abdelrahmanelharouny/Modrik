"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { EvidenceDTO, RequirementDTO } from "@/lib/rp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import { Quote, CheckCircle2, XCircle, Link2, Plus } from "lucide-react";

const kinds = ["need", "goal", "constraint", "preference", "risk", "metric", "pain_point", "assumption", "fact"];
const relationships = ["supports", "contradicts", "qualifies", "derives"];

export function EvidenceClaimsPanel({ projectId, evidence, requirements, onSaved }: {
  projectId: string; evidence: EvidenceDTO; requirements: RequirementDTO[]; onSaved: () => Promise<void>;
}) {
  const { toast } = useToast();
  const { lang } = useLang();
  const ar = lang === "ar";
  const [open, setOpen] = useState(false);
  const [claimText, setClaimText] = useState("");
  const [quote, setQuote] = useState("");
  const [kind, setKind] = useState("need");
  const [busy, setBusy] = useState(false);
  const [targetByClaim, setTargetByClaim] = useState<Record<string, string>>({});
  const [relationshipByClaim, setRelationshipByClaim] = useState<Record<string, string>>({});
  const revision = evidence.revisions?.[0];
  const claims = evidence.claims ?? [];
  const exactStart = useMemo(() => evidence.content.indexOf(quote), [evidence.content, quote]);
  const exact = quote.trim().length >= 3 && exactStart >= 0 && evidence.content.slice(exactStart, exactStart + quote.length) === quote;

  const createClaim = async () => {
    if (!revision || !exact || !claimText.trim()) return;
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/claims`, { method: "POST", body: JSON.stringify({
        evidenceId: evidence.id, revisionId: revision.id, claimText, quote,
        quoteStart: exactStart, quoteEnd: exactStart + quote.length, claimKind: kind,
      }) });
      setClaimText(""); setQuote(""); setOpen(false);
      await onSaved();
      toast({ title: "Evidence claim captured", description: "The claim is proposed and must be reviewed before it can support a requirement." });
    } catch (error) {
      toast({ title: "Could not capture claim", description: (error as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const review = async (claimId: string, status: "accepted" | "rejected") => {
    const requirementId = targetByClaim[claimId] || undefined;
    const relationship = relationshipByClaim[claimId] || "supports";
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/claims`, { method: "PATCH", body: JSON.stringify({
        claimId, status, ...(status === "accepted" && requirementId ? { requirementId, relationship } : {}),
        reviewNote: status === "accepted" ? "Reviewed against the preserved source quotation." : "Rejected during human evidence review.",
      }) });
      await onSaved();
      toast({ title: status === "accepted" ? "Claim accepted" : "Claim rejected", description: requirementId && status === "accepted" ? "Claim linked to the selected requirement." : "Review decision recorded." });
    } catch (error) {
      toast({ title: "Review could not be saved", description: (error as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return <section className="mt-3 rounded-md border border-border/60 bg-background/40 p-3" aria-label={ar ? `ادعاءات الدليل ${evidence.code}` : `Evidence claims for ${evidence.code}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold"><Quote className="h-3.5 w-3.5 text-aura" /> {ar ? "ادعاءات الدليل" : "Evidence claims"} <Badge variant="outline">{claims.length}</Badge></div>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(v => !v)} disabled={!revision}>
        <Plus className="mr-1 h-3.5 w-3.5" /> {open ? (ar ? "إغلاق" : "Close") : (ar ? "تسجيل ادعاء" : "Capture claim")}
      </Button>
    </div>
    {!revision && <p className="mt-2 text-xs text-muted-foreground">{ar ? "أنشئ إصدارًا من الدليل قبل تسجيل ادعاءات مرتبطة بالمصدر." : "Create an evidence revision before capturing source-linked claims."}</p>}
    {open && <div className="mt-3 space-y-2 rounded-md border border-aura/30 bg-aura/5 p-3">
      <Input value={claimText} onChange={e => setClaimText(e.target.value)} maxLength={1000} placeholder={ar ? "صياغة الادعاء (مثال: يجب أن تدعم البوابة اللغة العربية)." : "Normalized claim (e.g. The portal must support Arabic)."} aria-label={ar ? "الادعاء بصيغته الموحدة" : "Normalized claim"} />
      <Textarea value={quote} onChange={e => setQuote(e.target.value)} rows={3} maxLength={2000} dir="auto" placeholder={ar ? "الصق الاقتباس الحرفي من إصدار المصدر هذا…" : "Paste the exact quotation from this source revision…"} aria-label={ar ? "اقتباس المصدر الحرفي" : "Exact source quotation"} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={kind} onChange={e => setKind(e.target.value)} aria-label={ar ? "نوع الادعاء" : "Claim kind"} className="h-9 rounded-md border border-input bg-background px-2 text-xs">{kinds.map(k => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</select>
        <span className={`text-[10px] ${exact ? "text-verify" : "text-muted-foreground"}`}>{exact ? `Exact match · UTF-16 ${exactStart}–${exactStart + quote.length} · v${revision?.version}` : "Quotation must match this source exactly"}</span>
        <Button size="sm" onClick={createClaim} disabled={busy || !claimText.trim() || !exact}>{ar ? "حفظ الادعاء المقترح" : "Save proposed claim"}</Button>
      </div>
      <p className="text-[10px] text-muted-foreground">{ar ? "يُحفظ الاقتباس مع مواضعه داخل إصدار المصدر الثابت. ولا يُعامل الادعاء كدليل معتمد حتى يوافق عليه شخص." : "The quotation is stored with offsets against the immutable source revision. A claim is not treated as approved evidence until a human accepts it."}</p>
    </div>}
    {claims.length > 0 && <ul className="mt-3 space-y-2">
      {claims.map(claim => <li key={claim.id} className="rounded-md border border-border/60 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] text-aura">{claim.claimRef}</span>
          <Badge variant="outline">{claim.claimKind.replace("_", " ")}</Badge>
          <Badge variant={claim.status === "accepted" ? "default" : "secondary"}>{claim.status.replace("_", " ")}</Badge>
          <span className="ms-auto text-[10px] text-muted-foreground">confidence {(claim.extractionConfidence * 100).toFixed(0)}% · source v{claim.sourceRevisionVersion}</span>
        </div>
        <p className="mt-2 text-sm font-medium" dir="auto">{claim.claimText}</p>
        <blockquote className="mt-2 border-l-2 border-aura/50 pl-3 text-xs leading-relaxed text-muted-foreground" dir="auto">“{claim.quote}”</blockquote>
        <p className="mt-1 font-mono text-[9px] text-muted-foreground">UTF-16 [{claim.quoteStart}, {claim.quoteEnd})</p>
        {(claim.requirementLinks ?? []).map(link => <p key={link.requirement.id} className="mt-1 flex items-center gap-1 text-[10px] text-verify"><Link2 className="h-3 w-3" /> {link.relationship} · {link.requirement.refId}</p>)}
        {claim.status !== "accepted" && claim.status !== "rejected" && <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto_auto]">
          <select value={targetByClaim[claim.id] ?? ""} onChange={e => setTargetByClaim(v => ({...v,[claim.id]:e.target.value}))} aria-label={ar ? `المتطلب المرتبط بالادعاء ${claim.claimRef}` : `Requirement for ${claim.claimRef}`} className="h-9 min-w-0 rounded-md border border-input bg-background px-2 text-xs">
            <option value="">{ar ? "مراجعة دون ربط" : "Review without linking"}</option>
            {requirements.map(req => <option key={req.id} value={req.id}>{req.refId} · {req.text.slice(0, 70)}</option>)}
          </select>
          <select value={relationshipByClaim[claim.id] ?? "supports"} onChange={e => setRelationshipByClaim(v => ({...v,[claim.id]:e.target.value}))} aria-label={ar ? "علاقة الادعاء بالمتطلب" : "Claim relationship"} className="h-9 rounded-md border border-input bg-background px-2 text-xs">{relationships.map(value => <option key={value}>{value}</option>)}</select>
          <Button size="sm" className="h-9" disabled={busy} onClick={() => review(claim.id,"accepted")}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> {ar ? "قبول" : "Accept"}</Button>
          <Button size="sm" variant="outline" className="h-9" disabled={busy} onClick={() => review(claim.id,"rejected")}><XCircle className="mr-1 h-3.5 w-3.5" /> {ar ? "رفض" : "Reject"}</Button>
        </div>}
      </li>)}
    </ul>}
  </section>;
}
