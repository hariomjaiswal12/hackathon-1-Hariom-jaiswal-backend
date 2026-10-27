const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const tableAllocationService = require('../services/tableAllocation.service');

const getRecommendation = asyncHandler(async (req, res) => {
  const recommendation = await tableAllocationService.recommendTables({
    date: req.query.date,
    startTime: req.query.time,
    guests: Number(req.query.guests),
    location: req.query.location,
    shape: req.query.shape,
    tag: req.query.tag,
  });

  return ApiResponse.ok(res, 'Table recommendations retrieved', { recommendation });
});

module.exports = {
  getRecommendation,
};
