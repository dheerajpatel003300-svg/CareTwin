const BASE = "http://localhost:4000";

async function call(method, path, { token, cookie, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = `refreshToken=${cookie}`;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, res };
}

async function login(email, password) {
  const r = await call("POST", "/auth/login", { body: { email, password } });
  if (r.status !== 200) return { ok: false, status: r.status, message: r.data?.error?.message };
  const setCookie = r.res.headers.get("set-cookie") || "";
  const cookie = (setCookie.match(/refreshToken=([a-f0-9]{64})/) || [])[1];
  return { ok: true, token: r.data.data.accessToken, cookie };
}

let failures = 0;
function check(name, passed, detail = "") {
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

async function main() {
  const email = "test3@example.com";
  const s1 = await login(email, "Strong12345");
  if (!s1.ok) {
    console.log(`Cannot log in as ${email}: ${s1.status} ${s1.message}`);
    console.log("If it says 'Invalid email or password', the account may already be changed or deleted by an earlier run.");
    return;
  }
  console.log("logged in as test3\n");

  let r = await call("POST", "/settings/password", { token: s1.token, body: { currentPassword: "WrongPass123", newPassword: "Another12345" } });
  check("wrong current password rejected", r.status === 400, r.data?.error?.message);

  r = await call("POST", "/settings/password", { token: s1.token, body: { currentPassword: "Strong12345", newPassword: "Strong12345" } });
  check("same password rejected", r.status === 400, r.data?.error?.message);

  r = await call("POST", "/settings/password", { token: s1.token, body: { currentPassword: "Strong12345", newPassword: "short" } });
  check("weak password rejected", r.status === 400);

  r = await call("POST", "/settings/password", { token: s1.token, body: { currentPassword: "Strong12345", newPassword: "Another12345", email: "x@y.z" } });
  check("extra field rejected", r.status === 400);

  r = await call("POST", "/settings/password", { token: s1.token, body: { currentPassword: "Strong12345", newPassword: "Another12345" } });
  check("password change succeeds", r.status === 200, r.data?.data?.message);

  r = await call("POST", "/auth/refresh", { cookie: s1.cookie });
  check("old refresh cookie revoked after password change", r.status === 401, r.data?.error?.message);

  const old = await login(email, "Strong12345");
  check("old password rejected", !old.ok && old.status === 401);

  const s2 = await login(email, "Another12345");
  check("new password works", s2.ok);
  if (!s2.ok) return;

  r = await call("GET", "/notifications?unread=true", { token: s2.token });
  const types = (r.data?.data?.items || []).map((n) => n.type);
  check("security notification created", types.includes("security"), types.join(","));

  // logout-all: two sessions
  const a = await login(email, "Another12345");
  const c = await login(email, "Another12345");
  r = await call("POST", "/settings/logout-all", { token: a.token });
  check("logout-all succeeds", r.status === 200);
  r = await call("POST", "/auth/refresh", { cookie: a.cookie });
  check("session A refresh revoked", r.status === 401, r.data?.error?.message);
  r = await call("POST", "/auth/refresh", { cookie: c.cookie });
  check("session B refresh revoked", r.status === 401, r.data?.error?.message);

  // delete account
  const d = await login(email, "Another12345");
  r = await call("POST", "/settings/delete-account", { token: d.token, body: { password: "WrongPass123", confirm: "DELETE" } });
  check("delete with wrong password rejected", r.status === 400, r.data?.error?.message);
  r = await call("POST", "/settings/delete-account", { token: d.token, body: { password: "Another12345", confirm: "yes" } });
  check("delete without DELETE confirm rejected", r.status === 400);
  r = await call("POST", "/settings/delete-account", { token: d.token, body: { password: "Another12345", confirm: "DELETE" } });
  check("account deleted", r.status === 200, r.data?.data?.message);

  const gone = await login(email, "Another12345");
  check("login rejected after deletion", !gone.ok);

  const main = await login("test@example.com", "ThirdStrong12345");
  check("main account still works", main.ok);

  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} CHECK(S) FAILED`);
}

main().catch((e) => console.error("script error:", e.message));