const MAX_TEXT_PER_REPORT = 2_000;
const MAX_CONTEXT_LENGTH = 12_000;

const REPORT_TERMS =
  /\b(report|reports|lab|labs|laboratory|test result|test results|blood test|bloodwork|ocr|uploaded document|uploaded file|my results|these results)\b/i;

function isReportRelated(text) {
  return REPORT_TERMS.test(text);
}

async function getRecentReportContext(prisma, userId) {
  const records = await prisma.medicalRecord.findMany({
    where: { userId, deletedAt: null, storageKey: { not: null } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      id: true,
      title: true,
      recordType: true,
      recordDate: true,
      createdAt: true,
      storageKey: true,
    },
  });
  if (!records.length) return "";

  const record = records[0];
  const jobs = await prisma.recordOcrJob.findMany({
    where: {
      status: "succeeded",
      recordId: record.id,
      storageKey: record.storageKey,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { recordId: true, storageKey: true, text: true, updatedAt: true },
  });
  const job = jobs.find(
    (candidate) =>
      candidate.recordId === record.id &&
      candidate.storageKey === record.storageKey &&
      candidate.text?.trim(),
  );
  if (!job) return "";

  const header = `Report: ${record.title} | Type: ${record.recordType} | Date: ${
    record.recordDate?.toISOString?.().slice(0, 10) ??
    record.recordDate ??
    record.createdAt.toISOString().slice(0, 10)
  }\nExtracted text:\n`;
  const contentLimit = Math.min(
    MAX_TEXT_PER_REPORT,
    MAX_CONTEXT_LENGTH - header.length,
  );
  if (contentLimit <= 0) return "";

  const extractedText = job.text.trim();
  const truncated = extractedText.length > contentLimit;
  return `${header}${extractedText.slice(0, contentLimit)}${
    truncated ? "\n[Report text truncated]" : ""
  }`;
}

module.exports = {
  isReportRelated,
  getRecentReportContext,
  MAX_TEXT_PER_REPORT,
  MAX_CONTEXT_LENGTH,
};
