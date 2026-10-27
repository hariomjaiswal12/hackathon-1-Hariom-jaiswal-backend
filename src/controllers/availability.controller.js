const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const availabilityService = require('../services/availability.service');

const getAvailability = asyncHandler(async (req, res) => {
  const availability = await availabilityService.getAvailability({
    date: req.query.date,
    startTime: req.query.time,
    guests: Number(req.query.guests),
  });

  return ApiResponse.ok(res, 'Availability retrieved', { availability });
});

module.exports = {
  getAvailability,
};
