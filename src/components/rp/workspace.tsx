"use client";

// ─────────────────────────────────────────────────────────────
// THE FLIGHT — mission workspace shell. Renders the animated
// flight-path rail and each phase cockpit with smooth transitions.
// Human-gate actions (run agent / approve) preserved exactly.
// ─────────────────────────────────────────────────────────────

import { useState } from "react";
import { api } from "@/lib/api";
import { STAGES, type ProjectDTO, type Stage } from "@/lib/rp";
import { FLIGHT_PLAN, STATUS_CHIP } from "@/lib/registry";
import { useLang } from "@/lib/i18n";
import { HudPanel, Eyebrow, Chip, LiveDot, type Tone } from "@/components/rp/hud";
import { FlightPath } from "@/components/rp/flightpath";
import { ICONS } from "@/components/rp/icons";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Bot, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { ElicitationStage } from "@/components/rp/stage-elicitation";
import { ProblemsStage } from "@/components/rp/stage-problems";
import { ExtractionStage } from "@/components/rp/stage-extraction";
import { AmbiguityStage } from "@/components/rp/stage-ambiguity";
import { StoriesStage } from "@/components/rp/stage-stories";
import { ConflictsStage } from "@/components/rp/stage-conflicts";
import { DebriefBay } from "@/components/rp/stage-complete";

interface WorkspaceProps {
  project: ProjectDTO;
  busy: boolean;
  setBusy: (b: boolean) => void;
  refresh: () => Promise<void>;
  backHome: () => Promise<void>;
}

// view order = 6 engine stages, then debrief when complete
const VIEW_ORDER: (Stage | "DEBRIEF")[] = [...STAGES, "DEBRIEF"];

