"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { Archive, ArrowLeft, BookOpenCheck, Check, Filter, RefreshCw, ShieldAlert, X } from "lucide-react";
import { useLang } from "@/lib/i18n";

type ReviewItem = {
  id: string;
  projectId: string;
  projectName: string | null;
  nodeRef: string;
  kind: string;
  label: string;
  description: string;
  confidence: number | null;
  owner: string | null;
  origin?: string;
  retrieval?: { mode: string; score: number };
  updatedAt: string | null;
};
type Capabilities = { canReview: boolean; canApprove: boolean };

const KNOWLEDGE_KIND_AR: Record<string, string> = {
  stakeholder: "صاحب مصلحة", goal: "هدف", assumption: "افتراض", constraint: "قيد", decision: "قرار",
  risk: "مخاطر", metric: "مقياس", system: "نظام", domain_concept: "مفهوم نطاق", process: "عملية", policy: "سياسة",
};

export function OrganizationKnowledgeReviewManager() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [view, setView] = useState<"review_queue" | "accepted" | "archived">("review_queue");
  const [capabilities, setCapabilities] = useState<Capabilities>({ canReview: false, canApprove: false });
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [applied, setApplied] = useState({ query: "", kind: "" });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [candidatesScanned, setCandidatesScanned] = useState(0);
  const [candidatePages, setCandidatePages] = useState(0);
  const [candidatePasses, setCandidatePasses] = useState(0);
  const [retrievalDurationMs, setRetrievalDurationMs] = useState(0);
  const [retrievalMode, setRetrievalMode] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const translateMessage = (message: string) => {
    if (!ar) return message;
    const messages: Record<string, string> = {
      "Your organization role does not include knowledge read access.": "دورك في المؤسسة لا يتيح قراءة المعرفة المشتركة.",
      "Your organization role does not include knowledge review access.": "دورك في المؤسسة لا يتيح مراجعة المعرفة.",
      "Unable to load the review queue.": "تعذر تحميل قائمة المراجعة.",
      "This item changed while you were reviewing it. The queue has been refreshed.": "تغير هذا العنصر أثناء مراجعته. تم تحديث قائمة المراجعة.",
      "The governance decision could not be saved.": "تعذر حفظ قرار الحوكمة.",
      "Knowledge approved and added to accepted organization memory.": "تم اعتماد المعرفة وإضافتها إلى الذاكرة المؤسسية.",
      "Knowledge rejected. The decision was recorded.": "تم رفض المعرفة وتسجيل القرار.",
      "Knowledge archived. It is no longer included in shared retrieval.": "تمت أرشفة المعرفة وإخراجها من الاسترجاع المشترك.",
    };
    return messages[message] ?? message;
  };

  const load = useCallback(async (cursor?: string, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ view, limit: "100" });
      if (cursor) params.set("cursor", cursor);
      if (applied.query) params.set("q", applied.query);
      if (applied.kind) params.set("kind", applied.kind);
      const response = await fetch("/api/organizations/knowledge-memory?" + params.toString(), {
        cache: "no-store", credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403) throw new Error(view === "accepted" ? "Your organization role does not include knowledge read access." : "Your organization role does not include knowledge review access.");
        throw new Error(payload.error || "Unable to load the review queue.");
      }
      const receivedItems = Array.isArray(payload.items) ? payload.items : [];
      setItems((current) => append ? [...current, ...receivedItems] : receivedItems);
      setNextCursor(typeof payload.pagination?.nextCursor === "string" ? payload.pagination.nextCursor : null);
      setHasMore(payload.pagination?.hasMore === true);
      setCandidatesScanned(Number.isSafeInteger(payload.candidatesScanned) ? payload.candidatesScanned : 0);
      setCandidatePages(Number.isSafeInteger(payload.candidatePages) ? payload.candidatePages : 0);
      setCandidatePasses(Number.isSafeInteger(payload.candidatePasses) ? payload.candidatePasses : 0);
      setRetrievalDurationMs(Number.isFinite(payload.retrievalDurationMs) ? payload.retrievalDurationMs : 0);
      setRetrievalMode(typeof payload.retrievalMode === "string" ? payload.retrievalMode : "");
      setCapabilities(payload.capabilities ?? { canReview: false, canApprove: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the review queue.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [applied, view]);

  useEffect(() => { setNextCursor(null); setHasMore(false); void load(); }, [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied({ query: query.trim(), kind });
  }

  async function decide(item: ReviewItem, action: "approve" | "reject" | "archive") {
    setBusyId(item.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/organizations/knowledge-memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ nodeId: item.id, action, reason: reasons[item.id] ?? "" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) throw new Error("This item changed while you were reviewing it. The queue has been refreshed.");
        throw new Error(payload.error || "The governance decision could not be saved.");
      }
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setReasons((current) => { const next = { ...current }; delete next[item.id]; return next; });
      setNotice(action === "approve" ? "Knowledge approved and added to accepted organization memory." : action === "archive" ? "Knowledge archived. It is no longer included in shared retrieval." : "Knowledge rejected. The decision was recorded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The governance decision could not be saved.");
      await load();
    } finally {
      setBusyId("");
    }
  }

  return (
    <main dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10 text-foreground sm:px-6">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"><ArrowLeft className="h-4 w-4" /> {ar ? "لوحة التحكم" : "Mission Control"}</Link>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">{ar ? "حوكمة مساحة العمل" : "Workspace governance"}</p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold"><BookOpenCheck className="h-7 w-7 text-primary" /> {ar ? "معرفة المؤسسة" : "Organization knowledge"}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{ar ? "استكشف المعرفة الموثوقة المشتركة بين مشروعات المؤسسة، أو راجع الإضافات قبل اعتمادها في الذاكرة المؤسسية." : "Explore trusted knowledge shared across active organization projects, or review submissions before they enter the accepted memory."}</p>
        </div>
        <button type="button" onClick={() => { setNextCursor(null); setHasMore(false); void load(); }} disabled={loading || loadingMore || !!busyId} className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {ar ? "تحديث" : "Refresh"}
        </button>
      </div>

      <div role="tablist" aria-label={ar ? "طرق عرض المعرفة" : "Knowledge views"} className="mb-5 flex flex-wrap gap-2 border-b border-border">
        <button type="button" role="tab" aria-selected={view === "accepted"} onClick={() => setView("accepted")} className={`border-b-2 px-4 py-3 text-sm font-medium transition ${view === "accepted" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{ar ? "الذاكرة الموثوقة" : "Trusted memory"}</button>
        <button type="button" role="tab" aria-selected={view === "review_queue"} onClick={() => setView("review_queue")} className={`border-b-2 px-4 py-3 text-sm font-medium transition ${view === "review_queue" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{ar ? "قائمة المراجعة" : "Review queue"}</button>
        {capabilities.canApprove ? <button type="button" role="tab" aria-selected={view === "archived"} onClick={() => setView("archived")} className={`border-b-2 px-4 py-3 text-sm font-medium transition ${view === "archived" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{ar ? "الأرشيف" : "Archive"}</button> : null}
      </div>

      {view !== "archived" ? <div className="mb-5 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-3 py-1.5 text-muted-foreground">{ar ? "صلاحية المراجعة:" : "Review permission:"} {capabilities.canReview ? (ar ? "مفعلة" : "enabled") : (ar ? "غير ممنوحة" : "not assigned")}</span>
        <span className="rounded-full border border-border px-3 py-1.5 text-muted-foreground">{ar ? "صلاحية الاعتماد:" : "Approval permission:"} {capabilities.canApprove ? (ar ? "مفعلة" : "enabled") : (ar ? "غير ممنوحة" : "not assigned")}</span>
      </div> : null}

      <form onSubmit={applyFilters} className="mb-6 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[1fr_190px_auto]">
        <label className="grid gap-1.5 text-sm"><span className="text-muted-foreground">{ar ? "البحث في المعرفة" : "Search knowledge"}</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder={ar ? "ابحث بالعنوان أو الوصف" : "Search title or description"} className="h-10 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
        <label className="grid gap-1.5 text-sm"><span className="text-muted-foreground">{ar ? "نوع المعرفة" : "Knowledge type"}</span><select value={kind} onChange={(event) => setKind(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"><option value="">{ar ? "كل الأنواع" : "All types"}</option>{["stakeholder","goal","assumption","constraint","decision","risk","metric","system","domain_concept","process","policy"].map((value) => <option key={value} value={value}>{ar ? KNOWLEDGE_KIND_AR[value] ?? value.replaceAll("_", " ") : value.replaceAll("_", " ")}</option>)}</select></label>
        <button type="submit" disabled={loading} className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"><Filter className="h-4 w-4" />{ar ? "تطبيق" : "Apply"}</button>
      </form>

      {error ? <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{translateMessage(error)}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">{translateMessage(notice)}</p> : null}
      {view === "accepted" && retrievalMode === "streaming_bm25_keyset" ? <p role="status" className="mb-4 text-xs text-muted-foreground">{ar ? `تم فحص ${candidatesScanned.toLocaleString()} سجل معرفة مصرح به عبر ${candidatePages.toLocaleString()} صفحة قاعدة بيانات و${candidatePasses} تمريرة BM25 خلال ${retrievalDurationMs.toLocaleString()} مللي ثانية. تشمل النتائج المطابقات الأقدم وترتب عالميًا داخل نطاق مؤسستك.` : `Search evaluated ${candidatesScanned.toLocaleString()} authorized knowledge records across ${candidatePages.toLocaleString()} database pages and ${candidatePasses} BM25 passes in ${retrievalDurationMs.toLocaleString()} ms. Older matching records are included; results are ranked globally within your organization scope.`}</p> : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">{view === "accepted" ? (ar ? "معرفة المؤسسة الموثوقة" : "Trusted organization knowledge") : view === "archived" ? (ar ? "المعرفة المؤرشفة" : "Archived knowledge") : (ar ? "قرارات معلقة" : "Pending decisions")}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? `${items.length} عنصر محمل · ${view === "accepted" ? "المعرفة المعتمدة، الأحدث تحديثًا أولًا" : "الأقدم تقديمًا أولًا"}` : `${items.length} items loaded · ${view === "accepted" ? "approved knowledge, newest updated first" : view === "archived" ? "archived knowledge, newest updated first" : "oldest submitted first"}`}</p></div><span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">Organization scope</span></div>
        {loading ? <p className="p-6 text-sm text-muted-foreground">{ar ? `جارٍ تحميل ${view === "accepted" ? "الذاكرة الموثوقة" : "قائمة المراجعة"}…` : `Loading ${view === "accepted" ? "trusted memory" : "review queue"}…`}</p> : items.length === 0 ? <div className="p-10 text-center"><BookOpenCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">{view === "accepted" ? (ar ? "لا توجد معرفة موثوقة بعد" : "No trusted knowledge yet") : view === "archived" ? (ar ? "الأرشيف فارغ" : "Archive is empty") : (ar ? "قائمة المراجعة فارغة" : "Review queue is clear")}</p><p className="mt-1 text-sm text-muted-foreground">{view === "accepted" ? (ar ? "ستظهر هنا المعرفة التي يعتمدها مسؤول المؤسسة." : "Knowledge approved by an organization approver will appear here.") : view === "archived" ? (ar ? "تظهر هنا العناصر المؤرشفة مع الاحتفاظ بسجلها." : "Archived items remain visible here with their audit history.") : (ar ? "ستظهر هنا إضافات المعرفة الجديدة عندما تصبح جاهزة للمراجعة." : "New knowledge submissions will appear here when they are ready for review.")}</p></div> : (
          <div className="divide-y divide-border">{items.map((item) => (
            <article key={item.id} className="p-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><span className="rounded-md bg-secondary px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">{ar ? KNOWLEDGE_KIND_AR[item.kind] ?? item.kind.replaceAll("_", " ") : item.kind.replaceAll("_", " ")}</span><span className="font-mono text-[11px] text-muted-foreground">{item.nodeRef}</span>{view === "accepted" && item.retrieval ? <span className="rounded border border-primary/30 px-1.5 py-0.5 font-mono text-[9px] text-primary">{item.retrieval.mode.toUpperCase()} {item.retrieval.score.toFixed(3)}</span> : null}</div><h3 className="text-base font-semibold">{item.label}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description || (ar ? "لم يتم تقديم وصف." : "No description supplied.")}</p></div><div className="shrink-0 text-start text-xs text-muted-foreground"><p>{item.projectName || (ar ? "مشروع" : "Project")}</p><p className="mt-1 font-mono">{item.projectId}</p><p className="mt-1">{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : (ar ? "التاريخ غير متاح" : "Date unavailable")}</p></div></div>
              {view === "review_queue" ? <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="grid gap-1.5 text-xs text-muted-foreground">{ar ? "مبررات القرار" : "Decision rationale"} <span className="text-[11px]">{ar ? "اختياري · حتى 500 حرف" : "Optional · up to 500 characters"}</span><textarea value={reasons[item.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value.slice(0, 500) }))} rows={2} maxLength={500} placeholder={ar ? "اشرح سبب قبول هذا العنصر أو رفضه…" : "Explain why this should be accepted or rejected…"} className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
                <div className="flex flex-wrap gap-2">
                  {capabilities.canReview ? <button type="button" disabled={!!busyId} onClick={() => void decide(item, "reject")} className="inline-flex h-10 items-center gap-2 rounded-lg border border-destructive/40 px-3 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"><X className="h-4 w-4" />{ar ? "رفض" : "Reject"}</button> : null}
                  {capabilities.canApprove ? <button type="button" disabled={!!busyId} onClick={() => void decide(item, "approve")} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"><Check className="h-4 w-4" />{ar ? "اعتماد" : "Approve"}</button> : null}
                  {busyId === item.id ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" /> {ar ? "جارٍ الحفظ" : "Saving"}</span> : null}
                </div>
              </div> : view === "accepted" && capabilities.canApprove ? <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><label className="grid gap-1.5 text-xs text-muted-foreground">{ar ? "سبب الأرشفة" : "Archive rationale"}<span className="text-[11px]">{ar ? "اختياري · حتى 500 حرف" : "Optional · up to 500 characters"}</span><textarea value={reasons[item.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value.slice(0, 500) }))} rows={2} maxLength={500} placeholder={ar ? "لماذا يجب إخراج هذه المعرفة من الذاكرة النشطة؟" : "Why should this knowledge leave active memory?"} className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label><button type="button" disabled={!!busyId} onClick={() => void decide(item, "archive")} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50"><Archive className="h-4 w-4" />{ar ? "أرشفة" : "Archive"}</button></div> : <p className="mt-3 text-xs text-muted-foreground">{view === "accepted" ? (ar ? "معرفة مشتركة معتمدة · للقراءة فقط" : "Approved shared knowledge · Read only") : (ar ? "سجل مؤرشف للقراءة فقط" : "Archived record · Read only")}</p>}
            </article>
          ))}</div>
        )}
      </section>
      {!loading && hasMore && nextCursor ? <div className="mt-5 flex justify-center"><button type="button" onClick={() => void load(nextCursor, true)} disabled={loadingMore || !!busyId} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium hover:bg-secondary disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loadingMore ? "animate-spin" : ""}`} /> {loadingMore ? (ar ? "جارٍ تحميل المزيد…" : "Loading more…") : (ar ? "تحميل المزيد" : "Load more")}</button></div> : null}
      {view === "review_queue" ? <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {ar ? "صلاحيتا المراجعة والاعتماد منفصلتان. يظل العنصر المرفوض خارج الذاكرة المعتمدة؛ والاعتماد وحده ينقله إلى الاسترجاع المشترك." : "Review and approval are separate permissions. A rejected item remains out of accepted memory; approval is the only transition that promotes an item into shared retrieval."}</p> : <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {view === "accepted" ? (ar ? "تظل المعرفة المعتمدة نشطة حتى يؤرشفها معتمد مخوّل. الأرشفة لا تحذف سجل القرار." : "Approved knowledge stays active until an authorized approver archives it. Archiving preserves the decision history.") : (ar ? "الأرشيف للقراءة فقط؛ تظل سجلات القرارات محفوظة ولا تدخل العناصر المؤرشفة في الاسترجاع المشترك." : "The archive is read-only. Decision history is retained, and archived items are excluded from shared retrieval.")}</p>}
    </main>
  );
}
