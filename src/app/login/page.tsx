import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in — Modrik",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  const configured = Boolean(
    process.env.MODRIK_AUTH_SECRET &&
    Buffer.byteLength(process.env.MODRIK_AUTH_SECRET, "utf8") >= 32
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-7">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Modrik / مدرك</p>
          <h1 className="mt-3 text-2xl font-semibold">Secure mission access</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Sign in to access the workspaces you belong to. New members can join through a secure invitation link.
          </p>
        </div>
        {!configured ? (
          <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6">
            Authentication is not configured. Set a 32-byte MODRIK_AUTH_SECRET before using Modrik.
            Follow the setup instructions in SECURITY.md.
          </div>
        ) : (
          <LoginForm />
        )}
        <p className="mt-7 text-xs leading-5 text-muted-foreground">
          Access is scoped to active organization membership. Invitation links are single-use and expire automatically.
        </p>
      </section>
    </main>
  );
}