export function Workspace({ project, busy, setBusy, refresh, backHome }: WorkspaceProps) {
  const { toast } = useToast();
  const { lang, toggle } = useLang();
  const [viewStage, setViewStage] = useState<Stage | "DEBRIEF" | null>(null);
  const [plannerArm, setPlannerArm] = useState("impact_aware");
  const ar = lang === "ar";

  const complete = project.status === "complete";
  const stage: Stage = complete ? "CONFLICTS" : project.currentStage;
  const stageIdx = STAGES.indexOf(stage);
  const viewing: Stage | "DEBRIEF" = viewStage ?? (complete ? "DEBRIEF" : stage);
  const viewIdx = VIEW_ORDER.indexOf(viewing);
  const phase = FLIGHT_PLAN[Math.min(viewIdx, FLIGHT_PLAN.length - 1)];
  const isCurrent = !complete && viewing === stage;
  const running = project.stageStatus === "agent_running";
  const PhaseIcon = ICONS[phase.icon] ?? Bot;

  const runAgent = async () => {
    setBusy(true);
    try {
      await api(`/api/projects/${project.id}/pipeline`, {
        method: "POST",
        body: JSON.stringify({ action: "run", ...(stage === "ELICITATION" ? { arm: plannerArm } : {}) }),
      });
      await refresh();
      toast({ title: ar ? "أنهى الوكيل عمله" : "Agent finished", description: ar ? `${phase.agent} — النتيجة بانتظار مراجعتك.` : `${phase.agent} output is ready for your review.` });
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
      toast({ title: ar ? "تمت الموافقة" : "Gate passed", description: ar ? "بوابة بشرية — تابع متى شئت." : "Human gate passed — continue when ready." });
    } catch (e) {
      toast({ title: "Cannot approve yet", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const stageStatusChip = STATUS_CHIP[complete ? "complete" : project.stageStatus] ?? STATUS_CHIP.active;
  const stageStatusTone = (["verify", "signal", "plasma", "aura"] as Tone[]).includes(stageStatusChip.tone as Tone)
    ? (stageStatusChip.tone as Tone)
    : "aura";

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* command bar */}
      <header className="glass sticky top-0 z-40 border-b border-border/70">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 lg:px-8">
          <Button variant="ghost" size="icon" onClick={backHome} aria-label={ar ? "عودة إلى مركز التحكم" : "Back to Mission Control"}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-base font-bold tracking-tight">{project.name}</h1>
              {project.isDemo && <Chip tone="plasma">DEMO</Chip>}
            </div>
            <Eyebrow className="mt-0.5 block text-[9px]">
              {complete
                ? ar
                  ? "المهمة هبطت — خط الأساس جاهز"
                  : "MISSION LANDED — BASELINE READY"
                : `${ar ? "المرحلة" : "PHASE"} ${phase.num} · ${ar ? FLIGHT_PLAN[stageIdx].titleAr : FLIGHT_PLAN[stageIdx].title.toUpperCase()}`}
            </Eyebrow>
          </div>
          <Chip tone={stageStatusTone} className="hidden sm:inline-flex">
            <LiveDot tone={stageStatusTone} /> {stageStatusChip.label}
          </Chip>
          <Button variant="outline" size="sm" onClick={toggle} aria-label="Toggle language" className="px-2">
            <span className="font-mono text-xs">{ar ? "EN" : "ع"}</span>
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
        {/* flight path rail */}
        <HudPanel className="mb-6 px-4 pb-3 pt-4 lg:px-6" as="div">
          <FlightPath
            totalStages={STAGES.length}
            currentIdx={stageIdx}
            viewingIdx={viewIdx}
            running={running || busy}
            onSelect={(i) => setViewStage(VIEW_ORDER[i])}
            complete={complete}
          />
        </HudPanel>

        {/* phase header */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`head-${viewing}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <HudPanel className="mb-6 p-6" as="section">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <PhaseIcon className="h-4 w-4 text-aura" />
                    <Eyebrow>{phase.agent}</Eyebrow>
                    <Chip tone="muted">{ar ? "المرحلة" : "PHASE"} {phase.num}</Chip>
                  </div>
                  <h2 className="font-display text-xl font-bold tracking-tight">
                    {ar ? phase.titleAr : phase.title} — <span className="text-muted-foreground">{phase.callsign}</span>
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {viewing === "DEBRIEF"
                      ? ar
                        ? "أدوات الجلسة الختامية: الصحة، الانحراف، حِزَم القيود، نفق المحاكاة، خريطة الأبراج، والتصدير والتكامل."
                        : "Instrument suite for the landed baseline: health, drift, constraint packs, wind tunnel, constellation graph, exports and tracker sync."
                      : ar
                        ? "بوابة بشرية: " + phase.gateAr
                        : phase.gate}
                  </p>
                </div>
                {isCurrent && (
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {project.stageStatus === "awaiting_input" && viewing === "ELICITATION" && (
                      <Select value={plannerArm} onValueChange={setPlannerArm}>
                        <SelectTrigger aria-label="Planner arm" className="h-9 w-[220px] border-border/80 bg-secondary/40 font-mono text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="impact_aware">◆ impact-aware planner (utility formula)</SelectItem>
                          <SelectItem value="single_shot">single-shot baseline</SelectItem>
                          <SelectItem value="random">random selection</SelectItem>
                          <SelectItem value="llm">LLM self-selection</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {project.stageStatus === "awaiting_input" && (
                      <Button onClick={runAgent} disabled={busy} className="bg-aura font-semibold text-primary-foreground hover:bg-aura/85">
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                        {ar ? "شغّل" : "Run"} {phase.agent}
                      </Button>
                    )}
                    {running && (
                      <Button disabled className="border-plasma/40 bg-plasma/10 text-plasma">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {ar ? "الوكيل يعمل…" : "Agent working…"}
                      </Button>
                    )}
                    {project.stageStatus === "awaiting_review" && (
                      <Button onClick={approve} disabled={busy} className="bg-verify font-semibold text-[#052b1c] hover:bg-verify/85">
                        <CheckCircle2 className="mr-2 h-4 w-4" /> {ar ? "وافق وتابع" : "Approve & continue"}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {isCurrent && project.stageStatus === "awaiting_review" && (
                <p className="mt-4 flex items-start gap-2 rounded-md border border-signal/30 bg-signal/10 px-3 py-2 text-xs text-signal">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <span className="font-mono font-semibold tracking-wider">HUMAN GATE · </span>
                    {ar ? phase.gateAr : phase.gate}
                  </span>
                </p>
              )}
            </HudPanel>
          </motion.div>
        </AnimatePresence>

        {/* phase cockpit */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`content-${viewing}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {complete || viewing === "DEBRIEF" ? (
              <DebriefBay project={project} refresh={refresh} />
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
          </motion.div>
        </AnimatePresence>

        <p className="mt-8 pb-4 text-center font-mono text-[10px] text-muted-foreground/60">
          {ar ? "كل قرار مسجّل في سجل التدقيق" : "every decision journaled"}
        </p>
      </div>
    </div>
  );
}
