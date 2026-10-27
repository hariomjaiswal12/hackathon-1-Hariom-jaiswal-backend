const Waitlist = require('../models/Waitlist');
const { runJob } = require('../services/job.service');
const { publishWaitlist } = require('../services/realtime.service');
const { readJobConfig } = require('../config/env');
const { WAITLIST_STATUS } = require('../constants/waitlist');
const { REALTIME_EVENT } = require('../constants/realtime');
const { combineServerLocalDateTime } = require('../utils/calendar');

async function expireStaleWaitlist(options) {
  if (options.wait) {
    await options.wait;
  }

  const now = options.at instanceof Date ? options.at : new Date();
  const expiryMs = readJobConfig().waitlistExpiryHours * 60 * 60 * 1000;
  const waiting = await Waitlist.find({ status: WAITLIST_STATUS.WAITING });
  let expired = 0;

  for (const candidate of waiting) {
    const requested = combineServerLocalDateTime(candidate.date, candidate.requestedStartTime);

    if (!requested || now.getTime() - requested.getTime() < expiryMs) {
      continue;
    }

    const current = await Waitlist.findById(candidate._id);

    if (!current || current.status !== WAITLIST_STATUS.WAITING) {
      continue;
    }

    const updated = await Waitlist.findOneAndUpdate(
      { _id: current._id, status: WAITLIST_STATUS.WAITING },
      { $set: { status: WAITLIST_STATUS.EXPIRED } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      continue;
    }

    publishWaitlist(REALTIME_EVENT.WAITLIST_UPDATED, updated);
    expired += 1;
  }

  return { expired };
}

function runWaitlistExpiryJob(options = {}) {
  return runJob('waitlistExpiry', () => expireStaleWaitlist(options));
}

module.exports = {
  runWaitlistExpiryJob,
};
