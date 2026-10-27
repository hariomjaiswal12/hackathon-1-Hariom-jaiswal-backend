const crypto = require('crypto');
const Waitlist = require('../models/Waitlist');
const User = require('../models/User');
const availabilityService = require('./availability.service');
const ApiError = require('../utils/ApiError');
const HTTP_STATUS = require('../constants/httpStatus');
const ERROR_CODES = require('../constants/errorCodes');
const { ROLES } = require('../constants/roles');
const { AVAILABILITY_REASON } = require('../constants/availability');
const {
  BOOKING_SOURCE,
  STAFF_BOOKING_SOURCES,
  ADMIN_BOOKING_SOURCES,
} = require('../constants/bookings');
const {
  WAITLIST_STATUS,
  ACTIVE_WAITLIST_STATUSES,
  canTransitionWaitlist,
} = require('../constants/waitlist');
const { parseCalendarDate } = require('../utils/calendar');

const REFERENCE_ATTEMPTS = 5;

const BLOCKING_REASONS = new Set([
  AVAILABILITY_REASON.RESTAURANT_CLOSED,
  AVAILABILITY_REASON.SCHEDULE_NOT_CONFIGURED,
  AVAILABILITY_REASON.OUTSIDE_SERVICE_HOURS,
  AVAILABILITY_REASON.PARTY_TOO_LARGE,
]);

const BLOCKING_MESSAGES = {
  [AVAILABILITY_REASON.RESTAURANT_CLOSED]: 'The restaurant is closed on this date',
  [AVAILABILITY_REASON.SCHEDULE_NOT_CONFIGURED]: 'The restaurant has no schedule for this date',
  [AVAILABILITY_REASON.OUTSIDE_SERVICE_HOURS]: 'The requested time is outside service hours',
  [AVAILABILITY_REASON.PARTY_TOO_LARGE]: 'The party is larger than this service allows',
};

function presentWaitlist(entry) {
  const plain = entry.toObject();

  return {
    id: plain.id,
    waitlistReference: plain.waitlistReference,
    customerId: plain.customerId,
    date: plain.date,
    requestedStartTime: plain.requestedStartTime,
    guests: plain.guests,
    serviceName: plain.serviceName,
    status: plain.status,
    source: plain.source,
    notes: plain.notes,
    createdBy: plain.createdBy,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
}

function generateWaitlistReference(date) {
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `WL-${date.replace(/-/g, '')}-${suffix}`;
}

function invalidWaitlistState(message) {
  return new ApiError(
    HTTP_STATUS.CONFLICT,
    message,
    ERROR_CODES.INVALID_WAITLIST_STATE
  );
}

function duplicateWaitlist() {
  return new ApiError(
    HTTP_STATUS.CONFLICT,
    'An active waitlist entry already exists for this request',
    ERROR_CODES.WAITLIST_DUPLICATE
  );
}

function resolveSource(actor, source) {
  if (actor.role === ROLES.CUSTOMER) {
    if (source && source !== BOOKING_SOURCE.WEBSITE) {
      throw ApiError.forbidden('Customers can only create website waitlist entries');
    }

    return BOOKING_SOURCE.WEBSITE;
  }

  const allowed = actor.role === ROLES.ADMIN ? ADMIN_BOOKING_SOURCES : STAFF_BOOKING_SOURCES;
  const selected = source || (actor.role === ROLES.ADMIN ? BOOKING_SOURCE.ADMIN : BOOKING_SOURCE.STAFF);

  if (!allowed.includes(selected)) {
    throw ApiError.forbidden('This waitlist source is not allowed for your role');
  }

  return selected;
}

async function resolveCustomer(actor, customerId) {
  if (actor.role === ROLES.CUSTOMER) {
    if (customerId && String(customerId) !== String(actor.id)) {
      throw ApiError.forbidden('You cannot create a waitlist entry for another customer');
    }

    return actor.id;
  }

  if (!customerId) {
    throw ApiError.validation([{ field: 'customerId', message: 'Customer is required' }]);
  }

  const customer = await User.findById(customerId);

  if (!customer || customer.role !== ROLES.CUSTOMER) {
    throw ApiError.notFound('Customer not found');
  }

  if (!customer.isActive || customer.isBlacklisted) {
    throw ApiError.forbidden('This customer cannot be added to the waitlist');
  }

  return customer.id;
}

async function resolveRequestedService({ date, requestedStartTime, guests }) {
  const availability = await availabilityService.getAvailability({
    date,
    startTime: requestedStartTime,
    guests,
  });

  if (!availability.available && BLOCKING_REASONS.has(availability.reason)) {
    throw new ApiError(
      HTTP_STATUS.CONFLICT,
      BLOCKING_MESSAGES[availability.reason] || 'This time cannot be added to the waitlist',
      availability.reason
    );
  }

  if (!availability.service) {
    throw new ApiError(
      HTTP_STATUS.CONFLICT,
      BLOCKING_MESSAGES[availability.reason] || 'The requested time is outside service hours',
      availability.reason || AVAILABILITY_REASON.OUTSIDE_SERVICE_HOURS
    );
  }

  return {
    date: availability.date,
    requestedStartTime: availability.startTime,
    serviceName: availability.service.name,
    availability: {
      available: Boolean(availability.available),
      reason: availability.reason || null,
    },
  };
}

function isDuplicateReference(error) {
  return error.code === 11000
    && (error.keyPattern?.waitlistReference || error.keyValue?.waitlistReference);
}

function isDuplicateRequest(error) {
  return error.code === 11000 && !isDuplicateReference(error);
}

async function insertWaitlist(payload) {
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt += 1) {
    try {
      return await Waitlist.create({
        ...payload,
        waitlistReference: generateWaitlistReference(payload.date),
      });
    } catch (error) {
      if (isDuplicateRequest(error)) {
        throw duplicateWaitlist();
      }

      if (!isDuplicateReference(error)) {
        throw error;
      }
    }
  }

  throw ApiError.internal('Could not generate a waitlist reference');
}

