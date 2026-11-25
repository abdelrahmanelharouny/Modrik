export const ORGANIZATION_PLANS = Object.freeze({
  free: Object.freeze({ key:"free", name:"Free", monthlyTokenLimit:250_000, memberLimit:3, projectLimit:3, features:["core_pipeline","json_export"] }),
  team: Object.freeze({ key:"team", name:"Team", monthlyTokenLimit:2_000_000, memberLimit:15, projectLimit:30, features:["core_pipeline","json_export","baseline_registry","portfolio_analytics","governance","priority_support"] }),
  business: Object.freeze({ key:"business", name:"Business", monthlyTokenLimit:10_000_000, memberLimit:75, projectLimit:250, features:["core_pipeline","json_export","baseline_registry","portfolio_analytics","governance","audit_package","advanced_retention","priority_support"] }),
  enterprise: Object.freeze({ key:"enterprise", name:"Enterprise", monthlyTokenLimit:100_000_000, memberLimit:10_000, projectLimit:10_000, features:["core_pipeline","json_export","baseline_registry","portfolio_analytics","governance","audit_package","advanced_retention","sso_readiness","priority_support"] }),
});

export function resolveOrganizationPlan(key) {
  return ORGANIZATION_PLANS[typeof key === "string" ? key : ""] ?? ORGANIZATION_PLANS.free;
}

export function evaluateOrganizationEntitlements(input = {}) {
  const plan = resolveOrganizationPlan(input.planKey);
  const tokens = Number.isSafeInteger(input.monthlyTokens) && input.monthlyTokens >= 0 ? input.monthlyTokens : 0;
  const members = Number.isSafeInteger(input.activeMembers) && input.activeMembers >= 0 ? input.activeMembers : 0;
  const projects = Number.isSafeInteger(input.activeProjects) && input.activeProjects >= 0 ? input.activeProjects : 0;
  const tokenRatio = plan.monthlyTokenLimit ? tokens / plan.monthlyTokenLimit : 0;
  const tokenState = tokenRatio >= 1 ? "exceeded" : tokenRatio >= 0.8 ? "near_limit" : "within_limit";
  return Object.freeze({
    plan: { key: plan.key, name: plan.name },
    limits: { monthlyTokens: plan.monthlyTokenLimit, members: plan.memberLimit, projects: plan.projectLimit },
    usage: { monthlyTokens: tokens, activeMembers: members, activeProjects: projects },
    tokenState,
    memberState: members > plan.memberLimit ? "exceeded" : members >= plan.memberLimit ? "at_limit" : "within_limit",
    projectState: projects > plan.projectLimit ? "exceeded" : projects >= plan.projectLimit ? "at_limit" : "within_limit",
    features: [...plan.features],
    enforcement: "advisory_until_billing_provider_and_atomic_reservations_are_configured",
  });
}
