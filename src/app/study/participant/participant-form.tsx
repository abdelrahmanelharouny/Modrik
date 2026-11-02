"use client";

import { useEffect, useState } from "react";

type Dimension = "mental" | "physical" | "temporal" | "performance" | "effort" | "frustration";
const DIMENSIONS: { key: Dimension; label: string; ar: string }[] = [
  { key: "mental", label: "Mental demand", ar: "المجهود الذهني" },
  { key: "physical", label: "Physical demand", ar: "المجهود البدني" },
  { key: "temporal", label: "Temporal demand", ar: "ضغط الوقت" },
  { key: "performance", label: "Performance", ar: "تقييم الأداء" },
  { key: "effort", label: "Effort", ar: "المجهود المبذول" },
  { key: "frustration", label: "Frustration", ar: "الإحباط" },
];

type SubmitPayload = {
  consentAccepted?: boolean;
  taskTimeSec?: number;
  nasaTlx?: Partial<Record<Dimension, number>>;
  susScore?: number;
  notes?: string;
  event?: { kind: string; detail: string };
  finished?: boolean;
  withdraw?: boolean;
};

export function ParticipantForm() {
  const [tokenDraft, setTokenDraft] = useState("");
  const [token, setToken] = useState("");
  const [consent, setConsent] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [tlx, setTlx] = useState<Partial<Record<Dimension, string>>>({});
  const [susScore, setSusScore] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const storedToken = window.sessionStorage.getItem("modrik-study-participant-token");
    if (!storedToken) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/study/respond", {
          method: "GET",
          headers: { Authorization: "Bearer " + storedToken },
          cache: "no-store",
          credentials: "omit",
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          window.sessionStorage.removeItem("modrik-study-participant-token");
          if (!cancelled) setError(result.error || "The saved session code has expired.");
          return;
        }
        if (cancelled) return;
        setToken(storedToken);
        setSessionStarted(true);
        setConsent(result.consentAccepted === true);
        setFinished(result.finished === true);
        setNotice(result.finished
          ? "Your finished session was restored. You may still withdraw before the session code expires."
          : "Your participant session was restored in this tab.");
      } catch {
        if (!cancelled) setError("Could not restore the session. Check your connection and try again.");
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!running || startedAt === null) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);

  const elapsedLabel = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    return [hours, minutes, remainder].map((value) => String(value).padStart(2, "0")).join(":");
  };

  async function send(payload: SubmitPayload) {
    const response = await fetch("/api/study/respond", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      credentials: "omit",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "The study server rejected this update.");
    return result as { ok: boolean; sessionId?: string; finished?: boolean; withdrawn?: boolean };
  }

  async function beginSession() {
    setError("");
    setNotice("");
    const cleanToken = tokenDraft.trim();
    if (!/^mps_[A-Za-z0-9_-]{43}$/.test(cleanToken)) {
      setError("The session code does not look valid. Copy the full code supplied by the moderator.");
      return;
    }
    if (!consent) {
      setError("Please read the study notice and confirm before starting.");
      return;
    }

    setBusy(true);
    try {
      setToken(cleanToken);
      const response = await fetch("/api/study/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + cleanToken,
        },
        body: JSON.stringify({
          consentAccepted: true,
          event: { kind: "participant_started", detail: "Participant acknowledged study notice v1." },
        }),
        cache: "no-store",
        credentials: "omit",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "The session code could not be verified.");
      setSessionStarted(true);
      window.sessionStorage.setItem("modrik-study-participant-token", cleanToken);
      setTokenDraft("");
      setNotice("Your session is ready. Start the timer when the task begins.");
    } catch (cause) {
      setToken("");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function startTimer() {
    if (running || finished || withdrawn) return;
    setStartedAt(Date.now() - elapsedSeconds * 1000);
    setRunning(true);
    setNotice("Task timer is running.");
  }

  function pauseTimer() {
    if (!running || startedAt === null) return;
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    setRunning(false);
    setNotice("Timer paused. You may resume it or save your responses.");
  }

  function buildMeasurements(): SubmitPayload {
    const nasaTlx: Partial<Record<Dimension, number>> = {};
    for (const item of DIMENSIONS) {
      const raw = tlx[item.key];
      if (raw === undefined || raw.trim() === "") continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error(item.label + " must be between 0 and 100.");
      }
      nasaTlx[item.key] = Math.round(value);
    }
    let sus: number | undefined;
    if (susScore.trim() !== "") {
      const value = Number(susScore);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error("SUS score must be between 0 and 100.");
      }
      sus = Math.round(value);
    }
    return {
      consentAccepted: true,
      taskTimeSec: running && startedAt !== null
        ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
        : elapsedSeconds,
      ...(Object.keys(nasaTlx).length ? { nasaTlx } : {}),
      ...(sus !== undefined ? { susScore: sus } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
  }

  async function saveResponses() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = buildMeasurements();
      payload.event = { kind: "participant_update", detail: "Participant saved study measures." };
      await send(payload);
      if (running && startedAt !== null) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
      }
      setNotice("Responses saved. You can continue the task and update them again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function finishSession() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const payload = buildMeasurements();
      payload.finished = true;
      payload.event = { kind: "participant_finished", detail: "Participant finished the study session." };
      await send(payload);
      if (running && startedAt !== null) {
        setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
      }
      setRunning(false);
      setFinished(true);
      setNotice("Your session is finished and locked. The session code remains available for withdrawal until it expires.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function withdrawSession() {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await send({ consentAccepted: true, withdraw: true });
      setRunning(false);
      setWithdrawn(true);
      setFinished(true);
      window.sessionStorage.removeItem("modrik-study-participant-token");
      setToken("");
      setTlx({});
      setSusScore("");
      setNotes("");
      setElapsedSeconds(0);
      setNotice("Your session response data and recorded events have been scrubbed. A minimal withdrawal marker remains for study accounting.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      {!sessionStarted ? (
        <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
          <h2 className="text-lg font-semibold">Connect your study session</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            The moderator will give you a one-session code. Do not share it with anyone else.
            It is not a project password and it does not grant access to the Modrik workspace.
          </p>
          <label className="mt-5 block text-sm font-medium" htmlFor="participant-token">Session code</label>
          <input
            id="participant-token"
            autoComplete="off"
            spellCheck={false}
            value={tokenDraft}
            onChange={(event) => setTokenDraft(event.target.value)}
            placeholder="mps_…"
            className="mt-2 h-12 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          <div className="mt-5 rounded-xl border border-border/80 bg-secondary/30 p-4">
            <h3 className="text-sm font-semibold">Study notice · Version 1</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Participation is voluntary. The study stores your pseudonymous participant code, task time,
              workload scores, optional usability score, optional notes and study events. Do not enter
              your name or contact details. You may stop participating and withdraw your submitted
              responses while the session code is valid. The moderator should provide the full study
              information and answer your questions before you begin.
            </p>
            <label className="mt-4 flex items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1 h-4 w-4 accent-[var(--primary)]"
              />
              <span>I have received and read the study information, understand participation is voluntary, and agree to submit responses for this session.</span>
            </label>
          </div>

          <button
            type="button"
            onClick={beginSession}
            disabled={busy || !tokenDraft.trim() || !consent}
            className="mt-5 h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Checking session…" : "Confirm and start"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Study response</h2>
                <p className="mt-1 text-xs text-muted-foreground">Only this session can be updated with your code.</p>
              </div>
              <span className="rounded-full border border-border px-3 py-1 font-mono text-xs tabular-nums">
                {finished ? withdrawn ? "WITHDRAWN" : "FINISHED" : "ACTIVE"}
              </span>
            </div>
            <div className="mt-5 rounded-xl border border-border/80 bg-secondary/20 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Task time</p>
              <p className="mt-1 font-mono text-3xl tabular-nums">{elapsedLabel(elapsedSeconds)}</p>
              {!finished && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {!running ? (
                    <button type="button" onClick={startTimer} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                      {elapsedSeconds ? "Resume timer" : "Start timer"}
                    </button>
                  ) : (
                    <button type="button" onClick={pauseTimer} className="rounded-md border border-border px-4 py-2 text-sm font-medium">
                      Pause timer
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold">NASA-TLX workload (0–100)</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Enter any dimensions you have completed. You may save partial responses.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {DIMENSIONS.map((dimension) => (
                  <label key={dimension.key} className="block rounded-lg border border-border/70 p-3">
                    <span className="block text-sm font-medium">{dimension.label}</span>
                    <span className="block text-xs text-muted-foreground">{dimension.ar}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      inputMode="numeric"
                      disabled={finished}
                      value={tlx[dimension.key] ?? ""}
                      onChange={(event) => setTlx((current) => ({ ...current, [dimension.key]: event.target.value }))}
                      className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                SUS usability score (0–100)
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  disabled={finished}
                  value={susScore}
                  onChange={(event) => setSusScore(event.target.value)}
                  className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                />
              </label>
              <label className="block text-sm font-medium">
                Notes (optional)
                <textarea
                  rows={3}
                  maxLength={2000}
                  disabled={finished}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Describe usability issues without adding names or contact details."
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                />
              </label>
            </div>

            {!finished && (
              <div className="mt-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={saveResponses}
                  disabled={busy}
                  className="h-10 rounded-lg border border-border px-4 text-sm font-medium disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save responses"}
                </button>
                <button
                  type="button"
                  onClick={finishSession}
                  disabled={busy}
                  className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Finish session
                </button>
              </div>
            )}

            {finished && !withdrawn && (
              <p className="mt-5 rounded-lg border border-verify/30 bg-verify/5 p-3 text-sm leading-6">
                Your responses are locked. You can still withdraw them before the session code expires.
              </p>
            )}
            {finished && !withdrawn && (
              <button
                type="button"
                onClick={withdrawSession}
                disabled={busy}
                className="mt-3 h-10 rounded-lg border border-destructive/50 px-4 text-sm font-medium text-destructive disabled:opacity-50"
              >
                {busy ? "Withdrawing…" : "Withdraw my responses"}
              </button>
            )}
            {withdrawn && (
              <p className="mt-5 rounded-lg border border-border p-3 text-sm leading-6 text-muted-foreground">
                Withdrawal complete. The moderator can no longer access the submitted measurements or event history for this session.
              </p>
            )}
          </div>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">{notice}</p>}
    </section>
  );
}