async function createWaitlist({ actor, input }) {
  const source = resolveSource(actor, input.source);
  const customerId = await resolveCustomer(actor, input.customerId);
  const resolved = await resolveRequestedService({
    date: input.date,
    requestedStartTime: input.requestedStartTime,
    guests: input.guests,
  });

  const existing = await Waitlist.findOne({
    customerId,
    date: resolved.date,
    requestedStartTime: resolved.requestedStartTime,
    guests: input.guests,
    status: { $in: ACTIVE_WAITLIST_STATUSES },
  });

  if (existing) {
    throw duplicateWaitlist();
  }

  const entry = await insertWaitlist({
    customerId,
    date: resolved.date,
    requestedStartTime: resolved.requestedStartTime,
    guests: input.guests,
    serviceName: resolved.serviceName,
    status: WAITLIST_STATUS.WAITING,
    source,
    notes: input.notes ? String(input.notes).trim() : undefined,
    createdBy: actor.id,
  });

  return {
    entry: presentWaitlist(entry),
    availability: resolved.availability,
  };
}

function assertCanAccess(actor, entry) {
  if (actor.role === ROLES.CUSTOMER && String(entry.customerId) !== String(actor.id)) {
    throw ApiError.notFound('Waitlist entry not found');
  }
}

async function findWaitlistByReference(waitlistReference) {
  const entry = await Waitlist.findOne({
    waitlistReference: String(waitlistReference).trim().toUpperCase(),
  });

  if (!entry) {
    throw ApiError.notFound('Waitlist entry not found');
  }

  return entry;
}

async function listWaitlist({ actor, query }) {
  const filter = {};

  if (actor.role === ROLES.CUSTOMER) {
    filter.customerId = actor.id;
  }

  if (query.date) {
    const parsed = parseCalendarDate(query.date);

    if (!parsed) {
      throw ApiError.validation([
        { field: 'date', message: 'Date must be a real calendar date in YYYY-MM-DD format' },
      ]);
    }

    filter.date = parsed.iso;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.source) {
    filter.source = query.source;
  }

  const entries = await Waitlist.find(filter).sort({
    date: 1,
    requestedStartTime: 1,
    createdAt: 1,
    waitlistReference: 1,
  });

  return entries.map(presentWaitlist);
}

async function getWaitlist({ actor, waitlistReference }) {
  const entry = await findWaitlistByReference(waitlistReference);
  assertCanAccess(actor, entry);
  return presentWaitlist(entry);
}

async function transitionWaitlist({ actor, waitlistReference, toStatus, customerAllowed }) {
  if (actor.role === ROLES.CUSTOMER && !customerAllowed) {
    throw ApiError.forbidden();
  }

  const entry = await findWaitlistByReference(waitlistReference);
  assertCanAccess(actor, entry);

  if (!canTransitionWaitlist(entry.status, toStatus)) {
    throw invalidWaitlistState('This waitlist entry cannot move to that status');
  }

  const updated = await Waitlist.findOneAndUpdate(
    { _id: entry._id, status: entry.status },
    { $set: { status: toStatus } },
    { returnDocument: 'after' }
  );

  if (!updated) {
    throw invalidWaitlistState('This waitlist entry cannot move to that status');
  }

  return presentWaitlist(updated);
}

function cancelWaitlist({ actor, waitlistReference }) {
  return transitionWaitlist({
    actor,
    waitlistReference,
    toStatus: WAITLIST_STATUS.CANCELLED,
    customerAllowed: true,
  });
}

function notifyWaitlist({ actor, waitlistReference }) {
  return transitionWaitlist({
    actor,
    waitlistReference,
    toStatus: WAITLIST_STATUS.NOTIFIED,
    customerAllowed: false,
  });
}

function convertWaitlist({ actor, waitlistReference }) {
  return transitionWaitlist({
    actor,
    waitlistReference,
    toStatus: WAITLIST_STATUS.CONVERTED,
    customerAllowed: false,
  });
}

function expireWaitlist({ actor, waitlistReference }) {
  return transitionWaitlist({
    actor,
    waitlistReference,
    toStatus: WAITLIST_STATUS.EXPIRED,
    customerAllowed: false,
  });
}

module.exports = {
  createWaitlist,
  listWaitlist,
  getWaitlist,
  cancelWaitlist,
  notifyWaitlist,
  convertWaitlist,
  expireWaitlist,
};
