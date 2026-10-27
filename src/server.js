const http = require('http');
const app = require('./app');
const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const { initializeRealtime, closeRealtime } = require('./services/realtime.service');
const { startScheduler, stopScheduler } = require('./jobs');
const { integrationView } = require('./services/integrations/providerConfig');
const logger = require('./utils/logger');
const APP = require('./constants/app');

async function start() {
  try {
    env.validateEnv();
  } catch (envError) {
    logger.error(envError.message);
    process.exit(1);
  }

  if (!env.jwtSecret) {
    logger.warn(
      'JWT_SECRET is not set. Authentication routes cannot issue tokens until it is configured.'
    );
  }

  try {
    await connectDB();
  } catch (error) {
    logger.error(`Startup aborted: ${error.message}`);
    try {
      await disconnectDB();
    } catch (disconnectError) {
      logger.error(`Error while disconnecting MongoDB: ${disconnectError.message}`);
    }
    process.exit(1);
  }

  const server = http.createServer(app);
  initializeRealtime(server);

  server.on('error', (error) => {
    logger.error(`Server failed to start: ${error.message}`);
    process.exit(1);
  });

  server.listen(env.port, () => {
    logger.info(
      `${APP.SERVICE_NAME} listening on port ${env.port} (${env.nodeEnv})`
    );
    logger.info(`Health check: http://localhost:${env.port}${APP.API_PREFIX}/health`);
    try {
      const flags = env.describeStartupConfiguration();
      const channels = integrationView(env);
      const channelState = (name) => {
        const match = channels.channels.find((item) => item.channel === name);
        return match ? match.status : 'not_configured';
      };
      logger.info(
        `Configuration: scheduler=${flags.scheduler} reminder=${flags.bookingReminder} waitlistExpiry=${flags.waitlistExpiry} cleanup=${flags.bookingCleanup} deposits=${flags.deposits} payments=${flags.payments} phone=${channelState('phone')} whatsapp=${channelState('whatsapp')} retell=${channelState('retell')}`
      );
    } catch (configError) {
      logger.info(`Configuration summary unavailable: ${configError.message}`);
    }

    try {
      startScheduler();
    } catch (error) {
      logger.error(`[JOB] scheduler failed to start: ${error.message}`);
    }
  });

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info(`${signal} received. Initiating graceful shutdown.`);

    // 1. Stop scheduler jobs
    try {
      await stopScheduler();
    } catch (error) {
      logger.error(`[JOB] scheduler failed to stop: ${error.message}`);
    }

    // 2. Close Socket.io realtime connections
    try {
      closeRealtime();
    } catch (error) {
      logger.error(`Error while closing realtime server: ${error.message}`);
    }

    // 3. Stop accepting new HTTP requests and close server when in-flight finish
    server.close(async () => {
      // 4. Close MongoDB connection
      try {
        await disconnectDB();
      } catch (error) {
        logger.error(`Error while disconnecting MongoDB: ${error.message}`);
      }
      // 5. Exit cleanly
      logger.info('Graceful shutdown completed successfully.');
      process.exit(0);
    });

    // 6. Force termination if in-flight requests hang past timeout
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  }

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
}

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.error(`Unhandled rejection: ${message}`);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

start();
