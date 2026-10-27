const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const liveFloorService = require('../services/liveFloor.service');

const getLiveFloor = asyncHandler(async (req, res) => {
  const floor = await liveFloorService.getLiveFloor();

  return ApiResponse.ok(res, 'Live floor retrieved', floor);
});

module.exports = {
  getLiveFloor,
};
