"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { HudPanel, SectionHead, Chip } from "@/components/rp/hud";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const DIMENSIONS = [
  ["grounding", "Evidence grounding"],
  ["correctness", "Correctness"],
  ["completeness", "Completeness"],
  ["actionability", "Actionability"],
  ["languageFit", "Language / dialect fit"],
  ["safety", "Safety and restraint"],
  ["overall", "Overall quality"],
  ["reviewerConfidence", "Reviewer confidence"],
] as const;
type Dimension = typeof DIMENSIONS[number][0];
type ArtifactRow = { id: string; stage: string; createdAt: string; content: string; truncated: boolean };
type ReviewReport = { report: Record<string, unknown>; cohort: Record<string, unknown> };

export function AgentHumanEvaluation({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [scores, setScores] = useState<Record<Dimension, number>>({ grounding: 0, correctness: 0, completeness: 0, actionability: 0, languageFit: 0, safety: 0, overall: 0, reviewerConfidence: 0 });
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ReviewReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const response = await api<{ artifacts: ArtifactRow[] }>("/api/projects/" + projectId + "/agent-evaluation");
      setArtifacts(response.artifacts);
      setSelectedId((current) => current || response.artifacts[0]?.id || "");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
    }
  };
  useEffect(() => { void load(); }, [projectId]);
  useEffect(() => {
    setResult(null); setError("");
    setScores({ grounding: 0, correctness: 0, completeness: 0, actionability: 0, languageFit: 0, safety: 0, overall: 0, reviewerConfidence: 0 });
    setNote("");
  }, [selectedId]);

  const selected = artifacts.find((item) => item.id === selectedId);
  const parsedContent = (() => {
    if (!selected) return selected ? selected.content : "";
    try { return JSON.stringify(JSON.parse(selected.content), null, 2); } catch { return selected.content; }
  })();

  const submit = async () => {
    if (!selectedId || DIMENSIONS.some(([key]) => !Number.isInteger(scores[key]) || scores[key] < 1 || scores[key] > 5)) {
      setError("Rate all eight dimensions from 1 to 5 before submitting."); return;
    }
    setBusy(true); setError("");
    try {
      const response = await api<{ receivedReviews: number; status: string }>("/api/projects/" + projectId + "/agent-evaluation", {
        method: "POST", body: JSON.stringify({ action: "submit_review", artifactId: selectedId, scores, note }),
      });
      toast({ title: "Agent review saved", description: response.receivedReviews + " of 2 independent reviews received." });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message); toast({ title: "Could not save agent review", description: message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  const analyze = async () => {
    if (!selectedId) return;
    setBusy(true); setError("");
    try {
      const response = await api<ReviewReport>("/api/projects/" + projectId + "/agent-evaluation", {
        method: "POST", body: JSON.stringify({ action: "results", artifactId: selectedId }),
      });
      setResult(response);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message); toast({ title: "Analysis unavailable", description: message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <HudPanel className="p-5">
      <SectionHead title="Agent evaluation" blurb="Human review of immutable agent outputs. Reliability is aggregated only across independently reviewed artifacts." />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-xs" aria-label="Agent artifact to evaluate" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          {artifacts.map((item) => <option key={item.id} value={item.id}>{item.stage} · {new Date(item.createdAt).toLocaleString()}</option>)}
        </select>
        <Button size="sm" variant="outline" onClick={() => void load()}>Refresh outputs</Button>
      </div>
      {selected ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{selected.stage}</Badge><Chip tone="muted">{selected.id.slice(0, 12)}</Chip>{selected.truncated && <Badge variant="secondary">Preview truncated</Badge>}</div>
          <pre className="max-h-64 overflow-auto rounded-md border border-border bg-background/70 p-3 text-[10px] leading-4 whitespace-pre-wrap">{parsedContent}</pre>
          <div className="grid gap-2 sm:grid-cols-2">
            {DIMENSIONS.map(([key, label]) => <label key={key} className="flex items-center justify-between gap-2 text-xs"><span>{label}</span><Input type="number" min={1} max={5} step={1} aria-label={label} className="h-8 w-20" value={scores[key] || ""} onChange={(event) => setScores((current) => ({ ...current, [key]: Number(event.target.value) || 0 }))} /></label>)}
          </div>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional note; avoid names and personal data" aria-label="Agent review note" />
          <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void submit()} disabled={busy}>Submit independent review</Button><Button size="sm" variant="outline" onClick={() => void analyze()} disabled={busy}>Approver: analyze two reviews</Button></div>
          {result && <pre className="max-h-72 overflow-auto rounded-md border border-border p-3 text-[10px] whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>}
        </div>
      ) : <p className="mt-3 text-xs text-muted-foreground">No agent output artifacts are available for review yet.</p>}
      {error && <p className="mt-3 text-xs text-destructive" role="alert">{error}</p>}
      <p className="mt-3 text-[10px] leading-4 text-muted-foreground">AI self-scores are not ground truth. Human labels are required; one artifact yields descriptive scores only, while weighted kappa is calculated across multiple independently reviewed artifacts.</p>
    </HudPanel>
  );
}
