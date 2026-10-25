const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { updateProfileSchema } = require("../validators/user.validator");
const { createUserController } = require("../controllers/user.controller");

function createUserRouter({ prisma }) {
  const router = express.Router();
  const controller = createUserController({ prisma });

  router.use(requireAuth); // every route here needs a valid access token

  router.get("/me", controller.getProfile);
  router.patch("/me", validate(updateProfileSchema), controller.updateProfile);

  return router;
}

module.exports = { createUserRouter };