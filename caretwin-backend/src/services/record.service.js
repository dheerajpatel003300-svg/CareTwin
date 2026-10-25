const storage = require("./storage.service");

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// storageKey is deliberately NOT selected: clients never see where files live
const SELECT = {
  id: true,
  familyMemberId: true,
  familyMember: { select: { id: true, name: true, relationship: true } },
  title: true,
  recordType: true,
  description: true,
  fileName: true,
  doctorName: true,
  hospitalName: true,
  recordDate: true,
  createdAt: true,
  updatedAt: true,
};

const toDto = (row) => ({ ...row, hasFile: Boolean(row.fileName) });

async function createRecord(prisma, userId, data) {
  const row = await prisma.$transaction(async (tx) => {
    const member = await resolveFamilyMember(tx, userId, data.familyMemberId);
    return tx.medicalRecord.create({
      data: { userId, ...data, familyMemberId: member.id },
      select: SELECT,
    });
  });
  return toDto(row);
}

async function listRecords(prisma, userId, { limit, cursor, recordType, familyMemberId }) {
  if (familyMemberId) await getActiveFamilyMember(prisma, userId, familyMemberId);
  const rows = await prisma.medicalRecord.findMany({
    where: {
      userId,
      deletedAt: null,
      ...(recordType ? { recordType } : {}),
      ...(familyMemberId ? { familyMemberId } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: SELECT,
  });

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(toDto);
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

// Not found and not yours look identical (404), so ids can't be probed
async function getRecord(prisma, userId, id) {
  const row = await prisma.medicalRecord.findFirst({
    where: { id, userId, deletedAt: null },
    select: SELECT,
  });
  if (!row) throw httpError(404, "Record not found");
  return toDto(row);
}

async function updateRecord(prisma, userId, id, data) {
  await prisma.$transaction(async (tx) => {
    const update = { ...data };
    if (update.familyMemberId) {
      const member = await resolveFamilyMember(tx, userId, update.familyMemberId);
      update.familyMemberId = member.id;
    }
    const { count } = await tx.medicalRecord.updateMany({
      where: { id, userId, deletedAt: null },
      data: update,
    });
    if (count === 0) throw httpError(404, "Record not found");
  });
  return getRecord(prisma, userId, id);
}

async function deleteRecord(prisma, userId, id) {
  const storageKey = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT "storage_key"
      FROM "medical_records"
      WHERE "id" = ${id}::uuid AND "user_id" = ${userId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    if (!rows.length) throw httpError(404, "Record not found");
    const currentStorageKey = rows[0].storage_key;
    await tx.medicalRecord.update({
      where: { id },
      data: { deletedAt: new Date(), storageKey: null, fileName: null },
    });
    await tx.recordOcrJob.deleteMany({ where: { recordId: id } });
    return currentStorageKey;
  });

  // Remove the file from disk too: a deleted record must not leave health files behind
  if (storageKey) {
    try {
      await storage.deleteFile(storageKey);
    } catch (err) {
      console.error("record delete: could not remove a file:", err.code || err.message);
    }
  }
}

async function getActiveFamilyMember(prisma, userId, id) {
  const member = await prisma.familyMember.findFirst({
    where: { id, userId, deletedAt: null },
    select: { id: true },
  });
  if (!member) throw httpError(404, "Family member not found");
  return member;
}

async function resolveFamilyMember(tx, userId, id) {
  let member;
  if (id) {
    const rows = await tx.$queryRaw`
      SELECT "id"
      FROM "family_members"
      WHERE "id" = ${id}::uuid AND "user_id" = ${userId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    member = rows[0];
  } else {
    const rows = await tx.$queryRaw`
      SELECT "id"
      FROM "family_members"
      WHERE "user_id" = ${userId}::uuid AND "is_self" = true AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    member = rows[0];
  }
  if (!member) {
    if (id) throw httpError(404, "Family member not found");
    throw new Error("Default self family member is missing");
  }
  return member;
}

module.exports = { createRecord, listRecords, getRecord, updateRecord, deleteRecord };