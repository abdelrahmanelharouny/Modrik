"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpenCheck, Check, Filter, RefreshCw, ShieldAlert, X } from "lucide-react";

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
  origin: string;
  updatedAt: string | null;
};
type Capabilities = { canReview: boolean; canApprove: boolean };

export function OrganizationKnowledgeReviewManager() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities>({ canReview: false, canApprove: false });
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [applied, setApplied] = useState({ query: "", kind: "" });
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ view: "review_queue", limit: "100" });
      if (applied.query) params.set("q", applied.query);
      if (applied.kind) params.set("kind", applied.kind);
      const response = await fetch("/api/organizations/knowledge-memory?" + params.toString(), {
        cache: "no-store", credentials: "same-origin",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403) throw new Error("Your organization role does not include knowledge review access.");
        throw new Error(payload.error || "Unable to load the review queue.");
      }
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setCapabilities(payload.capabilities ?? { canReview: false, canApprove: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the review queue.");
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => { void load(); }, [load]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied({ query: query.trim(), kind });
  }

  async function decide(item: ReviewItem, action: "approve" | "reject") {
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
      setNotice(action === "approve" ? "Knowledge approved and added to accepted organization memory." : "Knowledge rejected. The decision was recorded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The governance decision could not be saved.");
      await load();
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-10 text-foreground sm:px-6">
      <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <Link href="/" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"><ArrowLeft className="h-4 w-4" /> Mission Control</Link>
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-primary">Workspace governance</p>
          <h1 className="mt-2 flex items-center gap-3 text-3xl font-semibold"><BookOpenCheck className="h-7 w-7 text-primary" /> Knowledge review queue</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Review proposed organization knowledge before it becomes trusted shared memory. Every decision is permission-checked and recorded in the organization audit stream.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || !!busyId} className="inline-flex h-10 items-center gap-2 self-start rounded-lg border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-border px-3 py-1.5 text-muted-foreground">Review permission: {capabilities.canReview ? "enabled" : "not assigned"}</span>
        <span className="rounded-full border border-border px-3 py-1.5 text-muted-foreground">Approval permission: {capabilities.canApprove ? "enabled" : "not assigned"}</span>
      </div>

      <form onSubmit={applyFilters} className="mb-6 grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-[1fr_190px_auto]">
        <label className="grid gap-1.5 text-sm"><span className="text-muted-foreground">Search knowledge</span><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={120} placeholder="Search title or description" className="h-10 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
        <label className="grid gap-1.5 text-sm"><span className="text-muted-foreground">Knowledge type</span><select value={kind} onChange={(event) => setKind(event.target.value)} className="h-10 rounded-lg border border-border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"><option value="">All types</option>{["stakeholder","goal","assumption","constraint","decision","risk","metric","system","domain_concept","process","policy"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
        <button type="submit" disabled={loading} className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"><Filter className="h-4 w-4" /> Apply</button>
      </form>

      {error ? <p role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">{notice}</p> : null}

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">Pending decisions</h2><p className="mt-1 text-xs text-muted-foreground">{items.length} items loaded · oldest submitted first</p></div><span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">Organization scope</span></div>
        {loading ? <p className="p-6 text-sm text-muted-foreground">Loading review queue…</p> : items.length === 0 ? <div className="p-10 text-center"><BookOpenCheck className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">Review queue is clear</p><p className="mt-1 text-sm text-muted-foreground">New knowledge submissions will appear here when they are ready for review.</p></div> : (
          <div className="divide-y divide-border">{items.map((item) => (
            <article key={item.id} className="p-5">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div className="min-w-0"><div className="mb-1 flex flex-wrap items-center gap-2"><span className="rounded-md bg-secondary px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">{item.kind.replaceAll("_", " ")}</span><span className="font-mono text-[11px] text-muted-foreground">{item.nodeRef}</span></div><h3 className="text-base font-semibold">{item.label}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{item.description || "No description supplied."}</p></div><div className="shrink-0 text-right text-xs text-muted-foreground"><p>{item.projectName || "Project"}</p><p className="mt-1 font-mono">{item.projectId}</p><p className="mt-1">{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "Date unavailable"}</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="grid gap-1.5 text-xs text-muted-foreground">Decision rationale <span className="text-[11px]">Optional · up to 500 characters</span><textarea value={reasons[item.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value.slice(0, 500) }))} rows={2} maxLength={500} placeholder="Explain why this should be accepted or rejected…" className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary" /></label>
                <div className="flex flex-wrap gap-2">
                  {capabilities.canReview ? <button type="button" disabled={!!busyId} onClick={() => void decide(item, "reject")} className="inline-flex h-10 items-center gap-2 rounded-lg border border-destructive/40 px-3 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"><X className="h-4 w-4" /> Reject</button> : null}
                  {capabilities.canApprove ? <button type="button" disabled={!!busyId} onClick={() => void decide(item, "approve")} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"><Check className="h-4 w-4" /> Approve</button> : null}
                  {busyId === item.id ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" /> Saving</span> : null}
                </div>
              </div>
            </article>
          ))}</div>
        )}
      </section>
      <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> Review and approval are separate permissions. A rejected item remains out of accepted memory; approval is the only transition that promotes an item into shared retrieval.</p>
    </main>
  );
}
