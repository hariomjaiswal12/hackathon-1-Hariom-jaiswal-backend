const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const scheduleService = require('../services/schedule.service');

const getWeeklySchedule = asyncHandler(async (req, res) => {
  const schedules = await scheduleService.getWeeklySchedule();
  return ApiResponse.ok(res, 'Weekly schedule retrieved', { schedules });
});

const getScheduleForDay = asyncHandler(async (req, res) => {
  const schedule = await scheduleService.getScheduleForDay(req.params.day);
  return ApiResponse.ok(res, 'Day schedule retrieved', { schedule });
});

const saveDaySchedule = asyncHandler(async (req, res) => {
  const schedule = await scheduleService.saveDaySchedule(req.params.day, {
    isOpen: req.body.isOpen,
    services: req.body.services,
  });

  return ApiResponse.ok(res, 'Day schedule saved', { schedule });
});

const getEffectiveSchedule = asyncHandler(async (req, res) => {
  const schedule = await scheduleService.getEffectiveSchedule(req.params.date);
  return ApiResponse.ok(res, 'Effective schedule retrieved', { schedule });
});

module.exports = {
  getWeeklySchedule,
  getScheduleForDay,
  saveDaySchedule,
  getEffectiveSchedule,
};
