const env = require('../config/env');
const { getDatabaseStatus } = require('../config/db');
const APP = require('../constants/app');

function getHealth() {
  const database = getDatabaseStatus();
  const databaseReady = !database.configured || database.status === 'connected';

  return {
    status: databaseReady ? 'ok' : 'degraded',
    service: APP.SERVICE_NAME,
    version: APP.API_VERSION,
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    database,
  };
}

module.exports = {
  getHealth,
};
