"use client";

// ─────────────────────────────────────────────────────────────
// DEBRIEF BAY — instruments suite for the landed baseline:
// constellation graph · health decomposer · drift radar ·
// constraint packs (WCAG 2.2 / Egypt-PDPL privacy / performance)
// · wind tunnel · decision journal · exports · tracker payloads.
// Every number rendered here is live from the project DTO or
// instrument APIs (dynamicity rule).
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { PRIORITY_ORDER, type ProjectDTO } from "@/lib/rp";
import { INTEGRATIONS, INSTRUMENTS, LLM_DISCLOSURE } from "@/lib/registry";
import { useLang } from "@/lib/i18n";
import { HudPanel, Eyebrow, Chip, CountUp, Meter, SectionHead, EmptyBay, Reveal, type Tone } from "@/components/rp/hud";
import { ICONS } from "@/components/rp/icons";
import { PlannerLab, CalibrationPanel, ExecutabilitySim, SelfAuditPanel, IntegrationsConsole } from "@/components/rp/debrief-instruments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Trophy,
  RotateCcw,
  Download,
  FileText,
  ListChecks,
  Gauge,
  BookOpen,
  GitMerge,
  ScrollText,
  Loader2,
  Radar as RadarIcon,
  ShieldCheck,
  Wind,
  Waypoints,
  HeartPulse,
  Waves,
  Github,
  Copy,
  CheckCheck,
  Radio,
  Target,
  Scale,
  FlaskConical,
  Network,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── shared shapes ────────────────────────────────────────────
interface HealthReport {
  summary: string;
  strengths: string[];
  risks: { title: string; note: string }[];
  recommendations: string[];
  ambiguityDebt: string;
  uncertaintyLedger: string;
  conflictDigest: string;
}
interface DriftResult {
  impacted: number;
  summary: string;
  flagged?: { refId: string; note: string }[];
}
interface ComplianceResult {
  overall: string;
  gaps: { aspect: string; note: string; suggestion: string }[];
  covered: { refId: string; aspect: string }[];
}
// deterministic debt profile from GET /health (item 11)
interface DebtProfileDTO {
  dimensions: { id: string; label: string; score: number; detail: string; contributions: { refId: string; text: string; amount: number; note: string }[] }[];
  headline: Record<string, number | null>;
}
const PACKS_UI: { id: string; name: string; desc: string }[] = [
  { id: "accessibility", name: "WCAG 2.2 Accessibility", desc: "Keyboard operability, screen readers, contrast, focus visibility, RTL handling, target size, low-bandwidth support." },
  { id: "gdpr", name: "Egypt PDPL Privacy", desc: "PDPL-inspired: lawful basis, consent, data minimisation, retention & deletion, user rights, breach notification, residency." },
  { id: "performance", name: "Performance & Resilience", desc: "Response-time targets, throughput, weak connectivity, graceful degradation, error handling, monitoring." },
];

// registry lookup helper (indices shift when instruments are added)
function insMeta(id: string) {
  return INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];
}

// typed-edge visual contract (kind → colour)
const EDGE_STYLE: Record<string, { color: string; dash?: string }> = {
  depends_on: { color: "#2ce8c8" },
  refines: { color: "#a78bfa" },
  derived_from: { color: "#7dd3fc" },
  validates: { color: "#3ddc97", dash: "2 3" },
  affected_by: { color: "#ffb454", dash: "6 3" },
  conflicts_with: { color: "#ff6b7a", dash: "4 4" },
};

