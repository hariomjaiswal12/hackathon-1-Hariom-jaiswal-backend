const env = require('../src/config/env');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/models/User');
const Table = require('../src/models/Table');
const Schedule = require('../src/models/Schedule');
const ClosedDay = require('../src/models/ClosedDay');
const { ROLES } = require('../src/constants/roles');
const { TABLE_STATUS, TABLE_SHAPE, TABLE_LOCATION } = require('../src/constants/tables');

async function seed() {
  await connectDB();
  console.log('Connected to MongoDB. Starting database seed...');

  // 1. Seed Users (Admin, Staff, Customer)
  const users = [
    {
      name: 'Admin Txotx',
      email: 'admin@iturrieta.eus',
      password: 'Admin12345!',
      role: ROLES.ADMIN,
      phone: '+34 685 72 15 90',
    },
    {
      name: 'Staff Iturrieta',
      email: 'staff@iturrieta.eus',
      password: 'Staff12345!',
      role: ROLES.STAFF,
      phone: '+34 685 72 15 91',
    },
    {
      name: 'Amaia Agirre',
      email: 'amaia@iturrieta.eus',
      password: 'Customer12345!',
      role: ROLES.CUSTOMER,
      phone: '+34 685 72 15 92',
    },
  ];

  for (const u of users) {
    const existing = await User.findOne({ email: u.email });
    if (!existing) {
      await User.create(u);
      console.log(`Created user: ${u.email} (${u.role})`);
    } else {
      console.log(`User already exists: ${u.email}`);
    }
  }

  // 2. Seed Weekly Schedules (Thu-Sun open for Lunch, Sat open for Lunch & Dinner)
  const weeklySchedules = [
    { dayOfWeek: 'MONDAY', isOpen: false, services: [] },
    { dayOfWeek: 'TUESDAY', isOpen: false, services: [] },
    { dayOfWeek: 'WEDNESDAY', isOpen: false, services: [] },
    {
      dayOfWeek: 'THURSDAY',
      isOpen: true,
      services: [
        {
          name: 'LUNCH',
          startTime: '13:00',
          endTime: '16:00',
          lastBookingTime: '14:30',
          bookingDurationMinutes: 90,
          maxGuestsPerBooking: 12,
        },
      ],
    },
    {
      dayOfWeek: 'FRIDAY',
      isOpen: true,
      services: [
        {
          name: 'LUNCH',
          startTime: '13:00',
          endTime: '16:00',
          lastBookingTime: '14:30',
          bookingDurationMinutes: 90,
          maxGuestsPerBooking: 12,
        },
      ],
    },
    {
      dayOfWeek: 'SATURDAY',
      isOpen: true,
      services: [
        {
          name: 'LUNCH',
          startTime: '13:00',
          endTime: '16:00',
          lastBookingTime: '14:30',
          bookingDurationMinutes: 90,
          maxGuestsPerBooking: 12,
        },
        {
          name: 'DINNER',
          startTime: '20:00',
          endTime: '23:00',
          lastBookingTime: '21:30',
          bookingDurationMinutes: 90,
          maxGuestsPerBooking: 12,
        },
      ],
    },
    {
      dayOfWeek: 'SUNDAY',
      isOpen: true,
      services: [
        {
          name: 'LUNCH',
          startTime: '13:00',
          endTime: '16:00',
          lastBookingTime: '14:30',
          bookingDurationMinutes: 90,
          maxGuestsPerBooking: 12,
        },
      ],
    },
  ];

  for (const s of weeklySchedules) {
    await Schedule.findOneAndUpdate(
      { dayOfWeek: s.dayOfWeek },
      { $set: s },
      { upsert: true, new: true }
    );
    console.log(`Configured schedule for ${s.dayOfWeek}`);
  }

  // 3. Seed Closed Day
  const christmas = { date: '2026-12-25', reason: 'Christmas Holiday', isActive: true };
  await ClosedDay.findOneAndUpdate(
    { date: christmas.date },
    { $set: christmas },
    { upsert: true, new: true }
  );

  // 4. Seed Tables
  const defaultTables = [
    {
      tableNumber: 'T01',
      name: 'Window table one',
      capacity: 2,
      shape: TABLE_SHAPE.ROUND,
      location: TABLE_LOCATION.WINDOW,
      tags: ['window', 'quiet', 'romantic'],
      notes: 'Front valley view',
      position: { x: 75, y: 70, rotation: 0 },
      status: TABLE_STATUS.AVAILABLE,
      isActive: true,
    },
    {
      tableNumber: 'T02',
      name: 'Window table two',
      capacity: 4,
      shape: TABLE_SHAPE.ROUND,
      location: TABLE_LOCATION.WINDOW,
      tags: ['window', 'view'],
      notes: 'Natural morning light',
      position: { x: 200, y: 70, rotation: 0 },
      status: TABLE_STATUS.AVAILABLE,
      isActive: true,
    },
    {
      tableNumber: 'T03',
      name: 'Center four',
      capacity: 4,
      shape: TABLE_SHAPE.SQUARE,
      location: TABLE_LOCATION.CENTER,
      tags: ['hearth', 'central'],
      notes: 'Near the cider kupelas',
      position: { x: 90, y: 190, rotation: 0 },
      status: TABLE_STATUS.AVAILABLE,
      isActive: true,
    },
    {
      tableNumber: 'T04',
      name: 'Center grand',
      capacity: 6,
      shape: TABLE_SHAPE.RECTANGLE,
      location: TABLE_LOCATION.CENTER,
      tags: ['groups', 'central'],
      notes: 'Oak wood table for family feasts',
      position: { x: 240, y: 190, rotation: 0 },
      status: TABLE_STATUS.AVAILABLE,
      isActive: true,
    },
    {
      tableNumber: 'T05',
      name: 'Window corner',
      capacity: 2,
      shape: TABLE_SHAPE.ROUND,
      location: TABLE_LOCATION.WINDOW,
      tags: ['window', 'quiet'],
      notes: 'Orchard hillside perspective',
      position: { x: 380, y: 70, rotation: 0 },
      status: TABLE_STATUS.AVAILABLE,
      isActive: true,
    },
    {
      tableNumber: 'T06',
      name: 'Private txoko',
      capacity: 8,
      shape: TABLE_SHAPE.RECTANGLE,
      location: TABLE_LOCATION.PRIVATE,
      tags: ['private', 'celebration', 'large'],
      notes: 'Private room with private kupela access',
      position: { x: 420, y: 190, rotation: 0 },
      status: TABLE_STATUS.AVAILABLE,
      isActive: true,
    },
    {
      tableNumber: 'T08',
      name: 'Orchard view eight',
      capacity: 2,
      shape: TABLE_SHAPE.ROUND,
      location: TABLE_LOCATION.WINDOW,
      tags: ['window', 'cozy'],
      notes: 'Quiet window seat',
      position: { x: 70, y: 310, rotation: 0 },
      status: TABLE_STATUS.AVAILABLE,
      isActive: true,
    },
    {
      tableNumber: 'T09',
      name: 'Harvest table nine',
      capacity: 4,
      shape: TABLE_SHAPE.SQUARE,
      location: TABLE_LOCATION.CENTER,
      tags: ['classic'],
      notes: 'Solid chestnut wood',
      position: { x: 190, y: 310, rotation: 0 },
      status: TABLE_STATUS.AVAILABLE,
      isActive: true,
    },
    {
      tableNumber: 'T10',
      name: 'Garden side ten',
      capacity: 4,
      shape: TABLE_SHAPE.SQUARE,
      location: TABLE_LOCATION.CENTER,
      tags: ['classic'],
      notes: 'Central hall dining',
      position: { x: 320, y: 310, rotation: 0 },
      status: TABLE_STATUS.AVAILABLE,
      isActive: true,
    },
    {
      tableNumber: 'T11',
      name: 'Pergola eleven',
      capacity: 4,
      shape: TABLE_SHAPE.SQUARE,
      location: TABLE_LOCATION.WINDOW,
      tags: ['window', 'bright'],
      notes: 'Panoramic glass wall',
      position: { x: 450, y: 310, rotation: 0 },
      status: TABLE_STATUS.AVAILABLE,
      isActive: true,
    },
    {
      tableNumber: 'T12',
      name: 'Bar high-top twelve',
      capacity: 2,
      shape: TABLE_SHAPE.ROUND,
      location: TABLE_LOCATION.BAR,
      tags: ['bar', 'quick', 'drinks'],
      notes: 'Beside the cider tasting counter',
      position: { x: 550, y: 100, rotation: 0 },
      status: TABLE_STATUS.AVAILABLE,
      isActive: true,
    },
    {
      tableNumber: 'T14',
      name: 'Terrace fourteen',
      capacity: 4,
      shape: TABLE_SHAPE.RECTANGLE,
      location: TABLE_LOCATION.OUTDOOR,
      tags: ['outdoor', 'fresh-air'],
      notes: 'Sheltered outdoor patio',
      position: { x: 550, y: 250, rotation: 0 },
      status: TABLE_STATUS.AVAILABLE,
      isActive: true,
    },
  ];

  for (const t of defaultTables) {
    await Table.findOneAndUpdate(
      { tableNumber: t.tableNumber },
      { $set: t },
      { upsert: true, new: true }
    );
    console.log(`Configured table ${t.tableNumber} (cap ${t.capacity})`);
  }

  console.log('Database seeding successfully completed.');
  await disconnectDB();
}

seed().catch(async (err) => {
  console.error('Seed error:', err);
  await disconnectDB();
  process.exit(1);
});
