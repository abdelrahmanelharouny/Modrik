"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const DIMENSIONS = [
  ["coverage", "Coverage"],
  ["grounding", "Evidence grounding"],
  ["relevance", "Decision relevance"],
  ["specificity", "Specificity"],
  ["dialectFit", "Egyptian Arabic / dialect fit"],
  ["nonRedundancy", "Non-redundancy"],
  ["overall", "Overall usefulness"],
  ["confidence", "Rater confidence"],
] as const;
type Dimension = typeof DIMENSIONS[number][0];
type Packet = {
  packetId: string;
  experimentId: string;
  context: { brief: string; evidence: { title: string; language: string; content: string }[] };
  sets: { blindId: string; questions: { text: string; language: string; priority: string }[] }[];
  blinding: string;
};
type RatingRow = { blindId: string; scores: Record<Dimension, number>; notes: string };
type PlannerReviewAvailability = { experimentId: string | null; ready: boolean };

export function PlannerHumanEvaluation({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [experimentId, setExperimentId] = useState("");
  const [packet, setPacket] = useState<Packet | null>(null);
  const [ratings, setRatings] = useState<RatingRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const emptyScores = useMemo(() => Object.fromEntries(DIMENSIONS.map(([key]) => [key, 0])) as Record<Dimension, number>, []);

  useEffect(() => {
    let active = true;
    api<PlannerReviewAvailability>("/api/projects/" + projectId + "/planner/feedback").then((result) => {
      if (active) setExperimentId(result.ready && result.experimentId ? result.experimentId : "");
    }).catch(() => undefined);
    return () => { active = false; };
  }, [projectId]);

  const loadPacket = async () => {
    if (!experimentId) return;
    setBusy(true); setError("");
    try {
      const result = await api<{ packet: Packet; existing: boolean }>("/api/projects/" + projectId + "/planner/feedback", {
        method: "POST", body: JSON.stringify({ action: "create_packet", experimentId }),
      });
      setPacket(result.packet);
      setRatings(result.packet.sets.map((set) => ({ blindId: set.blindId, scores: { ...emptyScores }, notes: "" })));
      setStatus(result.existing ? "Existing blinded packet loaded. Another independent reviewer can use this same packet." : "Blinded packet created. Submit one independent review; a second reviewer must submit separately.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message); toast({ title: "Could not load planner review", description: message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const updateScore = (blindId: string, dimension: Dimension, value: number) => {
    setRatings((current) => current.map((row) => row.blindId === blindId ? { ...row, scores: { ...row.scores, [dimension]: value } } : row));
  };
  const updateNotes = (blindId: string, notes: string) => {
    setRatings((current) => current.map((row) => row.blindId === blindId ? { ...row, notes } : row));
  };
  const submit = async () => {
    if (!packet) return;
    const complete = ratings.length === packet.sets.length && ratings.every((row) => DIMENSIONS.every(([key]) => Number.isInteger(row.scores[key]) && row.scores[key] >= 1 && row.scores[key] <= 5));
    if (!complete) { setError("Rate every dimension for all four blinded question sets using 1–5."); return; }
    setBusy(true); setError("");
    try {
      const result = await api<{ receivedReviews: number; status: string }>("/api/projects/" + projectId + "/planner/feedback", {
        method: "POST", body: JSON.stringify({ action: "submit_rating", packetId: packet.packetId, ratings }),
      });
      setStatus(result.receivedReviews + " of 2 independent reviews received. " + result.status.replaceAll("_", " ") + ".");
      toast({ title: "Human review submitted", description: result.receivedReviews === 2 ? "Two reviews are ready for an approver's analysis." : "A second independent reviewer must complete the same blinded packet." });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message); toast({ title: "Could not submit review", description: message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Card className="mt-4 border-aura/25 bg-secondary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">Human evaluation · blinded planner review</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Two independent reviewers score the same four question sets. Model and arm identities stay hidden.</p>
          </div>
          <Badge variant="outline">{experimentId ? "Experiment ready" : "Run 4-arm experiment first"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!packet ? (
          <Button size="sm" variant="outline" disabled={!experimentId || busy} onClick={() => void loadPacket()}>
            {busy ? "Preparing blind packet…" : "Create / load blind review packet"}
          </Button>
        ) : (
          <>
            {packet.context.brief && <div className="rounded-md border border-border/70 p-3"><p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Project brief</p><p className="whitespace-pre-wrap text-xs" dir="auto">{packet.context.brief}</p></div>}
            {packet.context.evidence.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Consented evidence shown to raters</p>
                {packet.context.evidence.map((item, index) => <div key={index} className="rounded-md border border-border/70 p-3"><p className="text-xs font-semibold">{item.title} · {item.language}</p><p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground" dir="auto">{item.content}</p></div>)}
              </div>
            )}
            {packet.sets.map((set) => {
              const row = ratings.find((item) => item.blindId === set.blindId);
              return (
                <section key={set.blindId} className="space-y-3 rounded-md border border-border/70 p-3">
                  <div className="flex items-center justify-between"><Badge variant="outline">Variant {set.blindId}</Badge><span className="text-[10px] text-muted-foreground">{set.questions.length} questions</span></div>
                  <ol className="list-decimal space-y-2 pl-5">{set.questions.map((question, index) => <li key={index} className="text-xs leading-5" dir="auto">{question.text}</li>)}</ol>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DIMENSIONS.map(([key, label]) => (
                      <label key={key} className="flex items-center justify-between gap-2 text-xs">
                        <span>{label}</span>
                        <Input type="number" min={1} max={5} step={1} aria-label={label + " for variant " + set.blindId} className="h-8 w-20" value={row?.scores[key] || ""} onChange={(event) => updateScore(set.blindId, key, Number(event.target.value) || 0)} />
                      </label>
                    ))}
                  </div>
                  <Input aria-label={"Reviewer notes for variant " + set.blindId} placeholder="Optional reviewer note (avoid names or personal data)" value={row?.notes ?? ""} onChange={(event) => updateNotes(set.blindId, event.target.value)} />
                </section>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void submit()} disabled={busy}>{busy ? "Submitting…" : "Submit independent review"}</Button>
              <Button size="sm" variant="outline" onClick={() => setPacket(null)} disabled={busy}>Reload packet</Button>
            </div>
          </>
        )}
        {status && <p className="text-xs text-muted-foreground" role="status">{status}</p>}
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        <p className="text-[10px] leading-4 text-muted-foreground">The packet includes only evidence with explicit AI consent. Ratings are descriptive for one experiment; do not claim statistical superiority from a single four-arm run.</p>
      </CardContent>
    </Card>
  );
}
