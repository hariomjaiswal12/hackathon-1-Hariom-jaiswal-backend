const mongoose = require('mongoose');
const { CHANNELS, INTEGRATION_EVENT_STATUS, INTEGRATION_EVENT_TYPE } = require('../constants/channels');

const integrationEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
    },
    source: {
      type: String,
      required: true,
      enum: CHANNELS,
    },
    eventType: {
      type: String,
      required: true,
      enum: Object.values(INTEGRATION_EVENT_TYPE),
    },
    status: {
      type: String,
      required: true,
      enum: Object.values(INTEGRATION_EVENT_STATUS),
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      maxlength: 200,
    },
    receivedAt: {
      type: Date,
      required: true,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    errorCode: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      maxlength: 300,
      default: null,
    },
    httpStatus: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('IntegrationEvent', integrationEventSchema);
