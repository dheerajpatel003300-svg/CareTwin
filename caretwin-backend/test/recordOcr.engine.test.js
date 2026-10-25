const test = require("node:test");
const assert = require("node:assert/strict");
const ocrEngine = require("../src/services/recordOcr.engine");

test("Tesseract TSV extraction returns word text and mean confidence", () => {
  const tsv = [
    "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
    "5\t1\t1\t1\t1\t1\t0\t0\t20\t10\t80\tPatient",
    "5\t1\t1\t1\t1\t2\t21\t0\t25\t10\t100\tReport",
  ].join("\n");
  assert.deepEqual(ocrEngine.parseTsv(tsv), {
    text: "Patient Report",
    confidence: 90,
    wordCount: 2,
  });
});

test("OCR result summary marks low-confidence text for review", () => {
  const result = ocrEngine.summarize([{ text: "Test result", confidence: 61.3, source: "ocr" }]);
  assert.equal(result.text, "Test result");
  assert.equal(result.confidence, 61.3);
  assert.equal(result.quality, "low");
  assert.equal(result.needsReview, true);
  assert.deepEqual(result.flags, ["low_confidence", "review_recommended"]);
});

test("embedded PDF text is unscored but not misrepresented as OCR confidence", () => {
  const result = ocrEngine.summarize([
    { text: "A sufficiently long extracted report body.", confidence: null, source: "embedded_text" },
  ]);
  assert.equal(result.confidence, null);
  assert.equal(result.quality, "unscored");
  assert.equal(result.needsReview, true);
  assert.deepEqual(result.flags, ["no_ocr_confidence", "review_recommended", "embedded_text_used"]);
});

test("empty OCR output fails instead of returning invented text", () => {
  assert.throws(() => ocrEngine.summarize([{ text: "", confidence: null, source: "ocr" }]), {
    code: "OCR_NO_TEXT",
  });
});

test("OCR resource limits are explicit", () => {
  assert.equal(ocrEngine.MAX_PDF_PAGES, 10);
  assert.equal(ocrEngine.MAX_IMAGE_PIXELS, 12_000_000);
  assert.equal(ocrEngine.MAX_TEXT_CHARACTERS, 100_000);
  assert.equal(ocrEngine.MAX_JOB_MS, 120_000);
});
