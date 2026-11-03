#!/usr/bin/env node
// Fail-closed migration entry point. Production migration execution stays disabled
// until a provider-specific baseline and deployment approval process are committed.
const required = ["MODRIK_MIGRATIONS_ENABLED", "MODRIK_MIGRATION_BASELINE_ID", "MODRIK_MIGRATION_APPROVED"];
const missing = required.filter((key) => {
  const value = process.env[key];
  return key === "MODRIK_MIGRATIONS_ENABLED" ? value !== "true" : !value?.trim();
});
if (missing.length) {
  console.error("[migration-guard] Refusing to run Prisma migrations. Missing explicit release controls:", missing.join(", "));
  console.error("[migration-guard] H1.6 does not authorize production migrations; reconcile the deployed database and baseline first.");
  process.exit(1);
}
console.error("[migration-guard] Release controls are present, but no production runner is implemented in H1.6.");
console.error("[migration-guard] Refusing execution until the provider-specific runner and approval workflow are reviewed.");
process.exit(1);
