"use client";

// ─────────────────────────────────────────────────────────────
// DEBRIEF INSTRUMENTS — new research & operations bays:
//   PlannerLab        — 4-arm Question-Planner ablation (item 7)
//   CalibrationPanel  — confidence vs critic-verdict calibration (open req 1)
//   ExecutabilitySim  — UNDEFINED = discovery simulator (item 8)
//   SelfAuditPanel    — deterministic platform self-audit (I11 dual role)
//   IntegrationsConsole — GitHub Issues + Jira bidirectional sync (open req 2)
// Every number is fetched live (dynamicity rule).
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { HudPanel, Eyebrow, Chip, EmptyBay, type Tone } from "@/components/rp/hud";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Target,
  Loader2,
  FlaskConical,
  Scale,
  ShieldCheck,
  Download,
  Upload,
  Plug,
  CheckCheck,
  XCircle,
  GitBranch,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";

// ── Planner Lab ──────────────────────────────────────────────

interface ArmMetrics {
  avgUtility: number;
  utilityPerCost: number;
  evidenceCoverage: number;
  redundancyRate: number;
  dialectFit: number;
}
interface PlannerRunDTO {
  id: string;
  arm: string;
  candidates: number;
  metrics: ArmMetrics | null;
  latencyMs: number | null;
  estTokens: number | null;
  createdAt: string;
  questions: { text: string; askCost: number; utility?: { utility: number } | null }[];
}

const ARM_META: Record<string, { label: string; tone: Tone; desc: string }> = {
  impact_aware: { label: "◆ impact-aware", tone: "verify", desc: "utility formula + ask-cost budget (ours)" },
  single_shot: { label: "single-shot", tone: "muted", desc: "one classic LLM call" },
  random: { label: "random", tone: "signal", desc: "5 of 12 picked at random" },
  llm: { label: "LLM pick", tone: "plasma", desc: "the model self-selects" },
};

