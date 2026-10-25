require("dotenv").config();
const fs = require("fs");
const { execSync } = require("child_process");

const results = [];
function add(level, name, detail = "") {
  results.push({ level, name, detail });
}

const env = process.env;
const prod = process.argv.includes("--prod");
const WEAK_WORDS = /(change|secret|your|example|placeholder|password|test|dev)/i;

function secretCheck(name) {
  const v = env[name];
  if (!v) return add("FAIL", `${name} is set`, "missing");
  const problems = [];
  if (v.length < 32) problems.push(`only ${v.length} chars (want 32+)`);
  if (WEAK_WORDS.test(v)) problems.push("contains a guessable word");
  add(problems.length ? "FAIL" : "PASS", `${name} is strong`, problems.join("; "));
}

// ---- secrets
secretCheck("JWT_ACCESS_SECRET");
if (env.JWT_REFRESH_SECRET) {
  secretCheck("JWT_REFRESH_SECRET");
  add(env.JWT_REFRESH_SECRET !== env.JWT_ACCESS_SECRET ? "PASS" : "FAIL", "refresh secret differs from access secret");
}

// ---- database credentials
try {
  const u = new URL(env.DATABASE_URL);
  const user = decodeURIComponent(u.username);
  const pass = decodeURIComponent(u.password);
  add(user !== "postgres" ? "PASS" : "FAIL", "app does not connect as the postgres superuser", `user=${user}`);
  const weak = pass.length < 16 || pass === user || WEAK_WORDS.test(pass);
  add(weak ? (prod ? "FAIL" : "WARN") : "PASS", "database password is strong", weak ? `length ${pass.length}; fine for local dev, must change for production` : "");
  add(["localhost", "127.0.0.1"].includes(u.hostname) ? (prod ? "FAIL" : "WARN") : "PASS", "database host", u.hostname);
} catch {
  add("FAIL", "DATABASE_URL is a valid URL");
}

// ---- CORS
const origins = (env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
add(origins.length ? "PASS" : "WARN", "CORS_ORIGINS is set", origins.length ? `${origins.length} origin(s)` : "no browser origin allowed");
add(origins.includes("*") ? "FAIL" : "PASS", "CORS has no wildcard");
const localOrigins = origins.filter((o) => /localhost|127\.0\.0\.1/.test(o));
add(localOrigins.length ? (prod ? "FAIL" : "WARN") : "PASS", "CORS has no localhost origins", localOrigins.length ? "remove before production" : "");
add(origins.every((o) => /^https:\/\//.test(o) || /localhost|127\.0\.0\.1/.test(o)) ? "PASS" : "FAIL", "non-local CORS origins use https");

// ---- environment / cookies / mail
add(env.NODE_ENV === "production" ? "PASS" : prod ? "FAIL" : "WARN", "NODE_ENV", String(env.NODE_ENV));
add(env.MAIL_PROVIDER === "smtp" ? "PASS" : prod ? "FAIL" : "WARN", "real email is configured", `MAIL_PROVIDER=${env.MAIL_PROVIDER || "console"}`);
add(env.SENTRY_DSN ? "PASS" : "WARN", "error monitoring (SENTRY_DSN) configured");

// ---- AI keys are not placeholders
for (const [name, prefix] of [["GROQ_API_KEY", "gsk_"], ["ANTHROPIC_API_KEY", "sk-ant-"]]) {
  if (env[name]) add(env[name].startsWith(prefix) ? "PASS" : "WARN", `${name} looks like a real key`);
}

// ---- git hygiene
try {
  const gi = fs.existsSync(".gitignore") ? fs.readFileSync(".gitignore", "utf8") : "";
  add(/^\.env\s*$/m.test(gi) ? "PASS" : "FAIL", ".gitignore covers .env");
  add(/^\/?storage\/?\s*$/m.test(gi) ? "PASS" : "FAIL", ".gitignore covers storage/ (uploaded health files)");
  try {
    const tracked = execSync("git ls-files", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n");
    add(tracked.some((f) => f === ".env") ? "FAIL" : "PASS", ".env is not tracked by git");
    add(tracked.some((f) => f.startsWith("storage/")) ? "FAIL" : "PASS", "no uploaded files are tracked by git");
  } catch {
    add("WARN", "git repository checks skipped", "this folder is not a git repo yet");
  }
} catch (e) {
  add("WARN", "git hygiene checks failed", e.message);
}

// ---- dev-only scripts exist (must not be deployed)
const devScripts = fs.existsSync("scripts") ? fs.readdirSync("scripts") : [];
add(devScripts.length ? "WARN" : "PASS", "dev-only scripts present", devScripts.length ? `${devScripts.length} files in scripts/ must NOT be deployed` : "");

// ---- report
const icon = { PASS: "PASS", WARN: "WARN", FAIL: "FAIL" };
for (const r of results) console.log(`${icon[r.level]}  ${r.name}${r.detail ? "  -> " + r.detail : ""}`);
const fails = results.filter((r) => r.level === "FAIL").length;
const warns = results.filter((r) => r.level === "WARN").length;
console.log(`\n${fails} fail, ${warns} warn  (mode: ${prod ? "production" : "development"})`);
process.exit(fails ? 1 : 0);