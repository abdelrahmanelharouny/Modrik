// ─────────────────────────────────────────────────────────────
// RequirementPilot — REQUIREMENT GRAPH (dev item 9)
//
// Typed edges:  depends_on · conflicts_with · derived_from ·
//               refines · validates · affected_by
//
// Sources:  LLM edge proposal pass + derived edges (conflicts_with
// materialised from the Conflict table so the graph is always the
// union of agent-proposed, derived and human-authored relations).
//
// Change traversal: reverse impact propagation — from a changed
// requirement, walk upstream dependents (who depends on me, who
// refines me, who is affected by me) breadth-first and return the
// full impacted set with hop distance. This is what makes drift
// radar results explainable.
// ─────────────────────────────────────────────────────────────
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";
import { getProvider, type ChatMessage } from "@/lib/providers";

export const EDGE_KINDS = [
  "depends_on",
  "conflicts_with",
  "derived_from",
  "refines",
  "validates",
  "affected_by",
] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];

export const EDGE_LABEL: Record<EdgeKind, string> = {
  depends_on: "depends on",
  conflicts_with: "conflicts with",
  derived_from: "derived from",
  refines: "refines",
  validates: "validates",
  affected_by: "affected by",
};

const SYSTEM =
  "You are the Graph Agent inside RequirementPilot, an evidence-based requirements engineering " +
  "assistant. You are precise and conservative. Reply with VALID JSON ONLY — no markdown fences, " +
  "no commentary.";

interface UsageAcc {
  calls: number;
  latencyMs: number;
  estTokens: number;
}

// ── LLM edge proposal pass ───────────────────────────────────

