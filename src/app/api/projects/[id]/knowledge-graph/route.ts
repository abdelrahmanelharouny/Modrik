import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logDecision } from "@/lib/journal";
import {
  CLAIM_NODE_RELATIONSHIPS, KNOWLEDGE_EDGE_STATUSES,
  NODE_REQUIREMENT_ROLES, normalizeEdgeInput, normalizeNodeInput, parseNodeAttributes,
  validateNodeStatus,
} from "@/lib/knowledge-graph/validation.mjs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await db.project.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const [nodes, edges] = await Promise.all([
    db.knowledgeNode.findMany({
      where: { projectId: id },
      orderBy: [{ kind: "asc" }, { label: "asc" }],
      include: {
        _count: { select: { outgoing: true } },
        claims: { include: { claim: { select: { id: true, claimRef: true, claimText: true, status: true, quote: true } } } },
        requirements: { include: { requirement: { select: { id: true, refId: true, text: true, status: true } } } },
      },
    }),
    db.knowledgeEdge.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      include: {
        fromNode: { select: { id: true, nodeRef: true, kind: true, label: true } },
        toNode: { select: { id: true, nodeRef: true, kind: true, label: true } },
      },
    }),
  ]);
  return NextResponse.json({
    project,
    nodes: nodes.map(node => ({ ...node, attributes: parseNodeAttributes(node.attributes) })),
    edges,
    summary: {
      nodes: nodes.length,
      acceptedNodes: nodes.filter(node => node.status === "accepted").length,
      proposedNodes: nodes.filter(node => node.status === "proposed").length,
      edges: edges.length,
      acceptedEdges: edges.filter(edge => edge.status === "accepted").length,
      proposedEdges: edges.filter(edge => edge.status === "proposed").length,
    },
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid graph payload." }, { status: 400 });
  const project = await db.project.findUnique({ where: { id }, select: { id: true, stageStatus: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (["agent_running", "approving"].includes(project.stageStatus)) return NextResponse.json({ error: "Knowledge graph is locked while the project pipeline is processing." }, { status: 409 });

  const action = typeof body.action === "string" ? body.action : "";
  try {
    if (action === "create_node") {
      let nodeInput;
      try { nodeInput = normalizeNodeInput(body); }
      catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
      const nodeRef = `KN-${randomUUID().slice(0, 8).toUpperCase()}`;
      const node = await db.knowledgeNode.create({
        data: { projectId: id, nodeRef, ...nodeInput, status: "proposed", origin: "human" },
      });
      await logDecision(id, "GRAPH", "human", "created_knowledge_node", `Created ${nodeRef} (${node.kind}): ${node.label}`);
      return NextResponse.json({ node: { ...node, attributes: parseNodeAttributes(node.attributes) } }, { status: 201 });
    }

    if (action === "update_node") {
      if (typeof body.nodeId !== "string") return NextResponse.json({ error: "nodeId is required." }, { status: 400 });
      const existing = await db.knowledgeNode.findFirst({ where: { id: body.nodeId, projectId: id } });
      if (!existing) return NextResponse.json({ error: "Knowledge node not found in this project." }, { status: 404 });
      const data: Record<string, unknown> = {};
      if (body.status !== undefined) {
        if (!validateNodeStatus(body.status)) return NextResponse.json({ error: "Unsupported node status." }, { status: 400 });
        data.status = body.status;
      }
      if (body.label !== undefined) {
        if (typeof body.label !== "string" || !body.label.trim() || body.label.trim().length > 180) return NextResponse.json({ error: "Node label is required and limited to 180 characters." }, { status: 400 });
        data.label = body.label.trim();
      }
      if (body.description !== undefined) {
        if (typeof body.description !== "string" || body.description.length > 5000) return NextResponse.json({ error: "Description is limited to 5,000 characters." }, { status: 400 });
        data.description = body.description.trim();
      }
      if (body.confidence !== undefined) {
        const value = Number(body.confidence);
        if (!Number.isFinite(value) || value < 0 || value > 1) return NextResponse.json({ error: "Confidence must be between 0 and 1." }, { status: 400 });
        data.confidence = value;
      }
      if (body.owner !== undefined) data.owner = typeof body.owner === "string" ? body.owner.trim().slice(0, 160) || null : null;
      const node = await db.knowledgeNode.update({ where: { id: existing.id }, data });
      await logDecision(id, "GRAPH", "human", "updated_knowledge_node", `Updated ${node.nodeRef}: ${Object.keys(data).join(", ") || "no fields"}`);
      return NextResponse.json({ node: { ...node, attributes: parseNodeAttributes(node.attributes) } });
    }

    if (action === "add_edge") {
      if (typeof body.fromNodeId !== "string" || typeof body.toNodeId !== "string") return NextResponse.json({ error: "fromNodeId and toNodeId are required." }, { status: 400 });
      let edgeInput;
      try { edgeInput = normalizeEdgeInput(body); }
      catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
      if (body.fromNodeId === body.toNodeId) return NextResponse.json({ error: "Self relationships are not allowed." }, { status: 422 });
      const [fromNode, toNode] = await Promise.all([
        db.knowledgeNode.findFirst({ where: { id: body.fromNodeId, projectId: id }, select: { id: true, nodeRef: true, label: true } }),
        db.knowledgeNode.findFirst({ where: { id: body.toNodeId, projectId: id }, select: { id: true, nodeRef: true, label: true } }),
      ]);
      if (!fromNode || !toNode) return NextResponse.json({ error: "Both nodes must belong to this project." }, { status: 404 });
      const edge = await db.knowledgeEdge.upsert({
        where: { fromNodeId_toNodeId_relationType: { fromNodeId: fromNode.id, toNodeId: toNode.id, relationType: edgeInput.relationType } },
        create: { projectId: id, fromNodeId: fromNode.id, toNodeId: toNode.id, ...edgeInput, status: "proposed", origin: "human" },
        update: { note: edgeInput.note, confidence: edgeInput.confidence, status: "proposed" },
      });
      await logDecision(id, "GRAPH", "human", "created_knowledge_edge", `${fromNode.nodeRef} —${edge.relationType}→ ${toNode.nodeRef}; proposed for review.`);
      return NextResponse.json({ edge }, { status: 201 });
    }

    if (action === "review_edge") {
      if (typeof body.edgeId !== "string" || !KNOWLEDGE_EDGE_STATUSES.includes(body.status)) return NextResponse.json({ error: "edgeId and a valid edge status are required." }, { status: 400 });
      const edge = await db.knowledgeEdge.findFirst({ where: { id: body.edgeId, projectId: id } });
      if (!edge) return NextResponse.json({ error: "Knowledge edge not found in this project." }, { status: 404 });
      const updated = await db.knowledgeEdge.update({ where: { id: edge.id }, data: { status: body.status } });
      await logDecision(id, "GRAPH", "human", "reviewed_knowledge_edge", `Edge ${edge.id} marked ${body.status}.`);
      return NextResponse.json({ edge: updated });
    }

    if (action === "link_claim") {
      if (typeof body.nodeId !== "string" || typeof body.claimId !== "string" || !CLAIM_NODE_RELATIONSHIPS.includes(body.relationship ?? "supports")) {
        return NextResponse.json({ error: "nodeId, claimId and a valid claim relationship are required." }, { status: 400 });
      }
      const [node, claim] = await Promise.all([
        db.knowledgeNode.findFirst({ where: { id: body.nodeId, projectId: id }, select: { id: true, nodeRef: true } }),
        db.evidenceClaim.findFirst({ where: { id: body.claimId, projectId: id }, select: { id: true, claimRef: true, status: true } }),
      ]);
      if (!node || !claim) return NextResponse.json({ error: "Node and claim must belong to this project." }, { status: 404 });
      if (claim.status !== "accepted") return NextResponse.json({ error: "Only accepted evidence claims can be linked to a knowledge node." }, { status: 422 });
      const link = await db.knowledgeNodeClaim.upsert({
        where: { nodeId_claimId: { nodeId: node.id, claimId: claim.id } },
        create: { projectId: id, nodeId: node.id, claimId: claim.id, relationship: body.relationship ?? "supports", note: typeof body.note === "string" ? body.note.slice(0, 500) : "" },
        update: { relationship: body.relationship ?? "supports", note: typeof body.note === "string" ? body.note.slice(0, 500) : "" },
      });
      await logDecision(id, "GRAPH", "human", "linked_claim_to_knowledge_node", `Linked accepted claim ${claim.claimRef} to ${node.nodeRef}.`);
      return NextResponse.json({ link }, { status: 201 });
    }

    if (action === "link_requirement") {
      if (typeof body.nodeId !== "string" || typeof body.requirementId !== "string" || !NODE_REQUIREMENT_ROLES.includes(body.role ?? "informs")) {
        return NextResponse.json({ error: "nodeId, requirementId and a valid requirement role are required." }, { status: 400 });
      }
      const [node, requirement] = await Promise.all([
        db.knowledgeNode.findFirst({ where: { id: body.nodeId, projectId: id }, select: { id: true, nodeRef: true } }),
        db.requirement.findFirst({ where: { id: body.requirementId, projectId: id }, select: { id: true, refId: true } }),
      ]);
      if (!node || !requirement) return NextResponse.json({ error: "Node and requirement must belong to this project." }, { status: 404 });
      const link = await db.knowledgeRequirement.upsert({
        where: { nodeId_requirementId_role: { nodeId: node.id, requirementId: requirement.id, role: body.role ?? "informs" } },
        create: { projectId: id, nodeId: node.id, requirementId: requirement.id, role: body.role ?? "informs", note: typeof body.note === "string" ? body.note.slice(0, 500) : "" },
        update: { note: typeof body.note === "string" ? body.note.slice(0, 500) : "" },
      });
      await logDecision(id, "GRAPH", "human", "linked_requirement_to_knowledge_node", `Linked requirement ${requirement.refId} to ${node.nodeRef}.`);
      return NextResponse.json({ link }, { status: 201 });
    }

    if (action === "delete_edge") {
      if (typeof body.edgeId !== "string") return NextResponse.json({ error: "edgeId is required." }, { status: 400 });
      const edge = await db.knowledgeEdge.findFirst({ where: { id: body.edgeId, projectId: id } });
      if (!edge) return NextResponse.json({ error: "Knowledge edge not found in this project." }, { status: 404 });
      await db.knowledgeEdge.delete({ where: { id: edge.id } });
      await logDecision(id, "GRAPH", "human", "deleted_knowledge_edge", `Removed relationship ${edge.relationType}.`);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown knowledge graph action." }, { status: 400 });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error).slice(0, 400);
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