function download(name: string, content: string, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

// ── constellation graph (typed edges + impact traversal, item 9) ──

interface GraphEdgeDTO {
  id: string;
  fromId: string;
  toId: string;
  fromRef: string;
  toRef: string;
  kind: string;
  note: string | null;
  origin: string;
}
interface ImpactNodeDTO {
  id: string;
  refId: string;
  text: string;
  depth: number;
  via: { from: string; kind: string }[];
}

function Constellation({ project }: { project: ProjectDTO }) {
  const [sel, setSel] = useState<{ kind: "req" | "ev"; id: string } | null>(null);
  const [edges, setEdges] = useState<GraphEdgeDTO[]>([]);
  const [impact, setImpact] = useState<ImpactNodeDTO[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [tracing, setTracing] = useState(false);
  const { toast } = useToast();
  const W = 640;
  const H = 400;
  const cx = W / 2;
  const cy = H / 2;
  const reqR = 118;
  const evR = 176;

  const reqs = project.requirements;
  const evs = project.evidences;
  const reqPos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    reqs.forEach((r, i) => {
      const a = (i / Math.max(1, reqs.length)) * 2 * Math.PI - Math.PI / 2;
      m.set(r.id, { x: cx + reqR * Math.cos(a), y: cy + reqR * Math.sin(a) });
    });
    return m;
  }, [reqs, cx, cy]);
  const evPos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    evs.forEach((e, i) => {
      const a = (i / Math.max(1, evs.length)) * 2 * Math.PI - Math.PI / 2 + Math.PI / Math.max(1, evs.length);
      m.set(e.code, { x: cx + evR * Math.cos(a), y: cy + evR * Math.sin(a) });
    });
    return m;
  }, [evs, cx, cy]);

  const selectedReq = sel?.kind === "req" ? reqs.find((r) => r.id === sel.id) : null;
  const selectedEv = sel?.kind === "ev" ? evs.find((e) => e.id === sel.id) : null;
  const impactIds = useMemo(() => new Set(impact.map((i) => i.id)), [impact]);

  const loadGraph = useCallback(async () => {
    try {
      const d = await api<{ edges: GraphEdgeDTO[] }>(`/api/projects/${project.id}/graph`);
      setEdges(d.edges);
    } catch {
      /* graph may be empty */
    }
  }, [project.id]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const extractEdges = async () => {
    setExtracting(true);
    try {
      const d = await api<{ created: number; proposals: number }>(`/api/projects/${project.id}/graph`, {
        method: "POST",
        body: JSON.stringify({ action: "extract" }),
      });
      toast({ title: "Graph pass complete", description: `${d.created} new edge(s) from ${d.proposals} proposal(s) + materialised conflict edges.` });
      await loadGraph();
    } catch (e) {
      toast({ title: "Edge extraction failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setExtracting(false);
    }
  };

  const traceImpact = async (requirementId: string) => {
    setTracing(true);
    try {
      const d = await api<{ impacted: ImpactNodeDTO[] }>(`/api/projects/${project.id}/graph`, {
        method: "POST",
        body: JSON.stringify({ action: "traverse", requirementIds: [requirementId] }),
      });
      setImpact(d.impacted);
      toast({ title: "Impact traversal complete", description: `${d.impacted.length} requirement(s) reachable through typed edges.` });
    } catch (e) {
      toast({ title: "Traversal failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTracing(false);
    }
  };

  if (reqs.length === 0) {
    return <EmptyBay>The constellation lights up once requirements exist — approve the Airframe phase first.</EmptyBay>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border border-border/70 bg-abyss/60">
        <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto block h-[340px] w-full min-w-[520px] sm:h-[400px]" role="img" aria-label="Requirement constellation">
          {/* evidence grounding edges */}
          {reqs.map((r) =>
            r.links.map((l) => {
              const p1 = reqPos.get(r.id);
              const p2 = evPos.get(l.evidenceCode);
              if (!p1 || !p2) return null;
              const active = sel?.kind === "req" ? sel.id === r.id : sel?.kind === "ev" ? sel.id === evs.find((e) => e.code === l.evidenceCode)?.id : true;
              return (
                <line key={`${r.id}-${l.evidenceCode}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(44,232,200,0.35)" strokeWidth={active ? 1.4 : 0.5} opacity={active ? 0.9 : 0.25}>
                  <animate attributeName="stroke-dasharray" values="1 7;3 7;1 7" dur="3s" repeatCount="indefinite" />
                </line>
              );
            })
          )}
          {/* typed requirement-to-requirement edges (item 9) */}
          {edges.map((e) => {
            const p1 = reqPos.get(e.fromId);
            const p2 = reqPos.get(e.toId);
            if (!p1 || !p2) return null;
            const style = EDGE_STYLE[e.kind] ?? { color: "#7e96b0" };
            const hot = impactIds.has(e.toId) || impactIds.has(e.fromId);
            const qx = (p1.x + p2.x) / 2;
            const qy = (p1.y + p2.y) / 2;
            return (
              <g key={e.id}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={style.color} strokeWidth={hot ? 1.8 : 1} strokeOpacity={hot ? 0.95 : 0.5} strokeDasharray={style.dash}>
                  {style.dash && <animate attributeName="stroke-dashoffset" values="0;-12" dur="2.4s" repeatCount="indefinite" />}
                </line>
                <text x={qx} y={qy - 3} textAnchor="middle" fill={style.color} fontSize="7.5" fontFamily="var(--font-jbmono), monospace" opacity={0.85}>
                  {e.kind}
                </text>
              </g>
            );
          })}
          {/* conflict edges (legacy derived view) */}
          {project.conflicts.filter((c) => !edges.some((e) => e.kind === "conflicts_with" && ((e.fromId === c.reqAId && e.toId === c.reqBId) || (e.fromId === c.reqBId && e.toId === c.reqAId)))).map((c) => {
            const p1 = reqPos.get(c.reqAId);
            const p2 = reqPos.get(c.reqBId);
            if (!p1 || !p2) return null;
            const resolved = c.status === "resolved";
            return (
              <line key={c.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={resolved ? "rgba(61,220,151,0.5)" : "rgba(255,107,122,0.65)"} strokeWidth="1.2" strokeDasharray="4 4">
                <animate attributeName="stroke-dashoffset" values="0;-16" dur="1.6s" repeatCount="indefinite" />
              </line>
            );
          })}
          {/* evidence nodes */}
          {evs.map((e) => {
            const p = evPos.get(e.code);
            if (!p) return null;
            const active = sel?.id === e.id;
            return (
              <g key={e.id} onClick={() => setSel(active ? null : { kind: "ev", id: e.id })} className="cursor-pointer">
                <circle cx={p.x} cy={p.y} r="13" fill="rgba(167,139,250,0.12)" stroke="rgba(167,139,250,0.5)" strokeWidth={active ? 2 : 1} />
                <text x={p.x} y={p.y + 3} textAnchor="middle" fill="#a78bfa" fontSize="9" fontFamily="var(--font-jbmono), monospace">{e.code}</text>
              </g>
            );
          })}
          {/* requirement nodes */}
          {reqs.map((r) => {
            const p = reqPos.get(r.id);
            if (!p) return null;
            const active = sel?.id === r.id;
            const flagged = r.driftStatus !== "none";
            const impacted = impactIds.has(r.id);
            const color = impacted ? "#a78bfa" : flagged ? "#ffb454" : r.ambiguity >= 60 ? "#ff6b7a" : r.ambiguity >= 30 ? "#ffb454" : "#2ce8c8";
            return (
              <g key={r.id} onClick={() => setSel(active ? null : { kind: "req", id: r.id })} className="cursor-pointer">
                {impacted && (
                  <circle cx={p.x} cy={p.y} r="21" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="3 3">
                    <animate attributeName="r" values="18;24;18" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={p.x} cy={p.y} r={active ? 17 : 14} fill={active ? "rgba(44,232,200,0.18)" : "rgba(44,232,200,0.07)"} stroke={color} strokeWidth={active ? 2 : 1.2} />
                <circle cx={p.x} cy={p.y} r="3" fill={color}>
                  <animate attributeName="opacity" values="1;0.35;1" dur="2.4s" repeatCount="indefinite" />
                </circle>
                <text x={p.x} y={p.y + 26} textAnchor="middle" fill="rgba(230,238,245,0.85)" fontSize="8.5" fontFamily="var(--font-jbmono), monospace">{r.refId}</text>
              </g>
            );
          })}
          {/* hub */}
          <circle cx={cx} cy={cy} r="4" fill="#2ce8c8" opacity="0.9" />
          <circle cx={cx} cy={cy} r="12" fill="none" stroke="rgba(44,232,200,0.3)" strokeWidth="1">
            <animate attributeName="r" values="10;22;10" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.7;0;0.7" dur="3s" repeatCount="indefinite" />
          </circle>
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-aura" /> requirement</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-plasma" /> evidence</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5" style={{ background: EDGE_STYLE.depends_on.color }} /> depends_on</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5" style={{ background: EDGE_STYLE.refines.color }} /> refines</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5" style={{ background: EDGE_STYLE.affected_by.color }} /> affected_by</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-coral" /> conflicts_with</span>
        <span className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={extracting || reqs.length < 2} onClick={extractEdges} className="h-7 border-aura/40 px-2 font-mono text-[10px] text-aura hover:bg-aura/10">
            {extracting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Network className="mr-1 h-3 w-3" />} extract edges
          </Button>
          {impact.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setImpact([])} className="h-7 border-border px-2 font-mono text-[10px]">
              clear impact ({impact.length})
            </Button>
          )}
        </span>
      </div>
      {selectedReq && (() => {
        const nodeEdges = edges.filter((e) => e.fromId === selectedReq.id || e.toId === selectedReq.id);
        return (
          <HudPanel className="p-4" as="div">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-aura/40 bg-aura/5 font-mono text-xs text-aura">{selectedReq.refId}</Badge>
              <Chip tone={selectedReq.priority === "Must" ? "coral" : selectedReq.priority === "Should" ? "signal" : "aura"}>{selectedReq.priority}</Chip>
              <Chip tone="muted">amb {selectedReq.ambiguity < 0 ? "—" : selectedReq.ambiguity}</Chip>
              {selectedReq.driftStatus !== "none" && <Chip tone="signal">drift: {selectedReq.driftStatus}</Chip>}
              <Button
                size="sm"
                variant="outline"
                disabled={tracing}
                onClick={() => traceImpact(selectedReq.id)}
                className="ml-auto h-7 border-plasma/40 px-2 font-mono text-[10px] text-plasma hover:bg-plasma/10"
              >
                {tracing ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Waypoints className="mr-1 h-3 w-3" />}
                trace impact from here
              </Button>
            </div>
            <p className="text-sm" dir="auto">{selectedReq.text}</p>
            {nodeEdges.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {nodeEdges.map((e) => (
                  <Badge key={e.id} variant="outline" className="font-mono text-[9px]" style={{ borderColor: (EDGE_STYLE[e.kind] ?? { color: "#7e96b0" }).color, color: (EDGE_STYLE[e.kind] ?? { color: "#7e96b0" }).color }}>
                    {e.fromId === selectedReq.id ? `→ ${e.toRef}` : `${e.fromRef} →`} · {e.kind}
                  </Badge>
                ))}
              </div>
            )}
          </HudPanel>
        );
      })()}
      {impact.length > 0 && (
        <HudPanel className="p-4" as="div">
          <Eyebrow tone="plasma" className="mb-2 block">◉ IMPACT SET — reverse traversal through typed edges</Eyebrow>
          <ul className="space-y-1">
            {impact.map((n) => (
              <li key={n.id} className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-plasma/40 font-mono text-[10px] text-plasma">{n.refId}</Badge>
                <span className="font-mono text-[9px] text-muted-foreground">
                  hop {n.depth} via {n.via.map((v) => `${v.from}·${v.kind}`).join(" → ")}
                </span>
                <span className="line-clamp-1 text-muted-foreground" dir="auto">{n.text}</span>
              </li>
            ))}
          </ul>
        </HudPanel>
      )}
      {selectedEv && (
        <HudPanel className="p-4" as="div">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="outline" className="border-plasma/40 bg-plasma/5 font-mono text-xs text-plasma">{selectedEv.code}</Badge>
            <span className="text-sm font-medium" dir="auto">{selectedEv.title}</span>
          </div>
          <p className="line-clamp-4 text-sm text-muted-foreground" dir="auto">{selectedEv.content}</p>
        </HudPanel>
      )}
    </div>
  );
}

// ── main bay ─────────────────────────────────────────────────
export function DebriefBay({ project, refresh }: { project: ProjectDTO; refresh: () => Promise<void> }) {
  const { toast } = useToast();
  const { lang } = useLang();
  const ar = lang === "ar";

  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [debt, setDebt] = useState<DebtProfileDTO | null>(null);
  const [openDim, setOpenDim] = useState<string | null>(null);
  const [drift, setDrift] = useState<DriftResult | null>(null);
  const [driftBusy, setDriftBusy] = useState(false);
  const [signal, setSignal] = useState("");
  const [compliance, setCompliance] = useState<Record<string, ComplianceResult>>({});
  const [packBusy, setPackBusy] = useState<string | null>(null);
  const [persona, setPersona] = useState("");
  const [secret, setSecret] = useState("");
  const [tunnel, setTunnel] = useState<{ answered: number } | null>(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api<{ report: HealthReport | null; debt: DebtProfileDTO | null }>(`/api/projects/${project.id}/health`)
      .then((d) => {
        setHealth(d.report);
        setDebt(d.debt);
      })
      .catch(() => {});
  }, [project.id]);

  const runHealth = useCallback(async () => {
    setHealthBusy(true);
    try {
      const d = await api<{ report: HealthReport }>(`/api/projects/${project.id}/health`, { method: "POST" });
      setHealth(d.report);
      toast({ title: "Health report generated", description: "Decomposed dimensions, no magic score." });
    } catch (e) {
      toast({ title: "Health run failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setHealthBusy(false);
    }
  }, [project.id, toast]);

  const runDrift = async () => {
    if (!signal.trim()) return;
    setDriftBusy(true);
    try {
      const d = await api<DriftResult>(`/api/projects/${project.id}/drift`, { method: "POST", body: JSON.stringify({ signal }) });
      setDrift(d);
      await refresh();
      toast({ title: "Drift sweep complete", description: `${d.impacted} requirement(s) flagged.` });
    } catch (e) {
      toast({ title: "Drift sweep failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setDriftBusy(false);
    }
  };

  const clearDrift = async () => {
    try {
      await api(`/api/projects/${project.id}/drift`, { method: "DELETE" });
      setDrift(null);
      await refresh();
    } catch (e) {
      toast({ title: "Could not clear flags", description: (e as Error).message, variant: "destructive" });
    }
  };

  const runPack = async (pack: string) => {
    setPackBusy(pack);
    try {
      const d = await api<ComplianceResult>(`/api/projects/${project.id}/compliance`, { method: "POST", body: JSON.stringify({ pack }) });
      setCompliance((c) => ({ ...c, [pack]: d }));
      toast({ title: `${PACKS_UI.find((p) => p.id === pack)?.name} scanned`, description: `Overall: ${d.overall}` });
    } catch (e) {
      toast({ title: "Pack scan failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPackBusy(null);
    }
  };

  const runTunnel = async () => {
    if (!persona.trim()) return;
    setTunnelBusy(true);
    try {
      const d = await api<{ answered: number }>(`/api/projects/${project.id}/wind-tunnel`, {
        method: "POST",
        body: JSON.stringify({ persona, secret }),
      });
      setTunnel(d);
      await refresh();
      toast({ title: "Wind tunnel complete", description: `${d.answered} pending question(s) answered by the synthetic stakeholder.` });
    } catch (e) {
      toast({ title: "Wind tunnel failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setTunnelBusy(false);
    }
  };

  const reopen = async () => {
    try {
      await api(`/api/projects/${project.id}/pipeline`, { method: "POST", body: JSON.stringify({ action: "reopen" }) });
      await refresh();
      toast({ title: "Pipeline reopened", description: "The baseline is unlocked for further iteration." });
    } catch (e) {
      toast({ title: "Could not reopen", description: (e as Error).message, variant: "destructive" });
    }
  };

  // ── dynamic stats (all from project DTO) ──
  const approved = project.requirements.filter((r) => r.priority !== "Won't");
  const assessed = project.requirements.filter((r) => r.ambiguity >= 0);
  const avgAmb = assessed.length ? Math.round(assessed.reduce((s, r) => s + r.ambiguity, 0) / assessed.length) : 0;
  const openConflicts = project.conflicts.filter((c) => c.status === "open").length;
  const selected = project.candidates.find((c) => c.selected);
  const flaggedReqs = project.requirements.filter((r) => r.driftStatus !== "none");
  const assumptions = project.questions.filter((q) => q.resolution === "proceed_with_uncertainty");
  const byPriority = PRIORITY_ORDER.map((p) => ({ p, n: approved.filter((r) => r.priority === p).length }));
  const maxN = Math.max(1, ...byPriority.map((b) => b.n));

  const stats = [
    { icon: FileText, label: ar ? "مصادر الأدلة" : "Evidence sources", value: project.evidences.length },
    { icon: ListChecks, label: ar ? "متطلبات في الخط" : "Requirements in baseline", value: approved.length },
    { icon: Gauge, label: ar ? "متوسط الغموض" : "Avg ambiguity", value: avgAmb },
    { icon: BookOpen, label: ar ? "قصص المستخدم" : "User stories", value: project.stories.length },
    { icon: GitMerge, label: ar ? "تعارضات مفتوحة" : "Open conflicts", value: openConflicts },
  ];

  const exportJson = () => {
    const payload = {
      project: { name: project.name, brief: project.brief, exportedAt: new Date().toISOString() },
      evidences: project.evidences,
      questions: project.questions,
      selectedProblem: selected ?? null,
      requirements: project.requirements,
      stories: project.stories,
      conflicts: project.conflicts,
    };
    download(`${project.name.replace(/\W+/g, "_")}_requirements_baseline.json`, JSON.stringify(payload, null, 2));
    toast({ title: "Baseline exported" });
  };

  const exportGherkin = () => {
    const lines = ["# Generated by RequirementPilot — GLM (provided by Z.ai)", ""];
    for (const s of project.stories) {
      const req = project.requirements.find((r) => r.id === s.requirementId);
      lines.push(`# ${s.refId} ← ${req?.refId ?? "?"} | ${s.title}`);
      lines.push("Feature: " + s.title);
      lines.push("  Scenario: " + (s.title || "main flow"));
      lines.push("    Given the system implements " + (req?.refId ?? "the requirement"));
      for (const ac of s.acceptance.split("\n").filter(Boolean)) lines.push(`    Then ${ac}`);
      lines.push("");
    }
    download(`${project.name.replace(/\W+/g, "_")}_stories.feature`, lines.join("\n"), "text/plain");
    toast({ title: "Gherkin skeleton exported" });
  };

  const exportAudit = () => {
    download(
      `${project.name.replace(/\W+/g, "_")}_audit_log.json`,
      JSON.stringify({ project: project.name, decisions: project.decisions, runs: project.runs }, null, 2)
    );
    toast({ title: "Audit log exported" });
  };

  const githubPayload = () =>
    JSON.stringify(
      {
        repository_target: "GitHub Issues (REST v3)",
        mode: "payload mirror — use the sync console above to push/pull live",
        issues: approved.map((r) => ({
          title: `[${r.refId}] ${r.text.slice(0, 80)}`,
          labels: ["requirement", `priority:${r.priority.toLowerCase()}`, `type:${r.type}`, `verify:${r.verifyStatus}`],
          body: `${r.text}\n\nAmbiguity: ${r.ambiguity < 0 ? "n/a" : r.ambiguity}\nEvidence: ${r.links.map((l) => l.evidenceCode).join(", ") || "—"}`,
        })),
      },
      null,
      2
    );
  const jiraPayload = () =>
    JSON.stringify(
      {
        target: "Jira Cloud REST API v3",
        mode: "payload mirror — use the sync console above to push/pull live",
        issues: project.stories.map((s) => ({
          fields: {
            summary: `${s.refId} ${s.title}`,
            issuetype: { name: "Story" },
            description: `${s.narrative}\n\nAcceptance criteria:\n${s.acceptance}\n\nTraceability: ${project.requirements.find((r) => r.id === s.requirementId)?.refId ?? "—"}`,
            labels: ["requirementpilot", `invest:${s.investScore ?? "n/a"}`],
          },
        })),
      },
      null,
      2
    );

  const copyPayload = (id: string, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1600);
    });
  };

  const INSTR_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
    constellation: Waypoints,
    planner: Target,
    health: HeartPulse,
    calibration: Scale,
    executability: FlaskConical,
    drift: RadarIcon,
    compliance: ShieldCheck,
    windtunnel: Wind,
    journal: ScrollText,
  };

  return (
    <div className="space-y-6">
      {/* landing strip */}
      <Reveal>
        <HudPanel glow className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full border border-verify/40 bg-verify/10">
                <Trophy className="h-5 w-5 text-verify" />
                <span className="absolute inset-0 animate-pulse-ring rounded-full border border-verify/40" />
              </span>
              <div>
                <h2 className="font-display text-lg font-bold tracking-tight">{ar ? "خط الأساس جاهز للإقلاع" : "Requirements baseline ready"}</h2>
                <p className="text-sm text-muted-foreground">
                  {ar ? "كل المراحل أُغلق بموافقة بشرية عند كل بوابة." : "All six phases completed with human approval at every gate."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={reopen} className="border-border text-muted-foreground hover:text-foreground">
                <RotateCcw className="mr-2 h-4 w-4" /> {ar ? "إعادة فتح المسار" : "Reopen pipeline"}
              </Button>
              <Button onClick={exportJson} className="bg-aura font-semibold text-primary-foreground hover:bg-aura/85">
                <Download className="mr-2 h-4 w-4" /> {ar ? "تصدير JSON" : "Export baseline"}
              </Button>
            </div>
          </div>
          {selected && (
            <div className="mt-4 rounded-md border border-aura/25 bg-aura/5 p-4">
              <Eyebrow className="mb-1 block">◉ {ar ? "المسار المختار" : "COMMITTED ROUTE"}</Eyebrow>
              <p className="font-medium" dir="auto">{selected.title}</p>
              <p className="mt-1 text-sm text-muted-foreground" dir="auto">{selected.description}</p>
            </div>
          )}
        </HudPanel>
      </Reveal>

      {/* live telemetry */}
      <Reveal>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((s) => (
            <HudPanel key={s.label} className="p-4 text-center" as="div">
              <s.icon className="mx-auto h-4 w-4 text-aura" />
              <div className="mt-2 font-display text-2xl font-bold tracking-tight text-foreground">
                <CountUp value={s.value} />
              </div>
              <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</div>
            </HudPanel>
          ))}
        </div>
      </Reveal>

      {/* MoSCoW */}
      <Reveal>
        <HudPanel className="p-6">
          <SectionHead icon={ListChecks} title={ar ? "توزيع MoSCoW" : "MoSCoW distribution"} blurb={ar ? "المتطلبات حسب أولوية الحكم البشري." : "Baseline composition by human-arbitrated priority."} />
          <div className="space-y-2.5">
            {byPriority.map(({ p, n }) => (
              <div key={p} className="flex items-center gap-3">
                <Chip tone={p === "Must" ? "coral" : p === "Should" ? "signal" : p === "Could" ? "aura" : "muted"} className="w-16 justify-center">{p}</Chip>
                <div className="h-5 flex-1 overflow-hidden rounded bg-secondary/70">
                  <div
                    className={`h-full rounded transition-all duration-700 ${p === "Must" ? "bg-coral/70" : p === "Should" ? "bg-signal/70" : p === "Could" ? "bg-aura/70" : "bg-muted-foreground/30"}`}
                    style={{ width: `${(n / maxN) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-sm tabular-nums">{n}</span>
              </div>
            ))}
          </div>
        </HudPanel>
      </Reveal>

      {/* instruments tabs */}
      <Reveal>
        <HudPanel className="p-5 lg:p-6">
          <Tabs defaultValue="constellation">
            <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-1 border border-border/70 bg-secondary/40 p-1">
              {INSTRUMENTS.map((ins) => {
                const Icon = INSTR_ICON[ins.id] ?? Waypoints;
                return (
                  <TabsTrigger
                    key={ins.id}
                    value={ins.id}
                    className="flex items-center gap-1.5 rounded px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground data-[state=active]:bg-aura/15 data-[state=active]:text-aura"
                  >
                    <Icon className="h-3.5 w-3.5" /> {ar ? ins.nameAr : ins.name}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* constellation */}
            <TabsContent value="constellation" className="mt-0">
              <SectionHead icon={Waypoints} title={ar ? "خريطة الأبراج" : "Constellation graph"} blurb={ar ? insMeta("constellation").descAr : insMeta("constellation").desc} />
              <Constellation project={project} />
            </TabsContent>

            {/* planner lab (item 7 — the research heart) */}
            <TabsContent value="planner" className="mt-0">
              <SectionHead icon={Target} title={ar ? "مختبر المُخطّط" : "Planner Lab — impact-aware question planner"} blurb={ar ? insMeta("planner").descAr : insMeta("planner").desc} />
              <PlannerLab projectId={project.id} />
            </TabsContent>

            {/* calibration (open requirement 1) */}
            <TabsContent value="calibration" className="mt-0">
              <SectionHead icon={Scale} title={ar ? "لوحة المعايرة" : "Calibration panel"} blurb={ar ? insMeta("calibration").descAr : insMeta("calibration").desc} />
              <CalibrationPanel projectId={project.id} />
            </TabsContent>

            {/* executability simulator (item 8) */}
            <TabsContent value="executability" className="mt-0">
              <SectionHead icon={FlaskConical} title={ar ? "مُحاكي التنفيذ" : "Executability simulator"} blurb={ar ? insMeta("executability").descAr : insMeta("executability").desc} />
              <ExecutabilitySim projectId={project.id} />
            </TabsContent>

            {/* health */}
            <TabsContent value="health" className="mt-0 space-y-4">
              <SectionHead
                icon={HeartPulse}
                title={ar ? "مُفكِّك الصحة" : "Health decomposer"}
                blurb={ar ? insMeta("health").descAr : insMeta("health").desc}
                right={
                  <Button size="sm" onClick={runHealth} disabled={healthBusy} className="bg-aura text-primary-foreground hover:bg-aura/85">
                    {healthBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <HeartPulse className="mr-2 h-3.5 w-3.5" />}
                    {health ? (ar ? "إعادة التوليد" : "Regenerate") : ar ? "تشغيل التحليل" : "Run decomposer"}
                  </Button>
                }
              />
              {/* deterministic debt decomposition (item 11) — always live, never cached */}
              {debt && (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {debt.dimensions.map((dim) => {
                    const dimTone: Tone = dim.score >= 50 ? "coral" : dim.score >= 20 ? "signal" : "verify";
                    return (
                      <HudPanel key={dim.id} className="p-4" as="div">
                        <button
                          type="button"
                          onClick={() => setOpenDim(openDim === dim.id ? null : dim.id)}
                          className="mb-2 flex w-full items-center justify-between gap-2 text-left"
                          aria-expanded={openDim === dim.id}
                        >
                          <Eyebrow className="block">{dim.label.toUpperCase()}</Eyebrow>
                          <span className={`font-mono text-xs tabular-nums ${dim.score >= 50 ? "text-coral" : dim.score >= 20 ? "text-signal" : "text-verify"}`}>{dim.score}</span>
                        </button>
                        <Meter value={100 - dim.score} tone={dimTone} />
                        <p className="mt-2 text-xs text-muted-foreground">{dim.detail}</p>
                        {openDim === dim.id && (
                          <ul className="mt-2 space-y-1.5 border-t border-border/70 pt-2">
                            {dim.contributions.length === 0 ? (
                              <li className="text-[11px] text-verify">no contributing records — this dimension is clean</li>
                            ) : (
                              dim.contributions.map((c, i) => (
                                <li key={i} className="rounded bg-secondary/30 px-2 py-1 text-[11px]">
                                  <span className="font-mono text-[10px] text-aura">{c.refId}</span>
                                  <span className="ml-1.5 line-clamp-2 text-muted-foreground" dir="auto">{c.text}</span>
                                  {c.note && <span className="mt-0.5 block text-[10px] text-muted-foreground/70" dir="auto">{c.note}</span>}
                                </li>
                              ))
                            )}
                          </ul>
                        )}
                      </HudPanel>
                    );
                  })}
                </div>
              )}
              {assessed.length > 0 && !debt && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <HudPanel className="p-4" as="div">
                    <Eyebrow className="mb-2 block">AMBIGUITY DEBT</Eyebrow>
                    <Meter value={100 - avgAmb} tone={avgAmb >= 60 ? "coral" : avgAmb >= 30 ? "signal" : "verify"} />
                    <p className="mt-2 text-xs text-muted-foreground">{health?.ambiguityDebt ?? `avg ${avgAmb} across ${assessed.length} assessed`}</p>
                  </HudPanel>
                  <HudPanel className="p-4" as="div">
                    <Eyebrow className="mb-2 block">UNCERTAINTY LEDGER</Eyebrow>
                    <Meter value={project.questions.length ? ((project.questions.length - assumptions.length) / project.questions.length) * 100 : 100} tone={assumptions.length ? "signal" : "verify"} />
                    <p className="mt-2 text-xs text-muted-foreground">{health?.uncertaintyLedger ?? `${assumptions.length} assumption(s) carried without asking`}</p>
                  </HudPanel>
                  <HudPanel className="p-4" as="div">
                    <Eyebrow className="mb-2 block">CONFLICT PRESSURE</Eyebrow>
                    <Meter value={project.conflicts.length ? ((project.conflicts.length - openConflicts) / project.conflicts.length) * 100 : 100} tone={openConflicts ? "coral" : "verify"} />
                    <p className="mt-2 text-xs text-muted-foreground">{health?.conflictDigest ?? `${openConflicts} open of ${project.conflicts.length} findings`}</p>
                  </HudPanel>
                </div>
              )}
              {healthBusy && <EmptyBay><Loader2 className="mr-2 inline h-4 w-4 animate-spin text-aura" />decomposing health dimensions…</EmptyBay>}
              {health && !healthBusy && (
                <div className="space-y-3">
                  <HudPanel className="p-4" as="div">
                    <p className="text-sm leading-relaxed">{health.summary}</p>
                  </HudPanel>
                  {health.strengths.length > 0 && (
                    <HudPanel className="p-4" as="div">
                      <Eyebrow tone="verify" className="mb-2 block">STRENGTHS</Eyebrow>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {health.strengths.map((s, i) => <li key={i} className="flex gap-2"><CheckCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-verify" />{s}</li>)}
                      </ul>
                    </HudPanel>
                  )}
                  {health.risks.length > 0 && (
                    <HudPanel className="p-4" as="div">
                      <Eyebrow tone="coral" className="mb-2 block">RISKS</Eyebrow>
                      <ul className="space-y-2 text-sm">
                        {health.risks.map((r, i) => (
                          <li key={i}>
                            <span className="font-medium text-coral">{r.title}</span>
                            <span className="block text-xs text-muted-foreground">{r.note}</span>
                          </li>
                        ))}
                      </ul>
                    </HudPanel>
                  )}
                  {health.recommendations.length > 0 && (
                    <HudPanel className="p-4" as="div">
                      <Eyebrow tone="signal" className="mb-2 block">RECOMMENDATIONS</Eyebrow>
                      <ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                        {health.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                      </ol>
                    </HudPanel>
                  )}
                </div>
              )}
              {!health && !healthBusy && <EmptyBay>No stored report yet — run the decomposer to generate one (an LLM call will be made).</EmptyBay>}
            </TabsContent>

            {/* drift */}
            <TabsContent value="drift" className="mt-0 space-y-4">
              <SectionHead icon={RadarIcon} title={ar ? "رادار الانحراف" : "Drift radar"} blurb={ar ? insMeta("drift").descAr : insMeta("drift").desc} />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  placeholder={ar ? "إشارة التغيّر — مثال: القانون الجديد يفرض موافقة ولي أمر" : "Change signal — e.g. 'regulator now requires parental consent for under-16 accounts'"}
                  value={signal}
                  onChange={(e) => setSignal(e.target.value)}
                  className="flex-1"
                  dir="auto"
                />
                <Button onClick={runDrift} disabled={driftBusy || !signal.trim()} className="bg-aura text-primary-foreground hover:bg-aura/85">
                  {driftBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RadarIcon className="mr-2 h-4 w-4" />}
                  {ar ? "امسح" : "Sweep"}
                </Button>
                {flaggedReqs.length > 0 && (
                  <Button variant="outline" onClick={clearDrift} className="border-border">
                    {ar ? "مسح الأعلام" : "Clear flags"}
                  </Button>
                )}
              </div>
              {drift && (
                <HudPanel className="p-4" as="div">
                  <div className="mb-2 flex items-center gap-2">
                    <Chip tone={drift.impacted > 0 ? "signal" : "verify"}>{drift.impacted} impacted</Chip>
                  </div>
                  <p className="text-sm leading-relaxed">{drift.summary}</p>
                  {drift.flagged && drift.flagged.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {drift.flagged.map((f, i) => (
                        <li key={i} className="rounded border border-signal/25 bg-signal/5 px-3 py-1.5 text-sm">
                          <span className="font-mono text-xs text-signal">{f.refId}</span> — {f.note}
                        </li>
                      ))}
                    </ul>
                  )}
                </HudPanel>
              )}
              {flaggedReqs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {flaggedReqs.map((r) => (
                    <Chip key={r.id} tone="signal"><RadarIcon className="h-3 w-3" /> {r.refId} drift: {r.driftStatus}</Chip>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* compliance packs */}
            <TabsContent value="compliance" className="mt-0 space-y-4">
              <SectionHead icon={ShieldCheck} title={ar ? "حِزَم القيود" : "Constraint pack bay"} blurb={ar ? insMeta("compliance").descAr : insMeta("compliance").desc} />
              <div className="grid gap-3 lg:grid-cols-3">
                {PACKS_UI.map((p) => {
                  const res = compliance[p.id];
                  return (
                    <HudPanel key={p.id} className="flex h-full flex-col p-4" as="article">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <h4 className="font-display text-sm font-bold">{p.name}</h4>
                        {res && <Chip tone={res.overall === "pass" ? "verify" : res.overall === "partial" ? "signal" : "coral"}>{res.overall}</Chip>}
                      </div>
                      <p className="mb-3 flex-1 text-xs leading-relaxed text-muted-foreground">{p.desc}</p>
                      <Button size="sm" variant="outline" onClick={() => runPack(p.id)} disabled={packBusy !== null} className="border-aura/40 text-aura hover:bg-aura/10">
                        {packBusy === p.id ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-2 h-3.5 w-3.5" />}
                        {res ? (ar ? "إعادة الفحص" : "Rescan") : ar ? "فحص" : "Scan graph"}
                      </Button>
                      {res && (
                        <div className="mt-3 space-y-2 border-t border-border/70 pt-3">
                          {res.covered.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {res.covered.slice(0, 8).map((c, i) => (
                                <Badge key={i} variant="outline" className="border-verify/30 bg-verify/5 font-mono text-[10px] text-verify">
                                  {c.refId}·{c.aspect.slice(0, 18)}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {res.gaps.length > 0 && (
                            <ul className="space-y-1.5">
                              {res.gaps.map((g, i) => (
                                <li key={i} className="rounded border border-coral/25 bg-coral/5 px-2.5 py-1.5 text-xs">
                                  <span className="font-semibold text-coral">{g.aspect}</span>
                                  <span className="block text-muted-foreground">{g.suggestion}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </HudPanel>
                  );
                })}
              </div>

              {/* dual role — the platform audits ITSELF on the same standards (deterministic) */}
              <div className="border-t border-border/70 pt-4">
                <Eyebrow className="mb-3 block">◉ PLATFORM SELF-AUDIT — the website holds itself to the same packs (deterministic, no LLM)</Eyebrow>
                <SelfAuditPanel />
              </div>
            </TabsContent>
            <TabsContent value="windtunnel" className="mt-0 space-y-4">
              <SectionHead icon={Wind} title={ar ? "نفق المحاكاة" : "Wind tunnel"} blurb={ar ? insMeta("windtunnel").descAr : insMeta("windtunnel").desc} />
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Input placeholder={ar ? "الشخصية — مثال: صاحبة مطبخ منزلية تكره التسجيل" : "Persona — e.g. 'home cook who distrusts signup forms'"} value={persona} onChange={(e) => setPersona(e.target.value)} dir="auto" />
                <Input placeholder={ar ? "السر المحجوب (اختياري)" : "Held-out secret (optional)"} value={secret} onChange={(e) => setSecret(e.target.value)} dir="auto" />
                <Button onClick={runTunnel} disabled={tunnelBusy || !persona.trim()} className="border-plasma/40 bg-plasma/10 text-plasma hover:bg-plasma/20">
                  {tunnelBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Waves className="mr-2 h-4 w-4" />}
                  {ar ? "شغّل النفق" : "Run tunnel"}
                </Button>
              </div>
              {tunnel && (
                <HudPanel className="p-4" as="div">
                  <Chip tone={tunnel.answered > 0 ? "verify" : "signal"}>{tunnel.answered} {ar ? "سؤال أجاب عنه الشخص الافتراضي" : "pending question(s) answered"}</Chip>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {ar
                      ? "تحقّق من قائمة الأسئلة — الإجابات المحاكاة موجّهة لتغطية الثغرات التي رصدها النفق."
                      : "Check the interrogation queue — synthetic answers landed there. Re-run Briefing questions to see coverage of what the tunnel exposed."}
                  </p>
                </HudPanel>
              )}
            </TabsContent>

            {/* journal */}
            <TabsContent value="journal" className="mt-0 space-y-3">
              <SectionHead
                icon={ScrollText}
                title={ar ? "سجل القرارات" : "Decision journal"}
                blurb={ar ? "سجل تدقيق غير قابل للتعديل لكل قرار بشري أو آلي." : "Immutable audit trail of every human and agent decision."}
                right={
                  <Button size="sm" variant="outline" onClick={exportAudit} className="border-border">
                    <Download className="mr-2 h-3.5 w-3.5" /> {ar ? "تصدير التدقيق" : "Export audit"}
                  </Button>
                }
              />
              {project.decisions.length === 0 ? (
                <EmptyBay>No decisions journaled yet.</EmptyBay>
              ) : (
                <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
                  {[...project.decisions].reverse().map((d) => (
                    <li key={d.id} className="flex items-start gap-2.5 rounded border border-border/60 bg-secondary/30 px-3 py-2 text-xs">
                      {d.actor === "human" ? <Radio className="mt-0.5 h-3 w-3 shrink-0 text-verify" /> : <Radio className="mt-0.5 h-3 w-3 shrink-0 text-plasma" />}
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-foreground">{d.action.replace(/_/g, " ")}</span>
                        <span className="block truncate text-muted-foreground" dir="auto">{d.detail}</span>
                      </div>
                      <span className="shrink-0 font-mono text-[9px] text-muted-foreground/70">
                        {new Date(d.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </HudPanel>
      </Reveal>

      {/* integrations: live sync console (open requirement 2) */}
      <Reveal>
        <HudPanel className="p-5">
          <SectionHead
            icon={Github}
            title={ar ? "مركز التزامن — GitHub Issues و Jira" : "Sync console — GitHub Issues + Jira"}
            blurb={
              ar
                ? "مزامنة ثنائية الاتجاه بأوراق اعتماد تُدخل وقت التشغيل وتُخزّن جانب الخادم فقط — وكل قفزة مُسجّلة في خريطة المزامنة."
                : "Bidirectional sync with runtime credentials stored server-side only — every hop traced in the sync map. Push exports approved requirements/stories; pull brings tracker issues back for your curation."
            }
          />
          <IntegrationsConsole projectId={project.id} />
        </HudPanel>
      </Reveal>

      {/* payload previews + exports */}
      <Reveal>
        <div className="grid gap-4 lg:grid-cols-2">
          {INTEGRATIONS.map((ig) => {
            const Icon = ICONS[ig.icon] ?? Github;
            const payload = ig.id === "github" ? githubPayload() : jiraPayload();
            return (
              <HudPanel key={ig.id} className="p-5">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-md border border-aura/30 bg-aura/5">
                    <Icon className="h-4 w-4 text-aura" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-sm font-bold">{ig.name}</h3>
                      <Chip tone="aura">payload preview</Chip>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{ar ? ig.descAr : ig.desc}</p>
                  </div>
                </div>
                <pre className="max-h-44 overflow-auto rounded border border-border/70 bg-abyss/70 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {payload.slice(0, 1200)}{"\n…"}
                </pre>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => copyPayload(ig.id, payload)} className="border-border">
                    {copied === ig.id ? <CheckCheck className="mr-1.5 h-3.5 w-3.5 text-verify" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                    {ar ? "نسخ" : "Copy"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => download(`${ig.id}_payload.json`, payload)} className="border-border">
                    <Download className="mr-1.5 h-3.5 w-3.5" /> {ar ? "تنزيل" : "Download"}
                  </Button>
                </div>
              </HudPanel>
            );
          })}
        </div>
      </Reveal>

      <div className="flex flex-wrap items-center justify-center gap-3 pb-2">
        <Button variant="outline" onClick={exportGherkin} className="border-border">
          <Download className="mr-2 h-4 w-4" /> {ar ? "تصدير Gherkin" : "Export Gherkin (.feature)"}
        </Button>
        <Button variant="outline" onClick={exportAudit} className="border-border">
          <ScrollText className="mr-2 h-4 w-4" /> {ar ? "سجل التدقيق" : "Audit log"}
        </Button>
      </div>
      <p className="pb-2 text-center font-mono text-[10px] text-muted-foreground/60">
        {ar ? LLM_DISCLOSURE.lineAr : LLM_DISCLOSURE.line}
      </p>
    </div>
  );
}
