export type OrganizationMembershipRecord = {
  id: string;
  organizationId: string;
  role: string;
  status: string;
  organization?: { id: string; name: string; slug: string; status: string } | null;
};
export type OrganizationOption = { id: string; name: string; slug: string; role: string };
export type OrganizationSelection =
  | { kind: "selected"; membership: OrganizationMembershipRecord; organizations: OrganizationOption[] }
  | { kind: "selection_required"; organizations: OrganizationOption[] }
  | { kind: "invalid"; organizations: OrganizationOption[] }
  | { kind: "none"; organizations: OrganizationOption[] };
export function resolveOrganizationMembership(
  memberships: OrganizationMembershipRecord[],
  requestedOrganizationId?: string | null
): OrganizationSelection;
