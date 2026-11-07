import { ParticipantForm } from "./participant-form";

export const metadata = {
  title: "Study participant portal — Modrik",
  description: "Private session-scoped response portal for Modrik user-study participants.",
  robots: { index: false, follow: false, noarchive: true },
};

export default function StudyParticipantPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 border-b border-border pb-5">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-primary">Modrik / مدرك · Research</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Study participant portal</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Enter the one-session code supplied by the study moderator. This portal accepts responses for that session only.
          </p>
        </div>
        <ParticipantForm />
        <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
          Do not enter your name, phone number, email address or any other direct identifier in notes.
          Your session code is pseudonymous; it is not a promise of legal anonymity.
        </p>
      </div>
    </main>
  );
}
