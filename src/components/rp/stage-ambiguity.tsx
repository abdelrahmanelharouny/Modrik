"use client";

// PHASE 04 · TURBULENCE SCAN — ambiguity scoring + rewrites.

import { useState } from "react";
import { api } from "@/lib/api";
import { type ProjectDTO } from "@/lib/rp";
import { HudPanel, Chip, Meter, SectionHead, EmptyBay, type Tone } from "@/components/rp/hud";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gauge, Sparkles, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function ambTone(score: number): Tone {
  if (score >= 60) return "coral";
  if (score >= 30) return "signal";
  return "verify";
}

export function AmbiguityStage({
  project,
  isCurrent,
  refresh,
}: {
  project: ProjectDTO;
  isCurrent: boolean;
  refresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | "flagged">("all");

  const applySuggestion = async (itemId: string) => {
    try {
      await api(`/api/projects/${project.id}/items`, {
        method: "PATCH",
        body: JSON.stringify({ kind: "requirement", itemId, data: { action: "apply_suggestion" } }),
      });
      await refresh();
      toast({ title: "Rewrite applied", description: "Requirement text replaced with the sharper version." });
    } catch (e) {
      toast({ title: "Could not apply rewrite", description: (e as Error).message, variant: "destructive" });
    }
  };

  const assessed = project.requirements.filter((r) => r.ambiguity >= 0);
  const flagged = assessed.filter((r) => r.ambiguity >= 30);
  const shown = filter === "flagged" ? flagged : assessed;
  const avg = assessed.length ? Math.round(assessed.reduce((s, r) => s + r.ambiguity, 0) / assessed.length) : 0;

  if (assessed.length === 0) {
    return (
      <HudPanel className="p-6">
        <SectionHead icon={Gauge} title="Turbulence scan" blurb="Ambiguity density per requirement." />
        <EmptyBay>Run the Ambiguity Agent to score every requirement and flag weak, untestable wording.</EmptyBay>
      </HudPanel>
    );
  }

  return (
    <section className="space-y-4">
      <SectionHead
        icon={Gauge}
        title="Turbulence scan"
        blurb="Ambiguity 0–100 per requirement (Arabic lexicon included) — accept rewrites where the air is rough."
        right={
          <>
            <Chip tone={ambTone(avg)}>avg {avg}</Chip>
            <Chip tone={flagged.length ? "signal" : "verify"}>{flagged.length} flagged</Chip>
            <div className="flex rounded-md border border-border p-0.5">
              <button
                className={`rounded px-3 py-1 font-mono text-[10px] uppercase tracking-wider ${filter === "all" ? "bg-aura/15 text-aura" : "text-muted-foreground"}`}
                onClick={() => setFilter("all")}
              >
                all
              </button>
              <button
                className={`rounded px-3 py-1 font-mono text-[10px] uppercase tracking-wider ${filter === "flagged" ? "bg-aura/15 text-aura" : "text-muted-foreground"}`}
                onClick={() => setFilter("flagged")}
              >
                flagged
              </button>
            </div>
          </>
        }
      />

      <ul className="space-y-3">
        {shown.map((r) => (
          <li key={r.id} className="hud-panel rounded-lg p-4 transition-colors hover:border-aura/30">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-aura/40 bg-aura/5 font-mono text-xs text-aura">
                {r.refId}
              </Badge>
              <span className="flex min-w-[140px] flex-1 items-center gap-2" style={{ maxWidth: 260 }}>
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">amb</span>
                <Meter value={r.ambiguity} tone={ambTone(r.ambiguity)} className="flex-1" />
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{r.ambiguity}</span>
              </span>
              {r.suggestion && <Chip tone="aura">rewrite available</Chip>}
            </div>

            <p className="mt-2 text-sm leading-relaxed" dir="auto">
              {r.text}
            </p>

            {r.ambiguityNote && (
              <p className="mt-2 rounded-md border border-signal/25 bg-signal/5 px-3 py-1.5 text-xs text-signal" dir="auto">
                <span className="font-mono font-semibold tracking-wider">WEAK WORDING · </span>
                {r.ambiguityNote}
              </p>
            )}

            {r.suggestion && (
              <div className="mt-3 rounded-md border border-aura/30 bg-aura/5 p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-aura">
                    <Sparkles className="h-3.5 w-3.5" /> proposed rewrite
                  </span>
                  {isCurrent && (
                    <Button size="sm" variant="outline" onClick={() => applySuggestion(r.id)} className="border-aura/40 text-aura hover:bg-aura/10">
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Apply rewrite
                    </Button>
                  )}
                </div>
                <p className="text-sm leading-relaxed" dir="auto">
                  {r.suggestion}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
