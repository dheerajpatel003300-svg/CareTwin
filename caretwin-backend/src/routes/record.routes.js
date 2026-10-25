const express = require("express");
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { singleFile } = require("../middleware/upload");
const {
  createRecordSchema,
  updateRecordSchema,
  listRecordsQuerySchema,
  recordIdParamSchema,
} = require("../validators/record.validator");
const { createRecordController } = require("../controllers/record.controller");
const { createRecordFileController } = require("../controllers/recordFile.controller");
const { createRecordOcrController } = require("../controllers/recordOcr.controller");

function createRecordRouter({ prisma, redis }) {
  const router = express.Router();
  const controller = createRecordController({ prisma });
  const fileController = createRecordFileController({ prisma });
  const ocrController = createRecordOcrController({ prisma });

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      prefix: "rl:upload:",
      sendCommand: (...args) => redis.call(...args),
    }),
  });

  router.use(requireAuth);

  router.get("/", validate(listRecordsQuerySchema, "query"), controller.list);
  router.post("/", validate(createRecordSchema), controller.create);
  router.get("/:id", validate(recordIdParamSchema, "params"), controller.get);
  router.patch(
    "/:id",
    validate(recordIdParamSchema, "params"),
    validate(updateRecordSchema),
    controller.update
  );
  router.delete("/:id", validate(recordIdParamSchema, "params"), controller.remove);

  // Files
  router.post(
    "/:id/file",
    uploadLimiter,
    validate(recordIdParamSchema, "params"),
    singleFile("file"),
    fileController.upload
  );
  router.get("/:id/file", validate(recordIdParamSchema, "params"), fileController.download);
  router.delete("/:id/file", validate(recordIdParamSchema, "params"), fileController.remove);
  router.get("/:id/ocr", validate(recordIdParamSchema, "params"), ocrController.get);

  return router;
}

module.exports = { createRecordRouter };