export async function extractEdges(projectId: string): Promise<{ created: number; proposals: number }> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: { orderBy: { order: "asc" } }, conflicts: true },
  });
  const usage = { calls: 0, latencyMs: 0, estTokens: 0 };
  if (project.reqs.length < 2) return { created: 0, proposals: 0 };

  const provider = await getProvider();
  const prompt = `REQUIREMENTS:
${project.reqs.map((r) => `${r.refId}: ${r.text}`).join("\n")}

TASK: Propose typed relationships BETWEEN requirements (not between a requirement and evidence). Allowed kinds:
- "depends_on": A cannot be delivered unless B exists first
- "derived_from": A is a refinement/consequence derived from B's core intent (use only when genuinely derivative)
- "refines": A sharpens or specialises B (B broader, A narrower)
- "validates": A's acceptance verifies B's intent
- "affected_by": a change to B forces A to change
Do NOT invent relations to fill space — 0 to 12 edges is acceptable. Never propose duplicate or self edges.

Return JSON: {"edges": [{"from": "REQ-01", "to": "REQ-03", "kind": "depends_on", "note": "one-line why"}]}`;

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM },
    { role: "user", content: prompt },
  ];
  const t0 = Date.now();
  let raw: string;
  try {
    raw = await provider.complete(messages);
  } catch {
    await new Promise((r) => setTimeout(r, 1500));
    raw = await provider.complete(messages);
  }
  usage.calls = 1;
  usage.latencyMs = Date.now() - t0;
  usage.estTokens = Math.ceil((prompt.length + raw.length) / 4);

  let parsed: { edges?: { from: string; to: string; kind: string; note?: string }[] };
  try {
    let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const start = text.search(/[{[]/);
    if (start > 0) text = text.slice(start);
    parsed = JSON.parse(text);
  } catch {
    return { created: 0, proposals: 0 };
  }

  const byRef = new Map(project.reqs.map((r) => [r.refId, r]));
  let created = 0;
  const proposals = (parsed.edges ?? []).slice(0, 16);
  for (const e of proposals) {
    const from = byRef.get(String(e.from ?? "").toUpperCase());
    const to = byRef.get(String(e.to ?? "").toUpperCase());
    const kind = String(e.kind ?? "");
    if (!from || !to || from.id === to.id) continue;
    if (!(EDGE_KINDS as readonly string[]).includes(kind)) continue;
    const existing = await db.reqEdge.findFirst({
      where: { projectId, fromId: from.id, toId: to.id, kind },
    });
    if (existing) continue;
    await db.reqEdge.create({
      data: { projectId, fromId: from.id, toId: to.id, kind, note: String(e.note ?? "").slice(0, 300), origin: "agent" },
    });
    created += 1;
  }

  // derived edges: materialise conflicts_with from the Conflict table so the
  // graph view always mirrors negotiated reality.
  for (const c of project.conflicts) {
    const existing = await db.reqEdge.findFirst({
      where: { projectId, fromId: c.reqAId, toId: c.reqBId, kind: "conflicts_with" },
    });
    if (!existing) {
      await db.reqEdge.create({
        data: { projectId, fromId: c.reqAId, toId: c.reqBId, kind: "conflicts_with", note: `materialised from ${c.kind} conflict`, origin: "derived" },
      });
      created += 1;
    }
  }

  await logDecision(projectId, "LIFECYCLE", "agent", "graph_extract", `Requirement graph: ${created} new edge(s) from ${proposals.length} proposal(s).`);
  await db.artifact.create({
    data: {
      projectId,
      stage: "GRAPH",
      kind: "json",
      content: JSON.stringify({ proposals, created }).slice(0, 20000),
    },
  });
  return { created, proposals: proposals.length };
}

// ── Change traversal (reverse impact propagation) ────────────

export interface ImpactNode {
  refId: string;
  text: string;
  id: string;
  depth: number;
  via: { from: string; kind: EdgeKind }[];
}

// From a changed requirement, find everything upstream that is impacted:
//   • X depends_on changed      → X impacted (it waits on me)
//   • X refines changed         → X impacted (its parent changed)
//   • X derived_from changed    → X impacted (it was derived from me)
//   • X affected_by changed     → X impacted (explicit channel)
//   • X conflicts_with changed  → X impacted (tension must be re-checked)
// Note: edges are stored from → to exactly as the kind reads; traversal
// walks them accordingly with BFS and reports hop depth + the path kinds.
export async function traverseImpact(projectId: string, changedRequirementIds: string[]): Promise<{ roots: string[]; impacted: ImpactNode[] }> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: { orderBy: { order: "asc" } }, edges: true },
  });
  const byId = new Map(project.reqs.map((r) => [r.id, r]));
  const roots = changedRequirementIds.filter((id) => byId.has(id));
  if (!roots.length) return { roots: [], impacted: [] };

  // adjacency: changedId → [{ other, kind }] meaning "other is impacted via kind"
  const upstream: Map<string, { other: string; kind: EdgeKind }[]> = new Map();
  for (const e of project.edges) {
    const push = (a: string, b: string, kind: EdgeKind) => {
      if (!upstream.has(a)) upstream.set(a, []);
      upstream.get(a)!.push({ other: b, kind });
    };
    switch (e.kind) {
      case "depends_on": // e.from depends on e.to → change of e.to impacts e.from
        push(e.toId, e.fromId, "depends_on");
        break;
      case "refines": // e.from refines e.to → change of e.to impacts e.from
        push(e.toId, e.fromId, "refines");
        break;
      case "derived_from": // e.from derived from e.to → change of e.to impacts e.from
        push(e.toId, e.fromId, "derived_from");
        break;
      case "affected_by": // e.from affected by e.to → change of e.to impacts e.from
        push(e.toId, e.fromId, "affected_by");
        break;
      case "conflicts_with": // symmetric tension
        push(e.fromId, e.toId, "conflicts_with");
        push(e.toId, e.fromId, "conflicts_with");
        break;
      case "validates": // e.from validates e.to → change of e.to invalidates e.from's check
        push(e.toId, e.fromId, "validates");
        break;
    }
  }

  const visited = new Set<string>(roots);
  const impacted: ImpactNode[] = [];
  let frontier = roots.map((id) => ({ id, depth: 0, via: [] as { from: string; kind: EdgeKind }[] }));
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      const rels = upstream.get(node.id) ?? [];
      for (const rel of rels) {
        if (visited.has(rel.other)) continue;
        visited.add(rel.other);
        const req = byId.get(rel.other)!;
        impacted.push({
          id: req.id,
          refId: req.refId,
          text: req.text,
          depth: node.depth + 1,
          via: [...node.via, { from: byId.get(node.id)!.refId, kind: rel.kind }],
        });
        next.push({ id: rel.other, depth: node.depth + 1, via: [...node.via, { from: byId.get(node.id)!.refId, kind: rel.kind }] });
      }
    }
    frontier = next;
  }
  impacted.sort((a, b) => a.depth - b.depth || a.refId.localeCompare(b.refId));
  return { roots, impacted };
}

// ── Full graph DTO (nodes + typed edges) ─────────────────────

export async function getGraph(projectId: string) {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { reqs: { orderBy: { order: "asc" } }, edges: { include: { from: { select: { refId: true } }, to: { select: { refId: true } } } } },
  });
  return {
    nodes: project.reqs.map((r) => ({
      id: r.id,
      refId: r.refId,
      text: r.text,
      type: r.type,
      priority: r.priority,
      driftStatus: r.driftStatus,
      verifyStatus: r.verifyStatus,
      ambiguity: r.ambiguity,
    })),
    edges: project.edges.map((e) => ({
      id: e.id,
      fromId: e.fromId,
      toId: e.toId,
      fromRef: e.from.refId,
      toRef: e.to.refId,
      kind: e.kind,
      note: e.note,
      origin: e.origin,
    })),
  };
}
