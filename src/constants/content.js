const EVENT_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
  ARCHIVED: 'ARCHIVED',
});

const EVENT_STATUSES = Object.freeze(Object.values(EVENT_STATUS));

const NEWS_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
});

const NEWS_STATUSES = Object.freeze(Object.values(NEWS_STATUS));

const PUBLIC_EVENT_SCOPE = Object.freeze({
  UPCOMING: 'upcoming',
  PAST: 'past',
  ALL: 'all',
});

const PUBLIC_EVENT_SCOPES = Object.freeze(Object.values(PUBLIC_EVENT_SCOPE));

module.exports = {
  EVENT_STATUS,
  EVENT_STATUSES,
  NEWS_STATUS,
  NEWS_STATUSES,
  PUBLIC_EVENT_SCOPE,
  PUBLIC_EVENT_SCOPES,
};
