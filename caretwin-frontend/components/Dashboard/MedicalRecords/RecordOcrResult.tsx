"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, RefreshCw, X } from "lucide-react";
import { btnGhost } from "@/components/ui/Field";
import { useCareData } from "@/lib/CareDataProvider";
import type { MedicalRecord } from "@/lib/types";
import { parseLabs } from "@/lib/labParser";
import {
  getPredictionSchema,
  getRecordOcr,
  predictMortality,
  type ApiOcrResult,
  type ApiPredictionSchema,
  type ApiMortalityResult,
} from "@/lib/api";
import {
  ageOnDate,
  extractMortalityLabValues,
  extractMortalityReportMetadata,
} from "@/lib/mortalityReport";
import type { RiskTrendRun } from "@/components/Dashboard/RiskTrendChart";

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_DURATION_MS = 3 * 60 * 1_000;

const statusLabels: Record<ApiOcrResult["status"], string> = {
  queued: "Text extraction queued",
  processing: "Extracting text",
  succeeded: "Text extraction complete",
  failed: "Text extraction failed",
};

export default function RecordOcrResult({
  recordId,
  onRecordUpdated,
  onRiskEstimate,
}: {
  recordId: string;
  onRecordUpdated?: (record: MedicalRecord) => void;
  onRiskEstimate?: (run: RiskTrendRun) => void;
}) {
  const { records, members, user, updateRecord } = useCareData();
  const record = records.find((item) => item.id === recordId);
  const patient = record ? members.find((item) => item.id === record.memberId) : undefined;
  const dateOfBirth = patient?.dob || user?.dateOfBirth?.slice(0, 10) || "";
  const patientGender = patient?.gender || user?.gender || "";
  const [result, setResult] = useState<ApiOcrResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const labValues = useMemo(
    () =>
      result?.status === "succeeded" && result.text
        ? parseLabs(result.text).filter((candidate) => candidate.value)
        : null,
    [result],
  );
  const [correctedLabValues, setCorrectedLabValues] = useState<Record<number, string>>({});
  const [editingLabIndex, setEditingLabIndex] = useState<number | null>(null);
  const [labValueDraft, setLabValueDraft] = useState("");
  const [labEditError, setLabEditError] = useState<string | null>(null);
  const reportMetadata = useMemo(
    () =>
      result?.status === "succeeded" && result.text
        ? extractMortalityReportMetadata(result.text)
        : null,
    [result],
  );
  const [replacingField, setReplacingField] = useState<string | null>(null);
  const [replaceMessage, setReplaceMessage] = useState<string | null>(null);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [riskResult, setRiskResult] = useState<ApiMortalityResult | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskDateChoice, setRiskDateChoice] = useState<string | null>(null);

  useEffect(() => {
    if (result?.status !== "succeeded" || !result.text) {
      return;
    }

    let cancelled = false;
    const metadata = extractMortalityReportMetadata(result.text);

    getPredictionSchema()
      .then(async (schema: ApiPredictionSchema) => {
        if (cancelled) return;
        setRiskLoading(true);

        const extractedDate = metadata.date?.value ?? null;
        const dashboardDate = record?.date ?? null;
        const dateDiffers = Boolean(extractedDate && dashboardDate && extractedDate !== dashboardDate);
        const riskDate = dateDiffers
          ? riskDateChoice
          : extractedDate ?? dashboardDate;
        if (dateDiffers && !riskDate) {
          setRiskError("The report date differs from the dashboard date. Choose which date to use for this estimate.");
          return;
        }
        if (!riskDate) {
          setRiskError("Set a report date in the dashboard before estimating risk.");
          return;
        }
        const age = ageOnDate(dateOfBirth, riskDate);
        if (age === null) {
          setRiskError("Add a valid date of birth to this patient's profile to calculate age.");
          return;
        }

        const labs = Object.fromEntries(
          Object.entries(extractMortalityLabValues(result.text ?? "", schema)).map(([lab, candidate]) => [
            lab,
            [Number(candidate.value)],
          ]),
        );
        const prediction = await predictMortality({
          age,
          admissionDate: riskDate,
          ...((patientGender === "female" || patientGender === "male") && {
            gender: patientGender === "female" ? "F" : "M",
          }),
          labs,
        });
        if (!cancelled) {
          setRiskResult(prediction.result);
          onRiskEstimate?.({
            id: `report-${recordId}`,
            createdAt: record?.createdAt ?? new Date().toISOString(),
            admissionTime: riskDate,
            probability: prediction.result.probability,
            threshold: prediction.result.threshold,
            flagged: prediction.result.flagged,
            labsSupplied: Object.keys(labs).length,
            labs: Object.fromEntries(
              Object.entries(labs).map(([name, values]) => [name, [...values]]),
            ),
          });
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : "Prediction failed.";
          setRiskError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setRiskLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [result, dateOfBirth, patientGender, recordId, record?.createdAt, record?.date, riskDateChoice, onRiskEstimate]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + MAX_POLL_DURATION_MS;

    const poll = async () => {
      try {
        const next = await getRecordOcr(recordId);
        if (cancelled) return;
        setResult(next);
        setError(null);

        if (next.status === "succeeded" || next.status === "failed") return;
        if (Date.now() >= deadline) {
          setTimedOut(true);
          return;
        }
        timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "Text extraction status could not be loaded.");
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [recordId, retryKey]);

  const retryCheck = () => {
    setResult(null);
    setError(null);
    setTimedOut(false);
    setCorrectedLabValues({});
    setEditingLabIndex(null);
    setLabValueDraft("");
    setLabEditError(null);
    setReplaceMessage(null);
    setReplaceError(null);
    setRiskResult(null);
    setRiskError(null);
    setRiskDateChoice(null);
    setRetryKey((key) => key + 1);
  };

  const beginLabEdit = (index: number, value: string) => {
    setEditingLabIndex(index);
    setLabValueDraft(correctedLabValues[index] ?? value);
    setLabEditError(null);
  };

  const saveLabEdit = (index: number) => {
    const value = labValueDraft.trim();
    if (
      !/^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(value) ||
      !Number.isFinite(Number(value.replace(",", ".")))
    ) {
      setLabEditError("Enter a valid numeric value.");
      return;
    }
    setCorrectedLabValues((current) => ({ ...current, [index]: value.replace(",", ".") }));
    setEditingLabIndex(null);
    setLabEditError(null);
  };

  const chooseRiskDate = async (date: string, replaceDashboardDate: boolean) => {
    if (replaceDashboardDate && !(await replaceMetadata("date", date))) {
      setRiskError("The dashboard date could not be replaced. You can keep the current date or try again.");
      return;
    }
    setRiskDateChoice(date);
    setRiskError(null);
  };

  const replaceMetadata = async (
    field: "date" | "doctor" | "hospital",
    value: string,
  ): Promise<boolean> => {
    if (!record) return false;
    setReplacingField(field);
    setReplaceMessage(null);
    setReplaceError(null);
    try {
      const updated = await updateRecord(recordId, field === "date"
        ? {
            recordDate: value,
            timeZoneOffsetMinutes: new Date().getTimezoneOffset(),
          }
        : field === "doctor"
          ? { doctorName: value }
          : { hospitalName: value });
      onRecordUpdated?.(updated);
      setReplaceMessage(
        field === "date"
          ? "Report date replaced."
          : field === "doctor"
            ? "Doctor name replaced."
            : "Hospital name replaced.",
      );
      return true;
    } catch (cause) {
      setReplaceError(cause instanceof Error ? cause.message : "The record could not be updated.");
      return false;
    } finally {
      setReplacingField(null);
    }
  };

  const dateIsDifferent =
    reportMetadata?.date &&
    record?.date !== reportMetadata.date.value;
  const doctorIsDifferent =
    reportMetadata?.doctor &&
    reportMetadata.doctor.value.toLocaleLowerCase() !== (record?.doctor ?? "").trim().toLocaleLowerCase();
  const hospitalIsDifferent =
    reportMetadata?.hospital &&
    reportMetadata.hospital.value.toLocaleLowerCase() !== (record?.hospital ?? "").trim().toLocaleLowerCase();

  return (
    <section className="mt-3 rounded-lg border border-line bg-[#fafbff] p-3" aria-live="polite">
      {error ? (
        <div>
          <p className="text-xs text-danger">Text extraction status unavailable: {error}</p>
          <button type="button" onClick={retryCheck} className={`${btnGhost} mt-2`}>
            <RefreshCw size={14} /> Check again
          </button>
        </div>
      ) : !result ? (
        <p className="text-xs text-mute">Checking text extraction status…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink">{statusLabels[result.status]}</p>
            {result.status === "failed" && (
              <p className="text-xs text-mute">
                {result.error ? `Code: ${result.error}. ` : ""}
                Re-upload the attachment from Medical Records to try OCR again.
              </p>
            )}
            {timedOut && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-mute">Still processing. Check again later.</p>
                <button type="button" onClick={retryCheck} className={`${btnGhost} py-1.5`}>
                  <RefreshCw size={13} /> Check
                </button>
              </div>
            )}
          </div>
          {result.status === "succeeded" && (
            <>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-mute">
                {result.quality && <span>OCR quality: {result.quality}</span>}
                {result.needsReview && <span className="font-semibold text-[#9a6700]">Review suggested</span>}
                {result.flags && result.flags.length > 0 && <span>Flags: {result.flags.join(", ")}</span>}
              </div>
              {labValues && labValues.length > 0 ? (
                <div className="mt-3 rounded-md border border-[#f3dcb1] bg-[#fff8eb] p-3">
                  <p className="text-xs font-semibold text-ink">Recognized lab values — verify against the uploaded report</p>
                  <p className="mt-1 text-[11px] leading-4 text-mute">
                    Every recognized result is shown here, including repeated measurements. OCR may misread values.
                  </p>
                  <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 text-xs">
                    {labValues.map((candidate, index) => (
                      <div key={`${candidate.test}-${index}`} className="col-span-3 grid grid-cols-subgrid items-center">
                        <dt className="truncate text-body">{candidate.test}</dt>
                        <dd className="font-semibold text-ink">
                          {editingLabIndex === index ? (
                            <label className="flex items-center gap-1.5">
                              <span className="sr-only">Corrected {candidate.test} value</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                value={labValueDraft}
                                onChange={(event) => {
                                  setLabValueDraft(event.target.value);
                                  setLabEditError(null);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    event.preventDefault();
                                    saveLabEdit(index);
                                  }
                                  if (event.key === "Escape") {
                                    setEditingLabIndex(null);
                                    setLabEditError(null);
                                  }
                                }}
                                className="h-8 w-24 rounded-md border border-line bg-white px-2 text-xs font-semibold text-ink"
                                autoFocus
                              />
                              {candidate.unit}
                            </label>
                          ) : (
                            <>{correctedLabValues[index] ?? candidate.value}{candidate.unit ? ` ${candidate.unit}` : ""}</>
                          )}
                        </dd>
                        <dd>
                          {editingLabIndex === index ? (
                            <span className="flex items-center gap-1">
                              <button
                                type="button"
                                aria-label={`Save corrected ${candidate.test} value`}
                                onClick={() => saveLabEdit(index)}
                                className="rounded p-1 text-brand hover:bg-brand-soft"
                              >
                                <Check size={15} />
                              </button>
                              <button
                                type="button"
                                aria-label={`Cancel editing ${candidate.test} value`}
                                onClick={() => {
                                  setEditingLabIndex(null);
                                  setLabEditError(null);
                                }}
                                className="rounded p-1 text-mute hover:bg-[#f0f2f6]"
                              >
                                <X size={15} />
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Edit ${candidate.test} value`}
                              onClick={() => beginLabEdit(index, correctedLabValues[index] ?? candidate.value)}
                              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-semibold text-brand hover:bg-brand-soft"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {labEditError && <p role="alert" className="mt-2 text-xs text-danger">{labEditError}</p>}
                </div>
              ) : labValues ? (
                <p className="mt-3 text-xs text-mute">No supported lab values were recognized in this report.</p>
              ) : (
                <p role="status" className="mt-3 text-xs text-mute">Checking for possible lab values…</p>
              )}
              {result.text && (
                <details className="mt-3 rounded-md border border-[#dfe3ea] bg-white p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-ink">
                    View all extracted text
                  </summary>
                  <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-body">
                    {result.text}
                  </pre>
                </details>
              )}
              {reportMetadata && (
                <div className="mt-3 rounded-md border border-[#dfe3ea] bg-white p-3">
                  <p className="text-xs font-semibold text-ink">Possible record details detected in report</p>
                  <div className="mt-2 space-y-2">
                    {reportMetadata.date && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-body">
                          Report date: <strong>{reportMetadata.date.value}</strong>
                          {reportMetadata.date.ambiguousNumericFormat &&
                            ` (read “${reportMetadata.date.sourceValue}”; interpreted as MM/DD/YYYY)`}
                        </span>
                        {dateIsDifferent && record && (
                          <button
                            type="button"
                            className={`${btnGhost} py-1.5`}
                            disabled={replacingField !== null}
                            onClick={() => void replaceMetadata("date", reportMetadata.date!.value)}
                          >
                            {replacingField === "date" ? "Replacing…" : "Replace this"}
                          </button>
                        )}
                      </div>
                    )}
                    {reportMetadata.doctor && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-body">Doctor: <strong>{reportMetadata.doctor.value}</strong></span>
                        {doctorIsDifferent && record && (
                          <button
                            type="button"
                            className={`${btnGhost} py-1.5`}
                            disabled={replacingField !== null}
                            onClick={() => void replaceMetadata("doctor", reportMetadata.doctor!.value)}
                          >
                            {replacingField === "doctor" ? "Replacing…" : "Replace this"}
                          </button>
                        )}
                      </div>
                    )}
                    {reportMetadata.hospital && (
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-body">Hospital or facility: <strong>{reportMetadata.hospital.value}</strong></span>
                        {hospitalIsDifferent && record && (
                          <button
                            type="button"
                            className={`${btnGhost} py-1.5`}
                            disabled={replacingField !== null}
                            onClick={() => void replaceMetadata("hospital", reportMetadata.hospital!.value)}
                          >
                            {replacingField === "hospital" ? "Replacing…" : "Replace this"}
                          </button>
                        )}
                      </div>
                    )}
                    {replaceMessage && <p role="status" className="text-xs text-brand">{replaceMessage}</p>}
                    {replaceError && <p role="alert" className="text-xs text-danger">{replaceError}</p>}
                  </div>
                </div>
              )}
              {reportMetadata &&
                !reportMetadata.date &&
                !reportMetadata.doctor &&
                !reportMetadata.hospital && (
                  <p className="mt-2 text-xs text-mute">No report date, doctor, or hospital name was recognized.</p>
              )}
              <div className="mt-4 rounded-lg border border-line bg-white p-3">
                <p className="text-xs font-semibold text-ink">Mortality risk research demo</p>
                {result.status !== "succeeded" ? (
                  <p className="mt-2 text-xs text-mute">
                    {result.status === "failed"
                      ? "An estimate is unavailable because text extraction failed."
                      : "An estimate will appear when text extraction completes."}
                  </p>
                ) : riskLoading ? (
                  <p role="status" className="mt-2 text-xs text-mute">Preparing estimate from this report…</p>
                ) : riskError ? (
                  <div className="mt-2 space-y-2">
                    <p role="status" className="text-xs text-mute">{riskError}</p>
                    {reportMetadata?.date &&
                      record?.date &&
                      reportMetadata.date.value !== record.date && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={`${btnGhost} py-1.5`}
                            disabled={replacingField !== null}
                            onClick={() => void chooseRiskDate(reportMetadata.date!.value, true)}
                          >
                            Replace dashboard date with {reportMetadata.date.value}
                          </button>
                          <button
                            type="button"
                            className={`${btnGhost} py-1.5`}
                            onClick={() => void chooseRiskDate(record.date, false)}
                          >
                            Keep dashboard date ({record.date})
                          </button>
                        </div>
                      )}
                  </div>
                ) : riskResult ? (
                  <div className="mt-2 space-y-2">
                    <div className={`rounded-md p-3 ${riskResult.flagged ? "bg-danger-soft text-danger" : "bg-[#f0fbf5] text-[#15965d]"}`}>
                      <p className="text-xs font-semibold uppercase tracking-wide">
                        {riskResult.riskLevel === "elevated" ? "Elevated risk" : "Lower risk"}
                      </p>
                      <p className="mt-0.5 text-2xl font-bold">{(riskResult.probability * 100).toFixed(1)}%</p>
                      <p className="mt-1 text-[11px] leading-4">
                        Estimated chance within {riskResult.predictionWindowHours} hours. This is a research estimate, not a diagnosis.
                      </p>
                    </div>
                    {riskResult.warnings.map((warning) => (
                      <p key={warning} className="text-[11px] leading-4 text-[#7a5a1f]">{warning}</p>
                    ))}
                    <p className="text-[11px] leading-4 text-mute">{riskResult.disclaimer}</p>
                  </div>
                ) : (
                  <p role="status" className="mt-2 text-xs text-mute">Preparing estimate from this report…</p>
                )}
                <p className="mt-2 text-[11px] leading-4 text-mute">
                  Uses the dashboard date if the report has no date, and asks you to resolve any date mismatch. Confirm extracted values before relying on this Model.
                </p>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-brand">View extracted text</summary>
                <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-white p-3 font-sans text-xs leading-5 text-body">
                  {result.text || "No text was returned."}
                </pre>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
