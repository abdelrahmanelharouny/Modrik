"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { createOfflineEvidenceMutationOperation } from "@/lib/evidence/offline-queue.mjs";
import type { EvidenceDTO } from "@/lib/rp";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { History, Pencil, X, Save, ShieldCheck, ShieldAlert } from "lucide-react";

export function EvidenceRevisionPanel({
  projectId,
  evidence,
  onSaved,
  onQueueOffline,
}: {
  projectId: string;
  evidence: EvidenceDTO;
  onSaved: () => Promise<void>;
  onQueueOffline?: (operation: ReturnType<typeof createOfflineEvidenceMutationOperation>) => Promise<void>;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState(evidence.title);
  const [content, setContent] = useState(evidence.content);
  const [language, setLanguage] = useState(evidence.language);
  const [consent, setConsent] = useState(evidence.consent);
  const [changeNote, setChangeNote] = useState("");
  const pendingOperationRef = useRef<{ fingerprint: string; id: string } | null>(null);

  const save = async () => {
    setBusy(true);
    try {
      const expectedRevisionVersion = evidence.revisions?.[0]?.version ?? 0;
      const requestFingerprint = JSON.stringify({ evidenceId: evidence.id, expectedRevisionVersion, title, content, language, consent, changeNote });
      if (!pendingOperationRef.current || pendingOperationRef.current.fingerprint !== requestFingerprint) {
        pendingOperationRef.current = { fingerprint: requestFingerprint, id: crypto.randomUUID() };
      }
      const clientOperationId = pendingOperationRef.current.id;
      const expectedRevisionVersion = evidence.revisions?.[0]?.version ?? 0;
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (!onQueueOffline) throw new Error("Offline editing queue is unavailable");
        await onQueueOffline(createOfflineEvidenceMutationOperation(projectId, "update", evidence.id, expectedRevisionVersion, { title, content, sourceType: evidence.sourceType, language, consent }, clientOperationId, changeNote));
        pendingOperationRef.current = null;
        setEditing(false);
        toast({ title: "Revision queued", description: "Your edit is stored locally and will sync in order after reconnecting. The expected revision is pinned." });
        return;
      }
      const result = await api<{ revision: number }>(`/api/projects/${projectId}/evidence`, {
        method: "PATCH",
        body: JSON.stringify({
          evidenceId: evidence.id,
          expectedRevisionVersion,
          title,
          content,
          language,
          consent,
          changeNote,
          clientOperationId,
        }),
      });
      pendingOperationRef.current = null;
      await onSaved();
      setEditing(false);
      setChangeNote("");
      toast({
        title: "Evidence revision saved",
        description: `Version ${result.revision} is now current. Previous versions remain available below.`,
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes("changed in another session")) {
        // Refresh the server snapshot/version but keep the unsaved local form values.
        await onSaved();
        toast({
          title: "Newer evidence version found",
          description: "Your draft is still here. Compare it with the refreshed history, then save again to create the next revision.",
          variant: "destructive",
        });
      } else if (error instanceof TypeError && onQueueOffline) {
        try {
          await onQueueOffline(createOfflineEvidenceMutationOperation(projectId, "update", evidence.id, evidence.revisions?.[0]?.version ?? 0, { title, content, sourceType: evidence.sourceType, language, consent }, pendingOperationRef.current?.id ?? crypto.randomUUID(), changeNote));
          pendingOperationRef.current = null;
          setEditing(false);
          toast({ title: "Revision queued", description: "Connection interrupted; the operation ID is preserved for safe retry." });
        } catch (queueError) { toast({ title: "Could not preserve revision offline", description: (queueError as Error).message, variant: "destructive" }); }
      } else {
        toast({ title: "Could not save evidence", description: message, variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 border-t border-border/60 pt-3">
      {editing ? (
        <div className="space-y-3 rounded-md border border-aura/30 bg-aura/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold">Create a new evidence revision</p>
            <span className="font-mono text-[10px] text-muted-foreground">current v{evidence.revisions?.[0]?.version ?? 1}</span>
          </div>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} aria-label="Evidence title" />
          <Textarea value={content} onChange={(event) => { const next = event.target.value; setContent(next); if (next !== evidence.content) setConsent(false); }} rows={6} maxLength={8000} dir="auto" aria-label="Evidence content" />
          <Input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} maxLength={500} placeholder="Why is this source changing? (optional)" aria-label="Revision note" />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            I explicitly confirm permission to process this revision with the configured AI provider
          </label>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}><X className="mr-1 h-3.5 w-3.5" /> Cancel</Button>
            <Button size="sm" onClick={save} disabled={busy || !title.trim() || !content.trim()}><Save className="mr-1 h-3.5 w-3.5" /> {busy ? "Saving…" : "Save revision"}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <History className="h-3.5 w-3.5" />
            <span>{evidence.revisions?.length ?? 0} revision snapshot(s)</span>
            <span>·</span>
            <span>SHA-256 provenance</span>
            {evidence.consent ? <ShieldCheck className="h-3.5 w-3.5 text-verify" aria-label="AI processing permission recorded" /> : <ShieldAlert className="h-3.5 w-3.5 text-signal" aria-label="AI processing permission not recorded" />}
          </div>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit source
          </Button>
        </div>
      )}
      {!!evidence.revisions?.length && (
        <details className="mt-2 rounded-md bg-secondary/20 px-3 py-2">
          <summary className="cursor-pointer text-[10px] font-mono text-muted-foreground">REVISION HISTORY · {evidence.revisions.length} MOST RECENT</summary>
          <ol className="mt-2 space-y-2">
            {evidence.revisions.map((revision) => (
              <li key={revision.id} className="border-l-2 border-border pl-3">
                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                  <span className="font-mono font-semibold text-aura">v{revision.version}</span>
                  <time dateTime={revision.createdAt} className="text-muted-foreground">{new Date(revision.createdAt).toLocaleString()}</time>
                  <span className="text-muted-foreground">· {revision.createdBy}</span>
                </div>
                <p className="mt-0.5 text-xs text-foreground/80">{revision.changeNote || "No change note"}</p>
                <p className="mt-0.5 break-all font-mono text-[9px] text-muted-foreground">SHA-256 {revision.contentHash.slice(0, 24)}…</p>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10px] text-aura">View preserved source snapshot</summary>
                  <p className="mt-2 whitespace-pre-wrap rounded bg-background/50 p-2 text-xs leading-relaxed" dir="auto">{revision.content}</p>
                </details>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
