// Records WHO did WHAT to WHICH resource. Never put medical content in here.
// A failure to write the log must not break the user's request, so errors are swallowed.
async function logAudit(prisma, { userId, actorId, action, resourceType, resourceId, ipAddress }) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId ?? null,
        actorId: actorId ?? userId ?? null,
        action,
        resourceType: resourceType ?? null,
        resourceId: resourceId ?? null,
        ipAddress: ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error("audit log write failed:", err.message);
  }
}

module.exports = { logAudit };