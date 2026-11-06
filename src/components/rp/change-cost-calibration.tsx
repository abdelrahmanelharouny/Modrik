"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, RefreshCw, ClipboardCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CalibrationRecord {
  id: string;
  rootRef: string | null;
  createdAt: string;
  estimate: { effortPoints: number; affectedRequirements: number; uncertainty?: { percent: number } } | null;
  outcome: { actualHours: number; note: string; recordedAt: string } | null;
}
interface CalibrationSummary {
  sampleCount: number;
  fit: { intercept: number; hoursPerEffortPoint: number } | null;
  maeHours: number | null;
  rmseHours: number | null;
  meanBiasHours: number | null;
  rankCorrelation: number | null;
  readiness: string;
  caveat?: string;
}
interface CalibrationResponse { records: CalibrationRecord[]; calibration: CalibrationSummary; truncated: boolean }

function OutcomeEditor({ record, onSaved }: { record: CalibrationRecord; onSaved: () => Promise<void> }) {
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const { lang } = useLang();
  const ar = lang === "ar";
  const save = async () => {
    if (!hours.trim() || !Number.isFinite(Number(hours)) || Number(hours) < 0) return;
    setBusy(true);
    try {
      await api(`/api/projects/${(window as unknown as { __modrikProjectId?: string }).__modrikProjectId ?? ""}/change-cost`, { method: "POST", body: JSON.stringify({ action: "record_outcome", estimateId: record.id, actualHours: Number(hours), note }) });
      toast({ title: ar ? "تم تسجيل ساعات التنفيذ" : "Observed effort recorded" });
      await onSaved();
    } catch (error) {
      toast({ title: ar ? "تعذر التسجيل" : "Could not record outcome", description: (error as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  return <div className="mt-2 rounded border border-border/60 bg-background/30 p-2">
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-mono text-muted-foreground">{record.rootRef ?? "Requirement"}</span>
      <span>{record.estimate?.effortPoints.toFixed(2)} {ar ? "نقطة جهد" : "effort points"}</span>
      <span className="text-muted-foreground">{new Date(record.createdAt).toLocaleDateString()}</span>
      {record.outcome ? <Badge variant="outline" className="border-signal/40 text-signal">{record.outcome.actualHours}h {ar ? "فعلي" : "actual"}</Badge> : <Badge variant="outline">{ar ? "بانتظار النتيجة" : "outcome pending"}</Badge>}
    </div>
    {!record.outcome && <div className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr_auto]">
      <Input type="number" min="0" step="0.25" value={hours} onChange={(event) => setHours(event.target.value)} placeholder={ar ? "الساعات الفعلية" : "Actual hours"} aria-label={ar ? "ساعات التنفيذ الفعلية" : "Actual engineering hours"} />
      <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder={ar ? "ملاحظة اختيارية عن نطاق العمل" : "Optional scope/context note"} aria-label={ar ? "ملاحظة" : "Outcome note"} />
      <Button size="sm" variant="outline" disabled={busy || !hours.trim() || !Number.isFinite(Number(hours)) || Number(hours) < 0} onClick={save}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}{ar ? "حفظ الفعلي" : "Save actual"}</Button>
    </div>}
    {record.outcome?.note && <p className="mt-1 text-[10px] text-muted-foreground">{record.outcome.note}</p>}
  </div>;
}

export function ChangeCostCalibration({ projectId, requirementId }: { projectId: string; requirementId: string }) {
  const [data, setData] = useState<CalibrationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const { lang } = useLang();
  const { toast } = useToast();
  const ar = lang === "ar";
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api<CalibrationResponse>(`/api/projects/${projectId}/change-cost`)); }
    catch (error) { toast({ title: ar ? "تعذر تحميل المعايرة" : "Calibration history unavailable", description: (error as Error).message, variant: "destructive" }); }
    finally { setLoading(false); }
  }, [projectId, toast, ar]);
  useEffect(() => { void load(); }, [load]);
  const register = async () => {
    setRegistering(true);
    try {
      await api(`/api/projects/${projectId}/change-cost`, { method: "POST", body: JSON.stringify({ action: "register_estimate", requirementId }) });
      toast({ title: ar ? "تم حفظ لقطة التقدير" : "Estimate snapshot registered", description: ar ? "تم حسابها من بيانات المشروع الحالية وحفظها في سجل القرارات." : "Recomputed from current project data and saved to the decision journal." });
      await load();
    } catch (error) {
      toast({ title: ar ? "تعذر حفظ التقدير" : "Could not register estimate", description: (error as Error).message, variant: "destructive" });
    } finally { setRegistering(false); }
  };
  const summary = data?.calibration;
  const readiness = summary?.readiness === "review_candidate" ? (ar ? "مرشح للمراجعة" : "review candidate") : summary?.readiness === "early_signal" ? (ar ? "إشارة أولية" : "early signal") : summary?.readiness === "collecting" ? (ar ? "جمع بيانات" : "collecting data") : (ar ? "لا توجد نتائج" : "no observations");
  return <section className="mt-4 rounded-md border border-signal/25 bg-background/30 p-3" aria-label={ar ? "معايرة جهد التغيير" : "Change effort calibration"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-signal" /><p className="text-xs font-semibold">{ar ? "معايرة التقدير بالعمل الفعلي" : "Calibrate against observed work"}</p></div><p className="mt-1 text-[10px] text-muted-foreground">{ar ? "احفظ التقدير الآن، وسجّل ساعات التنفيذ بعد اكتمال التغيير." : "Register today's estimate, then record engineering hours after the change is complete."}</p></div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={registering || loading} onClick={register}>{registering ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}{ar ? "حفظ التقدير" : "Register estimate"}</Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" disabled={loading} onClick={() => void load()} aria-label={ar ? "تحديث" : "Refresh"}>{loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}</Button>
      </div>
    </div>
    {summary && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div className="rounded border border-border/60 p-2"><p className="text-[9px] text-muted-foreground">{ar ? "عينات مكتملة" : "PAIRED SAMPLES"}</p><strong className="text-lg tabular-nums">{summary.sampleCount}</strong><Badge variant="outline" className="ml-2 text-[9px]">{readiness}</Badge></div>
      <div className="rounded border border-border/60 p-2"><p className="text-[9px] text-muted-foreground">MAE · {ar ? "ساعات" : "hours"}</p><strong className="text-lg tabular-nums">{summary.maeHours === null ? "—" : summary.maeHours.toFixed(2)}</strong></div>
      <div className="rounded border border-border/60 p-2"><p className="text-[9px] text-muted-foreground">RMSE · {ar ? "ساعات" : "hours"}</p><strong className="text-lg tabular-nums">{summary.rmseHours === null ? "—" : summary.rmseHours.toFixed(2)}</strong></div>
      <div className="rounded border border-border/60 p-2"><p className="text-[9px] text-muted-foreground">{ar ? "ارتباط الرتب" : "RANK CORRELATION"}</p><strong className="text-lg tabular-nums">{summary.rankCorrelation === null ? "—" : summary.rankCorrelation.toFixed(2)}</strong></div>
    </div>}
    {summary?.fit && <p className="mt-2 text-[10px] text-muted-foreground">{ar ? "الملاءمة الوصفية" : "Descriptive fit"}: actual hours ≈ {summary.fit.intercept.toFixed(2)} + ({summary.fit.hoursPerEffortPoint.toFixed(2)} × effort points). {ar ? "ليست توقعًا معتمدًا." : "Not a validated forecast."}</p>}
    {data?.records.length ? <div className="mt-3 space-y-2">{data.records.slice().reverse().slice(0, 12).map((record) => <OutcomeEditor key={record.id} record={record} onSaved={load} />)}</div> : <p className="mt-3 text-[10px] text-muted-foreground">{ar ? "لا توجد تقديرات محفوظة بعد. احفظ تقديرًا قبل بدء العمل، ثم سجّل الساعات الفعلية بعد انتهائه." : "No registered estimates yet. Save an estimate before work starts and record actual hours when it is complete."}</p>}
    {data?.truncated && <p className="mt-2 text-[10px] text-muted-foreground">{ar ? "السجل معروض جزئيًا؛ توجد سجلات أقدم." : "History is capped at the latest 2,000 journal entries."}</p>}
    <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{ar ? "المقاييس وصفية ومحسوبة على العينات المسجلة نفسها؛ لا تستخدمها كتوقعات تشغيلية قبل جمع عينة ممثلة واختبار منفصل." : summary?.caveat ?? "Metrics are descriptive and in-sample; do not use them as operational forecasts before representative data and held-out validation."}</p>
  </section>;
}
