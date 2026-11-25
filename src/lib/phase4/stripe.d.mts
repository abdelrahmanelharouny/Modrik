export declare function stripePriceForPlan(planKey: string, env?: Record<string,string|undefined>): string|null;
export declare function planForStripePrice(priceId: unknown, env?: Record<string,string|undefined>): string|null;
export declare function normalizeStripeSubscriptionStatus(value: unknown): "trialing"|"active"|"past_due"|"canceled"|"suspended";
export declare function verifyStripeWebhookSignature(rawBody: unknown, signatureHeader: unknown, secret: unknown, nowSeconds?: number, toleranceSeconds?: number): boolean;
export declare function stripeEventOrganizationId(object: any): string|null;
export declare function stripeEventPlanKey(object: any, env?: Record<string,string|undefined>): string|null;
export declare function stripeEpochDate(value: unknown): Date|null;
export declare function stripeForm(fields: Record<string,unknown>): URLSearchParams;
export declare function stripeApiRequest(path:string, options?: {secretKey?:string;method?:"GET"|"POST";fields?:Record<string,unknown>;idempotencyKey?:string;fetchImpl?:typeof fetch}): Promise<any>;
