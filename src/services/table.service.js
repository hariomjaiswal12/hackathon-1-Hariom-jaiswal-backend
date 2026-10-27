const Table = require('../models/Table');
const ApiError = require('../utils/ApiError');
const HTTP_STATUS = require('../constants/httpStatus');
const ERROR_CODES = require('../constants/errorCodes');
const { ROLES } = require('../constants/roles');
const {
  TABLE_STATUS,
  TABLE_STATUSES,
  STRUCTURAL_TABLE_FIELDS,
} = require('../constants/tables');

function normalizeTableNumber(tableNumber) {
  return String(tableNumber).trim().toUpperCase();
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return [...new Set(tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))];
}

function normalizePosition(position) {
  return {
    x: Number(position.x),
    y: Number(position.y),
    rotation: Number(position.rotation),
  };
}

function assertStaffMayUpdate(input, actorRole) {
  if (actorRole !== ROLES.STAFF) {
    return;
  }

  const structuralChanges = STRUCTURAL_TABLE_FIELDS.filter(
    (field) => input[field] !== undefined
  );

  if (structuralChanges.length > 0) {
    throw ApiError.forbidden(
      'Staff can update notes, status, and floor position only'
    );
  }
}

async function saveTable(table) {
  try {
    await table.save();
  } catch (error) {
    if (error.code === 11000) {
      throw ApiError.duplicate('A table with this table number already exists');
    }

    throw error;
  }

  return table.toObject();
}

async function getTableDocument(id) {
  const table = await Table.findById(id);

  if (!table) {
    throw ApiError.notFound('Table not found');
  }

  return table;
}

function buildListFilter(query) {
  const filter = {};

  if (query.status) {
    filter.status = query.status;
  }

  if (query.capacity !== undefined) {
    filter.capacity = Number(query.capacity);
  }

  if (query.location) {
    filter.location = query.location;
  }

  if (query.tag) {
    filter.tags = String(query.tag).trim().toLowerCase();
  }

  if (query.isActive === 'false') {
    filter.isActive = false;
  } else if (query.isActive === 'true' || query.isActive === undefined) {
    filter.isActive = true;
  }

  return filter;
}

async function createTable(input) {
  try {
    const table = await Table.create({
      tableNumber: normalizeTableNumber(input.tableNumber),
      name: input.name ? String(input.name).trim() : undefined,
      capacity: input.capacity,
      status: TABLE_STATUS.AVAILABLE,
      shape: input.shape,
      location: input.location,
      tags: normalizeTags(input.tags),
      position: normalizePosition(input.position),
      isActive: true,
      notes: input.notes ? String(input.notes).trim() : undefined,
    });

    return table.toObject();
  } catch (error) {
    if (error.code === 11000) {
      throw ApiError.duplicate('A table with this table number already exists');
    }

    throw error;
  }
}

async function listTables(query) {
  const tables = await Table.find(buildListFilter(query)).sort({ tableNumber: 1 });
  return tables.map((table) => table.toObject());
}

async function getFloorPlan() {
  const tables = await Table.find({ isActive: true }).sort({ tableNumber: 1 });
  return tables.map((table) => table.toFloorObject());
}

async function getTableById(id) {
  const table = await getTableDocument(id);
  return table.toObject();
}

async function updateTable(id, input, actorRole) {
  assertStaffMayUpdate(input, actorRole);

  if (input.status !== undefined && !TABLE_STATUSES.includes(input.status)) {
    throw ApiError.validation([{ field: 'status', message: 'Status is not valid' }]);
  }

  const table = await getTableDocument(id);

  if (input.tableNumber !== undefined) {
    table.tableNumber = normalizeTableNumber(input.tableNumber);
  }

  if (input.name !== undefined) {
    table.name = String(input.name).trim();
  }

  if (input.capacity !== undefined) {
    table.capacity = input.capacity;
  }

  if (input.shape !== undefined) {
    table.shape = input.shape;
  }

  if (input.location !== undefined) {
    table.location = input.location;
  }

  if (input.tags !== undefined) {
    table.tags = normalizeTags(input.tags);
  }

  if (input.position !== undefined) {
    table.position = normalizePosition(input.position);
  }

  if (input.notes !== undefined) {
    table.notes = String(input.notes).trim();
  }

  if (input.status !== undefined) {
    table.status = input.status;
  }

  if (input.isActive !== undefined) {
    table.isActive = input.isActive;
  }

  return saveTable(table);
}

async function updateTableStatus(id, status) {
  if (!TABLE_STATUSES.includes(status)) {
    throw ApiError.validation([{ field: 'status', message: 'Status is not valid' }]);
  }

  const table = await getTableDocument(id);
  table.status = status;
  return saveTable(table);
}

async function updateTablePosition(id, position) {
  const table = await getTableDocument(id);
  table.position = normalizePosition(position);
  return saveTable(table);
}

async function deactivateTable(id) {
  const table = await getTableDocument(id);

  if (!table.isActive) {
    throw new ApiError(
      HTTP_STATUS.BAD_REQUEST,
      'Table is already deactivated',
      ERROR_CODES.BAD_REQUEST
    );
  }

  table.isActive = false;
  return saveTable(table);
}

module.exports = {
  createTable,
  listTables,
  getFloorPlan,
  getTableById,
  updateTable,
  updateTableStatus,
  updateTablePosition,
  deactivateTable,
};
