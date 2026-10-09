"use client";

// ─────────────────────────────────────────────────────────────
// MISSION CONTROL — the home flight deck.
// Every number is live from /api/telemetry and /api/projects
// (dynamicity rule); every label comes from the central registry.
// ─────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { STAGES, type Stage } from "@/lib/rp";
import { FLIGHT_PLAN, FEATURE_ATLAS, IDENTITY, INTEGRATIONS, STATUS_CHIP, TELEMETRY_LABELS } from "@/lib/registry";
import { useLang } from "@/lib/i18n";
import { HudPanel, Eyebrow, CountUp, Chip, RadarSweep, Reveal, LiveDot, SectionHead, type Tone } from "@/components/rp/hud";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Radar,
  Rocket,
  Plus,
  Sparkles,
  Trash2,
  MoreHorizontal,
  FileText,
  ListChecks,
  BookOpen,
  ChevronRight,
  Telescope,
  Route,
  Languages,
  Crosshair,
  Github,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ICONS } from "@/components/rp/icons";
import type { ProjectSummary } from "@/lib/rp";

interface Telemetry {
  generatedAt: string;
  fleet: { missions: number; inFlight: number; complete: number };
  totals: {
    evidence: number;
    requirements: number;
    stories: number;
    decisions: number;
    conflictsResolved: number;
    questionsAnswered: number;
    assumptionsCarried: number;
    arabicEvidence: number;
  };
}

const TONE_OF: Record<string, Tone> = {
  live: "verify",
  "in-dev": "signal",
  planned: "muted",
};

