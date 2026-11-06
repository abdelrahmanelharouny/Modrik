"use client";

import { useLang } from "@/lib/i18n";
import { InvitationAcceptForm } from "./invitation-accept-form";

export function InvitationAcceptPageContent({ token }: { token: string }) {
  const { lang } = useLang();
  const ar = lang === "ar";
  return (
    <main dir={ar ? "rtl" : "ltr"} lang={ar ? "ar" : "en"} className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <div className="mb-7">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Modrik / مدرك</p>
          <h1 className="mt-3 text-2xl font-semibold">{ar ? "انضم إلى مؤسستك" : "Join your organization"}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {ar ? "اقبل دعوتك الآمنة للانضمام إلى مساحة عمل مدرك. يمكن استخدام الدعوة مرة واحدة فقط وتنتهي صلاحيتها بعد سبعة أيام." : "Accept your secure invitation to join a Modrik workspace. The invitation can be used only once and expires after seven days."}
          </p>
        </div>
        {!token ? (
          <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm leading-6">
            {ar ? "رابط الدعوة غير مكتمل. اطلب من مسؤول المؤسسة إصدار دعوة جديدة." : "This invitation link is incomplete. Ask your organization administrator to issue a new invitation."}
          </div>
        ) : <InvitationAcceptForm token={token} />}
      </section>
    </main>
  );
}
