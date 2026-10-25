const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { pipeline } = require("stream/promises");
const sharp = require("sharp");
const storage = require("./storage.service");

const MAX_PDF_PAGES = 10;
const MAX_IMAGE_PIXELS = 12_000_000;
const MAX_TEXT_CHARACTERS = 100_000;
const MAX_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_JOB_MS = 120_000;
const PAGE_RENDER_DPI = 150;

function ocrError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function timeoutFor(deadline, maxMs) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw ocrError("OCR_TIMEOUT", "OCR job timed out");
  return Math.min(maxMs, remaining);
}

function runProcess(command, args, { timeoutMs, maxOutputBytes = MAX_PROCESS_OUTPUT_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      env: { ...process.env, LC_ALL: "C" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(ocrError("OCR_TIMEOUT", "OCR subprocess timed out"));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxOutputBytes) {
        child.kill("SIGKILL");
        finish(ocrError("OCR_OUTPUT_LIMIT", "OCR output exceeded its limit"));
      } else {
        stdout.push(chunk);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= 64 * 1024) stderr.push(chunk);
    });
    child.on("error", (error) => {
      finish(
        ocrError(
          error.code === "ENOENT" ? "OCR_RUNTIME_MISSING" : "OCR_PROCESS_FAILED",
          error.code === "ENOENT" ? "An OCR runtime dependency is not installed" : "OCR process failed"
        )
      );
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(ocrError("OCR_PROCESS_FAILED", "OCR process returned an error"));
        return;
      }
      finish(null, {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

async function probeRuntime() {
  for (const [command, args] of [
    ["tesseract", ["--version"]],
    ["pdfinfo", ["-v"]],
    ["pdftotext", ["-v"]],
    ["pdftoppm", ["-v"]],
  ]) {
    await runProcess(command, args, { timeoutMs: 5_000, maxOutputBytes: 64 * 1024 });
  }
}

async function copyFromStorage(storageKey, destination) {
  const input = await storage.openReadStream(storageKey);
  await pipeline(input, fs.createWriteStream(destination, { mode: 0o600, flags: "wx" }));
}

function cleanText(text) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .split("\f")
    .join("\n")
    .trim()
    .slice(0, MAX_TEXT_CHARACTERS);
}

function parseTsv(output) {
  const words = [];
  for (const line of output.split(/\r?\n/).slice(1)) {
    const columns = line.split("\t");
    if (columns[0] !== "5" || columns.length < 12) continue;
    const word = columns.slice(11).join("\t").trim();
    const confidence = Number(columns[10]);
    if (word && Number.isFinite(confidence) && confidence >= 0) {
      words.push({ word, confidence });
    }
  }
  const text = words.map((item) => item.word).join(" ");
  const confidence = words.length
    ? Math.round((words.reduce((total, item) => total + item.confidence, 0) / words.length) * 10) / 10
    : null;
  return { text, confidence, wordCount: words.length };
}

function summarize(pages) {
  const combinedText = pages.map((page) => page.text).filter(Boolean).join("\n\n");
  const truncated = combinedText.length > MAX_TEXT_CHARACTERS;
  const text = cleanText(combinedText);
  if (!text) throw ocrError("OCR_NO_TEXT", "No readable text was detected");

  const scoredPages = pages.filter((page) => page.confidence !== null);
  const confidenceWeight = scoredPages.reduce((sum, page) => sum + (page.wordCount || 1), 0);
  const confidence = confidenceWeight
    ? Math.round(
        (scoredPages.reduce(
          (sum, page) => sum + page.confidence * (page.wordCount || 1),
          0
        ) /
          confidenceWeight) *
          10
      ) / 10
    : null;
  const quality =
    confidence === null ? "unscored" : confidence >= 85 ? "high" : confidence >= 65 ? "medium" : "low";
  const flags = [];
  if (quality === "low") flags.push("low_confidence");
  if (confidence === null) flags.push("no_ocr_confidence");
  if (confidence === null || confidence < 80) flags.push("review_recommended");
  if (truncated) flags.push("text_truncated");
  if (pages.some((page) => page.source === "embedded_text")) flags.push("embedded_text_used");
  if (pages.some((page) => page.source === "ocr") && pages.some((page) => page.source === "embedded_text")) {
    flags.push("mixed_extraction");
  }

  return { text, confidence, quality, needsReview: confidence === null || confidence < 80, flags };
}

async function inspectImage(inputPath) {
  let metadata;
  try {
    metadata = await sharp(inputPath, { limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  } catch {
    throw ocrError("OCR_INVALID_IMAGE", "Image could not be decoded");
  }
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width * metadata.height > MAX_IMAGE_PIXELS ||
    metadata.width > 10_000 ||
    metadata.height > 10_000
  ) {
    throw ocrError("OCR_IMAGE_LIMIT", "Image dimensions exceed OCR limits");
  }
}

async function normalizeImage(inputPath, outputPath) {
  await sharp(inputPath, { limitInputPixels: MAX_IMAGE_PIXELS })
    .timeout({ seconds: 15 })
    .rotate()
    .resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true })
    .png()
    .toFile(outputPath);
}

function parsePageCount(pdfInfo) {
  const match = pdfInfo.match(/^Pages:\s+(\d+)\s*$/im);
  const pages = match ? Number(match[1]) : 0;
  if (!Number.isInteger(pages) || pages < 1) throw ocrError("OCR_INVALID_PDF", "PDF page count is invalid");
  if (pages > MAX_PDF_PAGES) throw ocrError("OCR_PAGE_LIMIT", "PDF exceeds the OCR page limit");
  return pages;
}

function validatePageSize(pageInfo) {
  const match = pageInfo.match(/Page(?:\s+\d+)? size:\s+([\d.]+)\s+x\s+([\d.]+)/i);
  if (!match) throw ocrError("OCR_INVALID_PDF", "PDF page dimensions could not be determined");
  const width = Number(match[1]);
  const height = Number(match[2]);
  const pixels = (width * PAGE_RENDER_DPI / 72) * (height * PAGE_RENDER_DPI / 72);
  if (!Number.isFinite(pixels) || pixels > MAX_IMAGE_PIXELS) {
    throw ocrError("OCR_PAGE_DIMENSION_LIMIT", "PDF page dimensions exceed OCR limits");
  }
}

async function recognizeImage(inputPath, outputBase, deadline) {
  const normalizedPath = `${outputBase}-normalized.png`;
  await normalizeImage(inputPath, normalizedPath);
  const primaryResult = await runProcess(
    "tesseract",
    [normalizedPath, "stdout", "-l", "eng", "tsv"],
    { timeoutMs: timeoutFor(deadline, 30_000), maxOutputBytes: MAX_PROCESS_OUTPUT_BYTES }
  );
  const primary = parseTsv(primaryResult.stdout);
  if (primary.wordCount >= 5) return primary;

  const metadata = await sharp(normalizedPath).metadata();
  if (!metadata.width || !metadata.height || metadata.height < 40 || metadata.width < 40) {
    return primary;
  }

  const left = Math.floor(metadata.width * 0.02);
  const top = Math.floor(metadata.height * 0.25);
  const cropWidth = metadata.width - left * 2;
  const cropHeight = metadata.height - top;
  if (cropWidth < 40 || cropHeight < 40) return primary;

  const fallbackPath = `${outputBase}-text-region.png`;
  const fallbackResult = await sharp(normalizedPath)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize({ width: Math.min(3_000, cropWidth * 3) })
    .grayscale()
    .linear(1.5, -30)
    .png()
    .toFile(fallbackPath);
  if (fallbackResult.width * fallbackResult.height > MAX_IMAGE_PIXELS) {
    await fsp.rm(fallbackPath, { force: true });
    return primary;
  }

  const fallbackTsv = await runProcess(
    "tesseract",
    [fallbackPath, "stdout", "-l", "eng", "--psm", "6", "tsv"],
    { timeoutMs: timeoutFor(deadline, 30_000), maxOutputBytes: MAX_PROCESS_OUTPUT_BYTES }
  );
  const fallback = parseTsv(fallbackTsv.stdout);
  if (fallback.wordCount <= primary.wordCount) return primary;
  if (!primary.text) return fallback;

  const wordCount = primary.wordCount + fallback.wordCount;
  const confidence = Math.round(
    ((primary.confidence ?? 0) * primary.wordCount +
      (fallback.confidence ?? 0) * fallback.wordCount) /
      wordCount * 10
  ) / 10;
  return {
    text: `${primary.text}\n${fallback.text}`,
    confidence,
    wordCount,
  };
}

async function processPdf(inputPath, tempDir, deadline) {
  const info = await runProcess("pdfinfo", [inputPath], {
    timeoutMs: timeoutFor(deadline, 10_000),
    maxOutputBytes: 128 * 1024,
  });
  const pageCount = parsePageCount(info.stdout);
  const results = [];

  for (let page = 1; page <= pageCount; page += 1) {
    const pageInfo = await runProcess("pdfinfo", ["-f", String(page), "-l", String(page), inputPath], {
      timeoutMs: timeoutFor(deadline, 5_000),
      maxOutputBytes: 64 * 1024,
    });
    validatePageSize(pageInfo.stdout);

    const embedded = await runProcess(
      "pdftotext",
      ["-f", String(page), "-l", String(page), "-layout", "-enc", "UTF-8", inputPath, "-"],
      { timeoutMs: timeoutFor(deadline, 10_000), maxOutputBytes: MAX_TEXT_CHARACTERS }
    );
    const embeddedText = cleanText(embedded.stdout);
    if (embeddedText.length > 20) {
      results.push({ text: embeddedText, confidence: null, source: "embedded_text" });
      continue;
    }

    const outputBase = path.join(tempDir, `page-${page}`);
    await runProcess(
      "pdftoppm",
      [
        "-f", String(page),
        "-l", String(page),
        "-singlefile",
        "-r", String(PAGE_RENDER_DPI),
        "-png",
        inputPath,
        outputBase,
      ],
      { timeoutMs: timeoutFor(deadline, 20_000), maxOutputBytes: 64 * 1024 }
    );
    const recognized = await recognizeImage(`${outputBase}.png`, outputBase, deadline);
    results.push({ ...recognized, source: "ocr" });
  }
  return summarize(results);
}

async function processImage(inputPath, tempDir, deadline) {
  await inspectImage(inputPath);
  const recognized = await recognizeImage(inputPath, path.join(tempDir, "image"), deadline);
  return summarize([{ ...recognized, source: "ocr" }]);
}

async function processDocument(storageKey) {
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "caretwin-ocr-"));
  try {
    await fsp.chmod(tempDir, 0o700);
    const ext = path.extname(storageKey).toLowerCase();
    if (![".pdf", ".jpg", ".png"].includes(ext)) {
      throw ocrError("OCR_UNSUPPORTED_FILE", "Unsupported OCR file type");
    }
    const inputPath = path.join(tempDir, `input${ext}`);
    const deadline = Date.now() + MAX_JOB_MS;
    await copyFromStorage(storageKey, inputPath);
    return ext === ".pdf"
      ? await processPdf(inputPath, tempDir, deadline)
      : await processImage(inputPath, tempDir, deadline);
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
  }
}

module.exports = {
  MAX_PDF_PAGES,
  MAX_IMAGE_PIXELS,
  MAX_TEXT_CHARACTERS,
  MAX_JOB_MS,
  parseTsv,
  summarize,
  probeRuntime,
  processDocument,
};
