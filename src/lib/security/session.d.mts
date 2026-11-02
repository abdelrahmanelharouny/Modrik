export declare const SESSION_COOKIE: "modrik_session";
export declare const SESSION_TTL_SECONDS: number;
export type VerifiedSession = {
  email: string;
  role: "owner" | "admin" | "engineer" | "reviewer" | "approver" | "viewer";
  expiresAt: number;
  sessionId: string | null;
  userId: string | null;
  organizationId: string | null;
  membershipId: string | null;
  type: "identity" | "legacy-owner";
};
export declare function isSessionSigningConfigured(env?: NodeJS.ProcessEnv): boolean;
export declare function isAuthConfigured(env?: NodeJS.ProcessEnv): boolean;
export declare function hashPassword(password: unknown): Promise<string>;
export declare function verifyPasswordHash(password: unknown, passwordHash: unknown): Promise<boolean>;
export declare function verifyAdminCredentials(email: unknown, password: unknown, env?: NodeJS.ProcessEnv): Promise<boolean>;
export declare function createIdentitySessionToken(claims: {
  email: string;
  userId: string;
  organizationId: string;
  membershipId: string;
  role: string;
  sessionId: string;
}, secret: string, now?: number): string;
export declare function createSessionToken(email: string, secret: string, now?: number): string;
export declare function verifySessionToken(token: string | undefined, secret: string | undefined, now?: number): VerifiedSession | null;
export declare function verifyAdminRequest(token: string | undefined, env?: NodeJS.ProcessEnv, now?: number): VerifiedSession | null;
