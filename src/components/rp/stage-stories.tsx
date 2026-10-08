"use client";

// PHASE 05 · PAYLOAD — executable user stories with INVEST scores.

import { api } from "@/lib/api";
import { type ProjectDTO } from "@/lib/rp";
import { HudPanel, Chip, SectionHead, EmptyBay, type Tone } from "@/components/rp/hud";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";

function investTone(v: number): Tone {
  return v >= 70 ? "verify" : v >= 50 ? "signal" : "coral";
}

export function StoriesStage({
  project,
  isCurrent: _isCurrent,
  refresh: _refresh,
}: {
  project: ProjectDTO;
  isCurrent: boolean;
  refresh: () => Promise<void>;
}) {
  void api;
  const reqById = new Map(project.requirements.map((r) => [r.id, r]));

  if (project.stories.length === 0) {
    return (
      <HudPanel className="p-6">
        <SectionHead icon={BookOpen} title="Generated stories" blurb="Executable user stories." />
        <EmptyBay>Run the Story Agent to turn approved requirements into user stories with acceptance criteria.</EmptyBay>
      </HudPanel>
    );
  }

  return (
    <section className="space-y-4">
      <SectionHead
        icon={BookOpen}
        title="Generated stories"
        blurb="Gherkin-ready acceptance criteria and INVEST quality scores — ready to fly to your trackers."
        right={<Chip tone="aura">{project.stories.length} stories</Chip>}
      />

      <ul className="grid gap-3 xl:grid-cols-2">
        {project.stories.map((s) => {
          const req = reqById.get(s.requirementId);
          return (
            <li key={s.id} className="hud-panel rounded-lg p-5 transition-colors hover:border-aura/30">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-aura/40 bg-aura/5 font-mono text-xs text-aura">
                  {s.refId}
                </Badge>
                <Chip tone="muted">from {req?.refId ?? "—"}</Chip>
                {s.investScore !== null && s.investScore !== undefined && (
                  <Chip tone={investTone(s.investScore)}>INVEST {s.investScore}</Chip>
                )}
                {s.status === "approved" && <Chip tone="verify">approved</Chip>}
              </div>

              <h4 className="mt-2 font-display text-sm font-bold tracking-tight" dir="auto">
                {s.title}
              </h4>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground" dir="auto">
                {s.narrative}
              </p>

              {s.acceptance && (
                <div className="mt-3">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Acceptance criteria
                  </span>
                  <ul className="mt-1.5 space-y-1">
                    {s.acceptance.split("\n").filter(Boolean).map((ac, i) => (
                      <li key={i} className="flex gap-2 text-sm" dir="auto">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-aura" />
                        <span>{ac}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {s.investNote && <p className="mt-3 text-xs italic text-muted-foreground">{s.investNote}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
