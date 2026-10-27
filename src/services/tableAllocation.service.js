const availabilityService = require('./availability.service');
const { ALLOCATION_SCORE } = require('../constants/allocation');

function normalizePreference(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  return String(value).trim();
}

function normalizeTag(tag) {
  const value = normalizePreference(tag);
  return value ? value.toLowerCase() : null;
}

function preferencePoints(requested, matched, points) {
  return {
    requested: Boolean(requested),
    matched: Boolean(requested) && matched,
    points: requested && matched ? points : 0,
  };
}

function scoreTable(table, guests, preferences) {
  const capacityWaste = table.capacity - guests;
  const capacity = -(capacityWaste * ALLOCATION_SCORE.WASTED_SEAT_PENALTY);
  const location = preferencePoints(
    preferences.location,
    table.location === preferences.location,
    ALLOCATION_SCORE.LOCATION_MATCH
  );
  const shape = preferencePoints(
    preferences.shape,
    table.shape === preferences.shape,
    ALLOCATION_SCORE.SHAPE_MATCH
  );
  const tag = preferencePoints(
    preferences.tag,
    Array.isArray(table.tags) && table.tags.includes(preferences.tag),
    ALLOCATION_SCORE.TAG_MATCH
  );
  const breakdown = {
    base: ALLOCATION_SCORE.BASE,
    capacityWaste,
    capacity,
    location,
    shape,
    tag,
  };

  return {
    table,
    score: breakdown.base + breakdown.capacity + location.points + shape.points + tag.points,
    breakdown,
  };
}

function compareRecommendations(left, right) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (left.table.capacity !== right.table.capacity) {
    return left.table.capacity - right.table.capacity;
  }

  return left.table.tableNumber.localeCompare(right.table.tableNumber);
}

function presentResult(availability, preferences, recommendations) {
  return {
    available: availability.available,
    reason: availability.reason || null,
    date: availability.date,
    startTime: availability.startTime,
    endTime: availability.endTime || null,
    guests: availability.guests,
    closedReason: availability.closedReason || null,
    service: availability.service || null,
    preferences,
    recommendations,
  };
}

async function recommendTables({ date, startTime, guests, location, shape, tag }) {
  const availability = await availabilityService.getAvailability({
    date,
    startTime,
    guests,
  });
  const preferences = {
    location: normalizePreference(location),
    shape: normalizePreference(shape),
    tag: normalizeTag(tag),
  };

  if (!availability.available) {
    return presentResult(availability, preferences, []);
  }

  const recommendations = availability.tables
    .map((table) => scoreTable(table, guests, preferences))
    .sort(compareRecommendations)
    .map((recommendation, index) => ({
      rank: index + 1,
      ...recommendation,
    }));

  return presentResult(availability, preferences, recommendations);
}

module.exports = {
  recommendTables,
};
