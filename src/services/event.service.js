const Event = require('../models/Event');
const ApiError = require('../utils/ApiError');
const { EVENT_STATUS } = require('../constants/content');
const { slugify, normalizeImageUrl, assertEventSchedule, todayIso } = require('../utils/content');

function presentEvent(event, { includeAdmin = false } = {}) {
  const plain = event.toObject ? event.toObject() : event;
  const publicEvent = {
    id: String(plain.id || plain._id),
    title: plain.title,
    slug: plain.slug,
    description: plain.description,
    shortDescription: plain.shortDescription || '',
    imageUrl: plain.imageUrl || null,
    location: plain.location,
    startDate: plain.startDate,
    endDate: plain.endDate,
    startTime: plain.startTime,
    endTime: plain.endTime || null,
    status: plain.status,
    isPublished: Boolean(plain.isPublished),
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };

  if (!includeAdmin) {
    return publicEvent;
  }

  return {
    ...publicEvent,
    createdBy: plain.createdBy ? String(plain.createdBy) : null,
    archivedAt: plain.archivedAt || null,
  };
}

async function reserveSlug(requested, title, ignoreId) {
  const base = slugify(requested || title);

  if (!base) {
    throw ApiError.validation([{ field: 'slug', message: 'Slug must contain letters or numbers' }]);
  }

  const filter = { slug: base };
  if (ignoreId) {
    filter._id = { $ne: ignoreId };
  }

  const existing = await Event.exists(filter);

  if (existing) {
    throw ApiError.duplicate('An event with this slug already exists');
  }

  return base;
}

function applyStatus(event, status) {
  event.status = status;
  event.isPublished = status === EVENT_STATUS.PUBLISHED;
  event.archivedAt = status === EVENT_STATUS.ARCHIVED ? event.archivedAt || new Date() : null;
}

async function createEvent({ actor, input }) {
  const schedule = assertEventSchedule(input);
  const status = input.status || EVENT_STATUS.DRAFT;
  const event = new Event({
    title: String(input.title).trim(),
    slug: await reserveSlug(input.slug, input.title),
    description: String(input.description).trim(),
    shortDescription: input.shortDescription ? String(input.shortDescription).trim() : '',
    imageUrl: normalizeImageUrl(input.imageUrl) || null,
    location: String(input.location).trim(),
    ...schedule,
    createdBy: actor.id,
  });
  applyStatus(event, status);
  await event.save();
  return presentEvent(event, { includeAdmin: true });
}

async function listAdminEvents({ status }) {
  const filter = {};
  if (status) filter.status = status;
  const events = await Event.find(filter).sort({ startDate: 1, startTime: 1, title: 1 });
  return events.map((event) => presentEvent(event, { includeAdmin: true }));
}

async function getAdminEvent(id) {
  const event = await Event.findById(id);
  if (!event) throw ApiError.notFound('Event not found');
  return presentEvent(event, { includeAdmin: true });
}

async function updateEvent({ id, input }) {
  const event = await Event.findById(id);
  if (!event) throw ApiError.notFound('Event not found');

  if (input.title !== undefined) event.title = String(input.title).trim();
  if (input.description !== undefined) event.description = String(input.description).trim();
  if (input.shortDescription !== undefined) event.shortDescription = String(input.shortDescription || '').trim();
  if (input.location !== undefined) event.location = String(input.location).trim();
  if (input.imageUrl !== undefined) event.imageUrl = normalizeImageUrl(input.imageUrl);
  if (input.slug !== undefined) event.slug = await reserveSlug(input.slug, event.title, event._id);

  const schedule = assertEventSchedule({
    startDate: input.startDate === undefined ? event.startDate : input.startDate,
    endDate: input.endDate === undefined ? event.endDate : input.endDate,
    startTime: input.startTime === undefined ? event.startTime : input.startTime,
    endTime: input.endTime === undefined ? event.endTime : input.endTime,
  });
  event.startDate = schedule.startDate;
  event.endDate = schedule.endDate;
  event.startTime = schedule.startTime;
  event.endTime = schedule.endTime;
  if (input.status !== undefined) applyStatus(event, input.status);

  await event.save();
  return presentEvent(event, { includeAdmin: true });
}

async function archiveEvent(id) {
  const event = await Event.findById(id);
  if (!event) throw ApiError.notFound('Event not found');
  applyStatus(event, EVENT_STATUS.ARCHIVED);
  await event.save();
  return presentEvent(event, { includeAdmin: true });
}

async function listPublicEvents({ scope = 'upcoming', date }) {
  const filter = { status: EVENT_STATUS.PUBLISHED, isPublished: true };
  const today = todayIso();

  if (date) {
    filter.startDate = date;
  } else if (scope === 'past') {
    filter.endDate = { $lt: today };
  } else if (scope !== 'all') {
    filter.endDate = { $gte: today };
  }

  const sort = scope === 'past'
    ? { startDate: -1, startTime: -1 }
    : { startDate: 1, startTime: 1 };
  const events = await Event.find(filter).sort(sort);
  return events.map((event) => presentEvent(event));
}

async function getPublicEvent(slug) {
  const event = await Event.findOne({
    slug: slugify(slug),
    status: EVENT_STATUS.PUBLISHED,
    isPublished: true,
  });

  if (!event) throw ApiError.notFound('Event not found');
  return presentEvent(event);
}

module.exports = {
  presentEvent,
  createEvent,
  listAdminEvents,
  getAdminEvent,
  updateEvent,
  archiveEvent,
  listPublicEvents,
  getPublicEvent,
};
