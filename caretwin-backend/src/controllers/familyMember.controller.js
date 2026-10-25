const familyMemberService = require("../services/familyMember.service");
const { logAudit } = require("../services/audit.service");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createFamilyMemberController({ prisma }) {
  const audit = (req, action, resourceId) =>
    logAudit(prisma, {
      userId: req.userId,
      action,
      resourceType: "family_member",
      resourceId,
      ipAddress: req.ip,
    });

  const list = asyncHandler(async (req, res) => {
    const familyMembers = await familyMemberService.listFamilyMembers(prisma, req.userId);
    res.json({ success: true, data: { familyMembers } });
  });

  const create = asyncHandler(async (req, res) => {
    const familyMember = await familyMemberService.createFamilyMember(prisma, req.userId, req.body);
    await audit(req, "family_member.create", familyMember.id);
    res.status(201).json({ success: true, data: { familyMember } });
  });

  const get = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const familyMember = await familyMemberService.getFamilyMember(prisma, req.userId, id);
    await audit(req, "family_member.view", id);
    res.json({ success: true, data: { familyMember } });
  });

  const update = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    const familyMember = await familyMemberService.updateFamilyMember(
      prisma,
      req.userId,
      id,
      req.body
    );
    await audit(req, "family_member.update", id);
    res.json({ success: true, data: { familyMember } });
  });

  const remove = asyncHandler(async (req, res) => {
    const { id } = req.validated.params;
    await familyMemberService.deleteFamilyMember(prisma, req.userId, id);
    await audit(req, "family_member.delete", id);
    res.status(204).end();
  });

  return { list, create, get, update, remove };
}

module.exports = { createFamilyMemberController };
