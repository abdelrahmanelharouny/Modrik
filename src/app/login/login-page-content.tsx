"use client";

import { useLang } from "@/lib/i18n";
import { LoginForm } from "./login-form";

export function LoginPageContent({ configured }: { configured: boolean }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  return (
    <main dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-7"><p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Modrik / مدرك</p>
          <h1 className="mt-3 text-2xl font-semibold">{ar ? "دخول آمن إلى مساحة العمل" : "Secure mission access"}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{ar ? "سجّل الدخول للوصول إلى مساحات العمل التي تنتمي إليها. يمكن للأعضاء الجدد الانضمام عبر رابط دعوة آمن." : "Sign in to access the workspaces you belong to. New members can join through a secure invitation link."}</p>
        </div>
        {!configured ? <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6">{ar ? "لم يتم إعداد المصادقة. اضبط MODRIK_AUTH_SECRET بطول 32 بايت قبل استخدام مدرك، وراجع تعليمات SECURITY.md." : "Authentication is not configured. Set a 32-byte MODRIK_AUTH_SECRET before using Modrik. Follow the setup instructions in SECURITY.md."}</div> : <LoginForm />}
        <p className="mt-7 text-xs leading-5 text-muted-foreground">{ar ? "يقتصر الوصول على العضويات النشطة داخل المؤسسة. روابط الدعوة تستخدم مرة واحدة وتنتهي صلاحيتها تلقائيًا." : "Access is scoped to active organization membership. Invitation links are single-use and expire automatically."}</p>
      </section>
    </main>
  );
}
