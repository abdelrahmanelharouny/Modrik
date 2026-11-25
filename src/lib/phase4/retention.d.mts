export declare function validateOrganizationPolicyPatch(input: Record<string,unknown>): Record<string,unknown>;
export declare function isRetentionEligible(input?: {createdAt:Date|string;retentionDays:number;now?:Date|string;held?:boolean}): boolean;

export declare function assertOrganizationAiProviderAllowed(policy: { aiProcessingAllowed?: boolean; permittedAiProviders?: string | string[] } | null, provider: string): true;
