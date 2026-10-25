require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const BASE = "http://localhost:4000";
const prisma = new PrismaClient();

let failures = 0;
function check(name, passed, detail = "") {
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

async function call(method, urlPath, { token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function main() {
  const login = await call("POST", "/auth/login", { body: { email: "test@example.com", password: "ThirdStrong12345" } });
  if (login.status !== 200) {
    console.log(`Cannot log in: ${login.status} ${login.data?.error?.message}`);
    if (login.status === 429) console.log("Auth rate limit reached. Wait about 15 minutes and run again.");
    return;
  }
  const token = login.data.data.accessToken;
  console.log("logged in\n");

  // ---- file removal when a record is deleted + download header
  const rec = (await call("POST", "/records", { token, body: { title: "Batch1 test", recordType: "other" } })).data.data.record;

  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  const form = new FormData();
  form.append("file", new Blob([pdf], { type: "application/pdf" }), "my report.pdf");
  const up = await fetch(`${BASE}/records/${rec.id}/file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  check("upload accepted", up.status === 201, String(up.status));

  const dl = await fetch(`${BASE}/records/${rec.id}/file`, { headers: { Authorization: `Bearer ${token}` } });
  const disp = dl.headers.get("content-disposition") || "";
  const body = Buffer.from(await dl.arrayBuffer()).toString("latin1");
  check("download returns the PDF", dl.status === 200 && body.startsWith("%PDF-1.4"));
  check("Content-Disposition has plain filename", disp.includes('filename="my report.pdf"'), disp);
  check("Content-Disposition has filename*", disp.includes("filename*=UTF-8''my%20report.pdf"));
  check("nosniff header set", dl.headers.get("x-content-type-options") === "nosniff");

  const del = await call("DELETE", `/records/${rec.id}`, { token });
  check("record deleted (204)", del.status === 204, String(del.status));
  const deletedFile = await fetch(`${BASE}/records/${rec.id}/file`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check("deleted record file is unavailable", deletedFile.status === 404, String(deletedFile.status));

  // ---- resend verification
  const MSG = "If this account needs verification, a new link has been sent.";
  const reg = await call("POST", "/auth/register", { body: { firstName: "Test", lastName: "Four", email: "test4@example.com", password: "Strong12345" } });
  if (reg.status === 429) { console.log("\nAuth rate limit reached. Wait about 15 minutes and run again."); return; }

  const user4 = await prisma.user.findUnique({ where: { email: "test4@example.com" } });
  const verified = await prisma.user.findUnique({ where: { email: "test@example.com" } });
  const verifiedBefore = await prisma.emailVerificationToken.count({ where: { userId: verified.id } });

  const r1 = await call("POST", "/auth/resend-verification", { body: { email: "test4@example.com" } });
  const r2 = await call("POST", "/auth/resend-verification", { body: { email: "test@example.com" } });
  const r3 = await call("POST", "/auth/resend-verification", { body: { email: "nobody@example.com" } });
  check("resend: unverified account gets the message", r1.status === 200 && r1.data?.data?.message === MSG, String(r1.status));
  check("resend: verified account gets the SAME message", r2.status === 200 && r2.data?.data?.message === MSG);
  check("resend: unknown email gets the SAME message", r3.status === 200 && r3.data?.data?.message === MSG);

  const t4 = await prisma.emailVerificationToken.findMany({ where: { userId: user4.id } });
  const unused = t4.filter((t) => !t.usedAt).length;
  check("unverified user has exactly 1 usable token (older ones invalidated)", unused === 1, `unused=${unused}, total=${t4.length}`);
  const verifiedAfter = await prisma.emailVerificationToken.count({ where: { userId: verified.id } });
  check("no token created for the already-verified account", verifiedAfter === verifiedBefore);

  const bad = await call("POST", "/auth/resend-verification", { body: { email: "not-an-email" } });
  check("resend: bad email rejected (400)", bad.status === 400, String(bad.status));

  // ---- audit trail
  const rows = await prisma.auditLog.findMany({ where: { userId: verified.id }, orderBy: { createdAt: "desc" }, take: 30, select: { action: true } });
  const actions = new Set(rows.map((r) => r.action));
  for (const a of ["auth.login", "record.create", "record.file.upload", "record.file.download", "record.delete"]) {
    check(`audit has ${a}`, actions.has(a));
  }

  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} CHECK(S) FAILED`);
}

main()
  .catch((e) => console.error("script error:", e.message))
  .finally(() => prisma.$disconnect());