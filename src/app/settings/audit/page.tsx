import { OrganizationAuditManager } from "./audit-manager";

export const metadata = { title: "Organization audit — Modrik", robots: { index: false, follow: false } };

export default function OrganizationAuditPage() {
  return <OrganizationAuditManager />;
}
