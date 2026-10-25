const MAX_ACTIVE_FAMILY_MEMBERS = 25;
const SELECT = {
  id: true,
  name: true,
  relationship: true,
  dateOfBirth: true,
  gender: true,
  isSelf: true,
  createdAt: true,
  updatedAt: true,
};

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toDto(member) {
  return {
    ...member,
    dateOfBirth: member.dateOfBirth?.toISOString().slice(0, 10) ?? null,
  };
}

async function listFamilyMembers(prisma, userId) {
  const members = await prisma.familyMember.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ isSelf: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    select: SELECT,
  });
  return members.map(toDto);
}

async function getFamilyMember(prisma, userId, id) {
  const member = await prisma.familyMember.findFirst({
    where: { id, userId, deletedAt: null },
    select: SELECT,
  });
  if (!member) throw httpError(404, "Family member not found");
  return toDto(member);
}

async function createFamilyMember(prisma, userId, data) {
  const member = await prisma.$transaction(async (tx) => {
    const owners = await tx.$queryRaw`
      SELECT "id"
      FROM "users"
      WHERE "id" = ${userId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    if (!owners.length) throw httpError(404, "User not found");
    const count = await tx.familyMember.count({ where: { userId, deletedAt: null } });
    if (count >= MAX_ACTIVE_FAMILY_MEMBERS) {
      throw httpError(409, `A maximum of ${MAX_ACTIVE_FAMILY_MEMBERS} active family members is allowed`);
    }
    return tx.familyMember.create({
      data: { ...data, userId, isSelf: false },
      select: SELECT,
    });
  });
  return toDto(member);
}

async function lockActiveMember(tx, userId, id) {
  const rows = await tx.$queryRaw`
    SELECT "id", "is_self"
    FROM "family_members"
    WHERE "id" = ${id}::uuid AND "user_id" = ${userId}::uuid AND "deleted_at" IS NULL
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

async function updateFamilyMember(prisma, userId, id, data) {
  const member = await prisma.$transaction(async (tx) => {
    const locked = await lockActiveMember(tx, userId, id);
    if (!locked) throw httpError(404, "Family member not found");
    if (locked.is_self) {
      throw httpError(409, "Update your profile to change the self family member");
    }
    return tx.familyMember.update({ where: { id }, data, select: SELECT });
  });
  return toDto(member);
}

async function deleteFamilyMember(prisma, userId, id) {
  await prisma.$transaction(async (tx) => {
    const locked = await lockActiveMember(tx, userId, id);
    if (!locked) throw httpError(404, "Family member not found");
    if (locked.is_self) throw httpError(409, "The self family member cannot be deleted");

    const records = await tx.medicalRecord.count({
      where: { userId, familyMemberId: id, deletedAt: null },
    });
    if (records > 0) {
      throw httpError(409, "Reassign or delete this member's records before deleting the member");
    }

    await tx.familyMember.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  });
}

module.exports = {
  MAX_ACTIVE_FAMILY_MEMBERS,
  listFamilyMembers,
  getFamilyMember,
  createFamilyMember,
  updateFamilyMember,
  deleteFamilyMember,
};
