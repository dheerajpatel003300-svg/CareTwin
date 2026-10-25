const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { createFamilyMemberController } = require("../controllers/familyMember.controller");
const {
  createFamilyMemberSchema,
  updateFamilyMemberSchema,
  familyMemberIdParamSchema,
} = require("../validators/familyMember.validator");

function createFamilyMemberRouter({ prisma }) {
  const router = express.Router();
  const controller = createFamilyMemberController({ prisma });

  router.use(requireAuth);
  router.get("/", controller.list);
  router.post("/", validate(createFamilyMemberSchema), controller.create);
  router.get("/:id", validate(familyMemberIdParamSchema, "params"), controller.get);
  router.patch(
    "/:id",
    validate(familyMemberIdParamSchema, "params"),
    validate(updateFamilyMemberSchema),
    controller.update
  );
  router.delete("/:id", validate(familyMemberIdParamSchema, "params"), controller.remove);

  return router;
}

module.exports = { createFamilyMemberRouter };
