"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { STAGES, STAGE_META, type ProjectDTO, type Stage } from "@/lib/rp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Bot, CheckCircle2, Loader2, CircleDashed, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ElicitationStage } from "@/components/rp/stage-elicitation";
import { ProblemsStage } from "@/components/rp/stage-problems";
import { ExtractionStage } from "@/components/rp/stage-extraction";
import { AmbiguityStage } from "@/components/rp/stage-ambiguity";
import { StoriesStage } from "@/components/rp/stage-stories";
import { ConflictsStage } from "@/components/rp/stage-conflicts";
import { CompleteStage } from "@/components/rp/stage-complete";

interface WorkspaceProps {
  project: ProjectDTO;
  busy: boolean;
  setBusy: (b: boolean) => void;
  refresh: () => Promise<void>;
  backHome: () => Promise<void>;
}

export function Workspace({ project, busy, setBusy, refresh, backHome }: WorkspaceProps) {
  const { toast } = useToast();
  const [viewStage, setViewStage] = useState<Stage | null>(null);

  const stage = project.status === "complete" ? ("CONFLICTS" as Stage) : project.currentStage;
  const viewing = viewStage ?? stage;
  const meta = STAGE_META[stage];
  const isCurrent = viewing === stage && project.status !== "complete";
  const stageStatus = project.stageStatus;

  const runAgent = async () => {
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}/pipeline`, {
        method: "POST",
        body: JSON.stringify({ action: "run" }),
      });
      await refresh();
      toast({ title: "Agent finished", description: `${meta.agent} output is ready for your review.` });
    } catch (e) {
      await refresh();
      toast({ title: "Agent run failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}/pipeline`, {
        method: "POST",
        body: JSON.stringify({ action: "approve" }),
      });
      setViewStage(null);
      await refresh();
      toast({ title: "Stage approved", description: "Human gate passed — continue when ready." });
    } catch (e) {
      toast({ title: "Cannot approve yet", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const stageIdx = STAGES.indexOf(stage);
  const viewIdx = STAGES.indexOf(viewing);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-teal-50/60 to-background">
      {/* top bar */}
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 lg:px-8">
          <Button variant="ghost" size="icon" onClick={backHome} aria-label="Back to projects">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold tracking-tight">{project.name}</h1>
            <p className="text-xs text-muted-foreground">
              {project.status === "complete"
                ? "Pipeline complete — requirements baseline ready"
                : `Stage ${stageIdx + 1} of ${STAGES.length} · ${meta.title} · ${meta.hitl}`}
            </p>
          </div>
          {project.isDemo && <Badge variant="outline" className="border-teal-300 text-teal-700">Demo</Badge>}
          <Badge
            variant="outline"
            className={
              project.status === "complete"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-teal-300 bg-teal-50 text-teal-700"
            }
          >
            {project.status === "complete" ? "Complete" : STAGE_META[stage].title}
          </Badge>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[280px_1fr] lg:px-8">
        {/* stepper */}
        <nav aria-label="Pipeline stages" className="space-y-1">
          {STAGES.map((s, i) => {
            const done = project.status === "complete" || i < stageIdx;
            const current = i === stageIdx && project.status !== "complete";
            const locked = i > stageIdx && project.status !== "complete";
            const clickable = project.status === "complete" || i <= stageIdx;
            return (
              <button
                key={s}
                disabled={!clickable}
                onClick={() => clickable && setViewStage(s)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  viewing === s
                    ? "border-teal-300 bg-teal-50"
                    : clickable
                      ? "border-transparent hover:bg-muted"
                      : "border-transparent opacity-60"
                }`}
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    done
                      ? "bg-emerald-100 text-emerald-700"
                      : current
                        ? "bg-teal-600 text-white"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : current ? (
                    stageStatus === "agent_running" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      i + 1
                    )
                  ) : locked ? (
                    <Lock className="h-3.5 w-3.5" />
                  ) : (
                    <CircleDashed className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{STAGE_META[s].title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {project.status === "complete"
                      ? "approved"
                      : done
                        ? "approved"
                        : current
                          ? stageStatus.replace(/_/g, " ")
                          : "locked"}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* stage panel */}
        <main className="min-w-0 space-y-6">
          {/* stage header card */}
          <section className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <div className="mb-1 flex items-center gap-2">
                  <Bot className="h-4 w-4 text-teal-600" />
                  <span className="text-sm font-medium text-teal-700">{STAGE_META[viewing].agent}</span>
                  <Badge variant="outline" className="font-normal">
                    Stage {viewIdx + 1}
                  </Badge>
                </div>
                <h2 className="text-xl font-semibold tracking-tight">{STAGE_META[viewing].title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {STAGE_META[viewing].blurb}
                </p>
              </div>
              {isCurrent && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {stageStatus === "awaiting_input" && (
                    <Button onClick={runAgent} disabled={busy} className="bg-teal-600 hover:bg-teal-700">
                      {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                      Run {STAGE_META[viewing].agent}
                    </Button>
                  )}
                  {stageStatus === "agent_running" && (
                    <Button disabled>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Agent working…
                    </Button>
                  )}
                  {stageStatus === "awaiting_review" && (
                    <Button onClick={approve} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Approve &amp; continue
                    </Button>
                  )}
                </div>
              )}
            </div>
            {isCurrent && stageStatus === "awaiting_review" && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Human gate: {STAGE_META[viewing].hitl}
              </p>
            )}
          </section>

          {/* stage content */}
          {project.status === "complete" ? (
            <CompleteStage project={project} refresh={refresh} />
          ) : (
            <>
              {viewing === "ELICITATION" && <ElicitationStage project={project} isCurrent={isCurrent} refresh={refresh} />}
              {viewing === "PROBLEM_SELECTION" && <ProblemsStage project={project} isCurrent={isCurrent} refresh={refresh} />}
              {viewing === "EXTRACTION" && <ExtractionStage project={project} isCurrent={isCurrent} refresh={refresh} />}
              {viewing === "AMBIGUITY" && <AmbiguityStage project={project} isCurrent={isCurrent} refresh={refresh} />}
              {viewing === "STORIES" && <StoriesStage project={project} isCurrent={isCurrent} refresh={refresh} />}
              {viewing === "CONFLICTS" && <ConflictsStage project={project} isCurrent={isCurrent} refresh={refresh} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
