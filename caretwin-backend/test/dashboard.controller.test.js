const test = require("node:test");
const assert = require("node:assert/strict");
const dashboardService = require("../src/services/dashboard.service");
const predictionService = require("../src/services/prediction.service");
const { createDashboardController } = require("../src/controllers/dashboard.controller");

test("dashboard summary warms the ML service without changing its response", async () => {
  const originalGetDashboard = dashboardService.getDashboard;
  const originalWarmUp = predictionService.warmUpMlService;
  const dashboardData = {
    greeting: { firstName: "Alex" },
    profile: { percent: 100, missing: [] },
    counts: {
      unreadNotifications: 2,
      medicalRecords: 3,
      symptomChecks: 4,
      openSupportTickets: 1,
    },
    recentRecords: [],
    recentSymptomChecks: [],
  };
  let warmUpCalled = false;
  dashboardService.getDashboard = async (_prisma, userId) => {
    assert.equal(userId, "user-id");
    return dashboardData;
  };
  predictionService.warmUpMlService = () => {
    warmUpCalled = true;
  };

  try {
    const controller = createDashboardController({ prisma: {} });
    let response;
    await controller.summary(
      { userId: "user-id" },
      { json: (body) => { response = body; } },
      (error) => { throw error; },
    );

    assert.equal(warmUpCalled, true);
    assert.deepEqual(response, { success: true, data: dashboardData });
  } finally {
    dashboardService.getDashboard = originalGetDashboard;
    predictionService.warmUpMlService = originalWarmUp;
  }
});
