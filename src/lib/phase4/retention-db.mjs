export async function findActiveProjectRetentionHold(client, organizationId, projectId) {
  if (typeof organizationId !== "string" || !organizationId || typeof projectId !== "string" || !projectId) return null;
  return client.retentionHold.findFirst({
    where: { organizationId, projectId, releasedAt: null },
    orderBy: { placedAt: "asc" },
    select: { id: true, resourceType: true, resourceId: true, reason: true, placedAt: true },
  });
}

export async function findActiveResourceRetentionHold(client, organizationId, projectId, resourceType, resourceId) {
  if (typeof organizationId !== "string" || !organizationId || typeof projectId !== "string" || !projectId) return null;
  const OR = [{ resourceType: "project", resourceId: projectId }];
  if (typeof resourceType === "string" && resourceType && typeof resourceId === "string" && resourceId) {
    OR.push({ resourceType, resourceId });
  }
  return client.retentionHold.findFirst({
    where: { organizationId, projectId, releasedAt: null, OR },
    orderBy: { placedAt: "asc" },
    select: { id: true, resourceType: true, resourceId: true, reason: true, placedAt: true },
  });
}
