"use client";

// ─────────────────────────────────────────────────────────────
// PHASE 01 · BRIEFING — Evidence intake + interrogation cockpit.
// New in this build: voice-note capture (MediaRecorder → WAV →
// GLM ASR) and the full uncertainty-gated question flow
// (answer / proceed with recorded assumption / reopen).
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { LANG_LABEL, type ProjectDTO } from "@/lib/rp";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  const addEvidence = async () => {
    if (!title.trim() || !content.trim()) return;
    try {
      await api(`/api/projects/${project.id}/evidence`, {
        method: "POST",
        body: JSON.stringify({ title, sourceType, language, content, consent }),
      });
      setTitle("");
      setContent("");
      setConsent(false);
      setOpen(false);
      await refresh();
      toast({ title: "Evidence logged", description: "The agent will ground its output in this source." });
    } catch (e) {
      toast({ title: "Could not add evidence", description: (e as Error).message, variant: "destructive" });
    }
  };

  const removeEvidence = async (id: string) => {
    try {
      await api(`/api/projects/${project.id}/evidence?evidenceId=${id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      toast({ title: "Could not remove evidence", description: (e as Error).message, variant: "destructive" });
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

  const langTone = (l: string) => (l === "ar-EG" ? "signal" : l === "codeswitch" ? "plasma" : "muted");
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
                      Stakeholder consent recorded for this source
                    </Label>
                  </div>
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

        {project.evidences.length === 0 ? (
          <EmptyBay>
            No evidence yet. Add at least one source — agents refuse to fly without grounding.
          </EmptyBay>
        ) : (
          <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
            {project.evidences.map((ev) => (
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
