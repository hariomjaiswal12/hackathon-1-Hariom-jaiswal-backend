const logger = require('../utils/logger');
const { readJobConfig } = require('../config/env');

const JOBS = Object.freeze([
  { name: 'bookingReminder', enabledFlag: 'bookingReminderEnabled' },
  { name: 'waitlistExpiry', enabledFlag: 'waitlistExpiryEnabled' },
  { name: 'bookingCleanup', enabledFlag: 'bookingCleanupEnabled' },
]);

const runs = new Map();

function blankRun() {
  return {
    running: false,
    lastRunAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastDurationMs: null,
    startedAt: null,
  };
}

function stateFor(name) {
  if (!runs.has(name)) {
    runs.set(name, blankRun());
  }

  return runs.get(name);
}

function beginJob(name) {
  const state = stateFor(name);

  if (state.running) {
    logger.info('[JOB] skipped because previous execution is still running');
    return false;
  }

  state.running = true;
  state.lastRunAt = new Date();
  state.startedAt = Date.now();
  return true;
}

function succeedJob(name) {
  stateFor(name).lastSuccessAt = new Date();
}

function failJob(name) {
  stateFor(name).lastFailureAt = new Date();
}

function finishJob(name) {
  const state = stateFor(name);
  state.lastDurationMs = state.startedAt ? Date.now() - state.startedAt : null;
  state.running = false;
}

async function runJob(name, work) {
  if (!beginJob(name)) {
    return { name, skipped: true };
  }

  try {
    const result = await work();
    succeedJob(name);
    return { name, skipped: false, result };
  } catch (error) {
    failJob(name);
    logger.error(`[JOB] ${name} failed: ${error.message}`);
    return { name, skipped: false, failed: true };
  } finally {
    finishJob(name);
  }
}

function stamp(value) {
  return value ? new Date(value).toISOString() : null;
}

const JOB_ENV = Object.freeze({
  bookingReminder: 'BOOKING_REMINDER_ENABLED',
  waitlistExpiry: 'WAITLIST_EXPIRY_ENABLED',
  bookingCleanup: 'BOOKING_CLEANUP_ENABLED',
});

function configurationState(name) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') {
    return 'NOT_CONFIGURED';
  }
  if (String(raw).trim() === 'true') {
    return 'ENABLED';
  }
  return 'DISABLED';
}

function getJobStatus() {
  const config = readJobConfig();

  return {
    jobsEnabled: config.jobsEnabled,
    scheduler: configurationState('JOBS_ENABLED'),
    schedule: '*/5 * * * *',
    intervalMinutes: 5,
    reminderWindowMinutes: config.bookingReminderMinutes,
    expiryWindowHours: config.waitlistExpiryHours,
    jobs: JOBS.map((job) => {
      const state = stateFor(job.name);
      return {
        name: job.name,
        configuration: configurationState(JOB_ENV[job.name]),
        enabled: config.jobsEnabled && config[job.enabledFlag],
        running: state.running,
        lastRunAt: stamp(state.lastRunAt),
        lastSuccessAt: stamp(state.lastSuccessAt),
        lastFailureAt: stamp(state.lastFailureAt),
      };
    }),
  };
}

module.exports = {
  JOBS,
  runJob,
  getJobStatus,
};
