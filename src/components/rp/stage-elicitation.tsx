"use client";

// ─────────────────────────────────────────────────────────────
// PHASE 01 · BRIEFING — Evidence intake + interrogation cockpit.
// New in this build: voice-note capture (MediaRecorder → WAV →
// GLM ASR) and the full uncertainty-gated question flow
// (answer / proceed with recorded assumption / reopen).
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { createOfflineEvidenceOperation, createOfflineEvidenceMutationOperation, rebaseOfflineEvidenceUpdateOperation, listOfflineEvidenceOperations, putOfflineEvidenceOperation, removeOfflineEvidenceOperation, updateOfflineEvidenceOperation, withOfflineEvidenceSyncLock, type OfflineEvidenceOperation } from "@/lib/evidence/offline-queue.mjs";
import { getOfflineEvidenceRetryDelay, offlineEvidenceFailureRequiresReview, shouldDeferOfflineEvidenceSync } from "@/lib/evidence/offline-retry.mjs";
import { createOfflineEvidenceRetryScheduler } from "@/lib/evidence/offline-retry-scheduler.mjs";
import { LANG_LABEL, type ProjectDTO } from "@/lib/rp";
import { EvidenceRevisionPanel } from "@/components/rp/evidence-revision-panel";
import { EvidenceClaimsPanel } from "@/components/rp/evidence-claims-panel";
import { HudPanel, Eyebrow, Chip, Meter, SectionHead, EmptyBay, LiveDot } from "@/components/rp/hud";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Plus,
  Trash2,
  MessageCircleQuestion,
  CheckCircle2,
  Mic,
  Square,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Waves,
  FlaskConical,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PlannerExperimentView {
  experimentId: string;
  seed: string;
  materializedArm: string;
  candidatePoolHash: string;
  candidateCount: number;
  arms: {
    arm: string;
    candidates: number;
    estTokens: number;
    latencyMs: number;
    metrics: {
      avgUtility: number;
      utilityPerCost: number;
      evidenceCoverage: number;
      redundancyRate: number;
      dialectFit: number;
    };
  }[];
}

// ── WAV encoding helpers (16 kHz mono) ───────────────────────
function floatTo16BitPCM(view: DataView, offset: number, input: Float32Array) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
}
function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  floatTo16BitPCM(view, 44, samples);
  return buffer;
}
async function blobToWavBase64(blob: Blob): Promise<string> {
  const ctx = new AudioContext({ sampleRate: 16000 });
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  const mono = decoded.getChannelData(0);
  await ctx.close();
  const wav = encodeWav(mono, decoded.sampleRate);
  let binary = "";
  const bytes = new Uint8Array(wav);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// ── voice note recorder ──────────────────────────────────────
function MicRecorder({ onTranscript, expectedLanguage }: { onTranscript: (text: string) => void; expectedLanguage?: string }) {
  const { toast } = useToast();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setBusy(true);
        try {
          const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
          if (blob.size < 2000) throw new Error("Recording too short");
          const b64 = await blobToWavBase64(blob);
          const data = await api<{ text: string; warning?: string | null }>("/api/transcribe", {
            method: "POST",
            body: JSON.stringify({ audio: b64, expectedLanguage }),
          });
          onTranscript(data.text);
          if (data.warning) {
            toast({ title: "Voice note transcribed — please verify", description: data.warning, variant: "destructive" });
          } else {
            toast({ title: "Voice note transcribed", description: "Review the transcript, edit if needed, then add the source." });
          }
        } catch (e) {
          toast({ title: "Transcription failed", description: (e as Error).message, variant: "destructive" });
        } finally {
          setBusy(false);
        }
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      toast({ title: "Microphone unavailable", description: "Grant mic permission to record a voice note.", variant: "destructive" });
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2">
      {busy ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-aura" />
          <span className="font-mono text-xs text-muted-foreground">transcribing…</span>
        </>
      ) : recording ? (
        <>
          <LiveDot tone="coral" />
          <span className="font-mono text-xs text-coral tabular-nums">{mm}:{ss}</span>
          <Button size="sm" variant="outline" onClick={stop} className="ml-auto border-coral/40 text-coral hover:bg-coral/10">
            <Square className="mr-1.5 h-3 w-3" /> Stop
          </Button>
        </>
      ) : (
        <>
          <Mic className="h-4 w-4 text-aura" />
          <span className="font-mono text-xs text-muted-foreground">voice note</span>
          <Button size="sm" variant="outline" onClick={start} className="ml-auto border-aura/40 text-aura hover:bg-aura/10">
            Record
          </Button>
        </>
      )}
    </div>
  );
}

