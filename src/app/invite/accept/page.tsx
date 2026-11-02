import { InvitationAcceptForm } from "./invitation-accept-form";

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
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-7">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Modrik / مدرك</p>
          <h1 className="mt-3 text-2xl font-semibold">Join your organization</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Accept your secure invitation to join a Modrik workspace. The invitation can be used only once and expires after seven days.
          </p>
        </div>
        {!token ? (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm leading-6">
            This invitation link is incomplete. Ask your organization administrator to issue a new invitation.
          </div>
        ) : (
          <InvitationAcceptForm token={token} />
        )}
      </section>
    </main>
  );
}
