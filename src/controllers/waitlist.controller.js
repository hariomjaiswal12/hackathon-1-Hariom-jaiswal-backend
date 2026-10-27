const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const waitlistService = require('../services/waitlist.service');
const { publishWaitlist } = require('../services/realtime.service');
const { notifyWaitlistEvent } = require('../services/notification.service');
const { REALTIME_EVENT } = require('../constants/realtime');

const createWaitlist = asyncHandler(async (req, res) => {
  const result = await waitlistService.createWaitlist({
    actor: req.user,
    input: {
      date: req.body.date,
      requestedStartTime: req.body.requestedStartTime,
      guests: req.body.guests,
      notes: req.body.notes,
      customerId: req.body.customerId,
      source: req.body.source,
    },
  });

  publishWaitlist(REALTIME_EVENT.WAITLIST_CREATED, result.entry);
  await notifyWaitlistEvent(REALTIME_EVENT.WAITLIST_CREATED, result.entry);
  return ApiResponse.created(res, 'Waitlist entry created', {
    waitlist: result.entry,
    availability: result.availability,
  });
});

const listWaitlist = asyncHandler(async (req, res) => {
  const waitlist = await waitlistService.listWaitlist({
    actor: req.user,
    query: req.query,
  });

  return ApiResponse.ok(res, 'Waitlist retrieved', { waitlist });
});

const getWaitlist = asyncHandler(async (req, res) => {
  const waitlist = await waitlistService.getWaitlist({
    actor: req.user,
    waitlistReference: req.params.reference,
  });

  return ApiResponse.ok(res, 'Waitlist entry retrieved', { waitlist });
});

function transitionAction(method, event, message) {
  return asyncHandler(async (req, res) => {
    const waitlist = await waitlistService[method]({
      actor: req.user,
      waitlistReference: req.params.reference,
    });

    publishWaitlist(event, waitlist);
    await notifyWaitlistEvent(event, waitlist);
    return ApiResponse.ok(res, message, { waitlist });
  });
}

module.exports = {
  createWaitlist,
  listWaitlist,
  getWaitlist,
  cancelWaitlist: transitionAction('cancelWaitlist', REALTIME_EVENT.WAITLIST_CANCELLED, 'Waitlist entry cancelled'),
  notifyWaitlist: transitionAction('notifyWaitlist', REALTIME_EVENT.WAITLIST_UPDATED, 'Waitlist entry notified'),
  convertWaitlist: transitionAction('convertWaitlist', REALTIME_EVENT.WAITLIST_UPDATED, 'Waitlist entry converted'),
  expireWaitlist: transitionAction('expireWaitlist', REALTIME_EVENT.WAITLIST_UPDATED, 'Waitlist entry expired'),
};
