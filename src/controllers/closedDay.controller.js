const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const closedDayService = require('../services/closedDay.service');

const listClosedDays = asyncHandler(async (req, res) => {
  const closedDays = await closedDayService.listClosedDays(req.query);
  return ApiResponse.ok(res, 'Closed days retrieved', { closedDays });
});

const getClosedDay = asyncHandler(async (req, res) => {
  const closedDay = await closedDayService.getClosedDayByDate(req.params.date);
  return ApiResponse.ok(res, 'Closed day retrieved', { closedDay });
});

const createClosedDay = asyncHandler(async (req, res) => {
  const closedDay = await closedDayService.createClosedDay({
    date: req.body.date,
    reason: req.body.reason,
    createdBy: req.user.id || req.user._id,
  });

  return ApiResponse.created(res, 'Closed day created', { closedDay });
});

const updateClosedDay = asyncHandler(async (req, res) => {
  const closedDay = await closedDayService.updateClosedDay(req.params.id, {
    reason: req.body.reason,
    isActive: req.body.isActive,
  });

  return ApiResponse.ok(res, 'Closed day updated', { closedDay });
});

module.exports = {
  listClosedDays,
  getClosedDay,
  createClosedDay,
  updateClosedDay,
};
