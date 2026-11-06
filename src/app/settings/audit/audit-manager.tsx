"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Filter, RefreshCw } from "lucide-react";
import { useLang } from "@/lib/i18n";

type AuditEvent = {
  id: string; eventType: string; resourceType: string; resourceId: string;
  projectId: string | null; summary: string; metadata: Record<string, unknown>;
  actor: { id: string; displayName: string } | null; createdAt: string | null;
};
type AuditPage = { limit: number; hasMore: boolean; nextCursor: string | null };

export function OrganizationAuditManager() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [items, setItems] = useState<AuditEvent[]>([]);
  const [page, setPage] = useState<AuditPage | null>(null);
  const [eventType, setEventType] = useState("");
  const [projectId, setProjectId] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [applied, setApplied] = useState({ eventType: "", projectId: "", actorUserId: "" });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (cursor?: string, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (applied.eventType) params.set("eventType", applied.eventType);
      if (applied.projectId) params.set("projectId", applied.projectId);
      if (applied.actorUserId) params.set("actorUserId", applied.actorUserId);
      if (cursor) params.set("cursor", cursor);
      const response = await fetch("/api/organizations/audit?" + params.toString(), { cache: "no-store", credentials: "same-origin" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403) throw new Error("Your organization role does not include audit access.");
        throw new Error(payload.error || "Unable to load the organization audit stream.");
      }
      const incoming = Array.isArray(payload.items) ? payload.items as AuditEvent[] : [];
      setItems((current) => append ? [...current, ...incoming.filter((item) => !current.some((old) => old.id === item.id))] : incoming);
      setPage(payload.page ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the organization audit stream.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [applied]);

  useEffect(() => { void load(); }, [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied({ eventType: eventType.trim(), projectId: projectId.trim(), actorUserId: actorUserId.trim() });
  }

  return (
    <main dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10 text-foreground sm:px-6">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"><ArrowLeft className="h-4 w-4" /> {ar ? "لوحة التحكم" : "Mission Control"}</Link>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">{ar ? "حوكمة مساحة العمل" : "Workspace governance"}</p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold"><ClipboardList className="h-7 w-7 text-primary" /> {ar ? "تدقيق المؤسسة" : "Organization audit"}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{ar ? "سجل زمني لأنشطة الحوكمة داخل المؤسسة. يخضع الوصول إلى صلاحية التدقيق." : "A chronological, organization-scoped record of governance activity. Access is controlled by the audit permission."}</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || loadingMore} className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <form onSubmit={applyFilters} className="mb-6 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <label className="grid gap-1.5 text-sm"><span className="text-muted-foreground">{ar ? "نوع الحدث" : "Event type"}</span><input value={eventType} onChange={(e) => setEventType(e.target.value)} maxLength={128} placeholder="knowledge_memory.approve" className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
        <label className="grid gap-1.5 text-sm"><span className="text-muted-foreground">{ar ? "معرّف المشروع" : "Project ID"}</span><input value={projectId} onChange={(e) => setProjectId(e.target.value)} maxLength={128} placeholder={ar ? "تصفية حسب المشروع" : "Filter by project"} className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
        <label className="grid gap-1.5 text-sm"><span className="text-muted-foreground">{ar ? "معرّف المستخدم المنفذ" : "Actor user ID"}</span><input value={actorUserId} onChange={(e) => setActorUserId(e.target.value)} maxLength={128} placeholder={ar ? "تصفية حسب المستخدم" : "Filter by actor"} className="h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
        <button type="submit" disabled={loading} className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"><Filter className="h-4 w-4" />{ar ? "تطبيق" : "Apply"}</button>
      </form>

      {error ? <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{ar && error === "Your organization role does not include audit access." ? "دورك في المؤسسة لا يتيح الوصول إلى سجل التدقيق." : error}</p> : null}
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">{ar ? "سجل النشاط" : "Activity history"}</h2><p className="mt-1 text-xs text-muted-foreground">{ar ? `${items.length} حدثًا محملًا · الأحدث أولًا` : `${items.length} events loaded · newest first`}</p></div><span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">{ar ? "نطاق المؤسسة" : "Organization scope"}</span></div>
        {loading ? <p className="p-6 text-sm text-muted-foreground">{ar ? "جارٍ تحميل أحداث التدقيق…" : "Loading audit events…"}</p> : items.length === 0 ? <div className="p-10 text-center"><ClipboardList className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">{ar ? "لا توجد أحداث تدقيق" : "No audit events found"}</p><p className="mt-1 text-sm text-muted-foreground">{ar ? "ستظهر أنشطة الحوكمة هنا عند تسجيل أحداث المؤسسة." : "Governance activity will appear here when organization events are recorded."}</p></div> : (
          <div className="divide-y divide-border">{items.map((item) => (
            <article key={item.id} className="px-5 py-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div className="min-w-0"><p className="text-sm font-medium">{item.summary || item.eventType}</p><p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{item.eventType} · {item.resourceType}:{item.resourceId}</p></div><time className="shrink-0 text-xs text-muted-foreground" dateTime={item.createdAt ?? undefined}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : (ar ? "الوقت غير متاح" : "Time unavailable")}</time></div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{ar ? "المنفذ:" : "Actor:"} {item.actor?.displayName || item.actor?.id || (ar ? "النظام" : "System")}</span>{item.projectId ? <span>{ar ? "المشروع:" : "Project:"} <span className="font-mono">{item.projectId}</span></span> : null}<span>{ar ? "معرّف الحدث:" : "Event ID:"} <span className="font-mono">{item.id}</span></span></div>
              {Object.keys(item.metadata ?? {}).length ? <details className="mt-3 rounded-lg border border-border bg-background/60 px-3 py-2"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">{ar ? "تفاصيل الحدث" : "Event details"}</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{JSON.stringify(item.metadata, null, 2)}</pre></details> : null}
            </article>
          ))}</div>
        )}
        {!loading && page?.hasMore ? <div className="border-t border-border p-4 text-center"><button type="button" disabled={loadingMore} onClick={() => page.nextCursor && void load(page.nextCursor, true)} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm hover:bg-secondary disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loadingMore ? "animate-spin" : ""}`} /> {loadingMore ? (ar ? "جارٍ التحميل…" : "Loading…") : (ar ? "تحميل أحداث أقدم" : "Load older events")}</button></div> : null}
      </section>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">{ar ? "سجلات التدقيق محصورة في مؤسستك النشطة. لا تعرض هذه الشاشة بيانات المصادقة الحساسة أو عناوين البريد الإلكتروني للمنفذين." : "Audit records are scoped to your active organization. Sensitive authentication data and actor email addresses are not exposed in this view."}</p>
    </main>
  );
}
