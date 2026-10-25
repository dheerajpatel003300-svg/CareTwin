const PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "phone",
  "dateOfBirth",
  "gender",
  "emailVerifiedAt",
];

function profileCompleteness(user) {
  const missing = PROFILE_FIELDS.filter((f) => user[f] === null || user[f] === undefined || user[f] === "");
  const filled = PROFILE_FIELDS.length - missing.length;
  return {
    percent: Math.round((filled / PROFILE_FIELDS.length) * 100),
    missing,
  };
}

async function getDashboard(prisma, userId) {
  const [
    user,
    unreadNotifications,
    recordCount,
    symptomCheckCount,
    openTickets,
    recentRecords,
    recentSymptomChecks,
  ] = await Promise.all([
    prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        firstName: true,
        lastName: true,
        phone: true,
        dateOfBirth: true,
        gender: true,
        emailVerifiedAt: true,
      },
    }),
    prisma.notification.count({ where: { userId, isRead: false } }),
    prisma.medicalRecord.count({ where: { userId, deletedAt: null } }),
    prisma.symptomCheck.count({ where: { userId } }),
    prisma.supportTicket.count({
      where: { userId, status: { in: ["open", "in_progress"] } },
    }),
    prisma.medicalRecord.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, title: true, recordType: true, recordDate: true, createdAt: true },
    }),
    prisma.symptomCheck.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, severity: true, recommendedSpecialty: true, createdAt: true },
    }),
  ]);

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  return {
    greeting: { firstName: user.firstName },
    profile: profileCompleteness(user),
    counts: {
      unreadNotifications,
      medicalRecords: recordCount,
      symptomChecks: symptomCheckCount,
      openSupportTickets: openTickets,
    },
    recentRecords,
    recentSymptomChecks,
  };
}

module.exports = { getDashboard };