export function PlannerLab({ projectId }: { projectId: string }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  const { toast } = useToast();
  const armLabel = (arm: string) => ar ? ({ impact_aware: "◆ واعٍ بالأثر", single_shot: "استدعاء واحد", random: "اختيار عشوائي", llm: "اختيار النموذج" } as Record<string, string>)[arm] ?? arm : ARM_META[arm]?.label ?? arm;
  const armDescription = (arm: string) => ar ? ({ impact_aware: "اختيار حسب المنفعة وتكلفة السؤال", single_shot: "استدعاء تقليدي واحد للنموذج", random: "اختيار عشوائي للأسئلة", llm: "النموذج يختار الأسئلة بنفسه" } as Record<string, string>)[arm] ?? "" : ARM_META[arm]?.desc ?? "";
  const [runs, setRuns] = useState<PlannerRunDTO[]>([]);
  const [busyArm, setBusyArm] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ runs: PlannerRunDTO[] }>(`/api/projects/${projectId}/planner`);
      setRuns(d.runs);
    } catch {
      /* first run may not exist */
    } finally {
      setLoaded(true);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    const provider = params.get("oauth");
    const result = params.get("status");
    if ((provider === "github" || provider === "jira") && result) {
      const message = params.get("message");
      toast({
        title: result === "connected"
          ? (ar ? "تم ربط الحساب" : `${provider} account authorized`)
          : (ar ? "لم يكتمل الربط" : `${provider} authorization did not complete`),
        description: message || (result === "connected"
          ? (ar ? "اختر المستودع أو مشروع Jira لتفعيل المزامنة." : "Select a repository or Jira project to enable sync.")
          : (ar ? "يمكنك المحاولة مرة أخرى من لوحة التكاملات." : "You can retry from the integrations console.")),
        variant: result === "connected" ? "default" : "destructive",
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [load, toast, ar]);

  const runArm = async (arm: string) => {
    setBusyArm(arm);
    try {
      const d = await api<{ metrics: ArmMetrics; candidates: number }>(`/api/projects/${projectId}/planner`, {
        method: "POST",
        body: JSON.stringify({ arm }),
      });
      toast({
        title: `${armLabel(arm)} ${ar ? "تم التنفيذ" : "executed"}`,
        description: ar ? `المنفعة ${d.metrics.avgUtility} · التغطية ${d.metrics.evidenceCoverage}% · التكرار ${d.metrics.redundancyRate}% · ملاءمة اللهجة ${d.metrics.dialectFit}%` : `avgUtility ${d.metrics.avgUtility} · coverage ${d.metrics.evidenceCoverage}% · redundancy ${d.metrics.redundancyRate}% · dialect fit ${d.metrics.dialectFit}%`,
      });
      await load();
    } catch (e) {
      toast({ title: ar ? "فشل تشغيل المخطط" : "Planner run failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusyArm(null);
    }
  };

  // best (newest) metrics per arm for the comparison grid
  const bestPerArm: Record<string, ArmMetrics> = {};
  for (const r of runs) {
    if (r.metrics && !bestPerArm[r.arm]) bestPerArm[r.arm] = r.metrics;
  }
  const arms = ["impact_aware", "single_shot", "random", "llm"].filter((a) => bestPerArm[a]);

  return (
    <div className="space-y-4">
      <HudPanel className="p-4" as="div">
        <Eyebrow className="mb-2 block">◉ {ar ? "معادلة المنفعة (حتمية)" : "THE UTILITY FORMULA (deterministic)"}</Eyebrow>
        <p className="font-mono text-xs leading-relaxed text-aura">
          Utility = ( InformationGain × DownstreamImpact × Uncertainty × Risk ) ÷ AskCost
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {ar ? "تُقيّم الأسئلة حسب الإشارة وتُختار ضمن ميزانية تكلفة السؤال. شغّل أي مسار — وتُقيّم جميع المسارات النهائية بواسطة أداة التقييم والمُحكّم نفسيهما لضمان عدالة المقارنة." : "Signal-scored per question, selected under an ask-cost budget. Run any arm — every arm’s final set is judged by the same scorer and judge, so the comparison is fair (single-shot still gets signal-scored post-hoc)."}
        </p>
      </HudPanel>

      <div className="grid gap-2 sm:grid-cols-4">
        {Object.entries(ARM_META).map(([arm, meta]) => (
          <Button
            key={arm}
            size="sm"
            variant="outline"
            disabled={busyArm !== null}
            onClick={() => runArm(arm)}
            className="h-auto flex-col items-start gap-0.5 border-border/80 bg-secondary/30 py-2 text-left"
          >
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              {busyArm === arm ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3 text-aura" />}
              {armLabel(arm)}
            </span>
            <span className="text-[9px] normal-case tracking-normal text-muted-foreground">{armDescription(arm)}</span>
          </Button>
        ))}
      </div>

      {arms.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border/70">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-secondary/50 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{ar ? "المسار" : "arm"}</th>
                <th className="px-3 py-2">{ar ? "متوسط المنفعة ↑" : "avg utility ↑"}</th>
                <th className="px-3 py-2">{ar ? "المنفعة / التكلفة ↑" : "utility / cost ↑"}</th>
                <th className="px-3 py-2">{ar ? "التغطية ↑" : "coverage ↑"}</th>
                <th className="px-3 py-2">{ar ? "التكرار ↓" : "redundancy ↓"}</th>
                <th className="px-3 py-2">{ar ? "ملاءمة اللهجة ↑" : "dialect fit ↑"}</th>
                <th className="px-3 py-2">{ar ? "عدد التشغيلات" : "n runs"}</th>
              </tr>
            </thead>
            <tbody>
              {arms.map((arm) => {
                const m = bestPerArm[arm];
                const n = runs.filter((r) => r.arm === arm).length;
                return (
                  <tr key={arm} className={`border-t border-border/60 ${arm === "impact_aware" ? "bg-aura/5" : ""}`}>
                    <td className="px-3 py-2 font-mono">
                      <Chip tone={ARM_META[arm].tone}>{armLabel(arm)}</Chip>
                    </td>
                    <td className="px-3 py-2 font-mono tabular-nums">{m.avgUtility}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{m.utilityPerCost}</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{m.evidenceCoverage}%</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{m.redundancyRate}%</td>
                    <td className="px-3 py-2 font-mono tabular-nums">{m.dialectFit}%</td>
                    <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">{n}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {loaded && runs.length === 0 && (
        <EmptyBay>
          {ar ? "لا توجد تجارب مقارنة بعد. اختر مسارًا بالأعلى — سيضيف كل تشغيل أسئلته إلى قائمة الإحاطة مع تسجيل تفاصيل المنفعة لكل سؤال." : "No ablation runs yet. Pick an arm above — each run materialises its question set into the Briefing queue with the utility breakdown stamped on every question."}
        </EmptyBay>
      )}
      {runs.length > 0 && (
        <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {runs.slice(0, 6).map((r) => (
            <li key={r.id} className="rounded border border-border/60 bg-secondary/20 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={ARM_META[r.arm]?.tone ?? "muted"}>{armLabel(r.arm)}</Chip>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(r.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {r.candidates} candidates ·{" "}
                  {r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-muted-foreground" dir="auto">
                {r.questions.map((q) => q.text).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Calibration panel ────────────────────────────────────────

interface CalibrationDTO {
  n: number;
  brier: number;
  ece: number;
  verdict: string;
  bins: { range: string; n: number; avgConfidence: number; empirical: number; delta: number }[];
  spread: { supportedAvg: number | null; weakAvg: number | null };
}

export function CalibrationPanel({ projectId }: { projectId: string }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [cal, setCal] = useState<CalibrationDTO | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(true);
    api<CalibrationDTO>(`/api/projects/${projectId}/calibration`)
      .then(setCal)
      .catch(() => {})
      .finally(() => setBusy(false));
  }, [projectId]);

  if (busy) return <EmptyBay><Loader2 className="me-2 inline h-4 w-4 animate-spin text-aura" />{ar ? "جارٍ حساب شرائح موثوقية التقديرات…" : "computing reliability bins…"}</EmptyBay>;
  if (!cal) return <EmptyBay>{ar ? "بيانات المعايرة غير متاحة." : "Calibration data unavailable."}</EmptyBay>;

  if (cal.verdict === "insufficient-data") {
    return (
      <EmptyBay>
        {ar ? `لا توجد متطلبات موثقة كفاية بعد (نحتاج 3 على الأقل بدرجة ثقة وحكم الناقد؛ المتاح حاليًا ${cal.n}). شغّل مرحلتي الاستخراج والغموض أولًا، فالمعايرة تتحقق من توافق الثقة مع أحكام الناقد على الأدلة.` : `Not enough verified requirements yet (need ≥ 3 with confidence + critic verdicts; currently ${cal.n}). Run the Extraction and Ambiguity phases first — calibration validates confidence against the critic’s evidence verdicts.`}
      </EmptyBay>
    );
  }

  const verdictTone: Tone = cal.verdict === "well-calibrated" ? "verify" : cal.verdict === "overconfident" ? "coral" : "signal";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <HudPanel className="p-4 text-center" as="div">
          <Scale className="mx-auto h-4 w-4 text-aura" />
          <div className="mt-1.5 font-display text-xl font-bold tabular-nums">{cal.brier}</div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{ar ? "درجة Brier" : "Brier score"}</div>
        </HudPanel>
        <HudPanel className="p-4 text-center" as="div">
          <div className="font-display text-xl font-bold tabular-nums">{cal.ece}</div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{ar ? "خطأ المعايرة (ECE)" : "Calibration error (ECE)"}</div>
        </HudPanel>
        <HudPanel className="p-4 text-center" as="div">
          <Chip tone={verdictTone} className="mx-auto">{ar ? (cal.verdict === "well-calibrated" ? "معايرة جيدة" : cal.verdict === "overconfident" ? "ثقة مفرطة" : cal.verdict === "underconfident" ? "ثقة أقل من اللازم" : cal.verdict) : cal.verdict}</Chip>
          <div className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{ar ? "التقييم" : "verdict"}</div>
        </HudPanel>
        <HudPanel className="p-4 text-center" as="div">
          <div className="font-display text-xl font-bold tabular-nums">{cal.n}</div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{ar ? "متطلبات موثقة" : "verified requirements"}</div>
        </HudPanel>
      </div>

      <HudPanel className="p-4" as="div">
        <Eyebrow className="mb-3 block">◉ {ar ? "شرائح الموثوقية — الثقة المقدرة مقابل الفعلية" : "RELIABILITY BINS — claimed vs empirical"}</Eyebrow>
        <div className="space-y-3">
          {cal.bins.map((b) => (
            <div key={b.range}>
              <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span>
                  {ar ? "الثقة" : "confidence"} {b.range} <span className="text-foreground/70">· n={b.n}</span>
                </span>
                <span className={b.delta > 0.1 ? "text-coral" : b.delta < -0.1 ? "text-signal" : "text-verify"}>
                  {ar ? (b.delta > 0 ? "مبالغة" : b.delta < 0 ? "أقل من الفعلي" : "متوازن") : (b.delta > 0 ? "over" : b.delta < 0 ? "under" : "cal")} {Math.abs(Math.round(b.delta * 100))}pt
                </span>
              </div>
              <div className="relative h-5 overflow-hidden rounded bg-secondary/70">
                <div className="h-full bg-plasma/50" style={{ width: `${b.avgConfidence}%` }} title={`claimed ${b.avgConfidence}%`} />
                <div
                  className="absolute top-0 h-full border-l-2 border-dashed border-aura"
                  style={{ left: `${b.empirical * 100}%` }}
                  title={`empirical ${Math.round(b.empirical * 100)}%`}
                />
              </div>
              <div className="mt-0.5 font-mono text-[9px] text-muted-foreground">
                {ar ? `المقدرة ${b.avgConfidence}% · المدعومة فعليًا ${Math.round(b.empirical * 100)}%` : `claimed ${b.avgConfidence}% · empirical ${Math.round(b.empirical * 100)}% supported`}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {ar ? "الشريط المتصل يمثل الثقة المقدرة، والعلامة المتقطعة توضح معدل دعم الناقد الفعلي للمتطلب. إذا ظهرت العلامة قبل نهاية الشريط فهذا يعني أن الوكيل يبالغ في تقدير ثقته ضمن هذه الشريحة." : "Solid bar = claimed confidence · dashed marker = how often the critic actually found the requirement supported. A dashed marker left of the bar end means the agent is overconfident in that bin."}
          {cal.spread.supportedAvg !== null && cal.spread.weakAvg !== null && (
            <span className="block mt-1">
              {ar ? "متوسط الثقة في المتطلبات المدعومة " : "Spread: supported requirements average "}<span className="text-foreground">{cal.spread.supportedAvg}%</span>{ar ? " مقابل " : " confidence vs "}<span className="text-foreground">{cal.spread.weakAvg}%</span>{ar ? " للمتطلبات الضعيفة." : " for weak ones."}
            </span>
          )}
        </p>
      </HudPanel>
    </div>
  );
}

// ── Executability simulator ──────────────────────────────────

interface ExecScenarioDTO {
  id: string;
  refId: string;
  requirement: { refId: string; text: string } | null;
  given: string;
  when: string;
  then: string;
  resolution: string;
  undefinedReason: string | null;
  discovery: string | null;
}
interface ExecSummary {
  total: number;
  defined: number;
  undefined: number;
}

export function ExecutabilitySim({ projectId }: { projectId: string }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  const { toast } = useToast();
  const [scenarios, setScenarios] = useState<ExecScenarioDTO[]>([]);
  const [summary, setSummary] = useState<ExecSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<{ scenarios: ExecScenarioDTO[]; summary: ExecSummary }>(`/api/projects/${projectId}/executability`);
      setScenarios(d.scenarios);
      setSummary(d.summary);
    } catch {
      /* none yet */
    } finally {
      setLoaded(true);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    setBusy(true);
    try {
      const d = await api<{ scenarios: number; undefinedCount: number }>(`/api/projects/${projectId}/executability`, { method: "POST" });
      toast({
        title: ar ? "اكتملت المحاكاة" : "Simulation complete",
        description: ar ? `${d.scenarios} سيناريو — تم تسجيل ${d.undefinedCount} حالة غير محددة كاكتشافات.` : `${d.scenarios} scenario(s) — ${d.undefinedCount} UNDEFINED recorded as discoveries.`,
      });
      await load();
    } catch (e) {
      toast({ title: ar ? "فشلت المحاكاة" : "Simulation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={run} disabled={busy} className="bg-aura font-semibold text-primary-foreground hover:bg-aura/85">
          {busy ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="me-2 h-3.5 w-3.5" />}
          {summary ? (ar ? "إعادة المحاكاة" : "Re-simulate") : (ar ? "تشغيل المحاكي" : "Run simulator")}
        </Button>
        {summary && (
          <>
            <Chip tone="aura">{summary.total} {ar ? "سيناريو" : "scenarios"}</Chip>
            <Chip tone="verify">{summary.defined} {ar ? "محدد" : "defined"}</Chip>
            <Chip tone="coral">{summary.undefined} {ar ? "غير محدد ← اكتشافات" : "UNDEFINED → discoveries"}</Chip>
          </>
        )}
      </div>

      {loaded && scenarios.length === 0 && (
        <EmptyBay>
          {ar ? "لا توجد محاكاة بعد. ينشئ المحاكي سيناريوهات محددة بصيغة (المعطيات/عندما/إذن) وفق خط الأساس. وعندما لا يقدم خط الأساس إجابة، يسجل السيناريو كحالة غير محددة ويحولها إلى اكتشاف مع سؤال توضيحي." : "No simulations yet. The simulator writes concrete Given/When/Then scenarios against your baseline; wherever the baseline is silent, the scenario lands as UNDEFINED — a requirement discovery with the clarifying question that would define it."}
        </EmptyBay>
      )}

      <ul className="max-h-96 space-y-3 overflow-y-auto pr-1">
        {scenarios.map((s) => {
          const undef = s.resolution === "undefined";
          return (
            <li key={s.id} className={`rounded-md border p-4 ${undef ? "border-coral/40 bg-coral/5" : "border-verify/25 bg-verify/5"}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`font-mono text-[10px] ${undef ? "border-coral/40 text-coral" : "border-verify/40 text-verify"}`}>
                  {s.refId}
                </Badge>
                <Chip tone={undef ? "coral" : "verify"}>{s.resolution}</Chip>
                {s.requirement && <span className="font-mono text-[10px] text-muted-foreground">{ar ? "المالك" : "owner"} {s.requirement.refId}</span>}
              </div>
              <div className="space-y-1 text-sm" dir="auto">
                <p><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{ar ? "المعطيات · " : "given · "}</span>{s.given}</p>
                <p><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{ar ? "عندما · " : "when · "}</span>{s.when}</p>
                <p><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{ar ? "إذن · " : "then · "}</span>{s.then}</p>
              </div>
              {undef && s.undefinedReason && (
                <p className="mt-2 text-xs text-coral/90" dir="auto">{ar ? "سبب عدم التحديد:" : "WHY UNDEFINED:"} {s.undefinedReason}</p>
              )}
              {undef && s.discovery && (
                <p className="mt-1.5 rounded border border-signal/30 bg-signal/10 px-3 py-1.5 font-mono text-[11px] text-signal" dir="auto">
                  {ar ? "اكتشاف — السؤال أو التعريف التالي:" : "DISCOVERY — ask / define next:"} {s.discovery}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Platform self-audit (constraint-pack dual role) ──────────

interface AuditCheck {
  id: string;
  pack: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  value?: string;
}
interface AuditResult {
  checks: AuditCheck[];
  summary: { pass: number; warn: number; fail: number };
  generatedAt: string;
}

const PACK_LABEL: Record<string, string> = {
  wcag22: "WCAG 2.2",
  performance: "Performance",
  pdpl: "Egypt PDPL",
};

export function SelfAuditPanel() {
  const { lang } = useLang();
  const ar = lang === "ar";
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setBusy(true);
    api<AuditResult>("/api/self-audit")
      .then(setAudit)
      .catch(() => {})
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={load} disabled={busy} className="border-aura/40 text-aura hover:bg-aura/10">
          {busy ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="me-2 h-3.5 w-3.5" />}
          {ar ? "إعادة تدقيق المنصة" : "Re-audit platform"}
        </Button>
        {audit && (
          <>
            <Chip tone="verify">{audit.summary.pass} {ar ? "ناجح" : "pass"}</Chip>
            {audit.summary.warn > 0 && <Chip tone="signal">{audit.summary.warn} {ar ? "تحذير" : "warn"}</Chip>}
            {audit.summary.fail > 0 && <Chip tone="coral">{audit.summary.fail} {ar ? "فشل" : "fail"}</Chip>}
            <span className="font-mono text-[9px] text-muted-foreground">
              {ar ? "أعيد الحساب" : "recomputed"} {new Date(audit.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </>
        )}
      </div>
      {!audit && !busy && <EmptyBay>{ar ? "تدقق المنصة نفسها: حساب تباين WCAG 2.2 وفق رموز التصميم الفعلية، وميزانيات الأداء من القياسات، وبنية حماية البيانات وفق PDPL." : "The platform audits itself: WCAG 2.2 contrast math on live design tokens, performance budgets from telemetry, PDPL structure from the data."}</EmptyBay>}
      {audit && (
        <ul className="space-y-1.5">
          {audit.checks.map((c) => (
            <li key={c.id} className="flex items-start gap-2.5 rounded border border-border/60 bg-secondary/20 px-3 py-2 text-xs">
              {c.status === "pass" ? (
                <CheckCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verify" />
              ) : c.status === "warn" ? (
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />
              ) : (
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-coral" />
              )}
              <div className="min-w-0 flex-1">
                <span className="font-medium">{c.label}</span>
                {c.value && <span className="ms-1.5 font-mono text-[10px] text-aura">{c.value}</span>}
                <span className="block text-muted-foreground">{c.detail}</span>
              </div>
              <Badge variant="outline" className="shrink-0 border-border font-mono text-[9px] text-muted-foreground">
                {PACK_LABEL[c.pack] ?? c.pack}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Integrations console (GitHub + Jira live sync) ───────────

interface SyncMapDTO {
  id: string;
  kind: string;
  direction: string;
  localLabel: string;
  externalKey: string;
  externalUrl: string;
  title: string;
  syncedAt: string;
}
interface OAuthTrackerStatus {
  connected: boolean;
  pendingTarget: boolean;
  account: string;
  scopes: string[];
  expiresAt: string | null;
  needsReauthorization: boolean;
  connectedAt: string | null;
  cloudId?: string;
}
interface TrackerStatus {
  configured: boolean;
  oauth?: OAuthTrackerStatus | null;
  owner?: string;
  repo?: string;
  token?: string;
  baseUrl?: string;
  projectKey?: string;
  email?: string;
  webhookConfigured?: boolean;
}
interface IntegrationStatus {
  github: TrackerStatus;
  jira: TrackerStatus;
}
interface PulledIssue {
  key: string;
  title: string;
  state: string;
  url: string;
}
interface ReverseTraceDTO {
  ok: boolean;
  tracker: { id: string; kind: string; externalKey: string; externalUrl: string; title: string };
  resolution: string;
  guidance?: string;
  requirement?: { id: string; refId: string; text: string; status: string; priority: string };
  trace: {
    status: string;
    direct: { evidenceCode: string; note?: string | null; source?: { title: string; sourceType: string; language: string; consent: boolean; latestRevision?: { version: number; changeNote?: string | null; createdAt?: string | null; createdBy?: string | null } | null } | null }[];
    linkedClaims: { claimRef: string; status: string; relationship: string; evidenceCode?: string | null; revisionVersion?: number | null }[];
    knowledge: { nodeRef: string; kind: string; label: string; status: string; role: string }[];
    stories: { refId: string; title: string; status: string }[];
    impacted: { id: string; refId: string | null; text: string | null; status: string | null; priority: string | null; verifyStatus: string | null; driftStatus: string | null; depth: number; evidenceCount: number; evidenceCodes: string[] }[];
    decisions: { id: string; action: string; actor: string; createdAt?: string | null; mappingMethod: string; requirementRef: string | null }[];
  };
}

interface ReverseModeDTO {
  ok: boolean;
  mode: "requirement_to_trackers";
  requirement: { id: string; refId: string; text: string; status: string; priority: string };
  trackerMappings: (SyncMapDTO & { decisions: ReverseTraceDTO["trace"]["decisions"] })[];
  trace: ReverseTraceDTO["trace"];
}

export function IntegrationsConsole({ projectId }: { projectId: string }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  const { toast } = useToast();
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [maps, setMaps] = useState<SyncMapDTO[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [cfgKind, setCfgKind] = useState<"github" | "jira" | null>(null);
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [pulled, setPulled] = useState<Record<string, PulledIssue[]>>({});
  const [reverseTrace, setReverseTrace] = useState<ReverseTraceDTO | null>(null);
  const [traceBusyId, setTraceBusyId] = useState("");
  const [reverseRequirement, setReverseRequirement] = useState("");
  const [reverseMode, setReverseMode] = useState<ReverseModeDTO | null>(null);
  const [reverseModeBusy, setReverseModeBusy] = useState(false);
  const [targetValues, setTargetValues] = useState<Record<string, string>>({});
  const [targetOwners, setTargetOwners] = useState<Record<string, string>>({});
  const [targetBusy, setTargetBusy] = useState<string | null>(null);
  const [oauthAvailable, setOauthAvailable] = useState({ github: false, jira: false });

  const load = useCallback(async () => {
    try {
      const d = await api<{ status: IntegrationStatus; maps: SyncMapDTO[]; oauthAvailable?: { github: boolean; jira: boolean } }>(`/api/projects/${projectId}/integrations`);
      setStatus(d.status);
      setMaps(d.maps);
      setOauthAvailable(d.oauthAvailable ?? { github: false, jira: false });
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const inspectRequirement = async () => {
    const reference = reverseRequirement.trim();
    if (!reference) return;
    setReverseModeBusy(true);
    setReverseMode(null);
    try {
      const result = await api<ReverseModeDTO>(`/api/projects/${projectId}/traceability/reverse?requirementId=${encodeURIComponent(reference)}`);
      setReverseMode(result);
    } catch (e) {
      toast({ title: ar ? "وضع التتبع العكسي غير متاح" : "Reverse Mode unavailable", description: (e as Error).message, variant: "destructive" });
    } finally {
      setReverseModeBusy(false);
    }
  };

  const inspectReverseTrace = async (mapping: SyncMapDTO) => {
    setTraceBusyId(mapping.id);
    setReverseTrace(null);
    try {
      const result = await api<ReverseTraceDTO>(`/api/projects/${projectId}/traceability/reverse?syncMapId=${encodeURIComponent(mapping.id)}`);
      setReverseTrace(result);
    } catch (e) {
      toast({ title: ar ? "التتبع العكسي غير متاح" : "Reverse trace unavailable", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTraceBusyId("");
    }
  };

  const act = async (kind: "github" | "jira", action: string, extra?: object, okMsg?: string) => {
    setBusy(`${kind}:${action}`);
    try {
      const d = await api<Record<string, unknown>>(`/api/projects/${projectId}/integrations`, {
        method: "POST",
        body: JSON.stringify({ kind, action, ...extra }),
      });
      if (okMsg) toast({ title: okMsg, description: describeResult(action, d) });
      if (action === "pull") setPulled((p) => ({ ...p, [kind]: (d.issues as PulledIssue[]) ?? [] }));
      await load();
      return d;
    } catch (e) {
      toast({ title: `${kind} ${action} failed`, description: (e as Error).message, variant: "destructive" });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const chooseOAuthTarget = async (kind: "github" | "jira") => {
    const value = (targetValues[kind] ?? "").trim();
    if (!value) return;
    setTargetBusy(kind);
    try {
      await api(`/api/projects/${projectId}/integrations/oauth/${kind}/target`, {
        method: "POST",
        body: JSON.stringify(kind === "github"
          ? { owner: targetOwners.github?.trim() || status?.github.oauth?.account, repo: value }
          : { projectKey: value }),
      });
      toast({ title: ar ? "تم اعتماد وجهة المزامنة" : "Sync target verified", description: ar ? "تم التحقق من صلاحية الوصول لدى المزود." : "Provider access to the selected target was verified." });
      setTargetValues((current) => ({ ...current, [kind]: "" }));
      await load();
    } catch (error) {
      toast({ title: ar ? "تعذر اعتماد الوجهة" : "Target verification failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setTargetBusy(null);
    }
  };

  const disconnectOAuth = async (kind: "github" | "jira") => {
    setTargetBusy(kind);
    try {
      await api(`/api/projects/${projectId}/integrations/oauth/${kind}/target`, { method: "DELETE" });
      toast({ title: ar ? "تم فصل الاتصال" : "Provider disconnected", description: ar ? "تم إبطال الاتصال وإزالة بياناته المحلية." : "Provider authorization was revoked and the local connection removed." });
      await load();
    } catch (error) {
      toast({ title: ar ? "تعذر فصل الاتصال" : "Disconnect failed", description: (error as Error).message, variant: "destructive" });
    } finally {
      setTargetBusy(null);
    }
  };

  const saveCfg = async () => {
    if (!cfgKind) return;
    const d = await act(cfgKind, "save-config", { config: cfg }, ar ? "تم حفظ بيانات الاعتماد على الخادم مع إخفاء الأسرار" : "Credentials saved (server-side, masked)");
    if (!d) return;
    if (cfg.webhookSecret?.trim()) {
      const webhook = await act(cfgKind, "save-webhook-secret", { secret: cfg.webhookSecret },
        cfgKind === "github" ? ar ? "تم حفظ سر Webhook الخاص بـGitHub" : "GitHub webhook secret saved" : ar ? "تم حفظ سر Webhook الخاص بـJira" : "Jira webhook secret saved");
      if (!webhook) return;
    }
    setCfgKind(null);
    setCfg({});
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2">
        {(["github", "jira"] as const).map((kind) => {
          const st: TrackerStatus | undefined = status?.[kind];
          const configured = Boolean(st?.configured);
          return (
            <HudPanel key={kind} className="flex h-full flex-col p-4" as="article">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="font-display text-sm font-bold">{kind === "github" ? "GitHub Issues" : "Jira (Cloud)"}</h4>
                <Chip tone={configured ? "verify" : "signal"}>{configured ? (ar ? "متصل" : "connected") : (ar ? "يحتاج بيانات اعتماد" : "needs credentials")}</Chip>
              </div>
              <p className="mb-3 flex-1 text-xs leading-relaxed text-muted-foreground">
                {configured
                  ? kind === "github"
                    ? `${st?.owner}/${st?.repo} · token ${st?.token} · webhook ${st?.webhookConfigured ? "configured" : "not configured"}`
                    : `${st?.baseUrl} · project ${st?.projectKey} · email ${st?.email} · token ${st?.token} · webhook ${st?.webhookConfigured ? "configured" : "not configured"}`
                  : kind === "github"
                    ? "Provide a personal access token (repo scope), owner and repository. Stored server-side; responses always mask secrets."
                    : (ar ? "أدخل الرابط الأساسي للموقع والبريد الإلكتروني ورمز API ومفتاح المشروع. تُحفظ البيانات على الخادم وتُخفى الأسرار في جميع الاستجابات." : "Provide the site baseUrl, account email, API token and project key. Stored server-side; responses always mask secrets.")}
              </p>
              {st?.oauth?.connected ? (
                <div className="mb-3 w-full rounded-lg border border-aura/25 bg-aura/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">{ar ? "اتصال OAuth" : "OAuth authorization"} · {st.oauth.account || (ar ? "حساب موثق" : "Verified account")}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{st.oauth.scopes.join(" · ") || (ar ? "النطاقات غير متاحة" : "Scopes unavailable")} {st.oauth.expiresAt ? " · " + (ar ? "ينتهي" : "expires") + " " + new Date(st.oauth.expiresAt).toLocaleString() : ""}</p>
                    </div>
                    <Chip tone={st.oauth.needsReauthorization ? "signal" : st.oauth.pendingTarget ? "plasma" : "verify"}>{st.oauth.needsReauthorization ? (ar ? "يحتاج إعادة تفويض" : "reauthorization needed") : st.oauth.pendingTarget ? (ar ? "اختر وجهة" : "target required") : (ar ? "مفعّل" : "active")}</Chip>
                  </div>
                  {st.oauth.pendingTarget && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      {kind === "github" ? <Input aria-label="GitHub owner or organization" value={targetOwners.github ?? st.oauth.account} onChange={(event) => setTargetOwners((current) => ({ ...current, github: event.target.value }))} placeholder="Owner / organization" /> : null}
                      <Input aria-label={kind === "github" ? "GitHub repository" : "Jira project key"} value={targetValues[kind] ?? ""} onChange={(event) => setTargetValues((current) => ({ ...current, [kind]: event.target.value }))} placeholder={kind === "github" ? (ar ? "اسم المستودع" : "Repository name") : (ar ? "مفتاح مشروع Jira" : "Jira project key")} />
                      <Button size="sm" disabled={targetBusy !== null || !targetValues[kind]?.trim() || (kind === "github" && !(targetOwners.github ?? st.oauth.account).trim())} onClick={() => void chooseOAuthTarget(kind)} className="shrink-0 bg-aura text-primary-foreground hover:bg-aura/85">
                        {targetBusy === kind ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : null}{ar ? "تحقق واعتماد" : "Verify target"}
                      </Button>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={!oauthAvailable[kind]} onClick={() => { window.location.href = `/api/projects/${projectId}/integrations/oauth/${kind}`; }}>{ar ? "إعادة التفويض" : "Reauthorize"}</Button>
                    <Button size="sm" variant="outline" disabled={targetBusy !== null} onClick={() => void disconnectOAuth(kind)}>{ar ? "فصل الاتصال" : "Disconnect"}</Button>
                  </div>
                </div>
              ) : (
                <div className="mb-3 w-full rounded-lg border border-border/70 bg-secondary/20 p-3">
                  <p className="text-xs font-medium">{ar ? "الربط الآمن عبر OAuth" : "Secure OAuth connection"}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">{oauthAvailable[kind] ? (ar ? "اربط حسابك دون إدخال Personal Access Token." : "Authorize your account without entering a personal access token.") : (ar ? "الربط الخارجي مؤجل حتى إعداد بيانات تطبيق المزود في بيئة النشر." : "External activation is deferred until provider application credentials are configured in the deployment environment.")}</p>
                  <Button size="sm" className="mt-2 bg-aura text-primary-foreground hover:bg-aura/85" disabled={!oauthAvailable[kind]} onClick={() => { window.location.href = `/api/projects/${projectId}/integrations/oauth/${kind}`; }}>
                    <Plug className="me-1.5 h-3.5 w-3.5" />{ar ? "ربط الحساب" : `Connect ${kind === "github" ? "GitHub" : "Jira"}`}
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { setCfgKind(kind); setCfg({}); }} className="border-border">
                  <Plug className="me-1.5 h-3.5 w-3.5" /> {configured ? (ar ? "تحديث" : "Update") : (ar ? "إعداد" : "Configure")}
                </Button>
                <Button size="sm" variant="outline" disabled={!configured || busy !== null} onClick={() => act(kind, "test", {}, ar ? "اختبار الاتصال" : ar ? "اختبار الاتصال" : "Connection test")} className="border-border">
                  {busy === `${kind}:test` ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" /> : <GitBranch className="me-1.5 h-3.5 w-3.5" />} Test
                </Button>
                <Button size="sm" disabled={!configured || busy !== null} onClick={() => act(kind, "push", {}, ar ? `اكتمل الإرسال إلى ${kind === "github" ? "GitHub" : "Jira"}` : `${kind} push complete`)} className="bg-aura font-semibold text-primary-foreground hover:bg-aura/85">
                  {busy === `${kind}:push` ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="me-1.5 h-3.5 w-3.5" />} Push
                </Button>
                <Button size="sm" variant="outline" disabled={!configured || busy !== null} onClick={() => act(kind, "pull", {}, ar ? `اكتمل الاستيراد من ${kind === "github" ? "GitHub" : "Jira"}` : `${kind} pull complete`)} className="border-border">
                  {busy === `${kind}:pull` ? <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="me-1.5 h-3.5 w-3.5" />} Pull
                </Button>
              </div>
              {pulled[kind] && pulled[kind].length > 0 && (
                <div className="mt-3 border-t border-border/70 pt-3">
                  <Eyebrow className="mb-1.5 block">◉ {ar ? "تم الاستيراد — القرار لك فيما ستفعله بها" : "PULLED — your call what to do with these"}</Eyebrow>
                  <ul className="max-h-32 space-y-1 overflow-y-auto pr-1">
                    {pulled[kind].map((i) => (
                      <li key={i.key} className="flex items-center gap-2 rounded bg-secondary/30 px-2 py-1 text-[11px]">
                        <Badge variant="outline" className="border-border font-mono text-[9px]">{i.key}</Badge>
                        <a href={i.url} target="_blank" rel="noreferrer" className="truncate text-muted-foreground hover:text-aura">{i.title}</a>
                        <span className="ms-auto shrink-0 font-mono text-[9px] text-muted-foreground">{i.state}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </HudPanel>
          );
        })}
      </div>

      <HudPanel className="space-y-3 p-4" as="section">
        <div>
          <Eyebrow className="mb-1 block">◉ {ar ? "الوضع العكسي — المتطلب إلى التغييرات الفعلية" : "REVERSE MODE — REQUIREMENT TO REAL-WORLD CHANGES"}</Eyebrow>
          <p className="text-xs leading-relaxed text-muted-foreground">{ar ? "ابدأ بمرجع متطلب لتجميع روابط GitHub وJira، والأدلة والقصص والتبعيات المتأثرة، وسجل قرارات الربط. لا يُنشئ هذا الفحص أي روابط تلقائيًا." : "Start from a requirement reference to inspect linked GitHub/Jira records, evidence, stories, impacted dependencies and mapping decisions. Inspection never creates links automatically."}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={reverseRequirement} onChange={(event) => setReverseRequirement(event.target.value)} maxLength={128} placeholder={ar ? "مرجع المتطلب مثل REQ-12" : "Requirement reference, e.g. REQ-12"} onKeyDown={(event) => { if (event.key === "Enter") void inspectRequirement(); }} />
          <Button size="sm" disabled={reverseModeBusy || !reverseRequirement.trim()} onClick={() => void inspectRequirement()} className="shrink-0 bg-aura text-primary-foreground hover:bg-aura/85">
            {reverseModeBusy ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : <GitBranch className="me-2 h-3.5 w-3.5" />}
            {ar ? "فحص الأثر" : "Inspect impact"}
          </Button>
        </div>
        {reverseMode && (
          <div className="space-y-3 border-t border-border/70 pt-3">
            <div className="rounded-md border border-aura/30 bg-aura/5 p-3">
              <p className="font-mono text-[10px] text-aura">{reverseMode.requirement.refId} · {reverseMode.requirement.status} · {reverseMode.requirement.priority}</p>
              <p className="mt-1 text-sm font-semibold" dir="auto">{reverseMode.requirement.text}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                [ar ? "روابط التتبع" : "Tracker links", reverseMode.trackerMappings.length],
                [ar ? "الأدلة" : "Evidence", reverseMode.trace.direct.length],
                [ar ? "الادعاءات" : "Claims", reverseMode.trace.linkedClaims.length],
                [ar ? "القصص" : "Stories", reverseMode.trace.stories.length],
                [ar ? "المتأثرة" : "Impacted", reverseMode.trace.impacted.length],
              ].map(([label, value]) => <div key={String(label)} className="rounded border border-border/70 p-2 text-center"><p className="font-mono text-lg font-semibold tabular-nums">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></div>)}
            </div>
            <div>
              <p className="mb-2 font-mono text-[10px] text-muted-foreground">{ar ? "التغييرات المرتبطة وسجل مراجعتها" : "LINKED CHANGES & REVIEW DECISIONS"}</p>
              {reverseMode.trackerMappings.length === 0 ? <p className="text-xs text-muted-foreground">{ar ? "لا توجد روابط GitHub أو Jira مؤكدة لهذا المتطلب." : "No verified GitHub or Jira mappings exist for this requirement."}</p> : <ul className="space-y-2">{reverseMode.trackerMappings.map((mapping) => <li key={mapping.id} className="rounded border border-border/70 p-3">
                <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{mapping.kind}</Badge><a href={mapping.externalUrl} target="_blank" rel="noreferrer" className="font-mono text-xs text-aura hover:underline">{mapping.externalKey}</a><span className="min-w-0 flex-1 text-xs" dir="auto">{mapping.title}</span><Button size="sm" variant="outline" disabled={traceBusyId !== ""} onClick={() => void inspectReverseTrace(mapping)} className="h-7 px-2 text-[10px]">{ar ? "تفاصيل التتبع" : "Trace details"}</Button></div>
                <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-muted-foreground"><span>{mapping.direction}</span><span>·</span><span>{mapping.syncedAt ? new Date(mapping.syncedAt).toLocaleString() : (ar ? "وقت المزامنة غير متاح" : "sync time unavailable")}</span><span>·</span><span>{mapping.decisions.length} {ar ? "قرار ربط" : "mapping decisions"}</span></div>
                {mapping.decisions.length > 0 ? <ul className="mt-2 space-y-1 border-s border-border ps-3">{mapping.decisions.map((decision) => <li key={decision.id} className="text-[10px] text-muted-foreground">{decision.action.replaceAll("_", " ")} · {decision.mappingMethod.replaceAll("_", " ")} · {decision.createdAt ? new Date(decision.createdAt).toLocaleString() : "time unavailable"}</li>)}</ul> : null}
              </li>)}</ul>}
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">{ar ? "هذه قراءة عكسية مجمعة من المتطلب إلى أنظمة التتبع والأدلة. أي ربط أو تعديل يظل قرارًا بشريًا منفصلًا ومسجلًا." : "This is a consolidated read from the requirement to tracker records and evidence. Any mapping or change remains a separate, human-reviewed and journaled decision."}</p>
          </div>
        )}
      </HudPanel>

      {/* sync map */}
      <HudPanel className="p-4" as="div">
        <Eyebrow className="mb-2 block">◉ {ar ? `خريطة المزامنة — تتبع ثنائي الاتجاه (${maps.length})` : `SYNC MAP — bidirectional trace (${maps.length})`}</Eyebrow>
        {maps.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {ar ? "لم تتم أي مزامنة بعد. يرسل Push المتطلبات المعتمدة إلى GitHub أو القصص إلى Jira، بينما يجلب قضايا أنظمة التتبع لمراجعتها بشريًا. كل خطوة تظهر هنا." : "Nothing synced yet. Push sends approved requirements (GitHub) or stories (Jira) out; pull brings tracker issues back for human curation. Every hop lands here."}
          </p>
        ) : (
          <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
            {maps.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 rounded border border-border/60 bg-secondary/20 px-3 py-1.5 text-xs">
                <Badge variant="outline" className={`font-mono text-[9px] ${m.kind === "github" ? "border-plasma/40 text-plasma" : "border-signal/40 text-signal"}`}>
                  {m.kind}
                </Badge>
                <span className="font-mono text-[10px] text-aura">{m.localLabel}</span>
                <span className="text-muted-foreground">↔</span>
                <a href={m.externalUrl} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-foreground hover:text-aura">
                  {m.externalKey}
                </a>
                <span className="truncate text-muted-foreground" dir="auto">{m.title}</span>
                <span className="ms-auto shrink-0 font-mono text-[9px] text-muted-foreground">{m.direction}</span>
                <Button size="sm" variant="outline" disabled={traceBusyId !== ""} onClick={() => void inspectReverseTrace(m)} className="h-7 px-2 text-[10px]">
                  {traceBusyId === m.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null} Inspect trace
                </Button>
              </li>
            ))}
          </ul>
        )}
      </HudPanel>

      {reverseTrace && (
        <HudPanel className="space-y-3 p-4" as="section">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Eyebrow className="mb-1 block">◉ {ar ? "التتبع العكسي · مصدر راجعه إنسان" : "REVERSE TRACE · HUMAN-REVIEWED PROVENANCE"}</Eyebrow>
              <h4 className="text-sm font-semibold">{reverseTrace.tracker.externalKey} · {reverseTrace.tracker.title}</h4>
              <p className="mt-1 text-[10px] text-muted-foreground">{ar ? "نتيجة المعالجة:" : "Resolution:"} <span className="font-mono text-foreground">{reverseTrace.resolution.replaceAll("_", " ")}</span></p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setReverseTrace(null)} className="h-7 px-2">Close</Button>
          </div>
          {reverseTrace.trace.status !== "mapped" || !reverseTrace.requirement ? (
            <div className="rounded-md border border-signal/30 bg-signal/5 p-3 text-xs text-muted-foreground">{reverseTrace.guidance ?? "No verified requirement mapping exists yet. Similarity is not accepted as traceability."}</div>
          ) : (
            <>
              <div className="rounded-md border border-aura/30 bg-aura/5 p-3">
                <p className="font-mono text-[10px] text-aura">{ar ? "نظام التتبع ← المتطلب" : "TRACKER → REQUIREMENT"}</p>
                <p className="mt-1 text-sm font-semibold">{reverseTrace.requirement.refId} · {reverseTrace.requirement.text}</p>
                <div className="mt-2 flex flex-wrap gap-1.5"><Badge variant="outline">{reverseTrace.requirement.status}</Badge><Badge variant="outline">{reverseTrace.requirement.priority}</Badge><Badge variant="outline">{ar ? "ربط راجعه إنسان" : "Human-reviewed mapping"}</Badge></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-border/70 p-3">
                  <p className="mb-2 font-mono text-[10px] text-muted-foreground">{ar ? "المصدر ← إصدار الدليل" : "SOURCE → EVIDENCE REVISION"} ({reverseTrace.trace.direct.length})</p>
                  {reverseTrace.trace.direct.length === 0 ? <p className="text-xs text-muted-foreground">{ar ? "لا توجد روابط أدلة مباشرة." : "No direct evidence links."}</p> : <ul className="space-y-2">{reverseTrace.trace.direct.map((item) => <li key={item.evidenceCode} className="text-xs">
                    <p className="font-mono text-aura">{item.evidenceCode}</p><p>{item.source?.title ?? "Source metadata unavailable"}</p>
                    {item.source?.latestRevision && <p className="mt-1 text-[10px] text-muted-foreground">v{item.source.latestRevision.version} · {item.source.latestRevision.changeNote ?? "No revision note"} · {item.source.latestRevision.createdBy ?? "unknown actor"}</p>}
                    {item.source && <p className="text-[10px] text-muted-foreground">{item.source.sourceType} · {item.source.language} · consent {item.source.consent ? "recorded" : "not recorded"}</p>}
                  </li>)}</ul>}
                </div>
                <div className="rounded-md border border-border/70 p-3">
                  <p className="mb-2 font-mono text-[10px] text-muted-foreground">{ar ? "سجل القرارات" : "DECISION TRAIL"} ({reverseTrace.trace.decisions.length})</p>
                  {reverseTrace.trace.decisions.length === 0 ? <p className="text-xs text-muted-foreground">{ar ? "لم يُسجل قرار ربط منظم." : "No structured mapping decision recorded."}</p> : <ul className="space-y-2">{reverseTrace.trace.decisions.map((decision) => <li key={decision.id} className="text-xs">
                    <p className="font-medium">{decision.action.replaceAll("_", " ")}</p><p className="text-[10px] text-muted-foreground">{decision.actor} · {decision.mappingMethod.replaceAll("_", " ")} · {decision.createdAt ? new Date(decision.createdAt).toLocaleString() : "time unavailable"}</p>
                  </li>)}</ul>}
                </div>
              </div>
              <div className="rounded-md border border-border/70 p-3">
                <p className="mb-2 font-mono text-[10px] text-muted-foreground">{ar ? "المتطلبات المتأثرة" : "IMPACTED REQUIREMENTS"} ({reverseTrace.trace.impacted.length})</p>
                {reverseTrace.trace.impacted.length === 0 ? <p className="text-xs text-muted-foreground">{ar ? "لم تُرجع بيانات التأثير اللاحق." : "No downstream impact was returned."}</p> : <div className="space-y-2">{reverseTrace.trace.impacted.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 border-b border-border/50 pb-2 text-xs last:border-0 last:pb-0">
                  <span className="font-mono text-aura">{item.refId ?? item.id}</span><Badge variant="outline">hop {item.depth}</Badge><span>{item.priority ?? "priority unknown"}</span><span className="text-muted-foreground">verify: {item.verifyStatus ?? "unknown"} · drift: {item.driftStatus ?? "unknown"} · evidence: {item.evidenceCount}</span>
                </div>)}</div>}
              </div>
              <p className="text-[10px] leading-relaxed text-muted-foreground">{ar ? "هذه شاشة فحص للقراءة فقط. تظل تغييرات الربط قرارًا بشريًا منفصلًا؛ ولا تنشئ هذه الشاشة روابط بين نظام التتبع والمتطلبات أو تعدلها تلقائيًا." : "Read-only inspection. Mapping changes remain a separate human action; this view never creates or changes a tracker-to-requirement link automatically."}</p>
            </>
          )}
        </HudPanel>
      )}

      {/* config dialog */}
      <Dialog open={cfgKind !== null} onOpenChange={(o) => !o && setCfgKind(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {cfgKind === "github" ? "GitHub" : "Jira"} {ar ? "بيانات الاعتماد — تُحفظ على الخادم" : "credentials — stored server-side"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {cfgKind === "github" ? (
              <>
                <div>
                  <Label htmlFor="gh-token" className="text-xs text-muted-foreground">{ar ? "رمز وصول شخصي (نطاق المستودع)" : "Personal access token (repo scope)"}</Label>
                  <Input id="gh-token" type="password" value={cfg.token ?? ""} onChange={(e) => setCfg((c) => ({ ...c, token: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="gh-owner" className="text-xs text-muted-foreground">{ar ? "المالك / المؤسسة" : "Owner / org"}</Label>
                    <Input id="gh-owner" value={cfg.owner ?? ""} onChange={(e) => setCfg((c) => ({ ...c, owner: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="gh-repo" className="text-xs text-muted-foreground">{ar ? "المستودع" : "Repository"}</Label>
                    <Input id="gh-repo" value={cfg.repo ?? ""} onChange={(e) => setCfg((c) => ({ ...c, repo: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="gh-webhook-secret" className="text-xs text-muted-foreground">{ar ? "سر Webhook (32 حرفًا على الأقل)" : "Webhook secret (min. 32 characters)"}</Label>
                  <Input id="gh-webhook-secret" type="password" autoComplete="new-password" value={cfg.webhookSecret ?? ""} onChange={(e) => setCfg((c) => ({ ...c, webhookSecret: e.target.value }))} placeholder="Set or rotate the GitHub webhook secret" />
                  <p className="mt-1 text-[10px] text-muted-foreground">Optional. Stored encrypted; never returned. Configure GitHub to send Issues and Push events to /api/webhooks/github/{projectId}.</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="j-base" className="text-xs text-muted-foreground">{ar ? "الرابط الأساسي للموقع" : "Site base URL"}</Label>
                  <Input id="j-base" placeholder="https://yourorg.atlassian.net" value={cfg.baseUrl ?? ""} onChange={(e) => setCfg((c) => ({ ...c, baseUrl: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="j-email" className="text-xs text-muted-foreground">{ar ? "البريد الإلكتروني للحساب" : "Account email"}</Label>
                  <Input id="j-email" type="email" value={cfg.email ?? ""} onChange={(e) => setCfg((c) => ({ ...c, email: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="j-token" className="text-xs text-muted-foreground">{ar ? "رمز API" : "API token"}</Label>
                  <Input id="j-token" type="password" value={cfg.token ?? ""} onChange={(e) => setCfg((c) => ({ ...c, token: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="j-key" className="text-xs text-muted-foreground">{ar ? "مفتاح المشروع" : "Project key"}</Label>
                  <Input id="j-key" placeholder="RP" value={cfg.projectKey ?? ""} onChange={(e) => setCfg((c) => ({ ...c, projectKey: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="jira-webhook-secret" className="text-xs text-muted-foreground">Jira webhook secret (min. 32 characters)</Label>
                  <Input id="jira-webhook-secret" type="password" autoComplete="new-password" value={cfg.webhookSecret ?? ""} onChange={(e) => setCfg((c) => ({ ...c, webhookSecret: e.target.value }))} placeholder="Set or rotate the Jira webhook secret" />
                  <p className="mt-1 text-[10px] text-muted-foreground">Optional. Stored encrypted; never returned. In Jira Cloud, configure an admin webhook with this secret and send issue created/updated/deleted events to /api/webhooks/jira/{projectId}.</p>
                </div>
              </>
            )}
            <p className="text-[10px] text-muted-foreground">
              {ar ? "لا تعود الأسرار إلى المتصفح مطلقًا، وتُخفى في جميع الاستجابات. في العروض العامة، يفضل استخدام" : "Secrets never return to the browser (masked in every response). For public demos prefer"}
              {ar ? "متغيرات البيئة البديلة (RP_GITHUB_* / RP_JIRA_*) حتى لا تُحفظ بيانات اعتماد لكل مشروع." : "environment fallbacks (RP_GITHUB_* / RP_JIRA_*) so no per-project credentials persist."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCfgKind(null)}>{ar ? "إلغاء" : "Cancel"}</Button>
            <Button onClick={saveCfg} className="bg-aura text-primary-foreground hover:bg-aura/85">{ar ? "حفظ" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function describeResult(action: string, d: Record<string, unknown>): string {
  if (action === "push") {
    const pushed = (d.pushed as { refId?: string; key?: string; url?: string; issue?: number }[]) ?? [];
    if (!pushed.length) return "everything was already mapped — push is idempotent";
    return pushed.map((p) => `${p.refId ?? ""}→${p.key ?? `#${p.issue}`}`).join(", ");
  }
  if (action === "pull") return `${((d.issues as unknown[]) ?? []).length} issue(s) retrieved for your review`;
  if (action === "test") return String(d.detail ?? "");
  return "";
}
