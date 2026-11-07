"use client";

// PHASE 02 · ROUTE PLOT — impact-aware problem selection (N2).

import { api } from "@/lib/api";
import { type ProjectDTO } from "@/lib/rp";
import { HudPanel, Chip, Meter, SectionHead, EmptyBay } from "@/components/rp/hud";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Route, Crosshair } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";

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
  const { lang } = useLang();
  const ar = lang === "ar";

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
  const selected = project.candidates.find((c) => c.selected);

  if (project.candidates.length === 0) {
    return (
      <HudPanel className="p-6">
        <SectionHead icon={Route} title={ar ? "مسارات المشكلات المقترحة" : "Candidate routes"} blurb={ar ? "صياغات للمشكلات مدعومة بأدلتك ومرتبة حسب الأثر." : "Impact-scored problem statements grounded in your evidence."} />
        <EmptyBay>{ar ? "شغّل وكيل تحديد النطاق لاقتراح مشكلات تستند إلى الأدلة." : "Run the Scope Agent to plot candidate problem statements grounded in your evidence."}</EmptyBay>
      </HudPanel>
    );
  }

  return (
    <section className="space-y-4">
      <SectionHead
        icon={Route}
        title={ar ? "مسارات المشكلات المقترحة" : "Candidate routes"}
        blurb={ar ? "اضبط الأثر والجهد لكل مقترح؛ وتتحدث نسبة القيمة تلقائيًا. اختر مسارًا للمتابعة." : "Tune impact & effort per candidate — the value ratio updates live. Commit to one route to continue."}
        right={
          selected ? (
            <Chip tone="verify">
              <Crosshair className="h-3 w-3" /> {ar ? "تم اعتماد المسار" : "route committed"}
            </Chip>
          ) : (
            <Chip tone="signal">{ar ? "لم يُحدد مسار بعد" : "no route yet"}</Chip>
          )
        }
      />

      <RadioGroup
        value={selected?.id ?? ""}
        onValueChange={(id) => update(id, { selected: true })}
        className="gap-4"
        disabled={!isCurrent}
      >
        {project.candidates.map((c) => {
          const ratio = c.effort === 0 ? 0 : c.impact / c.effort;
          return (
            <div
              key={c.id}
              className={`hud-panel rounded-lg p-5 transition-all duration-300 ${
                c.selected ? "hud-glow border-aura/50" : "hover:border-aura/30"
              }`}
            >
              <div className="flex gap-4">
                <div className="flex flex-col items-center gap-2 pt-1">
                  <RadioGroupItem value={c.id} id={`cand-${c.id}`} aria-label={ar ? `اختر ${c.title}` : `Select ${c.title}`} className="border-aura/50 text-aura" />
                  {c.selected && <Chip tone="aura">{ar ? "محدد" : "selected"}</Chip>}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <Label htmlFor={`cand-${c.id}`} className="cursor-pointer font-display text-base font-semibold" dir="auto">
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
                          className="border-aura/30 bg-aura/5 font-mono text-xs font-normal text-aura"
                          title={evidenceTitles.get(code.trim()) ?? code}
                        >
                          {code.trim()}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-1.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span>{ar ? "الأثر" : "impact"}</span>
                        <span className="text-aura tabular-nums">{c.impact}/5</span>
                      </div>
                      <Slider
                        value={[c.impact]}
                        min={1}
                        max={5}
                        step={1}
                        disabled={!isCurrent}
                        onValueCommit={([v]) => update(c.id, { impact: v })}
                        aria-label={ar ? "درجة الأثر" : "Impact score"}
                      />
                      <Meter value={c.impact} max={5} tone="verify" className="mt-1.5" />
                    </div>
                    <div>
                      <div className="mb-1.5 flex justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span>{ar ? "الجهد" : "effort"}</span>
                        <span className="text-signal tabular-nums">{c.effort}/5</span>
                      </div>
                      <Slider
                        value={[c.effort]}
                        min={1}
                        max={5}
                        step={1}
                        disabled={!isCurrent}
                        onValueCommit={([v]) => update(c.id, { effort: v })}
                        aria-label={ar ? "درجة الجهد" : "Effort score"}
                      />
                      <Meter value={c.effort} max={5} tone="signal" className="mt-1.5" />
                    </div>
                  </div>

                  <Chip tone={ratio >= 1.5 ? "verify" : ratio >= 1 ? "signal" : "coral"}>
                    {ar ? `نسبة القيمة ${ratio.toFixed(2)}` : `value ratio ${ratio.toFixed(2)}`}
                  </Chip>
                </div>
              </div>
            </div>
          );
        })}
      </RadioGroup>
    </section>
  );
}
