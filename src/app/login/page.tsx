import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in — Modrik",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  const configured = Boolean(
    process.env.MODRIK_ADMIN_EMAIL &&
    process.env.MODRIK_ADMIN_PASSWORD_HASH &&
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
            Sign in to access project evidence, requirements, decisions and integrations.
          </p>
        </div>
        {!configured ? (
          <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6">
            Authentication is not configured. Set MODRIK_ADMIN_EMAIL, MODRIK_ADMIN_PASSWORD_HASH and MODRIK_AUTH_SECRET before using Modrik.
            Follow the setup instructions in SECURITY.md.
          </div>
        ) : (
          <LoginForm />
        )}
        <p className="mt-7 text-xs leading-5 text-muted-foreground">
          This release provides a single-owner access boundary. Organization membership and multi-user RBAC remain a separate rollout and must not be assumed to exist.
        </p>
      </section>
    </main>
  );
}
