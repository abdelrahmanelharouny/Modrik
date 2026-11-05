// Reverse traceability is deliberately deterministic: only an explicit
// requirementId, linked story, or exact stable REQ reference may resolve a
// tracker record. Similarity and LLM guesses are never treated as provenance.
export function resolveTrackerRequirement(syncMap, requirements, stories = []) {
  if (!syncMap || !Array.isArray(requirements)) return { requirement: null, resolution: "unmapped" };
  const byId = new Map(requirements.map((item) => [item.id, item]));
  if (typeof syncMap.requirementId === "string" && byId.has(syncMap.requirementId)) {
    return { requirement: byId.get(syncMap.requirementId), resolution: "explicit_requirement_link" };
  }
  if (typeof syncMap.storyId === "string") {
    const story = stories.find((item) => item.id === syncMap.storyId);
    if (story && byId.has(story.requirementId)) {
      return { requirement: byId.get(story.requirementId), resolution: "linked_user_story" };
    }
  }
  const label = typeof syncMap.localLabel === "string" ? syncMap.localLabel.trim() : "";
  const exact = requirements.filter((item) => item.refId === label);
  if (exact.length === 1) return { requirement: exact[0], resolution: "exact_stable_reference" };
  return { requirement: null, resolution: exact.length > 1 ? "ambiguous_reference" : "unmapped" };
}

export function summarizeReverseTrace({ requirement, traceLinks = [], claimLinks = [], knowledgeLinks = [], stories = [], impacted = [] }) {
  if (!requirement) return { status: "unmapped", direct: [], supportingClaims: [], knowledge: [], stories: [], impacted: [] };
  return {
    status: "mapped",
    direct: traceLinks.map((link) => ({ evidenceCode: link.evidenceCode, evidenceId: link.evidenceId, note: link.note ?? null })),
    linkedClaims: claimLinks.map((link) => ({
      claimId: link.claim.id, claimRef: link.claim.claimRef, status: link.claim.status,
      relationship: link.relationship, quote: link.claim.quote,
      evidenceCode: link.claim.evidence?.code ?? null,
      revisionVersion: link.claim.revision?.version ?? null,
    })),
    knowledge: knowledgeLinks.map((link) => ({
      nodeId: link.node.id, nodeRef: link.node.nodeRef, kind: link.node.kind,
      label: link.node.label, status: link.node.status, role: link.role,
    })),
    stories: stories.map((story) => ({ id: story.id, refId: story.refId, title: story.title, status: story.status })),
    impacted: impacted.map((item) => {
      const requirement = item.requirement ?? item;
      const evidenceCodes = Array.isArray(item.evidenceCodes) ? [...new Set(item.evidenceCodes.filter((code) => typeof code === "string"))].sort() : [];
      return {
        id: item.id,
        refId: requirement.refId ?? item.refId ?? null,
        text: requirement.text ?? null,
        status: requirement.status ?? null,
        priority: requirement.priority ?? null,
        verifyStatus: requirement.verifyStatus ?? null,
        driftStatus: requirement.driftStatus ?? null,
        depth: item.depth,
        via: Array.isArray(item.via) ? item.via : [],
        evidenceCodes,
        evidenceCount: evidenceCodes.length,
      };
    }),
  };
}