// ── main stage ───────────────────────────────────────────────
export function ElicitationStage({
  project,
  isCurrent,
  refresh,
}: {
  project: ProjectDTO;
  isCurrent: boolean;
  refresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState("interview");
  const [language, setLanguage] = useState("en");
  const [content, setContent] = useState("");
  const [consent, setConsent] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [experimenting, setExperimenting] = useState(false);
  const [experimentResult, setExperimentResult] = useState<PlannerExperimentView | null>(null);
  const [evidenceQuery, setEvidenceQuery] = useState("");
  const [evidenceTypeFilter, setEvidenceTypeFilter] = useState("all");
  const [pendingOffline, setPendingOffline] = useState<OfflineEvidenceOperation[]>([]);
  const [syncingOffline, setSyncingOffline] = useState(false);
  // Mount + the browser online event can fire close together. Keep one sync
  // worker per mounted project so queue rows are never concurrently acked or
  // have their retry counters overwritten by this component instance.
  const offlineSyncInFlightRef = useRef(false);
  const offlineRetrySchedulerRef = useRef<ReturnType<typeof createOfflineEvidenceRetryScheduler> | null>(null);
  if (!offlineRetrySchedulerRef.current) offlineRetrySchedulerRef.current = createOfflineEvidenceRetryScheduler();
  const deleteOperationIdsRef = useRef(new Map<string, string>());

  const loadOfflineQueue = useCallback(async () => {
    try { setPendingOffline(await listOfflineEvidenceOperations(project.id)); }
    catch (error) { toast({ title: "Offline queue unavailable", description: (error as Error).message, variant: "destructive" }); }
  }, [project.id, toast]);

  const syncOfflineEvidence = useCallback(async (force = false) => {
    if (offlineSyncInFlightRef.current || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    // Lifecycle recovery events must not bypass a scheduled exponential backoff.
    // An explicit user retry may intentionally override the delay.
    const retryPending = offlineRetrySchedulerRef.current?.isPending() ?? false;
    if (shouldDeferOfflineEvidenceSync(retryPending, force)) return;
    if (force) offlineRetrySchedulerRef.current?.cancel();
    offlineSyncInFlightRef.current = true;
    setSyncingOffline(true);
    let changed = false;
    try {
      await withOfflineEvidenceSyncLock(project.id, async (lease) => {
        const operations = await listOfflineEvidenceOperations(project.id);
        for (const operation of operations) {
          try {
            await lease.assertLease();
            const endpoint = `/api/projects/${project.id}/evidence`;
            if (operation.kind === "delete") {
              await api(`${endpoint}?evidenceId=${encodeURIComponent(operation.evidenceId)}&expectedRevisionVersion=${operation.expectedRevisionVersion}&clientOperationId=${operation.operationId}`, { method: "DELETE" });
            } else if (operation.kind === "update") {
              await api(endpoint, { method: "PATCH", body: JSON.stringify({ evidenceId: operation.evidenceId, expectedRevisionVersion: operation.expectedRevisionVersion, ...operation.payload, changeNote: operation.changeNote ?? "", clientOperationId: operation.operationId }) });
            } else {
              await api(endpoint, { method: "POST", body: JSON.stringify({ ...operation.payload, clientOperationId: operation.operationId }) });
            }
            if (await lease.acknowledge(operation)) changed = true;
            else break;
          } catch (error) {
            if ((error as Error & { code?: string }).code === "OFFLINE_SYNC_LEASE_LOST") throw error;
            const message = (error as Error).message;
            const attempts = operation.attempts + 1;
            await lease.recordFailure(operation, {
              ...operation,
              attempts,
              lastError: message.slice(0, 240),
            });
            // Revision/authorization/validation failures need human action.
            // Network and service failures retry with capped exponential backoff.
            const requiresReview = offlineEvidenceFailureRequiresReview(message);
            if (!requiresReview && typeof window !== "undefined" && navigator.onLine) {
              const delay = getOfflineEvidenceRetryDelay(attempts);
              offlineRetrySchedulerRef.current?.schedule(delay, () => {
                void syncOfflineEvidence();
              });
            }
            break;
          }
        }
        await loadOfflineQueue();
      });
      if (changed) await refresh();
    } catch (error) {
      toast({ title: "Could not sync offline evidence", description: (error as Error).message, variant: "destructive" });
    } finally {
      offlineSyncInFlightRef.current = false;
      setSyncingOffline(false);
    }
  }, [project.id, loadOfflineQueue, refresh, toast]);

  useEffect(() => {
    let disposed = false;
    const recover = () => {
      if (disposed || document.visibilityState === "hidden" || !navigator.onLine) return;
      void loadOfflineQueue();
      void syncOfflineEvidence();
    };
    void loadOfflineQueue();
    void syncOfflineEvidence();
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
    window.addEventListener("pageshow", recover);
    document.addEventListener("visibilitychange", recover);
    // A suspended tab may miss its online/focus event; this bounded heartbeat
    // rechecks persisted work without keeping an always-running sync loop.
    const recoveryInterval = window.setInterval(recover, 60_000);
    return () => {
      disposed = true;
      window.removeEventListener("online", recover);
      window.removeEventListener("focus", recover);
      window.removeEventListener("pageshow", recover);
      document.removeEventListener("visibilitychange", recover);
      window.clearInterval(recoveryInterval);
      offlineRetrySchedulerRef.current?.cancel();
    };
  }, [loadOfflineQueue, syncOfflineEvidence]);

  const addEvidence = async () => {
    if (!title.trim() || !content.trim()) return;
    const payload = { title: title.trim(), sourceType, language, content: content.trim(), consent };
    const operationId = crypto.randomUUID();
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const operation = createOfflineEvidenceOperation(project.id, payload, operationId);
        await putOfflineEvidenceOperation(operation);
        await loadOfflineQueue();
        setTitle(""); setContent(""); setConsent(false); setOpen(false);
        toast({ title: "Evidence saved on this device", description: "It is queued privately in this browser and will sync when you reconnect. This browser profile must remain available until sync completes. Local browser storage is not separately encrypted; avoid queuing highly sensitive material on shared devices." });
        return;
      }
      await api(`/api/projects/${project.id}/evidence`, {
        method: "POST",
        body: JSON.stringify({ ...payload, clientOperationId: operationId }),
      });
      setTitle("");
      setContent("");
      setConsent(false);
      setOpen(false);
      await refresh();
      toast({
        title: "Evidence logged",
        description: consent
          ? "This source is eligible for AI analysis."
          : "Stored in the project library, but its content is excluded from AI analysis until permission is recorded.",
      });
    } catch (e) {
      const error = e as Error;
      if (error instanceof TypeError) {
        try {
          await putOfflineEvidenceOperation(createOfflineEvidenceOperation(project.id, payload, operationId));
          await loadOfflineQueue();
          setTitle(""); setContent(""); setConsent(false); setOpen(false);
          toast({ title: "Connection interrupted — evidence queued", description: "The same operation ID will be reused on retry to prevent duplicate sources." });
          return;
        } catch (queueError) {
          toast({ title: "Could not preserve evidence offline", description: (queueError as Error).message, variant: "destructive" });
          return;
        }
      }
      toast({ title: "Could not add evidence", description: error.message, variant: "destructive" });
    }
  };

  const removeEvidence = async (id: string) => {
    const evidence = project.evidences.find((item) => item.id === id);
    if (!evidence) return;
    const expectedRevisionVersion = evidence.revisions?.[0]?.version ?? 0;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      try {
        const operationId = deleteOperationIdsRef.current.get(id) ?? crypto.randomUUID();
        await putOfflineEvidenceOperation(createOfflineEvidenceMutationOperation(project.id, "delete", id, expectedRevisionVersion, undefined, operationId));
        deleteOperationIdsRef.current.set(id, operationId);
        await loadOfflineQueue();
        toast({ title: "Deletion queued", description: "The source will be removed after reconnecting. Its revision is pinned; a conflict will pause the queue for review." });
      } catch (error) { toast({ title: "Could not queue deletion", description: (error as Error).message, variant: "destructive" }); }
      return;
    }
    if (!deleteOperationIdsRef.current.has(id)) deleteOperationIdsRef.current.set(id, crypto.randomUUID());
    const clientOperationId = deleteOperationIdsRef.current.get(id)!;
    try {
      await api(`/api/projects/${project.id}/evidence?evidenceId=${encodeURIComponent(id)}&expectedRevisionVersion=${expectedRevisionVersion}&clientOperationId=${clientOperationId}`, { method: "DELETE" });
      deleteOperationIdsRef.current.delete(id);
      await refresh();
    } catch (e) {
      const message = (e as Error).message;
      if (message.includes("EVIDENCE_REVISION_CONFLICT") || message.includes("changed in another session")) {
        await refresh();
        toast({ title: "Evidence changed before deletion", description: "The source was not removed. The latest revision has been loaded; review it before trying again.", variant: "destructive" });
        return;
      }
      toast({ title: "Could not remove evidence", description: message, variant: "destructive" });
    }
  };

  const saveAnswer = async (itemId: string, answer: string) => {
    try {
      await api(`/api/projects/${project.id}/items`, {
        method: "PATCH",
        body: JSON.stringify({ kind: "question", itemId, data: { answer } }),
      });
      await refresh();
    } catch (e) {
      toast({ title: "Could not save answer", description: (e as Error).message, variant: "destructive" });
    }
  };

  const proceedWithUncertainty = async (itemId: string) => {
    try {
      await api(`/api/projects/${project.id}/items`, {
        method: "PATCH",
        body: JSON.stringify({ kind: "question", itemId, data: { action: "proceed_with_uncertainty" } }),
      });
      await refresh();
      toast({ title: "Assumption carried", description: "Recorded in the uncertainty ledger and the decision journal." });
    } catch (e) {
      toast({ title: "Could not mark uncertainty", description: (e as Error).message, variant: "destructive" });
    }
  };

  const reopenQuestion = async (itemId: string) => {
    try {
      await api(`/api/projects/${project.id}/items`, {
        method: "PATCH",
        body: JSON.stringify({ kind: "question", itemId, data: { action: "reopen" } }),
      });
      await refresh();
    } catch (e) {
      toast({ title: "Could not reopen", description: (e as Error).message, variant: "destructive" });
    }
  };

  const runResearchExperiment = async () => {
    if (!isCurrent || experimenting) return;
    setExperimenting(true);
    setExperimentResult(null);
    try {
      const result = await api<PlannerExperimentView & { ok: boolean }>(
        `/api/projects/${project.id}/planner/experiment`,
        {
          method: "POST",
          body: JSON.stringify({ materializeArm: "impact_aware" }),
        }
      );
      setExperimentResult(result);
      await refresh();
      toast({
        title: "Four-arm experiment completed",
        description: `Shared ${result.candidateCount}-candidate pool · seed ${result.seed} · materialized ${result.materializedArm}.`,
      });
    } catch (error) {
      toast({
        title: "Planner experiment failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setExperimenting(false);
    }
  };

  const langTone = (l: string) => (l === "ar-EG" ? "signal" : l === "codeswitch" ? "plasma" : "muted");
  const filteredEvidence = project.evidences.filter((evidence) => {
    const query = evidenceQuery.trim().toLocaleLowerCase();
    const matchesQuery = !query || [evidence.code, evidence.title, evidence.content]
      .some((value) => value.toLocaleLowerCase().includes(query));
    return matchesQuery && (evidenceTypeFilter === "all" || evidence.sourceType === evidenceTypeFilter);
  });
  const answered = project.questions.filter((q) => q.answered).length;
  const carried = project.questions.filter((q) => q.resolution === "proceed_with_uncertainty").length;
  const transcript = (text: string) => setContent((c) => (c ? `${c}\n${text}` : text));

  return (
    <div className="space-y-6">
      {/* evidence library */}
      <HudPanel className="p-6">
        <SectionHead
          icon={FileText}
          title="Evidence library"
          blurb="Interviews, documents, meeting notes and voice notes — the ground truth every agent must cite."
          right={
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="bg-aura font-semibold text-primary-foreground hover:bg-aura/85">
                  <Plus className="mr-1.5 h-4 w-4" /> Add evidence
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="font-display">Log an evidence source</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <Input
                    placeholder="Source title (e.g. Interview with Um Karim)"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Select value={sourceType} onValueChange={setSourceType}>
                      <SelectTrigger aria-label="Source type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interview">Interview</SelectItem>
                        <SelectItem value="document">Document</SelectItem>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="survey">Survey</SelectItem>
                        <SelectItem value="observation">Observation</SelectItem>
                        <SelectItem value="transcript">Transcript</SelectItem>
                        <SelectItem value="whiteboard_ocr">Whiteboard OCR</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={language} onValueChange={setLanguage}>
                      <SelectTrigger aria-label="Language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="ar-EG">Egyptian Arabic</SelectItem>
                        <SelectItem value="codeswitch">Code-switched</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <MicRecorder onTranscript={transcript} expectedLanguage={language} />
                  <Textarea
                    rows={6}
                    dir="auto"
                    placeholder="Paste transcript, notes or document excerpt… (Arabic and code-switched text are welcome)"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <Checkbox id="consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
                    <Label htmlFor="consent" className="text-sm text-muted-foreground">
                      I have permission to send this source's content to the configured AI provider
                    </Label>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Leave this unchecked when permission is missing or uncertain. The source remains in the private project library, but its content is never sent to an AI model or used to generate requirements.
                  </p>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={addEvidence}
                    disabled={!title.trim() || !content.trim()}
                    className="bg-aura text-primary-foreground hover:bg-aura/85"
                  >
                    Add source
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        {pendingOffline.length > 0 && (
          <section className="mb-4 rounded-md border border-aura/30 bg-aura/5 p-3" aria-label="Offline evidence outbox">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold">{pendingOffline.length} pending evidence operation(s)</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  FIFO outbox · {pendingOffline.reduce((sum, item) => sum + item.attempts, 0)} total retry attempt(s) · IndexedDB is not separately encrypted
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void syncOfflineEvidence(true)} disabled={syncingOffline || (typeof navigator !== "undefined" && !navigator.onLine)}>
                {syncingOffline ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Undo2 className="mr-1.5 h-3.5 w-3.5" />}
                {syncingOffline ? "Syncing…" : "Retry queue"}
              </Button>
            </div>
            <ol className="mt-3 space-y-2">
              {pendingOffline.map((operation, index) => {
                const target = operation.kind === "update" || operation.kind === "delete"
                  ? project.evidences.find((item) => item.id === operation.evidenceId)
                  : undefined;
                const conflict = /EVIDENCE_REVISION_CONFLICT|changed in another session|revision.*conflict/i.test(operation.lastError ?? "");
                const canRebase = operation.kind === "update" && !!target && conflict;
                const operationTitle = operation.kind === "delete"
                  ? target?.title ?? operation.evidenceId
                  : operation.payload.title;
                const expectedVersion = "expectedRevisionVersion" in operation ? operation.expectedRevisionVersion : "—";
                return (
                  <li key={operation.operationId} className="rounded border border-border/70 bg-background/60 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="font-mono">{index + 1} · {(operation.kind ?? "create").toUpperCase()}</Badge>
                          <span className="text-xs font-medium">{operationTitle}</span>
                          {conflict ? <Badge variant="destructive">Revision conflict</Badge> : operation.lastError ? <Badge variant="secondary">Needs attention</Badge> : <Badge variant="outline">Waiting</Badge>}
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Queued {new Date(operation.createdAt).toLocaleString()} · {operation.attempts} attempt(s) · expected v{expectedVersion}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canRebase && (
                          <Button size="sm" variant="outline" onClick={async () => {
                            try {
                              const latestVersion = target.revisions?.[0]?.version ?? 0;
                              await updateOfflineEvidenceOperation(rebaseOfflineEvidenceUpdateOperation(operation, latestVersion));
                              await loadOfflineQueue();
                              toast({ title: "Update rebased", description: `The queued draft now targets revision v${latestVersion}. Review the comparison below, then retry the queue.` });
                            } catch (error) {
                              toast({ title: "Could not rebase update", description: (error as Error).message, variant: "destructive" });
                            }
                          }}>
                            Rebase to v{target?.revisions?.[0]?.version ?? 0}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={async () => {
                          await removeOfflineEvidenceOperation(operation.operationId);
                          await loadOfflineQueue();
                          toast({ title: "Queued operation discarded", description: "The local operation was removed; the server source was not changed." });
                        }}>Discard</Button>
                      </div>
                    </div>
                    {operation.lastError && <p className="mt-2 break-words text-xs text-coral" role="alert">{operation.lastError}</p>}
                    {conflict && operation.kind === "update" && (
                      <div className="mt-3 grid gap-2 border-t border-border/60 pt-3 md:grid-cols-2">
                        <div className="min-w-0 rounded bg-secondary/40 p-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Queued draft · v{operation.expectedRevisionVersion} base</p>
                          <p className="mt-1 text-xs font-medium" dir="auto">{operation.payload.title}</p>
                          <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] text-muted-foreground" dir="auto">{operation.payload.content}</p>
                        </div>
                        <div className="min-w-0 rounded bg-secondary/40 p-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Current server source · v{target?.revisions?.[0]?.version ?? 0}</p>
                          <p className="mt-1 text-xs font-medium" dir="auto">{target?.title ?? "Source no longer exists"}</p>
                          <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[11px] text-muted-foreground" dir="auto">{target?.content ?? "The source is unavailable. Discard this queued update."}</p>
                        </div>
                      </div>
                    )}
                    {conflict && operation.kind === "delete" && (
                      <p className="mt-2 text-xs text-muted-foreground">Deletion is deliberately not auto-rebased. Review the current source in the library; discard this operation if the newer source should be retained.</p>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-[10px] leading-4 text-muted-foreground">
              A revision conflict pauses the FIFO queue. Rebase is available only for updates and preserves the draft and operation ID; deletions require a fresh, deliberate decision.
            </p>
          </section>
        )}
        {project.evidences.length > 0 && (
          <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={evidenceQuery}
                onChange={(event) => setEvidenceQuery(event.target.value)}
                placeholder="Search source title, ID or transcript…"
                aria-label="Search evidence sources"
                className="pl-9"
              />
            </div>
            <Select value={evidenceTypeFilter} onValueChange={setEvidenceTypeFilter}>
              <SelectTrigger aria-label="Filter evidence by source type"><SelectValue placeholder="All source types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All source types</SelectItem>
                <SelectItem value="interview">Interview</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="survey">Survey</SelectItem>
                <SelectItem value="observation">Observation</SelectItem>
                <SelectItem value="transcript">Transcript</SelectItem>
                <SelectItem value="whiteboard_ocr">Whiteboard OCR</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground sm:col-span-2" aria-live="polite">
              Showing {filteredEvidence.length} of {project.evidences.length} sources · {project.evidences.filter((e) => e.consent).length} AI-eligible
            </p>
          </div>
        )}
        {project.evidences.length === 0 ? (
          <EmptyBay>
            No evidence yet. Add at least one source — agents refuse to fly without grounding.
          </EmptyBay>
        ) : filteredEvidence.length === 0 ? (
          <EmptyBay>No sources match this search. Try another term or source type.</EmptyBay>
        ) : (
          <ul className="max-h-[min(70vh,760px)] space-y-3 overflow-y-auto pr-1">
            {filteredEvidence.map((ev) => (
              <li key={ev.id} className="rounded-md border border-border/80 bg-secondary/30 p-4 transition-colors hover:border-aura/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge variant="outline" className="shrink-0 border-aura/40 bg-aura/10 font-mono text-aura">
                      {ev.code}
                    </Badge>
                    <span className="truncate text-sm font-medium" dir="auto">
                      {ev.title}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Chip tone={langTone(ev.language)} mono={false}>{LANG_LABEL[ev.language] ?? ev.language}</Chip>
                    {ev.consent ? (
                      <ShieldCheck className="h-4 w-4 text-verify" aria-label="Consent on file" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-signal" aria-label="No consent recorded" />
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-coral"
                      onClick={() => removeEvidence(ev.id)}
                      aria-label={`Remove ${ev.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground" dir="auto">
                  {ev.content}
                </p>
                <EvidenceRevisionPanel
                  projectId={project.id}
                  evidence={ev}
                  onSaved={refresh}
                  onQueueOffline={async (operation) => { await putOfflineEvidenceOperation(operation); await loadOfflineQueue(); }}
                />
                <EvidenceClaimsPanel
                  projectId={project.id}
                  evidence={ev}
                  requirements={project.requirements}
                  onSaved={refresh}
                />
              </li>
            ))}
          </ul>
        )}
      </HudPanel>

      {/* interrogation queue */}
      <HudPanel className="p-6">
        <SectionHead
          icon={MessageCircleQuestion}
          title="Interrogation queue"
          blurb="Every question carries an ask-cost and a fallback assumption — you decide what is worth asking, and what you are willing to assume."
          right={
            <>
              {isCurrent && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={runResearchExperiment}
                  disabled={experimenting || project.questions.some((question) => question.answered)}
                  title="Runs all four arms against one immutable pool. Available before stakeholder answers are recorded."
                >
                  {experimenting
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <FlaskConical className="mr-1.5 h-3.5 w-3.5" />}
                  {experimenting ? "Running study…" : "4-arm experiment"}
                </Button>
              )}
              <Chip tone={answered === project.questions.length && project.questions.length > 0 ? "verify" : "signal"}>
                {answered}/{project.questions.length} answered
              </Chip>
              {carried > 0 && (
                <Chip tone="plasma">
                  <Waves className="h-3 w-3" /> {carried} assumption{carried === 1 ? "" : "s"} carried
                </Chip>
              )}
            </>
          }
        />

        {experimentResult && (
          <div className="mb-5 rounded-md border border-aura/30 bg-aura/5 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Research comparison completed</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {experimentResult.experimentId} · seed {experimentResult.seed} · pool {experimentResult.candidatePoolHash.slice(0, 12)}
                </p>
              </div>
              <Chip tone="verify">materialized: {experimentResult.materializedArm}</Chip>
            </div>
            <p className="mb-3 text-xs leading-5 text-muted-foreground">
              random, llm and impact_aware used the same {experimentResult.candidateCount}-question candidate pool and shared signal scores. single_shot is an independent direct-generation baseline.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-3">Arm</th>
                    <th className="pb-2 pr-3">Avg utility</th>
                    <th className="pb-2 pr-3">Coverage</th>
                    <th className="pb-2 pr-3">Redundancy</th>
                    <th className="pb-2 pr-3">Dialect fit</th>
                    <th className="pb-2">Est. tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {experimentResult.arms.map((arm) => (
                    <tr key={arm.arm} className="border-t border-border/60">
                      <td className="py-2 pr-3 font-mono">{arm.arm}</td>
                      <td className="py-2 pr-3">{arm.metrics.avgUtility}</td>
                      <td className="py-2 pr-3">{arm.metrics.evidenceCoverage}%</td>
                      <td className="py-2 pr-3">{arm.metrics.redundancyRate}%</td>
                      <td className="py-2 pr-3">{arm.metrics.dialectFit}%</td>
                      <td className="py-2">{arm.estTokens.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {project.questions.length === 0 ? (
          <EmptyBay>
            Run the Questioner Agent to generate the interrogation queue from your brief and evidence.
          </EmptyBay>
        ) : (
          <ul className="space-y-4">
            {project.questions.map((q, i) => {
              const uncertainty = q.resolution === "proceed_with_uncertainty";
              interface UtilBreakdown {
                infoGain: number;
                impact: number;
                uncertainty: number;
                risk: number;
                utility: number;
              }
              let util: UtilBreakdown | null = null;
              try {
                util = q.utility ? (JSON.parse(q.utility) as UtilBreakdown) : null;
              } catch {
                util = null;
              }
              return (
                <li
                  key={q.id}
                  className={`rounded-md border p-4 transition-colors ${
                    uncertainty ? "border-plasma/40 bg-plasma/5" : q.answered ? "border-verify/30 bg-verify/5" : "border-border/80 bg-secondary/30"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">Q{i + 1}</span>
                    <Chip tone={q.priority === "high" ? "coral" : q.priority === "low" ? "muted" : "signal"}>
                      {q.priority} priority
                    </Chip>
                    {typeof q.askCost === "number" && (
                      <span className="flex items-center gap-2" title={`Ask cost ${q.askCost}/5`}>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">ask cost</span>
                        <Meter value={q.askCost} max={5} tone={q.askCost >= 4 ? "coral" : q.askCost >= 3 ? "signal" : "verify"} className="w-16" />
                      </span>
                    )}
                    {util && (
                      <span
                        className="flex items-center gap-1.5 rounded-full border border-aura/40 bg-aura/10 px-2 py-0.5 font-mono text-[10px] text-aura"
                        title={`Utility = (IG ${util.infoGain} × Impact ${util.impact} × Uncertainty ${util.uncertainty} × Risk ${util.risk}) ÷ AskCost — total ${util.utility}`}
                      >
                        ◆ utility {util.utility}
                        <span className="text-aura/60">IG{util.infoGain}·IMP{util.impact}·UNC{util.uncertainty}·RSK{util.risk}</span>
                      </span>
                    )}
                    {q.answered && !uncertainty && (
                      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-verify">
                        <CheckCircle2 className="h-3.5 w-3.5" /> answered
                      </span>
                    )}
                    {uncertainty && (
                      <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-plasma">
                        <Waves className="h-3.5 w-3.5" /> uncertainty carried
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium leading-relaxed" dir="auto">
                    {q.text}
                  </p>
                  {q.rationale && (
                    <p className="mt-1 text-xs italic text-muted-foreground" dir="auto">
                      Why this matters: {q.rationale}
                    </p>
                  )}
                  {q.fallbackAssumption && (
                    <p className="mt-2 rounded-md border border-plasma/25 bg-plasma/5 px-3 py-1.5 font-mono text-[11px] text-plasma" dir="auto">
                      IF SKIPPED, ASSUME: {q.fallbackAssumption}
                    </p>
                  )}

                  {q.answered && !uncertainty ? (
                    <div className="mt-3 flex items-start justify-between gap-3 rounded-md bg-secondary/40 px-3 py-2">
                      <p className="text-sm" dir="auto">{q.answer}</p>
                      {isCurrent && (
                        <Button size="sm" variant="ghost" onClick={() => reopenQuestion(q.id)} className="h-7 shrink-0 text-muted-foreground">
                          <Undo2 className="mr-1 h-3.5 w-3.5" /> reopen
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      <Textarea
                        rows={2}
                        className="mt-3"
                        dir="auto"
                        placeholder="Your answer (the agent reads this in later stages)…"
                        defaultValue={q.answer ?? ""}
                        disabled={!isCurrent}
                        onBlur={(e) => {
                          const v = e.target.value;
                          if (v !== (q.answer ?? "")) saveAnswer(q.id, v);
                        }}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      />
                      {isCurrent && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {answers[q.id] !== undefined && answers[q.id] !== (q.answer ?? "") && (
                            <Button size="sm" variant="secondary" onClick={() => saveAnswer(q.id, answers[q.id])}>
                              Save answer
                            </Button>
                          )}
                          {!uncertainty && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => proceedWithUncertainty(q.id)}
                              className="border-plasma/40 text-plasma hover:bg-plasma/10"
                            >
                              <Waves className="mr-1.5 h-3.5 w-3.5" /> Proceed with uncertainty
                            </Button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4">
          <Eyebrow tone="muted">◉ the agent proceeds only when you approve the gate above — assumptions stay visible forever</Eyebrow>
        </div>
      </HudPanel>
    </div>
  );
}
