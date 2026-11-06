import { InvitationAcceptPageContent } from "./invitation-accept-page-content";

export const metadata = {
  title: "Accept invitation — Modrik",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function InvitationAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return <InvitationAcceptPageContent token={token} />;
}
