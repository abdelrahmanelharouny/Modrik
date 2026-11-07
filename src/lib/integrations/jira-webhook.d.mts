export interface JiraWebhookSignal { projectKey: string; key: string; title: string; url: string; eventName: string; signal: string }
export function verifyJiraWebhookSignature(rawBody: string, signature: string | null, secret: string): boolean;
export function normalizeJiraWebhook(payload: unknown, configuredProjectKey: string, baseUrl: string): JiraWebhookSignal | null;
