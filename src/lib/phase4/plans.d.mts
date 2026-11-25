export declare const ORGANIZATION_PLANS: Readonly<Record<string, Readonly<{key:string;name:string;monthlyTokenLimit:number;memberLimit:number;projectLimit:number;features:readonly string[]}>>>;
export declare function resolveOrganizationPlan(key: unknown): Readonly<{key:string;name:string;monthlyTokenLimit:number;memberLimit:number;projectLimit:number;features:readonly string[]}>;
export declare function evaluateOrganizationEntitlements(input?: {planKey?:string;monthlyTokens?:number;activeMembers?:number;activeProjects?:number}): {
 plan:{key:string;name:string};limits:{monthlyTokens:number;members:number;projects:number};usage:{monthlyTokens:number;activeMembers:number;activeProjects:number};
 tokenState:"within_limit"|"near_limit"|"exceeded";memberState:"within_limit"|"at_limit"|"exceeded";projectState:"within_limit"|"at_limit"|"exceeded";features:string[];enforcement:string;
};
