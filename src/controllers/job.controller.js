const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const { getJobStatus } = require('../services/job.service');

const getAdminJobStatus = asyncHandler(async (req, res) => {
  return ApiResponse.ok(res, 'Job status retrieved', getJobStatus());
});

module.exports = {
  getAdminJobStatus,
};
