const TABLE_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  RESERVED: 'RESERVED',
  OCCUPIED: 'OCCUPIED',
  CLEANING: 'CLEANING',
  OUT_OF_SERVICE: 'OUT_OF_SERVICE',
});

const TABLE_SHAPE = Object.freeze({
  ROUND: 'ROUND',
  SQUARE: 'SQUARE',
  RECTANGLE: 'RECTANGLE',
});

const TABLE_LOCATION = Object.freeze({
  WINDOW: 'WINDOW',
  BAR: 'BAR',
  CENTER: 'CENTER',
  PRIVATE: 'PRIVATE',
  OUTDOOR: 'OUTDOOR',
  OTHER: 'OTHER',
});

const TABLE_STATUSES = Object.freeze(Object.values(TABLE_STATUS));
const TABLE_SHAPES = Object.freeze(Object.values(TABLE_SHAPE));
const TABLE_LOCATIONS = Object.freeze(Object.values(TABLE_LOCATION));

const STRUCTURAL_TABLE_FIELDS = Object.freeze([
  'tableNumber',
  'name',
  'capacity',
  'shape',
  'location',
  'tags',
  'isActive',
]);

const OPERATIONAL_TABLE_FIELDS = Object.freeze(['notes', 'status', 'position']);

module.exports = {
  TABLE_STATUS,
  TABLE_SHAPE,
  TABLE_LOCATION,
  TABLE_STATUSES,
  TABLE_SHAPES,
  TABLE_LOCATIONS,
  STRUCTURAL_TABLE_FIELDS,
  OPERATIONAL_TABLE_FIELDS,
};
