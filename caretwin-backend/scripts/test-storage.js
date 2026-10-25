require("dotenv").config();
const storage = require("../src/services/storage.service");

let failures = 0;
function check(name, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
}

async function main() {
  console.log("provider:", (process.env.STORAGE_PROVIDER || "local").toLowerCase(), "\n");
  try {
    await storage.ensureRoot();
    check("storage is reachable", true);
  } catch (e) {
    check("storage is reachable", false, e.name + ": " + e.message);
    return;
  }

  const key = storage.newKey("00000000-0000-4000-8000-000000000000", ".pdf");
  const data = Buffer.from("%PDF-1.4 storage round trip test");

  await storage.saveFile(key, data);
  check("save works", true);

  const stream = await storage.openReadStream(key);
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  check("read returns the same bytes", Buffer.concat(chunks).equals(data));

  await storage.deleteFile(key);
  try {
    await storage.openReadStream(key);
    check("reading a deleted file fails with 404", false, "it still exists");
  } catch (e) {
    check("reading a deleted file fails with 404", e.statusCode === 404, String(e.statusCode));
  }

  await storage.deleteFile(key);
  check("deleting twice is not an error", true);

  try {
    await storage.saveFile("../../etc/passwd", data);
    check("a bad key is refused", false);
  } catch {
    check("a bad key is refused", true);
  }

  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} CHECK(S) FAILED`);
}

main().catch((e) => console.error("script error:", e.message));