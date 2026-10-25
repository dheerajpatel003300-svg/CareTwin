const { PrismaClient } = require("@prisma/client");

function createPrisma(logger) {
  const prisma = new PrismaClient({
    log: [
      { emit: "event", level: "error" },
      { emit: "event", level: "warn" },
    ],
  });

  prisma.$on("error", (event) => {
    logger.error({ err: event }, "prisma error");
  });

  prisma.$on("warn", (event) => {
    logger.warn({ msg: event.message }, "prisma warn");
  });

  return prisma;
}

async function checkDatabase(prisma) {
  await prisma.$queryRaw`SELECT 1`;
}

module.exports = { createPrisma, checkDatabase };
