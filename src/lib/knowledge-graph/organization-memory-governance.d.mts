export type OrganizationMemoryAction = "submit_for_review" | "reject" | "approve" | "archive";
export type OrganizationMemoryTransition = {
  action: OrganizationMemoryAction;
  from: string;
  to: string;
  permission: "requirements:write" | "requirements:review" | "requirements:approve";
};
export function resolveOrganizationMemoryTransition(
  action: string,
  currentStatus: string
): OrganizationMemoryTransition | null;
export function normalizeOrganizationMemoryReason(value: unknown): string;
