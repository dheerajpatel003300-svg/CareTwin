const { getMe } = require("./auth.service");

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// Only fields that were actually sent are written (undefined = leave unchanged)
async function updateProfile(prisma, userId, data) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: userId, deletedAt: null },
      data,
    });
    if (count === 0) throw httpError(404, "User not found");

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, dateOfBirth: true, gender: true },
    });
    await tx.familyMember.updateMany({
      where: { userId, isSelf: true, deletedAt: null },
      data: {
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Me",
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
      },
    });
  });

  return getMe(prisma, userId);
}

module.exports = { updateProfile };