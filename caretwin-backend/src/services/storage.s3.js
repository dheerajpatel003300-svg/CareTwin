const crypto = require("crypto");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3");

const BUCKET = () => process.env.S3_BUCKET;
// Only keys this app generates are accepted: <user uuid>/<32 hex>.<ext>
const KEY_RE = /^[0-9a-f-]{36}\/[0-9a-f]{32}\.(pdf|jpg|png)$/;
const TYPES = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".png": "image/png" };

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

let client;
function getClient() {
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT || undefined, // set for R2, B2, MinIO...
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

function checkKey(key) {
  if (!KEY_RE.test(key)) throw new Error("Invalid storage key");
}

// Fails fast at startup if the bucket settings are wrong
async function ensureRoot() {
  for (const name of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
    if (!process.env[name]) throw new Error(`STORAGE_PROVIDER=s3 but ${name} is not set`);
  }
  await getClient().send(new HeadBucketCommand({ Bucket: BUCKET() }));
}

function newKey(userId, ext) {
  return `${userId}/${crypto.randomBytes(16).toString("hex")}${ext}`;
}

async function saveFile(key, buffer) {
  checkKey(key);
  const ext = key.slice(key.lastIndexOf("."));
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: buffer,
      ContentType: TYPES[ext],
      CacheControl: "private, no-store",
    })
  );
}

async function openReadStream(key) {
  checkKey(key);
  try {
    const res = await getClient().send(new GetObjectCommand({ Bucket: BUCKET(), Key: key }));
    return res.Body; // a Node Readable
  } catch (err) {
    if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      throw httpError(404, "File not found");
    }
    throw err;
  }
}

// S3 deletes are idempotent: deleting a missing key is not an error
async function deleteFile(key) {
  checkKey(key);
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
}

module.exports = { ensureRoot, newKey, saveFile, openReadStream, deleteFile };