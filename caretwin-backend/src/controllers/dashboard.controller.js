const dashboardService = require("../services/dashboard.service");
const predictionService = require("../services/prediction.service");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function createDashboardController({ prisma }) {
  const summary = asyncHandler(async (req, res) => {
    predictionService.warmUpMlService();
    const data = await dashboardService.getDashboard(prisma, req.userId);
    res.json({ success: true, data });
  });

  return { summary };
}

module.exports = { createDashboardController };