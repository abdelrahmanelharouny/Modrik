"use client";
import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, CircleDot, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";

type Finding = {
  id: string; requirementRef: string; note: string; status: string;
  requirement: null | { refId: string; text: string; status: string; priority: string; verifyStatus: string; driftStatus: string };
};
type ImpactJob = {
  id: string; status: string; attempts: number; maxAttempts: number; lastError: string | null;
  createdAt: string; completedAt: string | null; source: string; signal: string;
  tracker: null | { kind: string; direction: string; externalKey: string; externalUrl: string; title: string };
  summary: string | null; findings: Finding[];
};
const labels: Record<string, { en: string; ar: string }> = {
  queued: { en: "Queued", ar: "في قائمة الانتظار" }, running: { en: "Analyzing", ar: "جارٍ التحليل" },
  retry_wait: { en: "Retry scheduled", ar: "إعادة المحاولة مجدولة" }, completed: { en: "Analysis complete", ar: "اكتمل التحليل" },
  dead: { en: "Needs operator attention", ar: "يحتاج تدخلًا تشغيليًا" }, pending: { en: "Pending review", ar: "بانتظار المراجعة" },
  confirmed: { en: "Confirmed", ar: "مؤكد" }, dismissed: { en: "Dismissed", ar: "مستبعد" }, resolved: { en: "Resolved", ar: "تمت المعالجة" },
};
export function ChangeImpactInbox({ projectId }: { projectId: string }) {
  const { lang } = useLang(); const ar = lang === "ar";
  const [jobs, setJobs] = useState<ImpactJob[]>([]); const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false); const [busyId, setBusyId] = useState("");
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects/" + projectId + "/drift", { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not load change-impact jobs.");
      setJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load change-impact jobs."); }
    finally { setLoading(false); setRefreshing(false); }
  }, [projectId]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(true); }, 10000);
    return () => window.clearInterval(timer);
  }, [load]);
  async function submitSignal() {
    if (!signal.trim() || submitting) return;
    setSubmitting(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/projects/" + projectId + "/drift", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signal: signal.trim() }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not queue the change signal.");
      setSignal("");
      setNotice(ar ? "تمت إضافة إشارة التغيير إلى قائمة التحليل." : "Change signal queued for background analysis.");
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not queue the change signal.");
    } finally { setSubmitting(false); }
  }
  async function review(finding: Finding, action: "confirm" | "dismiss" | "resolve") {
    setBusyId(finding.id); setError(""); setNotice("");
    try {
      const response = await fetch("/api/projects/" + projectId + "/drift", {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ findingId: finding.id, action }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Could not save the review decision.");
      setNotice(ar ? "تم حفظ قرار مراجعة الأثر." : "Impact review decision saved.");
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save the review decision.");
      await load(true);
    } finally { setBusyId(""); }
  }
  const statusLabel = (value: string) => labels[value]?.[ar ? "ar" : "en"] ?? value;
  const pendingCount = jobs.reduce((sum, job) => sum + job.findings.filter((item) => item.status === "pending").length, 0);
  if (loading) return <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{ar ? "تحميل سجل التغييرات..." : "Loading change history..."}</div>;
  return (
    <section dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{ar ? "النتائج المقترحة لا تغيّر حالة المتطلبات المعتمدة تلقائيًا؛ قرار المراجعة مطلوب." : "Suggested findings never change approved requirements automatically; an explicit review decision is required."}</p>
        <div className="flex items-center gap-2"><Badge variant="outline">{ar ? pendingCount + " للمراجعة" : pendingCount + " pending"}</Badge>
          <Button size="sm" variant="outline" disabled={refreshing} onClick={() => void load(true)}><RefreshCw className={"mr-1.5 h-3.5 w-3.5 " + (refreshing ? "animate-spin" : "")} />{ar ? "تحديث" : "Refresh"}</Button>
        </div>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void submitSignal(); }} className="grid gap-2 rounded-lg border border-border/60 bg-background/50 p-3 sm:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-xs text-muted-foreground">{ar ? "إشارة تغيير يدوية" : "Manual change signal"}
          <textarea value={signal} onChange={(event) => setSignal(event.target.value.slice(0, 2000))} maxLength={2000} rows={2} required placeholder={ar ? "صف التغيير الذي قد يؤثر على المتطلبات..." : "Describe a change that may affect requirements..."} className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </label>
        <Button type="submit" disabled={submitting || !signal.trim()} className="self-end">{submitting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}{ar ? "إضافة للتحليل" : "Queue analysis"}</Button>
      </form>
      {error ? <p role="alert" className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded border border-primary/30 bg-primary/5 p-2 text-xs text-primary">{notice}</p> : null}
      {!jobs.length ? <p className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">{ar ? "لا توجد أحداث تغيير بعد. ستظهر هنا أحداث GitHub وJira أو الإشارات اليدوية بعد إضافتها." : "No change events yet. GitHub/Jira deliveries and manual change signals will appear here."}</p> : null}
      {jobs.map((job) => (
        <article key={job.id} className="rounded-lg border border-border/70 bg-background/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Badge variant="outline">{statusLabel(job.status)}</Badge><span className="font-mono text-[10px] text-muted-foreground">{job.source.toUpperCase()} · {job.attempts}/{job.maxAttempts}</span><span className="text-[10px] text-muted-foreground">{new Date(job.createdAt).toLocaleString()}</span></div>
            {job.tracker?.externalUrl ? <a href={job.tracker.externalUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">{job.tracker.title || job.tracker.externalKey}</a> : null}
          </div>
          <p dir="auto" className="mt-2 text-sm leading-relaxed">{job.signal}</p>
          {job.summary ? <p dir="auto" className="mt-2 rounded bg-secondary/40 p-2 text-xs leading-relaxed">{job.summary}</p> : null}
          {job.lastError ? <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" />{job.lastError}</p> : null}
          {job.findings.length ? <div className="mt-3 space-y-2">{job.findings.map((finding) => (
            <div key={finding.id} className="rounded border border-border/60 p-2.5">
              <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-primary">{finding.requirementRef}</span><Badge variant="outline">{statusLabel(finding.status)}</Badge>
                {finding.requirement ? <span className="text-[10px] text-muted-foreground">{finding.requirement.priority} · {finding.requirement.verifyStatus} · {finding.requirement.driftStatus}</span> : null}
              </div>
              <p dir="auto" className="mt-1 text-xs leading-relaxed">{finding.note}</p>
              {finding.requirement ? <p dir="auto" className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{finding.requirement.text}</p> : null}
              {finding.status === "pending" || finding.status === "confirmed" ? <div className="mt-2 flex flex-wrap gap-2">
                {finding.status === "pending" ? <Button size="sm" variant="outline" disabled={!!busyId} onClick={() => void review(finding, "confirm")}><ShieldCheck className="mr-1 h-3 w-3" />{ar ? "تأكيد" : "Confirm"}</Button> : null}
                <Button size="sm" variant="outline" disabled={!!busyId} onClick={() => void review(finding, "dismiss")}><X className="mr-1 h-3 w-3" />{ar ? "استبعاد" : "Dismiss"}</Button>
                <Button size="sm" variant="outline" disabled={!!busyId} onClick={() => void review(finding, "resolve")}><Check className="mr-1 h-3 w-3" />{ar ? "تمت المعالجة" : "Resolve"}</Button>
                {busyId === finding.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              </div> : null}
            </div>
          ))}</div> : job.status === "completed" ? <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><CircleDot className="h-3 w-3" />{ar ? "لم يُكتشف متطلب متأثر في هذا الحدث." : "No impacted requirement was identified for this event."}</p> : null}
        </article>
      ))}
    </section>
  );
}
