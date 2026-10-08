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
  const { toast } = useToast();
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
  }, [load]);

  const runArm = async (arm: string) => {
    setBusyArm(arm);
    try {
      const d = await api<{ metrics: ArmMetrics; candidates: number }>(`/api/projects/${projectId}/planner`, {
        method: "POST",
        body: JSON.stringify({ arm }),
      });
      toast({
        title: `${ARM_META[arm]?.label ?? arm} executed`,
        description: `avgUtility ${d.metrics.avgUtility} · coverage ${d.metrics.evidenceCoverage}% · redundancy ${d.metrics.redundancyRate}% · dialect fit ${d.metrics.dialectFit}%`,
      });
      await load();
    } catch (e) {
      toast({ title: "Planner run failed", description: (e as Error).message, variant: "destructive" });
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
        <Eyebrow className="mb-2 block">◉ THE UTILITY FORMULA (deterministic)</Eyebrow>
        <p className="font-mono text-xs leading-relaxed text-aura">
          Utility = ( InformationGain × DownstreamImpact × Uncertainty × Risk ) ÷ AskCost
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Signal-scored per question, selected under an ask-cost budget. Run any arm — every arm&apos;s
          final set is judged by the <span className="text-foreground">same scorer and judge</span>, so the
          comparison is fair (single-shot still gets signal-scored post-hoc).
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
              {meta.label}
            </span>
            <span className="text-[9px] normal-case tracking-normal text-muted-foreground">{meta.desc}</span>
          </Button>
        ))}
      </div>

      {arms.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border/70">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-secondary/50 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2">arm</th>
                <th className="px-3 py-2">avg utility ↑</th>
                <th className="px-3 py-2">utility / cost ↑</th>
                <th className="px-3 py-2">coverage ↑</th>
                <th className="px-3 py-2">redundancy ↓</th>
                <th className="px-3 py-2">dialect fit ↑</th>
                <th className="px-3 py-2">n runs</th>
              </tr>
            </thead>
            <tbody>
              {arms.map((arm) => {
                const m = bestPerArm[arm];
                const n = runs.filter((r) => r.arm === arm).length;
                return (
                  <tr key={arm} className={`border-t border-border/60 ${arm === "impact_aware" ? "bg-aura/5" : ""}`}>
                    <td className="px-3 py-2 font-mono">
                      <Chip tone={ARM_META[arm].tone}>{ARM_META[arm].label}</Chip>
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
          No ablation runs yet. Pick an arm above — each run materialises its question set into the
          Briefing queue with the utility breakdown stamped on every question.
        </EmptyBay>
      )}
      {runs.length > 0 && (
        <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {runs.slice(0, 6).map((r) => (
            <li key={r.id} className="rounded border border-border/60 bg-secondary/20 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={ARM_META[r.arm]?.tone ?? "muted"}>{ARM_META[r.arm]?.label ?? r.arm}</Chip>
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
  const [cal, setCal] = useState<CalibrationDTO | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(true);
    api<CalibrationDTO>(`/api/projects/${projectId}/calibration`)
      .then(setCal)
      .catch(() => {})
      .finally(() => setBusy(false));
  }, [projectId]);

  if (busy) return <EmptyBay><Loader2 className="mr-2 inline h-4 w-4 animate-spin text-aura" />computing reliability bins…</EmptyBay>;
  if (!cal) return <EmptyBay>Calibration data unavailable.</EmptyBay>;

  if (cal.verdict === "insufficient-data") {
    return (
      <EmptyBay>
        Not enough verified requirements yet (need ≥ 3 with confidence + critic verdicts; currently {cal.n}).
        Run the Extraction and Ambiguity phases first — calibration validates confidence against the
        critic&apos;s evidence verdicts.
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
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Brier score</div>
        </HudPanel>
        <HudPanel className="p-4 text-center" as="div">
          <div className="font-display text-xl font-bold tabular-nums">{cal.ece}</div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Calibration error (ECE)</div>
        </HudPanel>
        <HudPanel className="p-4 text-center" as="div">
          <Chip tone={verdictTone} className="mx-auto">{cal.verdict}</Chip>
          <div className="mt-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">verdict</div>
        </HudPanel>
        <HudPanel className="p-4 text-center" as="div">
          <div className="font-display text-xl font-bold tabular-nums">{cal.n}</div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">verified requirements</div>
        </HudPanel>
      </div>

      <HudPanel className="p-4" as="div">
        <Eyebrow className="mb-3 block">◉ RELIABILITY BINS — claimed vs empirical</Eyebrow>
        <div className="space-y-3">
          {cal.bins.map((b) => (
            <div key={b.range}>
              <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                <span>
                  confidence {b.range} <span className="text-foreground/70">· n={b.n}</span>
                </span>
                <span className={b.delta > 0.1 ? "text-coral" : b.delta < -0.1 ? "text-signal" : "text-verify"}>
                  {b.delta > 0 ? "over" : b.delta < 0 ? "under" : "cal"} {Math.abs(Math.round(b.delta * 100))}pt
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
                claimed {b.avgConfidence}% · empirical {Math.round(b.empirical * 100)}% supported
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Solid bar = claimed confidence · dashed marker = how often the critic actually found the
          requirement supported. A dashed marker left of the bar end means the agent is overconfident in that bin.
          {cal.spread.supportedAvg !== null && cal.spread.weakAvg !== null && (
            <span className="block mt-1">
              Spread: supported requirements average <span className="text-foreground">{cal.spread.supportedAvg}%</span> confidence vs{" "}
              <span className="text-foreground">{cal.spread.weakAvg}%</span> for weak ones.
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
        title: "Simulation complete",
        description: `${d.scenarios} scenario(s) — ${d.undefinedCount} UNDEFINED recorded as discoveries.`,
      });
      await load();
    } catch (e) {
      toast({ title: "Simulation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={run} disabled={busy} className="bg-aura font-semibold text-primary-foreground hover:bg-aura/85">
          {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="mr-2 h-3.5 w-3.5" />}
          {summary ? "Re-simulate" : "Run simulator"}
        </Button>
        {summary && (
          <>
            <Chip tone="aura">{summary.total} scenarios</Chip>
            <Chip tone="verify">{summary.defined} defined</Chip>
            <Chip tone="coral">{summary.undefined} UNDEFINED → discoveries</Chip>
          </>
        )}
      </div>

      {loaded && scenarios.length === 0 && (
        <EmptyBay>
          No simulations yet. The simulator writes concrete Given/When/Then scenarios against your
          baseline; wherever the baseline is silent, the scenario lands as UNDEFINED — a requirement
          discovery with the clarifying question that would define it.
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
                {s.requirement && <span className="font-mono text-[10px] text-muted-foreground">owner {s.requirement.refId}</span>}
              </div>
              <div className="space-y-1 text-sm" dir="auto">
                <p><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">given · </span>{s.given}</p>
                <p><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">when · </span>{s.when}</p>
                <p><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">then · </span>{s.then}</p>
              </div>
              {undef && s.undefinedReason && (
                <p className="mt-2 text-xs text-coral/90" dir="auto">WHY UNDEFINED: {s.undefinedReason}</p>
              )}
              {undef && s.discovery && (
                <p className="mt-1.5 rounded border border-signal/30 bg-signal/10 px-3 py-1.5 font-mono text-[11px] text-signal" dir="auto">
                  DISCOVERY — ask / define next: {s.discovery}
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
          {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-2 h-3.5 w-3.5" />}
          Re-audit platform
        </Button>
        {audit && (
          <>
            <Chip tone="verify">{audit.summary.pass} pass</Chip>
            {audit.summary.warn > 0 && <Chip tone="signal">{audit.summary.warn} warn</Chip>}
            {audit.summary.fail > 0 && <Chip tone="coral">{audit.summary.fail} fail</Chip>}
            <span className="font-mono text-[9px] text-muted-foreground">
              recomputed {new Date(audit.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </>
        )}
      </div>
      {!audit && !busy && <EmptyBay>The platform audits itself: WCAG 2.2 contrast math on live design tokens, performance budgets from telemetry, PDPL structure from the data.</EmptyBay>}
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
                {c.value && <span className="ml-1.5 font-mono text-[10px] text-aura">{c.value}</span>}
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
interface TrackerStatus {
  configured: boolean;
  owner?: string;
  repo?: string;
  token?: string;
  baseUrl?: string;
  projectKey?: string;
  email?: string;
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

export function IntegrationsConsole({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [maps, setMaps] = useState<SyncMapDTO[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [cfgKind, setCfgKind] = useState<"github" | "jira" | null>(null);
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [pulled, setPulled] = useState<Record<string, PulledIssue[]>>({});

  const load = useCallback(async () => {
    try {
      const d = await api<{ status: IntegrationStatus; maps: SyncMapDTO[] }>(`/api/projects/${projectId}/integrations`);
      setStatus(d.status);
      setMaps(d.maps);
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

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

  const saveCfg = async () => {
    if (!cfgKind) return;
    const d = await act(cfgKind, "save-config", { config: cfg }, "Credentials saved (server-side, masked)");
    if (d) setCfgKind(null);
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
                <Chip tone={configured ? "verify" : "signal"}>{configured ? "connected" : "needs credentials"}</Chip>
              </div>
              <p className="mb-3 flex-1 text-xs leading-relaxed text-muted-foreground">
                {configured
                  ? kind === "github"
                    ? `${st?.owner}/${st?.repo} · token ${st?.token}`
                    : `${st?.baseUrl} · project ${st?.projectKey} · email ${st?.email} · token ${st?.token}`
                  : kind === "github"
                    ? "Provide a personal access token (repo scope), owner and repository. Stored server-side; responses always mask secrets."
                    : "Provide the site baseUrl, account email, API token and project key. Stored server-side; responses always mask secrets."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { setCfgKind(kind); setCfg({}); }} className="border-border">
                  <Plug className="mr-1.5 h-3.5 w-3.5" /> {configured ? "Update" : "Configure"}
                </Button>
                <Button size="sm" variant="outline" disabled={!configured || busy !== null} onClick={() => act(kind, "test", {}, "Connection test")} className="border-border">
                  {busy === `${kind}:test` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <GitBranch className="mr-1.5 h-3.5 w-3.5" />} Test
                </Button>
                <Button size="sm" disabled={!configured || busy !== null} onClick={() => act(kind, "push", {}, `${kind} push complete`)} className="bg-aura font-semibold text-primary-foreground hover:bg-aura/85">
                  {busy === `${kind}:push` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />} Push
                </Button>
                <Button size="sm" variant="outline" disabled={!configured || busy !== null} onClick={() => act(kind, "pull", {}, `${kind} pull complete`)} className="border-border">
                  {busy === `${kind}:pull` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />} Pull
                </Button>
              </div>
              {pulled[kind] && pulled[kind].length > 0 && (
                <div className="mt-3 border-t border-border/70 pt-3">
                  <Eyebrow className="mb-1.5 block">◉ PULLED — your call what to do with these</Eyebrow>
                  <ul className="max-h-32 space-y-1 overflow-y-auto pr-1">
                    {pulled[kind].map((i) => (
                      <li key={i.key} className="flex items-center gap-2 rounded bg-secondary/30 px-2 py-1 text-[11px]">
                        <Badge variant="outline" className="border-border font-mono text-[9px]">{i.key}</Badge>
                        <a href={i.url} target="_blank" rel="noreferrer" className="truncate text-muted-foreground hover:text-aura">{i.title}</a>
                        <span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground">{i.state}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </HudPanel>
          );
        })}
      </div>

      {/* sync map */}
      <HudPanel className="p-4" as="div">
        <Eyebrow className="mb-2 block">◉ SYNC MAP — bidirectional trace ({maps.length})</Eyebrow>
        {maps.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing synced yet. Push sends approved requirements (GitHub) or stories (Jira) out; pull brings
            tracker issues back for human curation. Every hop lands here.
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
                <span className="ml-auto shrink-0 font-mono text-[9px] text-muted-foreground">{m.direction}</span>
              </li>
            ))}
          </ul>
        )}
      </HudPanel>

      {/* config dialog */}
      <Dialog open={cfgKind !== null} onOpenChange={(o) => !o && setCfgKind(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">
              {cfgKind === "github" ? "GitHub" : "Jira"} credentials — stored server-side
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {cfgKind === "github" ? (
              <>
                <div>
                  <Label htmlFor="gh-token" className="text-xs text-muted-foreground">Personal access token (repo scope)</Label>
                  <Input id="gh-token" type="password" value={cfg.token ?? ""} onChange={(e) => setCfg((c) => ({ ...c, token: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="gh-owner" className="text-xs text-muted-foreground">Owner / org</Label>
                    <Input id="gh-owner" value={cfg.owner ?? ""} onChange={(e) => setCfg((c) => ({ ...c, owner: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="gh-repo" className="text-xs text-muted-foreground">Repository</Label>
                    <Input id="gh-repo" value={cfg.repo ?? ""} onChange={(e) => setCfg((c) => ({ ...c, repo: e.target.value }))} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="j-base" className="text-xs text-muted-foreground">Site base URL</Label>
                  <Input id="j-base" placeholder="https://yourorg.atlassian.net" value={cfg.baseUrl ?? ""} onChange={(e) => setCfg((c) => ({ ...c, baseUrl: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="j-email" className="text-xs text-muted-foreground">Account email</Label>
                  <Input id="j-email" type="email" value={cfg.email ?? ""} onChange={(e) => setCfg((c) => ({ ...c, email: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="j-token" className="text-xs text-muted-foreground">API token</Label>
                  <Input id="j-token" type="password" value={cfg.token ?? ""} onChange={(e) => setCfg((c) => ({ ...c, token: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="j-key" className="text-xs text-muted-foreground">Project key</Label>
                  <Input id="j-key" placeholder="RP" value={cfg.projectKey ?? ""} onChange={(e) => setCfg((c) => ({ ...c, projectKey: e.target.value }))} />
                </div>
              </>
            )}
            <p className="text-[10px] text-muted-foreground">
              Secrets never return to the browser (masked in every response). For public demos prefer
              environment fallbacks (RP_GITHUB_* / RP_JIRA_*) so no per-project credentials persist.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCfgKind(null)}>Cancel</Button>
            <Button onClick={saveCfg} className="bg-aura text-primary-foreground hover:bg-aura/85">Save</Button>
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
