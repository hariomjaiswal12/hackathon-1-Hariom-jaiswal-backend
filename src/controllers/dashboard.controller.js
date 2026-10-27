const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const dashboardService = require('../services/dashboard.service');

const getOverview = asyncHandler(async (req, res) => {
  const overview = await dashboardService.getOverview(req.dashboardDate);

  return ApiResponse.ok(res, 'Dashboard overview retrieved', overview);
});

const getBookingAnalytics = asyncHandler(async (req, res) => {
  const analytics = await dashboardService.getBookingAnalytics({
    date: req.dashboardDate,
    status: req.query.status,
    source: req.query.source,
    tableId: req.query.tableId,
  });

  return ApiResponse.ok(res, 'Booking analytics retrieved', analytics);
});

const getHourlyDistribution = asyncHandler(async (req, res) => {
  const distribution = await dashboardService.getHourlyDistribution(req.dashboardDate);

  return ApiResponse.ok(res, 'Hourly distribution retrieved', distribution);
});

const getServiceAnalytics = asyncHandler(async (req, res) => {
  const analytics = await dashboardService.getServiceAnalytics(req.dashboardDate);

  return ApiResponse.ok(res, 'Service analytics retrieved', analytics);
});

const getTableUtilization = asyncHandler(async (req, res) => {
  const utilization = await dashboardService.getTableUtilization(req.dashboardDate);

  return ApiResponse.ok(res, 'Table utilization retrieved', utilization);
});

const getWaitlistAnalytics = asyncHandler(async (req, res) => {
  const analytics = await dashboardService.getWaitlistAnalytics(req.dashboardDate);

  return ApiResponse.ok(res, 'Waitlist analytics retrieved', analytics);
});

const getLiveSummary = asyncHandler(async (req, res) => {
  const summary = await dashboardService.getLiveSummary();

  return ApiResponse.ok(res, 'Live floor summary retrieved', summary);
});

const getRecentActivity = asyncHandler(async (req, res) => {
  const activity = await dashboardService.getRecentActivity();

  return ApiResponse.ok(res, 'Recent activity retrieved', activity);
});

module.exports = {
  getOverview,
  getBookingAnalytics,
  getHourlyDistribution,
  getServiceAnalytics,
  getTableUtilization,
  getWaitlistAnalytics,
  getLiveSummary,
  getRecentActivity,
};
