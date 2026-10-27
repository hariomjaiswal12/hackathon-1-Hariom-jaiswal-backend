const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const healthService = require('../services/health.service');

const getHealth = asyncHandler(async (req, res) => {
  const health = healthService.getHealth();
  return ApiResponse.ok(res, 'TXOTX OS API is running', health);
});

module.exports = {
  getHealth,
};
