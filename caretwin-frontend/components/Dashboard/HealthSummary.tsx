"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Dna, HeartPulse, RefreshCw } from "lucide-react";
import RecordDetailModal from "@/components/Dashboard/MedicalRecords/RecordDetailModal";
import { btnGhost } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useCareData } from "@/lib/CareDataProvider";
import { downloadRecordFile, getRecordOcr } from "@/lib/api";
import { downloadBlob, slug } from "@/lib/download";
import { normalizeLabValue, parseLabs, type LabCandidate, type LabTest } from "@/lib/labParser";
import type { MedicalRecord } from "@/lib/types";

type ReviewCandidate = {
  key: string;
  record: MedicalRecord;
  candidate: LabCandidate;
};

type ValueCandidate = {
  record?: MedicalRecord;
  candidate: LabCandidate;
  source: "report" | "edited";
  lowConfidence?: boolean;
};

const TEST_GROUPS = [
  { id: "kidney", label: "Kidney function", tests: ["Creatinine", "Urea Nitrogen"] as LabTest[] },
  { id: "electrolytes", label: "Electrolytes", tests: ["Sodium", "Potassium", "Calcium"] as LabTest[] },
  { id: "blood-count", label: "Blood count", tests: ["Hemoglobin"] as LabTest[] },
  { id: "blood-sugar", label: "Blood sugar", tests: ["Glucose"] as LabTest[] },
];

const DISPLAY_UNITS: Record<LabTest, string> = {
  Hemoglobin: "g/dL",
  Creatinine: "mg/dL",
  Potassium: "mEq/L",
  "Urea Nitrogen": "mg/dL",
  Sodium: "mEq/L",
  Glucose: "mg/dL",
  Calcium: "mg/dL",
  "RBC Count": "million/µL",
  "WBC Count": "cells/µL",
  "Platelet Count": "cells/µL",
  Hematocrit: "%",
  Albumin: "g/dL",
};

function candidateKey(recordId: string, test: LabTest) {
  return `${recordId}:${test}`;
}

function formatNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return Number(value.toFixed(2)).toString();
}

function withCandidateValue(candidate: LabCandidate, value: string): LabCandidate {
  if (
    candidate.possibleConversion &&
    Number(value.replace(",", ".")) === Number(candidate.possibleConversion.value)
  ) {
    return {
      ...candidate,
      normalizedValue: Number(candidate.possibleConversion.value),
      normalizedUnit: candidate.possibleConversion.targetUnit,
      converted: true,
      reliable: true,
    };
  }
  const normalized = normalizeLabValue(
    candidate.test,
    value,
    candidate.unit,
    candidate.bloodUrea,
  );
  const range = candidate.referenceRange?.match(/(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)/);
  const numeric = Number(value.replace(",", "."));
  const withinReferenceRange =
    range && Number.isFinite(numeric)
      ? numeric >= Number(range[1]) && numeric <= Number(range[2])
      : undefined;

  return {
    ...candidate,
    value,
    normalizedValue: normalized.value,
    normalizedUnit: normalized.unit,
    converted: normalized.converted,
    reliable: normalized.reliable,
    withinReferenceRange,
  };
}

function reportedDate(record?: MedicalRecord) {
  return record?.date?.slice(0, 10) || record?.createdAt?.slice(0, 10) || "";
}

