const express = require('express');
const availabilityController = require('../controllers/availability.controller');
const validate = require('../middleware/validate');
const { availabilityValidator } = require('../validators/availability.validator');

const router = express.Router();

router.get('/', availabilityValidator, validate, availabilityController.getAvailability);

module.exports = router;
