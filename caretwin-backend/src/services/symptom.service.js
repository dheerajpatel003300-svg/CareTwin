const { evaluate } = require("./symptom.engine");
const { SYMPTOMS } = require("../data/symptomRules");

function ageFromDob(dob) {
  if (!dob) return undefined;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

async function runCheck(prisma, userId, input) {
  // Age comes from the stored profile, never from the request, so it can't be spoofed
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { dateOfBirth: true },
  });

  const result = evaluate({ ...input, age: ageFromDob(user?.dateOfBirth) });

  const saved = await prisma.symptomCheck.create({
    data: {
      userId,
      symptoms: input.symptoms,
      severity: input.severity,
      duration: `${input.durationDays} days`,
      result,
      recommendedSpecialty: result.recommendedSpecialty,
    },
    select: { id: true, createdAt: true },
  });

  if (result.urgency === "emergency" || result.urgency === "urgent") {
    await prisma.notification.create({
      data: {
        userId,
        title: result.urgency === "emergency" ? "Seek emergency care" : "Please see a doctor today",
        message: "Your recent symptom check suggests you should get medical help soon.",
        type: "symptom_alert",
      },
    });
  }

  return { id: saved.id, createdAt: saved.createdAt, ...result };
}

async function listHistory(prisma, userId, { limit, cursor }) {
  const rows = await prisma.symptomCheck.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: { id: true, symptoms: true, severity: true, recommendedSpecialty: true, result: true, createdAt: true },
  });
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    id: r.id,
    symptoms: r.symptoms,
    severity: r.severity,
    urgency: r.result?.urgency ?? null,
    recommendedSpecialty: r.recommendedSpecialty,
    createdAt: r.createdAt,
  }));
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

function listVocabulary() {
  return Object.entries(SYMPTOMS).map(([id, label]) => ({ id, label }));
}

module.exports = { runCheck, listHistory, listVocabulary };