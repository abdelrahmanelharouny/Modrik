export declare const INVITATION_TTL_MS: number;
export declare const INVITABLE_ROLES: readonly ["admin", "engineer", "reviewer", "approver", "viewer"];
export declare function createInvitationToken(): string;
export declare function hashInvitationToken(token: unknown): string | null;
export declare function isInvitableRole(role: unknown): role is "admin" | "engineer" | "reviewer" | "approver" | "viewer";
export declare function getInvitationState(invitation: unknown, now?: number): "invalid" | "accepted" | "revoked" | "expired" | "pending";
