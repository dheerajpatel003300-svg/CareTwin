const nodemailer = require("nodemailer");

const isProd = () => process.env.NODE_ENV === "production";
const provider = () => process.env.MAIL_PROVIDER || "console";
const from = () => process.env.MAIL_FROM || "CareTwin <no-reply@localhost>";
const frontendUrl = () => (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/+$/, "");

let transport;
function getTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 465);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transport;
}

// Delivers one email. In console mode (dev only) it prints the token like before.
async function deliver({ to, subject, text, html, devLabel, devToken }) {
  if (provider() === "smtp") {
    await getTransport().sendMail({ from: from(), to, subject, text, html });
    return;
  }
  if (isProd()) {
    console.error("email not sent: MAIL_PROVIDER is 'console' in production");
    return;
  }
  console.log(`[dev] ${devLabel} for ${to}: ${devToken}`);
}

// Fire and forget: never makes the HTTP response wait, never throws into the request.
function inBackground(promise) {
  promise.catch((err) => console.error("email send failed:", err.code || err.name));
}

function verificationContent(token) {
  const link = `${frontendUrl()}/verify-email?token=${token}`;
  return {
    subject: "Verify your CareTwin email",
    text: `Welcome to CareTwin.\n\nVerify your email by opening this link (valid for 24 hours):\n${link}\n\nIf you did not create an account, you can ignore this email.`,
    html: `<p>Welcome to CareTwin.</p><p><a href="${link}">Verify your email</a> (link valid for 24 hours).</p><p>If you did not create an account, you can ignore this email.</p>`,
  };
}

function resetContent(token) {
  const link = `${frontendUrl()}/reset-password?token=${token}`;
  return {
    subject: "Reset your CareTwin password",
    text: `We received a request to reset your CareTwin password.\n\nOpen this link to choose a new one (valid for 1 hour):\n${link}\n\nIf you did not ask for this, ignore this email. Your password will not change.`,
    html: `<p>We received a request to reset your CareTwin password.</p><p><a href="${link}">Choose a new password</a> (link valid for 1 hour).</p><p>If you did not ask for this, ignore this email. Your password will not change.</p>`,
  };
}

function queueVerificationEmail(to, token) {
  inBackground(
    deliver({ to, ...verificationContent(token), devLabel: "verification token", devToken: token })
  );
}

function queuePasswordResetEmail(to, token) {
  inBackground(
    deliver({ to, ...resetContent(token), devLabel: "password reset token", devToken: token })
  );
}

// For scripts/test-email.js: awaited, so configuration errors are visible
async function sendTestEmail(to) {
  await deliver({
    to,
    subject: "CareTwin test email",
    text: "This is a test email from your CareTwin backend.",
    html: "<p>This is a test email from your CareTwin backend.</p>",
    devLabel: "test email",
    devToken: "(console mode: nothing was sent)",
  });
}

module.exports = { queueVerificationEmail, queuePasswordResetEmail, sendTestEmail };