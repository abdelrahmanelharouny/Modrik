import { PasswordResetRequestForm } from "./request-form";
import { PasswordResetCompleteForm } from "./complete-form";

export const metadata = {
  title: "Password recovery — Modrik",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
    <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Modrik / مدرك</p>
      <h1 className="mt-3 text-2xl font-semibold">{token ? "Choose a new password" : "Recover your account"}</h1>
      <p className="mt-2 mb-7 text-sm leading-6 text-muted-foreground">{token ? "Use a strong password of at least 12 characters. This link can be used once and expires after 30 minutes." : "Enter the email address associated with your account. If it matches an active account, recovery instructions will be sent."}</p>
      {token ? <PasswordResetCompleteForm token={token} /> : <PasswordResetRequestForm />}
    </section>
  </main>;
}
