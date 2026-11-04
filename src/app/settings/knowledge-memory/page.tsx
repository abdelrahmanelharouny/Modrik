import { OrganizationKnowledgeReviewManager } from "./review-manager";

export const metadata = { title: "Knowledge review — Modrik", robots: { index: false, follow: false } };

export default function OrganizationKnowledgeReviewPage() {
  return <OrganizationKnowledgeReviewManager />;
}
