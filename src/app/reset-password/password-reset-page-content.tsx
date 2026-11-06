"use client";

import { useLang } from "@/lib/i18n";
import { PasswordResetRequestForm } from "./request-form";
import { PasswordResetCompleteForm } from "./complete-form";

export function PasswordResetPageContent({ token }: { token: string }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  return (
    <main dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Modrik / مدرك</p>
        <h1 className="mt-3 text-2xl font-semibold">{token ? (ar ? "اختيار كلمة مرور جديدة" : "Choose a new password") : (ar ? "استعادة حسابك" : "Recover your account")}</h1>
        <p className="mt-2 mb-7 text-sm leading-6 text-muted-foreground">
          {token
            ? (ar ? "استخدم كلمة مرور قوية لا تقل عن 12 حرفًا. يمكن استخدام هذا الرابط مرة واحدة وينتهي بعد 30 دقيقة." : "Use a strong password of at least 12 characters. This link can be used once and expires after 30 minutes.")
            : (ar ? "أدخل البريد الإلكتروني المرتبط بحسابك. إذا كان يطابق حسابًا نشطًا، فستُرسل إليه تعليمات الاستعادة." : "Enter the email address associated with your account. If it matches an active account, recovery instructions will be sent.")}
        </p>
        {token ? <PasswordResetCompleteForm token={token} /> : <PasswordResetRequestForm />}
      </section>
    </main>
  );
}
