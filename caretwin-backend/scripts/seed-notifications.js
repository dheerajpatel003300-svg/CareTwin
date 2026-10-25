require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Usage: node scripts/seed-notifications.js <email>");

  const prisma = new PrismaClient();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No user with email ${email}`);

  const samples = [
    { title: "Welcome to CareTwin", message: "Your account is ready.", type: "welcome" },
    { title: "Complete your profile", message: "Add your phone and date of birth.", type: "reminder" },
    { title: "Upload your first record", message: "Keep your medical records in one place.", type: "reminder" },
  ];

  for (const s of samples) {
    await prisma.notification.create({ data: { userId: user.id, ...s } });
    await new Promise((r) => setTimeout(r, 20)); // distinct createdAt values
  }

  console.log(`Created ${samples.length} notifications for ${email}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});