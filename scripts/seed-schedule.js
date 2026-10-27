const fs = require('fs');
const path = require('path');
const env = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const scheduleService = require('../src/services/schedule.service');

async function main() {
  if (process.env.SEED_SCHEDULE !== 'yes') {
    console.error(
      'Refusing to write schedules. Edit scripts/schedule.example.json, then set SEED_SCHEDULE=yes.'
    );
    process.exit(1);
  }

  if (!env.mongodbUri) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }

  const examplePath = path.join(__dirname, 'schedule.example.json');
  const example = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
  await connectDB();

  const current = await scheduleService.getWeeklySchedule();
  const configured = current.filter((day) => day.isConfigured);

  if (configured.length > 0 && process.env.SEED_SCHEDULE_OVERWRITE !== 'yes') {
    console.error(
      'Schedules already exist. Set SEED_SCHEDULE_OVERWRITE=yes to replace the configured days.'
    );
    await disconnectDB();
    process.exit(1);
  }

  for (const day of example.days) {
    await scheduleService.saveDaySchedule(day.dayOfWeek, day);
    console.log(`Saved ${day.dayOfWeek}`);
  }

  await disconnectDB();
}

main().catch(async (error) => {
  console.error(error.message);
  try {
    await disconnectDB();
  } catch (disconnectError) {
    console.error(disconnectError.message);
  }
  process.exit(1);
});
