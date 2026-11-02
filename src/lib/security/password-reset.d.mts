export declare const PASSWORD_RESET_TTL_MS: number;
export declare function createPasswordResetToken(): string;
export declare function hashPasswordResetToken(token: unknown): string | null;
export declare function getPasswordResetState(record: unknown, now?: number): "invalid" | "used" | "revoked" | "expired" | "pending";
