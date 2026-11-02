export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  backend: "upstash" | "memory" | "unavailable" | "memory-capacity";
};
export declare function isDistributedRateLimitConfigured(env?: NodeJS.ProcessEnv): boolean;
export declare function consumeRateLimit(input: {
  scope: string;
  identifier: string;
  limit: number;
  windowMs: number;
}, options?: {
  env?: NodeJS.ProcessEnv;
  now?: number;
  fetchImpl?: typeof fetch;
}): Promise<RateLimitResult>;
