require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Number(process.argv[2]) || 10,
    select: { action: true, resourceType: true, ipAddress: true, createdAt: true },
  });
  console.table(rows);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
