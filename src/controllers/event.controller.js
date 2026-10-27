const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const eventService = require('../services/event.service');

const createEvent = asyncHandler(async (req, res) => {
  const event = await eventService.createEvent({ actor: req.user, input: req.body });
  return ApiResponse.created(res, 'Event created', { event });
});

const listAdminEvents = asyncHandler(async (req, res) => {
  const events = await eventService.listAdminEvents({ status: req.query.status });
  return ApiResponse.ok(res, 'Events retrieved', { events });
});

const getAdminEvent = asyncHandler(async (req, res) => {
  const event = await eventService.getAdminEvent(req.params.id);
  return ApiResponse.ok(res, 'Event retrieved', { event });
});

const updateEvent = asyncHandler(async (req, res) => {
  const event = await eventService.updateEvent({ id: req.params.id, input: req.body });
  return ApiResponse.ok(res, 'Event updated', { event });
});

const archiveEvent = asyncHandler(async (req, res) => {
  const event = await eventService.archiveEvent(req.params.id);
  return ApiResponse.ok(res, 'Event archived', { event });
});

const listPublicEvents = asyncHandler(async (req, res) => {
  const events = await eventService.listPublicEvents({
    scope: req.query.scope,
    date: req.query.date,
  });
  return ApiResponse.ok(res, 'Events retrieved', { events });
});

const getPublicEvent = asyncHandler(async (req, res) => {
  const event = await eventService.getPublicEvent(req.params.slug);
  return ApiResponse.ok(res, 'Event retrieved', { event });
});

module.exports = {
  createEvent,
  listAdminEvents,
  getAdminEvent,
  updateEvent,
  archiveEvent,
  listPublicEvents,
  getPublicEvent,
};
