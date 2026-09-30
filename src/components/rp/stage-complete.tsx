"use client";

import { api } from "@/lib/api";
import { PRIORITY_ORDER, type ProjectDTO } from "@/lib/rp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, RotateCcw, Trophy, Gauge, ListChecks, BookOpen, GitMerge, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function CompleteStage({
  project,
  refresh,
}: {
  project: ProjectDTO;
  refresh: () => Promise<void>;
}) {
  const { toast } = useToast();

  const reopen = async () => {
    try {
      await api(`/api/projects/${project.id}/pipeline`, {
        method: "POST",
        body: JSON.stringify({ action: "reopen" }),
      });
      await refresh();
      toast({ title: "Pipeline reopened", description: "The baseline is unlocked for further iteration." });
    } catch (e) {
      toast({ title: "Could not reopen", description: (e as Error).message, variant: "destructive" });
    }
  };

  const exportJson = () => {
    const payload = {
      project: { name: project.name, brief: project.brief, exportedAt: new Date().toISOString() },
      evidences: project.evidences,
      questions: project.questions,
      selectedProblem: project.candidates.find((c) => c.selected) ?? null,
      requirements: project.requirements,
      stories: project.stories,
      conflicts: project.conflicts,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/\W+/g, "_")}_requirements_baseline.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const approved = project.requirements.filter((r) => r.priority !== "Won't");
  const byPriority = PRIORITY_ORDER.map((p) => ({
    p,
    n: approved.filter((r) => r.priority === p).length,
  }));
  const maxN = Math.max(1, ...byPriority.map((b) => b.n));
  const assessed = project.requirements.filter((r) => r.ambiguity >= 0);
  const avgAmb = assessed.length
    ? Math.round(assessed.reduce((s, r) => s + r.ambiguity, 0) / assessed.length)
    : 0;
  const openConflicts = project.conflicts.filter((c) => c.status === "open").length;
  const selected = project.candidates.find((c) => c.selected);

  const stats = [
    { icon: FileText, label: "Evidence sources", value: project.evidences.length },
    { icon: ListChecks, label: "Requirements", value: approved.length },
    { icon: Gauge, label: "Avg ambiguity", value: avgAmb },
    { icon: BookOpen, label: "User stories", value: project.stories.length },
    { icon: GitMerge, label: "Open conflicts", value: openConflicts },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100">
              <Trophy className="h-5 w-5 text-emerald-600" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Requirements baseline ready</h2>
              <p className="text-sm text-muted-foreground">
                All six stages completed with human approval at every gate.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reopen}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reopen pipeline
            </Button>
            <Button onClick={exportJson} className="bg-teal-600 hover:bg-teal-700">
              <Download className="mr-2 h-4 w-4" /> Export baseline (JSON)
            </Button>
          </div>
        </div>

        {selected && (
          <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/60 p-4">
            <span className="text-xs font-semibold uppercase tracking-wide text-teal-700">
              Selected problem
            </span>
            <p className="mt-1 font-medium" dir="auto">
              {selected.title}
            </p>
            <p className="mt-1 text-sm text-muted-foreground" dir="auto">
              {selected.description}
            </p>
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-white p-4 text-center shadow-sm">
            <s.icon className="mx-auto h-4 w-4 text-teal-600" />
            <div className="mt-2 text-2xl font-semibold tracking-tight">{s.value}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold tracking-tight">MoSCoW distribution</h3>
        <div className="space-y-2.5">
          {byPriority.map(({ p, n }) => (
            <div key={p} className="flex items-center gap-3">
              <Badge variant="outline" className="w-16 justify-center">
                {p}
              </Badge>
              <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted">
                <div
                  className={`h-full rounded-md ${
                    p === "Must"
                      ? "bg-rose-400"
                      : p === "Should"
                        ? "bg-amber-400"
                        : p === "Could"
                          ? "bg-teal-400"
                          : "bg-slate-300"
                  }`}
                  style={{ width: `${(n / maxN) * 100}%` }}
                />
              </div>
              <span className="w-8 text-right text-sm font-medium">{n}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {project.requirements.filter((r) => r.priority === "Won't").length} requirement(s) marked
          &quot;Won&apos;t&quot; are excluded from the baseline but kept for audit.
        </p>
      </section>
    </div>
  );
}
