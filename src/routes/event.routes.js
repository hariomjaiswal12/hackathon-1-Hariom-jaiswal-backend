const express = require('express');
const eventController = require('../controllers/event.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { ROLES } = require('../constants/roles');
const {
  createEventValidator,
  updateEventValidator,
  eventIdValidator,
  listAdminEventsValidator,
  listPublicEventsValidator,
  publicSlugValidator,
} = require('../validators/event.validator');

const adminRouter = express.Router();
adminRouter.use(authenticate, authorize(ROLES.ADMIN));
adminRouter.post('/', createEventValidator, validate, eventController.createEvent);
adminRouter.get('/', listAdminEventsValidator, validate, eventController.listAdminEvents);
adminRouter.get('/:id', eventIdValidator, validate, eventController.getAdminEvent);
adminRouter.patch('/:id', updateEventValidator, validate, eventController.updateEvent);
adminRouter.delete('/:id', eventIdValidator, validate, eventController.archiveEvent);

const publicRouter = express.Router();
publicRouter.get('/', listPublicEventsValidator, validate, eventController.listPublicEvents);
publicRouter.get('/:slug', publicSlugValidator, validate, eventController.getPublicEvent);

module.exports = {
  adminRouter,
  publicRouter,
};
