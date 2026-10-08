"use client";

// PHASE 06 · CLEARANCE — the negotiation table. The agent lays
// out findings and implications only; the human writes every
// resolution (human-in-the-loop contract).

import { useState } from "react";
import { api } from "@/lib/api";
import { type ProjectDTO } from "@/lib/rp";
import { HudPanel, Chip, SectionHead, EmptyBay, type Tone } from "@/components/rp/hud";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { GitMerge, CheckCircle2, Scale } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const KIND_TONE: Record<string, Tone> = { contradiction: "coral", duplication: "signal", overlap: "aura" };
const SEV_TONE: Record<string, Tone> = { high: "coral", medium: "signal", low: "muted" };

export function ConflictsStage({
  project,
  isCurrent,
  refresh,
}: {
  project: ProjectDTO;
  isCurrent: boolean;
  refresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const reqById = new Map(project.requirements.map((r) => [r.id, r]));

  const resolve = async (itemId: string) => {
    const resolution = resolutions[itemId];
    if (!resolution?.trim()) {
      toast({
        title: "Resolution required",
        description: "The system presents implications — the verdict must be yours. Write the resolution first.",
        variant: "destructive",
      });
      return;
    }
    try {
      await api(`/api/projects/${project.id}/items`, {
        method: "PATCH",
        body: JSON.stringify({ kind: "conflict", itemId, data: { resolution } }),
      });
      await refresh();
      toast({ title: "Conflict resolved", description: "Verdict recorded in the decision journal." });
    } catch (e) {
      toast({ title: "Could not resolve", description: (e as Error).message, variant: "destructive" });
    }
  };

  const open = project.conflicts.filter((c) => c.status === "open");

  if (project.conflicts.length === 0) {
    return (
      <HudPanel className="p-6">
        <SectionHead icon={GitMerge} title="Negotiation table" blurb="Contradictions, duplications and overlaps." />
        <EmptyBay>Run the Consistency Agent to cross-check requirements for contradictions, duplications and overlaps.</EmptyBay>
      </HudPanel>
    );
  }

  return (
    <section className="space-y-4">
      <SectionHead
        icon={GitMerge}
        title="Negotiation table"
        blurb="The agent presents the collision and its implications — the verdict is always yours."
        right={
          <>
            <Chip tone="aura">{project.conflicts.length} findings</Chip>
            <Chip tone={open.length === 0 ? "verify" : "signal"}>{open.length} open</Chip>
          </>
        }
      />

      <ul className="space-y-3">
        {project.conflicts.map((c) => {
          const a = reqById.get(c.reqAId);
          const b = reqById.get(c.reqBId);
          const resolved = c.status === "resolved";
          return (
            <li key={c.id} className={`hud-panel rounded-lg p-5 transition-all ${resolved ? "opacity-70" : "hover:border-aura/30"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={KIND_TONE[c.kind] ?? "muted"}>{c.kind}</Chip>
                <Chip tone={SEV_TONE[c.severity] ?? "muted"}>{c.severity} severity</Chip>
                {resolved ? (
                  <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-verify">
                    <CheckCircle2 className="h-3.5 w-3.5" /> resolved
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-signal">
                    <Scale className="h-3.5 w-3.5" /> awaiting your verdict
                  </span>
                )}
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
                {[a, b].map((r, i) => (
                  <div key={i} className={`rounded-md border bg-secondary/40 p-3 ${i === 1 ? "md:content-center" : ""}`}>
                    {i === 1 && (
                      <div className="mb-2 flex justify-center md:hidden">
                        <GitMerge className="h-4 w-4 text-coral/70" />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-border font-mono text-xs text-muted-foreground">
                        {r?.refId}
                      </Badge>
                      {i === 0 && <span className="hidden font-mono text-[9px] uppercase tracking-widest text-muted-foreground md:block">side A</span>}
                      {i === 1 && <span className="hidden font-mono text-[9px] uppercase tracking-widest text-muted-foreground md:block">side B</span>}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed" dir="auto">
                      {r?.text}
                    </p>
                  </div>
                ))}
                <div className="hidden items-center md:flex">
                  <span className="rounded-full border border-coral/40 bg-coral/10 px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-coral">
                    vs
                  </span>
                </div>
              </div>

              <p className="mt-3 text-sm leading-relaxed" dir="auto">
                {c.description}
              </p>

              {c.suggestion && !resolved && (
                <p className="mt-2 rounded-md border border-aura/25 bg-aura/5 px-3 py-2 text-xs text-aura" dir="auto">
                  <span className="font-mono font-semibold tracking-wider">IMPLICATION · </span>
                  {c.suggestion}
                </p>
              )}

              {resolved ? (
                <p className="mt-3 rounded-md border border-verify/30 bg-verify/5 px-3 py-2 text-sm text-verify" dir="auto">
                  <span className="font-mono font-semibold tracking-wider">RESOLUTION · </span>
                  {c.resolution}
                </p>
              ) : (
                isCurrent && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      rows={2}
                      dir="auto"
                      placeholder="How should this conflict be resolved? (e.g. REQ-04 wins, REQ-07 is dropped)"
                      value={resolutions[c.id] ?? ""}
                      onChange={(e) => setResolutions((r) => ({ ...r, [c.id]: e.target.value }))}
                    />
                    <Button size="sm" variant="outline" onClick={() => resolve(c.id)} className="border-verify/40 text-verify hover:bg-verify/10">
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Mark resolved
                    </Button>
                  </div>
                )
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
