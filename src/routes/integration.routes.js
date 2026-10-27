const express = require('express');
const integrationController = require('../controllers/integration.controller');
const retellController = require('../controllers/retell.controller');
const whatsappController = require('../controllers/whatsapp.controller');
const { verifyIntegrationRequest } = require('../services/channel/webhook');
const validate = require('../middleware/validate');
const {
  createIntegrationBookingValidator,
  availabilityValidator,
  cancelValidator,
  rescheduleValidator,
} = require('../validators/integration.validator');

const router = express.Router();

router.get('/whatsapp/webhook', whatsappController.verify);
router.post('/whatsapp/webhook', whatsappController.receive);
router.post('/retell/webhook', retellController.receive);

router.use(verifyIntegrationRequest);

router.post('/availability', availabilityValidator, validate, integrationController.checkAvailability);
router.post('/bookings', createIntegrationBookingValidator, validate, integrationController.createBooking);
router.post(
  '/bookings/:reference/cancel',
  cancelValidator,
  validate,
  integrationController.cancelBooking
);
router.post(
  '/bookings/:reference/reschedule',
  rescheduleValidator,
  validate,
  integrationController.rescheduleBooking
);

module.exports = router;
