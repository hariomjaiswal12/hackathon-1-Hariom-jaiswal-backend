const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

const READY_STATE = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

mongoose.set('strictQuery', true);

function getDatabaseStatus() {
  return {
    configured: Boolean(env.mongodbUri),
    status: READY_STATE[mongoose.connection.readyState] || 'unknown',
  };
}

function registerConnectionLogs() {
  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connection established');
  });

  mongoose.connection.on('error', (error) => {
    logger.error(`MongoDB connection error: ${error.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
}

async function connectDB() {
  if (!env.mongodbUri) {
    logger.warn(
      'MONGODB_URI is not set. API will start without a database connection.'
    );
    return;
  }

  registerConnectionLogs();

  try {
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 5000,
    });
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
    throw error;
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
}

module.exports = {
  connectDB,
  disconnectDB,
  getDatabaseStatus,
};
