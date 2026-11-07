import { PasswordResetPageContent } from "./password-reset-page-content";

export const metadata = {
  title: "Password recovery — Modrik",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  return <PasswordResetPageContent token={token} />;
}
