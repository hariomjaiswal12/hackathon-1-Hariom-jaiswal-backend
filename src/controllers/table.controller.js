const asyncHandler = require('../utils/asyncHandler');
const ApiResponse = require('../utils/ApiResponse');
const tableService = require('../services/table.service');
const { publishTableUpdated } = require('../services/realtime.service');

const listTables = asyncHandler(async (req, res) => {
  const tables = await tableService.listTables(req.query);
  return ApiResponse.ok(res, 'Tables retrieved', { tables });
});

const getFloor = asyncHandler(async (req, res) => {
  const tables = await tableService.getFloorPlan();
  return ApiResponse.ok(res, 'Floor plan retrieved', { tables });
});

const getTable = asyncHandler(async (req, res) => {
  const table = await tableService.getTableById(req.params.id);
  return ApiResponse.ok(res, 'Table retrieved', { table });
});

const createTable = asyncHandler(async (req, res) => {
  const table = await tableService.createTable({
    tableNumber: req.body.tableNumber,
    name: req.body.name,
    capacity: req.body.capacity,
    shape: req.body.shape,
    location: req.body.location,
    tags: req.body.tags,
    position: req.body.position,
    notes: req.body.notes,
  });

  publishTableUpdated(table);
  return ApiResponse.created(res, 'Table created', { table });
});

const updateTable = asyncHandler(async (req, res) => {
  const table = await tableService.updateTable(req.params.id, req.body, req.user.role);
  publishTableUpdated(table);
  return ApiResponse.ok(res, 'Table updated', { table });
});

const updateTableStatus = asyncHandler(async (req, res) => {
  const table = await tableService.updateTableStatus(req.params.id, req.body.status);
  publishTableUpdated(table);
  return ApiResponse.ok(res, 'Table status updated', { table });
});

const updateTablePosition = asyncHandler(async (req, res) => {
  const table = await tableService.updateTablePosition(req.params.id, {
    x: req.body.x,
    y: req.body.y,
    rotation: req.body.rotation,
  });

  publishTableUpdated(table);
  return ApiResponse.ok(res, 'Table position updated', { table });
});

const deactivateTable = asyncHandler(async (req, res) => {
  const table = await tableService.deactivateTable(req.params.id);
  publishTableUpdated(table);
  return ApiResponse.ok(res, 'Table deactivated', { table });
});

module.exports = {
  listTables,
  getFloor,
  getTable,
  createTable,
  updateTable,
  updateTableStatus,
  updateTablePosition,
  deactivateTable,
};
