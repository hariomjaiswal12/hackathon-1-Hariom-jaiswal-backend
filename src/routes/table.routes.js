const express = require('express');
const tableController = require('../controllers/table.controller');
const allocationController = require('../controllers/allocation.controller');
const liveFloorController = require('../controllers/liveFloor.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../constants/roles');
const {
  tableIdValidator,
  createTableValidator,
  updateTableValidator,
  updateStatusValidator,
  updatePositionValidator,
  listTablesValidator,
} = require('../validators/table.validator');
const { allocationValidator } = require('../validators/allocation.validator');

const router = express.Router();

const managers = authorize(ROLES.ADMIN, ROLES.STAFF);
const admins = authorize(ROLES.ADMIN);

router.get('/', listTablesValidator, validate, tableController.listTables);
router.get('/floor', tableController.getFloor);
router.get('/floor/live', authenticate, managers, liveFloorController.getLiveFloor);
router.get(
  '/recommendation',
  allocationValidator,
  validate,
  allocationController.getRecommendation
);
router.get('/:id', tableIdValidator, validate, tableController.getTable);

router.post(
  '/',
  authenticate,
  admins,
  createTableValidator,
  validate,
  tableController.createTable
);

router.patch(
  '/:id/status',
  authenticate,
  managers,
  tableIdValidator,
  updateStatusValidator,
  validate,
  tableController.updateTableStatus
);

router.patch(
  '/:id/position',
  authenticate,
  managers,
  tableIdValidator,
  updatePositionValidator,
  validate,
  tableController.updateTablePosition
);

router.patch(
  '/:id',
  authenticate,
  managers,
  tableIdValidator,
  updateTableValidator,
  validate,
  tableController.updateTable
);

router.delete(
  '/:id',
  authenticate,
  admins,
  tableIdValidator,
  validate,
  tableController.deactivateTable
);

module.exports = router;
