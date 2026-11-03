export interface GitHubWebhookSignal {
  repository: string; key: string; title: string; url: string; signal: string;
}
export function verifyGitHubWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean;
export function normalizeGitHubWebhook(eventName: string | null, action: string | null, payload: unknown): GitHubWebhookSignal | null;
