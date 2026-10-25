require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: node scripts/verify-user.js <email>");

  const prisma = new PrismaClient();
  const { count } = await prisma.user.updateMany({
    where: { email, emailVerifiedAt: null },
    data: { emailVerifiedAt: new Date() },
  });
  console.log(count ? `Verified ${email}` : `${email} not found or already verified`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});