export function MissionControl({
  projects,
  busy,
  setBusy,
  onOpen,
  onCreated,
  onDeleted,
}: {
  projects: ProjectSummary[] | null;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onOpen: (id: string) => Promise<void>;
  onCreated: (id: string) => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const { toast } = useToast();
  const { lang, toggle } = useLang();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const ar = lang === "ar";

  useEffect(() => {
    api<Telemetry>("/api/telemetry")
      .then(setTelemetry)
      .catch(() => setTelemetry(null));
  }, [projects]);

  const createProject = async () => {
    setBusy(true);
    try {
      const data = await api<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name, brief }),
      });
      setOpen(false);
      setName("");
      setBrief("");
      await onCreated(data.project.id);
    } catch (e) {
      toast({ title: "Could not create project", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const loadDemo = async () => {
    setBusy(true);
    try {
      const data = await api<{ projectId: string; existed: boolean }>("/api/demo", { method: "POST" });
      toast({
        title: data.existed ? "Demo mission ready" : ar ? "تم تحميل المهمة التجريبية" : "Demo mission loaded",
        description: ar ? "أدلة بالعامية المصرية والكود-سويتشينج جاهزة." : "Egyptian Arabic + code-switched evidence included.",
      });
      await onCreated(data.projectId);
    } catch (e) {
      toast({ title: "Could not load demo", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await api(`/api/projects/${id}`, { method: "DELETE" });
      await onDeleted();
      toast({ title: ar ? "تم حذف المهمة" : "Mission deleted" });
    } catch (e) {
      toast({ title: "Could not delete", description: (e as Error).message, variant: "destructive" });
    }
  };

  // radar blips: one per mission, angle by index, radius by progress
  const blips =
    projects?.slice(0, 8).map((p, i) => {
      const idx = p.status === "complete" ? STAGES.length : Math.max(0, STAGES.indexOf(p.currentStage as Stage));
      const progress = idx / STAGES.length;
      return {
        angle: -90 + (360 / Math.max(1, Math.min(projects.length, 8))) * i,
        radius: 0.28 + progress * 0.62,
        label: p.isDemo ? "DEMO" : undefined,
        tone: (p.status === "complete" ? "verify" : p.isDemo ? "plasma" : "aura") as Tone,
        onClick: () => onOpen(p.id),
      };
    }) ?? [];

  const heroStats = telemetry
    ? [
        { key: "missions" as const, value: telemetry.fleet.missions },
        { key: "evidence" as const, value: telemetry.totals.evidence },
        { key: "requirements" as const, value: telemetry.totals.requirements },
        { key: "decisions" as const, value: telemetry.totals.decisions },
      ]
    : [];

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="grid-bg pointer-events-none absolute inset-x-0 top-0 h-[640px]" aria-hidden />

      {/* ── command bar ── */}
      <header className="glass sticky top-0 z-40 border-b border-border/70">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <span className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-aura/40 bg-aura/10">
              <Radar className="h-4.5 w-4.5 text-aura" />
              <span className="absolute inset-0 animate-pulse-ring rounded-lg border border-aura/30" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-display text-sm font-bold leading-tight tracking-tight">{ar ? IDENTITY.nameAr : IDENTITY.name}</div>
              <Eyebrow className="leading-tight">{IDENTITY.codename}</Eyebrow>
            </div>
          </div>
          <nav className="hidden items-center gap-5 md:flex" aria-label="Primary">
            <a href="#fleet" className="text-sm text-muted-foreground transition-colors hover:text-aura">{ar ? "الأسطول" : "Fleet"}</a>
            <a href="#flightplan" className="text-sm text-muted-foreground transition-colors hover:text-aura">{ar ? "خطة الرحلة" : "Flight Plan"}</a>
            <a href="#instruments" className="text-sm text-muted-foreground transition-colors hover:text-aura">{ar ? "الأدوات" : "Instruments"}</a>
          </nav>
          <div className="flex items-center gap-2">
            <Chip tone="plasma" className="hidden sm:inline-flex">
              <LiveDot tone="plasma" /> {ar ? "بوابة بشرية في كل مرحلة" : "human-gated · evidence-driven"}
            </Chip>
            <Button variant="outline" size="sm" onClick={toggle} aria-label="Toggle language">
              <Languages className="h-4 w-4" />
              <span className="font-mono text-xs">{ar ? "EN" : "ع"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 lg:px-8">
        {/* ── hero ── */}
        <section className="grid items-center gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
          <Reveal>
            <Eyebrow className="mb-4 block">
              ◉ {ar ? "مركز التحكم في هندسة المتطلبات" : "REQUIREMENTS ENGINEERING · MISSION CONTROL"}
            </Eyebrow>
            <h1 className="font-display text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              {ar ? IDENTITY.taglineAr : IDENTITY.tagline}
            </h1>
            <p className="mt-4 max-w-xl leading-relaxed text-muted-foreground">
              {ar
                ? "ستة وكلاء أذكياء يقودون رحلة من الأدلة الفوضوية إلى خط أساس قابل للدفاع عنه — وبوابة موافقة بشرية عند كل مرحلة يتحكم بها أنت."
                : "Six agentic stages fly your mission from messy stakeholder evidence to a defensible, flight-ready requirements baseline — with a human approval gate at every phase."}
            </p>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground/80">
              {ar ? IDENTITY.subTaglineAr : IDENTITY.subTagline}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="bg-aura font-semibold text-primary-foreground hover:bg-aura/85" disabled={busy}>
                    <Plus className="mr-2 h-4 w-4" /> {ar ? "مهمة جديدة" : "New Mission"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="font-display">{ar ? "بدء مهمة جديدة" : "Launch a new mission"}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <Input
                      placeholder={ar ? "اسم المهمة" : "Mission name"}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <Textarea
                      rows={5}
                      placeholder={
                        ar
                          ? "موجز المشروع — ماذا تبني، لمن، وماذا تعرف حتى الآن؟"
                          : "Project brief — what are you building, for whom, and what do you already know?"
                      }
                      value={brief}
                      onChange={(e) => setBrief(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      {ar ? "إلغاء" : "Cancel"}
                    </Button>
                    <Button
                      onClick={createProject}
                      disabled={!name.trim() || busy}
                      className="bg-aura text-primary-foreground hover:bg-aura/85"
                    >
                      {ar ? "إطلاق" : "Launch"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button size="lg" variant="outline" onClick={loadDemo} disabled={busy} className="border-plasma/40 text-plasma hover:bg-plasma/10 hover:text-plasma">
                <Sparkles className="mr-2 h-4 w-4" />
                {ar ? "المهمة التجريبية" : "Load demo mission"}
              </Button>
            </div>
            <p className="mt-5 font-mono text-[11px] text-muted-foreground/70">
              {ar ? "التسجيل الصوتي والنص بالعربية مدعومان · كل قرار قرار بشري" : "Voice notes & Arabic text supported · every decision is a human decision"}
            </p>
          </Reveal>

          {/* radar + telemetry */}
          <Reveal delay={0.12}>
            <HudPanel glow className="p-6" as="div">
              <div className="mb-3 flex items-center justify-between">
                <Eyebrow>◉ {ar ? "رادار الأسطول — مباشر" : "FLEET RADAR — LIVE"}</Eyebrow>
                <LiveDot tone="verify" />
              </div>
              <div className="flex justify-center">
                <RadarSweep size={286} blips={blips} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border/70 pt-4 sm:grid-cols-4">
                {heroStats.length === 0 &&
                  [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 rounded-md bg-secondary/60" />)}
                {heroStats.map(({ key, value }) => {
                  const meta = TELEMETRY_LABELS[key];
                  const Icon = ICONS[meta.icon];
                  return (
                    <div key={key} className="rounded-md bg-secondary/40 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Icon className="h-3 w-3" />
                        <span className="font-mono text-[9px] uppercase tracking-wider">{ar ? meta.labelAr : meta.label}</span>
                      </div>
                      <div className="font-display text-xl font-bold text-aura">
                        <CountUp value={value} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </HudPanel>
          </Reveal>
        </section>

        {/* ── flight plan ── */}
        <section id="flightplan" className="scroll-mt-20 py-10">
          <Reveal>
            <SectionHead
              icon={Route}
              title={ar ? "خطة الرحلة — من الضباب إلى الإقلاع" : "The Flight Plan — fog to flight-ready"}
              blurb={
                ar
                  ? "سبع مراحل، كل منها وكيل ذكي وبوابة موافقة بشرية — أنت تقرر متى ننتقل."
                  : "Seven phases, each an agentic stage closed by a human gate you control. Nothing advances without you."
              }
            />
          </Reveal>
          <div className="relative mt-2">
            <svg className="absolute inset-x-0 top-5 hidden h-2 w-full lg:block" aria-hidden preserveAspectRatio="none" viewBox="0 0 100 2">
              <line x1="0" y1="1" x2="100" y2="1" stroke="rgba(44,232,200,0.35)" strokeWidth="1.5" strokeDasharray="4 4" className="animate-dash-flow" vectorEffect="non-scaling-stroke" />
            </svg>
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
              {FLIGHT_PLAN.map((ph, i) => {
                const Icon = ICONS[ph.icon] ?? Telescope;
                return (
                  <Reveal key={ph.code} delay={i * 0.06} className="min-w-0">
                    <li className="relative h-full min-w-0">
                      <div className="mb-3 hidden justify-center lg:flex">
                        <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-aura/40 bg-background">
                          <Icon className="h-4 w-4 text-aura" />
                        </span>
                      </div>
                      <HudPanel className={i === FLIGHT_PLAN.length - 1 ? "h-full border-plasma/30 p-4" : "h-full p-4"} as="div">
                        <div className="flex items-center justify-between lg:block">
                          <span className="font-mono text-[10px] tracking-widest text-muted-foreground">{ph.num}</span>
                          <Icon className="h-4 w-4 text-aura lg:hidden" />
                        </div>
                        <h3 className="mt-1.5 font-display text-sm font-bold tracking-tight">{ar ? ph.titleAr : ph.title}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{ar ? ph.callsign : ph.callsign}</p>
                      </HudPanel>
                    </li>
                  </Reveal>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ── fleet ── */}
        <section id="fleet" className="scroll-mt-20 py-10">
          <Reveal>
            <SectionHead
              icon={Rocket}
              title={ar ? "أسطول المهام" : "Mission fleet"}
              blurb={ar ? "كل بطاقة مهمة قيد الطيران — تقدّمها محفوظ لحظة بلحظة." : "Every mission currently in your hangar — progress preserved moment to moment."}
              right={
                telemetry && (
                  <Chip tone="aura">
                    <LiveDot tone="aura" /> {telemetry.fleet.inFlight} {ar ? "في الجو" : "in flight"} · {telemetry.fleet.complete}{" "}
                    {ar ? "مكتملة" : "landed"}
                  </Chip>
                )
              }
            />
          </Reveal>

          {projects === null ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-44 rounded-lg bg-secondary/50" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <Reveal>
              <HudPanel className="p-12 text-center" as="div">
                <Crosshair className="mx-auto h-10 w-10 text-aura/70" />
                <h2 className="mt-4 font-display text-lg font-bold">{ar ? "لا توجد مهام بعد" : "No missions on the board"}</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  {ar
                    ? "ابدأ من الصفر، أو حمّل المهمة التجريبية بأدلة بالعامية المصرية لترى المسار كاملاً."
                    : "Start from scratch, or load the demo mission with Egyptian Arabic and code-switched stakeholder evidence to see the full flight in action."}
                </p>
                <div className="mt-5 flex justify-center gap-2">
                  <Button variant="outline" onClick={loadDemo} disabled={busy} className="border-plasma/40 text-plasma hover:bg-plasma/10">
                    <Sparkles className="mr-2 h-4 w-4" /> {ar ? "المهمة التجريبية" : "Load demo mission"}
                  </Button>
                  <Button onClick={() => setOpen(true)} className="bg-aura text-primary-foreground hover:bg-aura/85">
                    <Plus className="mr-2 h-4 w-4" /> {ar ? "مهمة جديدة" : "New Mission"}
                  </Button>
                </div>
              </HudPanel>
            </Reveal>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projects.map((p, i) => {
                const idx = p.status === "complete" ? STAGES.length : Math.max(0, STAGES.indexOf(p.currentStage as Stage));
                const pct = Math.round((idx / STAGES.length) * 100);
                const phaseLabel =
                  p.status === "complete"
                    ? STATUS_CHIP.complete.label
                    : (FLIGHT_PLAN.find((f) => f.code === p.currentStage)?.title ?? p.currentStage);
                const chipTone = p.status === "complete" ? "verify" : "aura";
                return (
                  <Reveal key={p.id} delay={Math.min(i, 5) * 0.05} className="min-w-0">
                    <li
                      className="group relative min-w-0 cursor-pointer"
                      role="button"
                      tabIndex={0}
                      aria-label={`Open mission ${p.name}`}
                      onClick={() => onOpen(p.id)}
                      onKeyDown={(e) => e.key === "Enter" && onOpen(p.id)}
                    >
                      <HudPanel
                        className="h-full p-5 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-aura/40 group-hover:hud-glow"
                        as="div"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {p.isDemo && <Chip tone="plasma">DEMO</Chip>}
                              <Chip tone={chipTone}>{phaseLabel}</Chip>
                            </div>
                            <h3 className="mt-2 truncate font-display text-base font-bold tracking-tight">{p.name}</h3>
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground" dir="auto">
                              {p.brief || (ar ? "لا يوجد موجز بعد." : "No brief provided yet.")}
                            </p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Mission menu">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="border-border bg-popover">
                              <DropdownMenuItem
                                className="text-coral focus:text-coral"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteProject(p.id);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> {ar ? "حذف" : "Delete"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        <div className="mt-4">
                          <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            <span>{ar ? "تقدم الرحلة" : "flight progress"}</span>
                            <span className="text-aura">{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-aura to-plasma transition-all duration-700"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        <div className="mt-4 flex items-center gap-3 font-mono text-xs text-muted-foreground">
                          <span className="flex items-center gap-1" title="Evidence">
                            <FileText className="h-3.5 w-3.5" /> {p._count.evidences}
                          </span>
                          <span className="flex items-center gap-1" title="Requirements">
                            <ListChecks className="h-3.5 w-3.5" /> {p._count.reqs}
                          </span>
                          <span className="flex items-center gap-1" title="Stories">
                            <BookOpen className="h-3.5 w-3.5" /> {p._count.stories}
                          </span>
                          <ChevronRight className="ml-auto h-4 w-4 text-aura/0 transition-all group-hover:text-aura" />
                        </div>
                      </HudPanel>
                    </li>
                  </Reveal>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── instruments / feature atlas ── */}
        <section id="instruments" className="scroll-mt-20 py-10">
          <Reveal>
            <SectionHead
              icon={Telescope}
              title={ar ? "أطلس القدرات" : "Capability atlas"}
              blurb={
                ar
                  ? "كل قدرة معلنة حالة حقيقية من السجل المركزي — لا مبالغات تسويقية."
                  : "Every declared capability, with its honest status from the central registry — no marketing fog."
              }
            />
          </Reveal>
          <div className="grid gap-4 pb-10 md:grid-cols-2">
            {FEATURE_ATLAS.map((g, gi) => (
              <Reveal key={g.group} delay={gi * 0.06} className="min-w-0">
                <HudPanel className="h-full p-5" as="article">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="font-display text-sm font-bold tracking-tight">{ar ? g.groupAr : g.group}</h3>
                      <p className="text-xs text-muted-foreground">{g.blurb}</p>
                    </div>
                    <Badge variant="outline" className="border-border font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {g.items.length} {ar ? "قدرة" : "caps"}
                    </Badge>
                  </div>
                  <ul className="space-y-2.5">
                    {g.items.map((it) => (
                      <li key={it.name} className="flex items-start justify-between gap-3 rounded-md bg-secondary/35 px-3 py-2">
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium">{ar ? it.nameAr : it.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{it.note}</span>
                        </div>
                        <Chip tone={TONE_OF[it.status]} className="mt-0.5 shrink-0">
                          {STATUS_CHIP[it.status].label}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                </HudPanel>
              </Reveal>
            ))}
          </div>

          {/* integrations strip */}
          <Reveal>
            <HudPanel className="mb-10 flex flex-wrap items-center gap-x-8 gap-y-3 p-5" as="div">
              <Eyebrow className="w-full">◈ {ar ? "خليج التكامل — جاهز للمزامنة" : "INTEGRATIONS BAY — SYNC TARGETS"}</Eyebrow>
              {INTEGRATIONS.map((ig) => {
                const Icon = ICONS[ig.icon] ?? Github;
                return (
                  <div key={ig.id} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-aura/30 bg-aura/5">
                      <Icon className="h-4 w-4 text-aura" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{ig.name}</span>
                        <Chip tone="verify">{STATUS_CHIP[ig.status]?.label ?? "READY"}</Chip>
                      </div>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{ar ? ig.descAr : ig.desc}</p>
                    </div>
                  </div>
                );
              })}
            </HudPanel>
          </Reveal>
        </section>
      </main>

      {/* ── footer (sticky via mt-auto) ── */}
      <footer className="mt-auto border-t border-border/70 bg-card/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 font-mono text-[11px] text-muted-foreground lg:px-8">
          <span>
            {ar ? IDENTITY.nameAr : IDENTITY.name} · {IDENTITY.codename} — {ar ? IDENTITY.subTaglineAr : IDENTITY.subTagline}
          </span>
          <span className="flex items-center gap-1.5">
            <LiveDot tone="plasma" /> {ar ? "قائم على الأدلة · بشري في الحلقة" : "evidence-driven · human-in-the-loop"}
          </span>
        </div>
      </footer>
    </div>
  );
}