function labValueId(test: LabTest) {
  return `digital-twin-value-${test.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function ProfileValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[#f8f9fc] p-3">
      <p className="text-[11px] font-semibold text-mute">{label}</p>
      {value ? (
        <p className="mt-1 break-words text-sm font-semibold text-ink">{value}</p>
      ) : (
        <Link href="/dashboard/profile" className="mt-1 inline-block text-sm font-semibold text-brand underline">Not added</Link>
      )}
    </div>
  );
}

export default function HealthSummary() {
  const {
    activeId,
    members,
    records,
    recordsState,
    refreshRecords,
  } = useCareData();
  const router = useRouter();
  const toast = useToast();
  const member = members.find((item) => item.id === activeId);
  const [reviewCandidates, setReviewCandidates] = useState<ReviewCandidate[]>([]);
  const [valueEdits, setValueEdits] = useState<Record<string, ValueCandidate>>({});
  const [editingTest, setEditingTest] = useState<LabTest | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [loadingOcr, setLoadingOcr] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState(TEST_GROUPS[0].id);
  const [openedRecord, setOpenedRecord] = useState<MedicalRecord | null>(null);

  const memberRecords = useMemo(
    () =>
      records
        .filter((record) => record.memberId === activeId && record.hasFile)
        .sort((a, b) => {
          const dateOrder = reportedDate(b).localeCompare(reportedDate(a));
          if (dateOrder !== 0) return dateOrder;
          return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
        }),
    [records, activeId],
  );

  useEffect(() => {
    let cancelled = false;
    if (recordsState.status !== "ready") return;
    const load = async () => {
      await Promise.resolve();
      if (cancelled) return;
      setLoadingOcr(true);
      setOcrError(null);
      setReviewCandidates([]);
      setValueEdits({});
      setEditingTest(null);
      setEditError(null);
      const found: ReviewCandidate[] = [];
      let failedRequests = 0;
      let completedReports = 0;
      for (let start = 0; start < memberRecords.length && completedReports < 10; start += 3) {
        const batch = memberRecords.slice(start, start + 3);
        const results = await Promise.all(
          batch.map(async (record) => {
            try {
              const ocr = await getRecordOcr(record.id);
              if (ocr.status !== "succeeded") {
                return { completed: false, candidates: [] as ReviewCandidate[] };
              }
              if (!ocr.text) return { completed: true, candidates: [] as ReviewCandidate[] };
              const parsed = parseLabs(ocr.text);
              return {
                completed: true,
                candidates: parsed.map((candidate, index) => ({
                  key: `${candidateKey(record.id, candidate.test)}:${index}`,
                  record,
                  candidate,
                })),
              };
            } catch {
              failedRequests += 1;
              return { completed: false, candidates: [] as ReviewCandidate[] };
            }
          }),
        );
        for (const result of results) {
          if (!result.completed || completedReports >= 10) continue;
          completedReports += 1;
          found.push(...result.candidates);
        }
      }
      if (cancelled) return;
      setReviewCandidates(found);
      if (failedRequests) {
        setOcrError(`OCR could not be checked for ${failedRequests} of the selected reports. Try again to reload extracted values.`);
      }
      setLoadingOcr(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [memberRecords, recordsState.status, retryToken, activeId]);

  const latestByTest = useMemo(() => {
    const latest = new Map<LabTest, ValueCandidate>();
    for (const item of reviewCandidates) {
      if (!item.candidate.reliable) continue;
      const current = latest.get(item.candidate.test);
      const dateOrder = reportedDate(item.record).localeCompare(
        current ? reportedDate(current.record) : "",
      );
      const uploadOrder = (item.record.createdAt ?? "").localeCompare(
        current?.record?.createdAt ?? "",
      );
      if (
        !current ||
        dateOrder > 0 ||
        (dateOrder === 0 && uploadOrder > 0) ||
        (dateOrder === 0 && uploadOrder === 0 && current.record?.id === item.record.id)
      ) {
        latest.set(item.candidate.test, {
          record: item.record,
          candidate: item.candidate,
          source: "report",
        });
      }
    }
    for (const [key, item] of Object.entries(valueEdits)) {
      if (key.startsWith(`${activeId}:`)) {
        latest.set(item.candidate.test, item);
      }
    }
    return latest;
  }, [reviewCandidates, valueEdits, activeId]);
  const visibleGroup = TEST_GROUPS.find((group) => group.id === selectedGroup) ?? TEST_GROUPS[0];
  const height = Number(member?.heightCm);
  const weight = Number(member?.weightKg);
  const bmi = height > 0 && weight > 0 ? (weight / ((height / 100) ** 2)).toFixed(1) : "";

  const startEditing = (test: LabTest) => {
    const item = latestByTest.get(test);
    setEditingTest(test);
    setEditValue(item?.candidate.value ?? "");
    setEditUnit(item?.candidate.unit ?? DISPLAY_UNITS[test]);
    setEditError(null);
  };

  const saveEditedValue = (test: LabTest) => {
    const existing = latestByTest.get(test);
    const candidate: LabCandidate = existing
      ? { ...existing.candidate, unit: editUnit, unitReported: true, bloodUrea: false }
      : {
          test,
          value: editValue,
          unit: editUnit,
          unitReported: true,
          rawLine: "Manually entered for this visit",
          normalizedValue: null,
          normalizedUnit: DISPLAY_UNITS[test],
          converted: false,
          reliable: false,
          bloodUrea: false,
        };
    const edited = withCandidateValue(candidate, editValue);
    if (!edited.reliable) {
      setEditError("Enter a numeric value within the plausible range for this test.");
      return;
    }
    setValueEdits((current) => ({
      ...current,
      [`${activeId}:${test}`]: {
        ...(existing?.record && { record: existing.record }),
        candidate: edited,
        source: "edited",
      },
    }));
    setEditingTest(null);
    setEditError(null);
  };

  const clearEditedValue = (test: LabTest) => {
    setValueEdits((current) => {
      const next = { ...current };
      delete next[`${activeId}:${test}`];
      return next;
    });
  };

  const openRecord = (record: MedicalRecord) => setOpenedRecord(record);
  const selectGroup = (group: (typeof TEST_GROUPS)[number]) => {
    setSelectedGroup(group.id);
    document.getElementById(labValueId(group.tests[0]))?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };
  const download = async (record: MedicalRecord) => {
    if (!record.hasFile) return;
    try {
      const { blob, contentDisposition } = await downloadRecordFile(record.id);
      const encoded = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const plain = contentDisposition?.match(/filename="([^"]+)"/i)?.[1];
      const name = encoded ? decodeURIComponent(encoded) : plain ?? record.fileName ?? `${slug(record.title)}-attachment`;
      downloadBlob(name, blob);
      toast("Attachment downloaded");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "The attachment could not be downloaded.", "error");
    }
  };

  if (recordsState.status === "error") {
    return (
      <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="digital-twin-title">
        <h2 id="digital-twin-title" className="text-[15px] font-bold text-ink">Digital twin</h2>
        <p role="alert" className="mt-3 text-sm text-danger">Uploaded reports could not be loaded.</p>
        <button type="button" className={`${btnGhost} mt-3`} onClick={() => void refreshRecords()}>Try again</button>
      </section>
    );
  }

  return (
    <section className="min-w-0 space-y-5 rounded-xl border border-line bg-white p-5 sm:p-6" aria-labelledby="digital-twin-title">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Dna size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 id="digital-twin-title" className="text-[15px] font-bold text-ink">Digital twin</h2>
          <p className="mt-1 text-[13px] text-mute">
            Latest available lab values from {member?.name || "your"} reports.
          </p>
          <p className="mt-1 text-xs text-mute">Values are selected from your latest report.</p>
        </div>
      </header>

      <section aria-label="Digital twin body view" className="grid gap-4 lg:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)]">
        <div className="mx-auto w-full max-w-[280px]">
          <div className="relative mx-auto aspect-[506/960] w-full overflow-hidden rounded-xl border border-line bg-[#07172b]">
            <Image
              src="/digital-twin-anatomy.jpg"
              alt=""
              aria-hidden="true"
              fill
              sizes="280px"
              className="object-cover"
            />
            {TEST_GROUPS.map((group) => {
              const pin = {
                "blood-count": { left: "51%", top: "44%" },
                "blood-sugar": { left: "52%", top: "61%" },
                kidney: { left: "43%", top: "70%" },
                electrolytes: { left: "52%", top: "20%" },
              }[group.id];
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => selectGroup(group)}
                  aria-pressed={selectedGroup === group.id}
                  aria-label={`Show ${group.label} values`}
                  className={`absolute flex max-w-[132px] -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold leading-tight shadow-sm focus-visible:outline-none ${
                    selectedGroup === group.id ? "z-10 border-[#8ef5ff] bg-[#0878b8] text-white" : "border-[#9ad9e5] bg-[#07172b]/90 text-white"
                  }`}
                  style={pin}
                >
                  <HeartPulse size={11} className="shrink-0" aria-hidden="true" />
                  <span>{group.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[11px] text-mute">Pin positions are illustrative, not a diagnosis.</p>
        </div>

        <div aria-live="polite" className="min-w-0">
          <h3 className="text-sm font-bold text-ink">Lab values</h3>
          <p className="mt-1 text-xs text-mute">Selected pin: {visibleGroup.label}</p>
          <div className="mt-2 space-y-3">
            {TEST_GROUPS.map((group) => (
              <section key={group.id} className={`rounded-lg border p-3 ${selectedGroup === group.id ? "border-brand bg-brand-soft/40" : "border-line"}`}>
                <h4 className="text-xs font-bold text-ink">{group.label}</h4>
                <dl className="mt-2 divide-y divide-line">
                  {group.tests.map((test) => {
                    const item = latestByTest.get(test);
                    return (
                      <div key={test} id={labValueId(test)} tabIndex={-1} className="scroll-m-6 py-2 focus:outline-none">
                        <dt className="text-xs font-semibold text-mute">{test}</dt>
                        {item ? (
                          <>
                            <dd className="mt-1">
                              <button
                                type="button"
                                onClick={() => startEditing(test)}
                                className="rounded text-left text-lg font-bold text-ink underline decoration-dotted underline-offset-4 hover:text-brand focus-visible:outline-none"
                                aria-label={`Edit ${test} value`}
                              >
                                {formatNumber(item.candidate.normalizedValue)} {item.candidate.normalizedUnit || DISPLAY_UNITS[test]}
                              </button>
                            </dd>
                            {item.source === "edited" && <p className="mt-1 text-xs text-mute">Edited for this visit</p>}
                            {item.candidate.converted && (
                              <p className="mt-1 text-xs text-body">
                                {item.candidate.possibleConversion
                                  ? `OCR did not capture a unit; ${item.candidate.value} was interpreted as ${item.candidate.possibleConversion.sourceUnit} and converted to ${formatNumber(item.candidate.normalizedValue)} ${item.candidate.normalizedUnit}. Check the source report.`
                                  : `Reported: ${item.candidate.value} ${item.candidate.unit}; converted to ${item.candidate.normalizedUnit}.`}
                              </p>
                            )}
                            {!item.candidate.unitReported && !item.candidate.converted && (
                              <p className="mt-1 text-xs text-mute">The report did not specify a unit; the standard unit is shown.</p>
                            )}
                            {item.candidate.referenceRange && item.candidate.withinReferenceRange !== undefined && (
                              <p className="mt-1 text-xs text-body">
                                {item.candidate.withinReferenceRange ? "Within" : "Outside"} the range printed on the report ({item.candidate.referenceRange} {item.candidate.unit}).
                              </p>
                            )}
                            {item.record ? (
                              <>
                                <dd className="mt-1 text-xs text-mute">
                                  {reportedDate(item.record)} · {item.record.title}
                                </dd>
                                <button type="button" onClick={() => openRecord(item.record!)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
                                  Open this report <ArrowUpRight size={12} aria-hidden="true" />
                                </button>
                              </>
                            ) : (
                              <p className="mt-1 text-xs text-mute">Manually entered · no source report</p>
                            )}
                            {editingTest === test && (
                              <div className="mt-3 flex flex-wrap items-end gap-2">
                                <label className="min-w-24 flex-1 text-xs font-semibold text-body">
                                  Value
                                  <input
                                    autoFocus
                                    inputMode="decimal"
                                    value={editValue}
                                    onChange={(event) => setEditValue(event.target.value)}
                                    className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                                  />
                                </label>
                                <label className="w-28 text-xs font-semibold text-body">
                                  Unit
                                  <input
                                    value={editUnit}
                                    onChange={(event) => setEditUnit(event.target.value)}
                                    className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                                  />
                                </label>
                                <button type="button" onClick={() => saveEditedValue(test)} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dark">Save</button>
                                {item.source === "edited" && <button type="button" onClick={() => clearEditedValue(test)} className={`${btnGhost} px-3 py-2 text-xs`}>Use report value</button>}
                                <button type="button" onClick={() => { setEditingTest(null); setEditError(null); }} className={`${btnGhost} px-3 py-2 text-xs`}>Cancel</button>
                                {editError && <p role="alert" className="w-full text-xs text-danger">{editError}</p>}
                              </div>
                            )}
                          </>
                        ) : (
                          <dd className="mt-1 text-sm text-mute">
                            <button
                              type="button"
                              onClick={() => startEditing(test)}
                              className="rounded font-semibold text-brand underline focus-visible:outline-none"
                              aria-label={`Add ${test} value`}
                            >
                              NotFound
                            </button>
                            {editingTest === test && (
                              <span className="mt-3 flex flex-wrap items-end gap-2">
                                <label className="min-w-24 flex-1 text-xs font-semibold text-body">
                                  Value
                                  <input
                                    autoFocus
                                    inputMode="decimal"
                                    value={editValue}
                                    onChange={(event) => setEditValue(event.target.value)}
                                    className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                                  />
                                </label>
                                <label className="w-28 text-xs font-semibold text-body">
                                  Unit
                                  <input
                                    value={editUnit}
                                    onChange={(event) => setEditUnit(event.target.value)}
                                    className="mt-1 h-9 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                                  />
                                </label>
                                <button type="button" onClick={() => saveEditedValue(test)} className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white hover:bg-brand-dark">Save</button>
                                <button type="button" onClick={() => { setEditingTest(null); setEditError(null); }} className={`${btnGhost} px-3 py-2 text-xs`}>Cancel</button>
                                {editError && <span role="alert" className="w-full text-xs text-danger">{editError}</span>}
                              </span>
                            )}
                            {memberRecords.length === 0 && (
                              <>
                                {" "}
                                <Link href="/dashboard/medical-records" className="font-semibold text-brand underline">
                                  Upload a report
                                </Link>
                              </>
                            )}
                          </dd>
                        )}
                      </div>
                    );
                  })}
                </dl>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-line pt-4" aria-labelledby="profile-strip-heading">
        <div className="flex items-center justify-between gap-3">
          <h3 id="profile-strip-heading" className="text-sm font-bold text-ink">Profile</h3>
          <Link href="/dashboard/profile" className="text-xs font-semibold text-brand underline">Update profile</Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ProfileValue label="Blood group" value={member?.bloodGroup ?? ""} />
          <ProfileValue label="Height" value={member?.heightCm ? `${member.heightCm} cm` : ""} />
          <ProfileValue label="Weight" value={member?.weightKg ? `${member.weightKg} kg` : ""} />
          <ProfileValue label="BMI" value={bmi} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["Allergies", "Conditions"] as const).map((label) => {
            const values = label === "Allergies" ? member?.allergies ?? [] : member?.conditions ?? [];
            return (
              <div key={label}>
                <p className="text-xs font-semibold text-mute">{label}</p>
                {values.length ? (
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {values.map((value) => <li key={value} className="rounded-full bg-brand-soft px-2.5 py-1 text-xs text-brand">{value}</li>)}
                  </ul>
                ) : (
                  <Link href="/dashboard/profile" className="mt-1 inline-block text-xs font-semibold text-brand underline">Not added</Link>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <p className="border-t border-line pt-3 text-xs text-mute">Wearable data is not connected.</p>

      <section className="border-t border-line pt-4" aria-labelledby="extraction-details-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="extraction-details-heading" className="text-sm font-bold text-ink">Extracted report details</h3>
            <p className="mt-1 text-xs text-mute">Values are shown automatically when readable. Select any value above to edit it.</p>
          </div>
          {ocrError && (
            <button type="button" onClick={() => setRetryToken((value) => value + 1)} className={`${btnGhost} py-1.5`}>
              <RefreshCw size={14} /> Retry OCR check
            </button>
          )}
        </div>
        <div
          className="mt-3 max-h-72 space-y-2 overflow-y-auto overscroll-contain pr-2"
          aria-label="Extracted report details"
          tabIndex={0}
        >
          {recordsState.status === "loading" || loadingOcr ? (
            <div className="space-y-2" aria-label="Loading extracted report values">
              <div className="ct-skeleton h-12 rounded-lg" />
              <div className="ct-skeleton h-12 rounded-lg" />
            </div>
          ) : ocrError ? (
            <p role="alert" className="text-sm text-danger">{ocrError}</p>
          ) : reviewCandidates.length ? (
            <ul className="space-y-2">
              {reviewCandidates.map((item) => (
                <li key={item.key} className="rounded-lg bg-[#f8f9fc] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{item.candidate.test}: {item.candidate.value} {item.candidate.unit}</span>
                  </div>
                  <p className="mt-1 text-xs text-mute">{item.record.title} · {reportedDate(item.record)}</p>
                  <p className="mt-1 break-words font-mono text-xs text-body">{item.candidate.rawLine}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-mute">{memberRecords.length ? "No supported lab values were extracted from completed reports." : "No uploaded reports with attachments were found for this family member."}</p>
          )}
        </div>
      </section>

      <p className="border-t border-line pt-3 text-xs leading-5 text-mute">Values come from your uploaded reports and may contain reading errors. Not medical advice.</p>

      <RecordDetailModal
        record={openedRecord}
        member={member}
        onClose={() => setOpenedRecord(null)}
        onDownload={(record) => void download(record)}
        onEdit={() => {
          setOpenedRecord(null);
          router.push("/dashboard/medical-records");
        }}
      />
    </section>
  );
}
