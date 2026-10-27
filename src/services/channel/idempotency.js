const crypto = require('crypto');
const IntegrationEvent = require('../../models/IntegrationEvent');
const ApiError = require('../../utils/ApiError');
const { INTEGRATION_EVENT_STATUS } = require('../../constants/channels');

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function replayError(event) {
  throw new ApiError(
    event.httpStatus || 400,
    event.errorMessage || 'The integration request failed',
    event.errorCode || 'BAD_REQUEST'
  );
}

async function waitForEvent(idempotencyKey) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const event = await IntegrationEvent.findOne({ idempotencyKey });

    if (event && event.status === INTEGRATION_EVENT_STATUS.PROCESSED && event.result) {
      return { replayed: true, result: event.result };
    }

    if (event && event.status === INTEGRATION_EVENT_STATUS.FAILED) {
      replayError(event);
    }

    await sleep(100);
  }

  throw ApiError.duplicate('This integration request is already being processed');
}

async function runIdempotent({ idempotencyKey, source, eventType, work }) {
  const key = String(idempotencyKey || '').trim();

  if (!key || key.length > 200) {
    throw ApiError.validation([{ field: 'Idempotency-Key', message: 'Idempotency key must be between 1 and 200 characters' }]);
  }

  const existing = await IntegrationEvent.findOne({ idempotencyKey: key });
  if (existing && existing.status === INTEGRATION_EVENT_STATUS.PROCESSED && existing.result) {
    return { replayed: true, result: existing.result };
  }
  if (existing && existing.status === INTEGRATION_EVENT_STATUS.FAILED) {
    replayError(existing);
  }
  if (existing) {
    return waitForEvent(key);
  }

  let event;

  try {
    event = await IntegrationEvent.create({
      eventId: crypto.randomUUID(),
      source,
      eventType,
      status: INTEGRATION_EVENT_STATUS.RECEIVED,
      idempotencyKey: key,
      receivedAt: new Date(),
    });
  } catch (error) {
    if (error.code === 11000) {
      return waitForEvent(key);
    }
    throw error;
  }

  try {
    const result = await work();
    event.status = INTEGRATION_EVENT_STATUS.PROCESSED;
    event.processedAt = new Date();
    event.result = result;
    await event.save();
    return { replayed: false, result };
  } catch (error) {
    event.status = INTEGRATION_EVENT_STATUS.FAILED;
    event.processedAt = new Date();
    event.errorCode = error.code || 'INTERNAL_ERROR';
    event.errorMessage = String(error.message || 'Integration request failed').slice(0, 300);
    event.httpStatus = error.statusCode || 500;
    await event.save();
    throw error;
  }
}

module.exports = {
  runIdempotent,
};
