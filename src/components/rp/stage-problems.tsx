"use client";

import { api } from "@/lib/api";
import { type ProjectDTO } from "@/lib/rp";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ProblemsStage({
  project,
  isCurrent,
  refresh,
}: {
  project: ProjectDTO;
  isCurrent: boolean;
  refresh: () => Promise<void>;
}) {
  const { toast } = useToast();

  const update = async (itemId: string, data: Record<string, unknown>) => {
    try {
      await api(`/api/projects/${project.id}/items`, {
        method: "PATCH",
        body: JSON.stringify({ kind: "candidate", itemId, data }),
      });
      await refresh();
    } catch (e) {
      toast({ title: "Update failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const evidenceTitles = new Map(project.evidences.map((e) => [e.code, e.title]));

  if (project.candidates.length === 0) {
    return (
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-teal-600" />
          <h3 className="font-semibold tracking-tight">Candidate problem statements</h3>
        </div>
        <p className="mt-3 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Run the Scope Agent to propose impact-scored problem statements grounded in your evidence.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-teal-600" />
        <h3 className="font-semibold tracking-tight">Candidate problem statements</h3>
        <span className="text-sm text-muted-foreground">
          Tune impact &amp; effort, then select the one problem to pursue.
        </span>
      </div>

      <RadioGroup
        value={project.candidates.find((c) => c.selected)?.id ?? ""}
        onValueChange={(id) => update(id, { selected: true })}
        className="gap-4"
        disabled={!isCurrent}
      >
        {project.candidates.map((c) => {
          const ratio = c.effort === 0 ? 0 : c.impact / c.effort;
          return (
            <div
              key={c.id}
              className={`flex gap-4 rounded-xl border bg-white p-5 shadow-sm transition-colors ${
                c.selected ? "border-teal-400 ring-1 ring-teal-300" : ""
              }`}
            >
              <div className="flex flex-col items-center gap-2 pt-1">
                <RadioGroupItem value={c.id} id={`cand-${c.id}`} aria-label={`Select ${c.title}`} />
                {c.selected && (
                  <Badge className="border-transparent bg-teal-600 text-[10px] text-white">selected</Badge>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <Label htmlFor={`cand-${c.id}`} className="cursor-pointer text-base font-medium" dir="auto">
                    {c.title}
                  </Label>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground" dir="auto">
                    {c.description}
                  </p>
                </div>

                {c.evidenceIds && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.evidenceIds.split(",").filter(Boolean).map((code) => (
                      <Badge
                        key={code}
                        variant="outline"
                        className="border-teal-200 bg-teal-50 font-mono text-xs font-normal text-teal-700"
                        title={evidenceTitles.get(code.trim()) ?? code}
                      >
                        {code.trim()}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                      <span>Impact</span>
                      <span className="font-semibold text-foreground">{c.impact}/5</span>
                    </div>
                    <Slider
                      value={[c.impact]}
                      min={1}
                      max={5}
                      step={1}
                      disabled={!isCurrent}
                      onValueCommit={([v]) => update(c.id, { impact: v })}
                      aria-label="Impact score"
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                      <span>Effort</span>
                      <span className="font-semibold text-foreground">{c.effort}/5</span>
                    </div>
                    <Slider
                      value={[c.effort]}
                      min={1}
                      max={5}
                      step={1}
                      disabled={!isCurrent}
                      onValueCommit={([v]) => update(c.id, { effort: v })}
                      aria-label="Effort score"
                    />
                  </div>
                </div>

                <Badge
                  variant="outline"
                  className={
                    ratio >= 1.5
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : ratio >= 1
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                  }
                >
                  value ratio {ratio.toFixed(2)}
                </Badge>
              </div>
            </div>
          );
        })}
      </RadioGroup>
    </section>
  );
}
