const cron = require('node-cron');
const logger = require('../utils/logger');
const { readJobConfig } = require('../config/env');
const { runBookingReminderJob } = require('./bookingReminder.job');
const { runWaitlistExpiryJob } = require('./waitlistExpiry.job');
const { runBookingCleanupJob } = require('./bookingCleanup.job');

const SCHEDULE = '*/5 * * * *';

const REGISTRY = Object.freeze([
  {
    name: 'bookingReminder',
    flag: 'bookingReminderEnabled',
    run: () => runBookingReminderJob(),
  },
  {
    name: 'waitlistExpiry',
    flag: 'waitlistExpiryEnabled',
    run: () => runWaitlistExpiryJob(),
  },
  {
    name: 'bookingCleanup',
    flag: 'bookingCleanupEnabled',
    run: () => runBookingCleanupJob(),
  },
]);

let tasks = [];
let schedulerStarted = false;

function startScheduler() {
  const config = readJobConfig();

  if (!config.jobsEnabled) {
    return { started: false, jobs: [] };
  }

  if (schedulerStarted) {
    return { started: false, jobs: tasks.map((entry) => entry.name), alreadyStarted: true };
  }

  logger.info('[JOB] scheduler started');
  const startedJobs = [];

  REGISTRY.forEach((job) => {
    if (!config[job.flag]) {
      return;
    }

    logger.info(`[JOB] ${job.name} started`);
    const task = cron.schedule(SCHEDULE, () => {
      job.run().catch((error) => {
        logger.error(`[JOB] ${job.name} failed: ${error.message}`);
      });
    }, {
      name: job.name,
      noOverlap: true,
    });
    task.unref();
    tasks.push({ name: job.name, task });
    startedJobs.push(job.name);
  });

  schedulerStarted = true;
  return { started: true, jobs: startedJobs };
}

async function stopScheduler() {
  const current = tasks;
  tasks = [];
  schedulerStarted = false;
  current.forEach((entry) => {
    entry.task.destroy();
  });
}

module.exports = {
  startScheduler,
  stopScheduler,
  runBookingReminderJob,
  runWaitlistExpiryJob,
  runBookingCleanupJob,
};
