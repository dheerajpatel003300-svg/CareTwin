require("dotenv").config();
const { sendTestEmail } = require("../src/services/email.service");

async function main() {
  const to = process.argv[2];
  if (!to) throw new Error("Usage: node scripts/test-email.js <your-email>");

  console.log("provider:", process.env.MAIL_PROVIDER || "console");
  console.log("smtp host:", process.env.SMTP_HOST || "(not set)", "| user set:", Boolean(process.env.SMTP_USER), "| password set:", Boolean(process.env.SMTP_PASS));

  try {
    await sendTestEmail(to);
    console.log(process.env.MAIL_PROVIDER === "smtp" ? `sent to ${to} - check the inbox (and spam)` : "console mode: nothing was sent");
  } catch (err) {
    // Show the code and the server's response text, never the credentials
    console.log("SEND FAILED:", err.code || err.name, "-", err.responseCode || "", String(err.response || err.message).split("\n")[0]);
  }
}

main().catch((e) => console.error("script error:", e.message));