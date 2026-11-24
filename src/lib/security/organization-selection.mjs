export function resolveOrganizationMembership(memberships, requestedOrganizationId = null) {
  const activeMemberships = Array.isArray(memberships)
    ? memberships.filter((membership) =>
        membership &&
        membership.status === "active" &&
        membership.organization &&
        membership.organization.status === "active" &&
        typeof membership.organizationId === "string" &&
        typeof membership.id === "string"
      )
    : [];

  const organizations = activeMemberships.map((membership) => ({
    id: membership.organizationId,
    name: String(membership.organization.name ?? membership.organization.slug ?? "Workspace"),
    slug: String(membership.organization.slug ?? ""),
    role: String(membership.role ?? "viewer"),
  }));

  if (typeof requestedOrganizationId === "string" && requestedOrganizationId.length > 0) {
    const membership = activeMemberships.find(
      (candidate) => candidate.organizationId === requestedOrganizationId
    );
    return membership
      ? { kind: "selected", membership, organizations }
      : { kind: "invalid", organizations };
  }

  if (activeMemberships.length === 0) return { kind: "none", organizations: [] };
  if (activeMemberships.length > 1) return { kind: "selection_required", organizations };
  return { kind: "selected", membership: activeMemberships[0], organizations };
}
