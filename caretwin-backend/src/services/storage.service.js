const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

// Local-disk storage. To move to S3 later, keep these four function names
// and swap the bodies; nothing else in the app needs to change.
const ROOT = path.resolve(process.env.STORAGE_DIR || "./storage");

async function ensureRoot() {
  await fsp.mkdir(ROOT, { recursive: true });
}

// Keys are generated here, never taken from user input.
function newKey(userId, ext) {
  return `${userId}/${crypto.randomBytes(16).toString("hex")}${ext}`;
}

// Defence in depth: refuse any key that would resolve outside ROOT.
function resolveKey(key) {
  const full = path.resolve(ROOT, key);
  if (!full.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key");
  return full;
}

async function saveFile(key, buffer) {
  const full = resolveKey(key);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, buffer, { mode: 0o600, flag: "wx" });
}

function openReadStream(key) {
  return fs.createReadStream(resolveKey(key));
}

async function deleteFile(key) {
  try {
    await fsp.unlink(resolveKey(key));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

module.exports = { ensureRoot, newKey, saveFile, openReadStream, deleteFile };