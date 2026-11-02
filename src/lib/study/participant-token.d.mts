export interface ParticipantTokenIssue {
  token: string;
  hash: string;
  expiresAt: Date;
}
export declare function hashParticipantToken(token: string): string;
export declare function issueParticipantToken(now?: number, ttlMs?: number): ParticipantTokenIssue;
export declare function verifyParticipantToken(token: string, expectedHash: string, expiresAt: Date, now?: number): boolean;
