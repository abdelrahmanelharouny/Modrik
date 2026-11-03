export declare const SESSION_COOKIE: "modrik_session";
export declare const SESSION_TTL_SECONDS: number;
export declare function isAuthConfigured(env?: NodeJS.ProcessEnv): boolean;
export declare function verifyAdminCredentials(email: unknown, password: unknown, env?: NodeJS.ProcessEnv): Promise<boolean>;
export declare function createSessionToken(email: string, secret: string, now?: number): string;
export declare function verifySessionToken(token: string | undefined, secret: string | undefined, now?: number): { email: string; role: "owner"; expiresAt: number } | null;
export declare function verifyAdminRequest(token: string | undefined, env?: NodeJS.ProcessEnv, now?: number): { email: string; role: "owner"; expiresAt: number } | null;
