import { LoginPageContent } from "./login-page-content";

export const metadata = {
  title: "Sign in — Modrik",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  const configured = Boolean(
    process.env.MODRIK_AUTH_SECRET &&
    Buffer.byteLength(process.env.MODRIK_AUTH_SECRET, "utf8") >= 32
  );
  return <LoginPageContent configured={configured} />;
}
