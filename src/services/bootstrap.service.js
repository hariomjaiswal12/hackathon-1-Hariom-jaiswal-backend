const crypto = require('crypto');
const User = require('../models/User');
const Schedule = require('../models/Schedule');
const Table = require('../models/Table');
const Booking = require('../models/Booking');
const Waitlist = require('../models/Waitlist');
const Notification = require('../models/Notification');
const Event = require('../models/Event');
const News = require('../models/News');
const Payment = require('../models/Payment');
const DepositConfig = require('../models/DepositConfig');

const { ROLES } = require('../constants/roles');
const { BOOKING_STATUS, BOOKING_HISTORY_ACTION, BOOKING_SOURCE } = require('../constants/bookings');
const { WAITLIST_STATUS } = require('../constants/waitlist');
const { NOTIFICATION_TYPE, NOTIFICATION_STATUS, NOTIFICATION_CHANNEL } = require('../constants/notifications');
const { TABLE_STATUS, TABLE_SHAPE, TABLE_LOCATION } = require('../constants/tables');
const { EVENT_STATUS, NEWS_STATUS } = require('../constants/content');
const {
  PAYMENT_STATUS,
  PAYMENT_TYPE,
  PAYMENT_PROVIDER,
  DEPOSIT_TYPE,
  DEPOSIT_STATUS,
} = require('../constants/payments');
const logger = require('../utils/logger');

const DEMO_PASSWORD = 'DemoPassword123!';

const CORE_USERS = [
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

const DEMO_CUSTOMERS = [
  { name: 'Iker Etxeberria', email: 'iker.etxeberria@iturrieta.eus', phone: '+34 685 10 20 01' },
  { name: 'Ane Mendizabal', email: 'ane.mendizabal@iturrieta.eus', phone: '+34 685 10 20 02' },
  { name: 'Jon Aranburu', email: 'jon.aranburu@iturrieta.eus', phone: '+34 685 10 20 03' },
  { name: 'Maialen Urrutia', email: 'maialen.urrutia@iturrieta.eus', phone: '+34 685 10 20 04' },
  { name: 'Unai Goikoetxea', email: 'unai.goikoetxea@iturrieta.eus', phone: '+34 685 10 20 05' },
  { name: 'Nerea Salazar', email: 'nerea.salazar@iturrieta.eus', phone: '+34 685 10 20 06' },
  { name: 'Mikel Zubia', email: 'mikel.zubia@iturrieta.eus', phone: '+34 685 10 20 07' },
  { name: 'Leire Otxoa', email: 'leire.otxoa@iturrieta.eus', phone: '+34 685 10 20 08' },
  { name: 'Aitor Elorza', email: 'aitor.elorza@iturrieta.eus', phone: '+34 685 10 20 09' },
  { name: 'June Arregi', email: 'june.arregi@iturrieta.eus', phone: '+34 685 10 20 10' },
];

const WEEKLY_SCHEDULES = [
  { dayOfWeek: 'MONDAY', isOpen: false, services: [] },
  {
    dayOfWeek: 'TUESDAY',
    isOpen: true,
    services: [
      { name: 'LUNCH', startTime: '13:00', endTime: '16:00', lastBookingTime: '14:30', bookingDurationMinutes: 90, maxGuestsPerBooking: 12 },
      { name: 'DINNER', startTime: '20:00', endTime: '23:00', lastBookingTime: '21:30', bookingDurationMinutes: 90, maxGuestsPerBooking: 12 },
    ],
  },
  {
    dayOfWeek: 'WEDNESDAY',
    isOpen: true,
    services: [
      { name: 'LUNCH', startTime: '13:00', endTime: '16:00', lastBookingTime: '14:30', bookingDurationMinutes: 90, maxGuestsPerBooking: 12 },
      { name: 'DINNER', startTime: '20:00', endTime: '23:00', lastBookingTime: '21:30', bookingDurationMinutes: 90, maxGuestsPerBooking: 12 },
    ],
  },
  {
    dayOfWeek: 'THURSDAY',
    isOpen: true,
    services: [
      { name: 'LUNCH', startTime: '13:00', endTime: '16:00', lastBookingTime: '14:30', bookingDurationMinutes: 90, maxGuestsPerBooking: 12 },
      { name: 'DINNER', startTime: '20:00', endTime: '23:00', lastBookingTime: '21:30', bookingDurationMinutes: 90, maxGuestsPerBooking: 12 },
    ],
  },
  {
    dayOfWeek: 'FRIDAY',
    isOpen: true,
    services: [
      { name: 'LUNCH', startTime: '13:00', endTime: '16:00', lastBookingTime: '14:30', bookingDurationMinutes: 90, maxGuestsPerBooking: 12 },
      { name: 'DINNER', startTime: '20:00', endTime: '23:00', lastBookingTime: '21:30', bookingDurationMinutes: 90, maxGuestsPerBooking: 12 },
    ],
  },
  {
    dayOfWeek: 'SATURDAY',
    isOpen: true,
    services: [
      { name: 'LUNCH', startTime: '13:00', endTime: '16:00', lastBookingTime: '14:30', bookingDurationMinutes: 90, maxGuestsPerBooking: 12 },
      { name: 'DINNER', startTime: '20:00', endTime: '23:30', lastBookingTime: '22:00', bookingDurationMinutes: 90, maxGuestsPerBooking: 12 },
    ],
  },
  {
    dayOfWeek: 'SUNDAY',
    isOpen: true,
    services: [
      { name: 'LUNCH', startTime: '13:00', endTime: '17:00', lastBookingTime: '15:00', bookingDurationMinutes: 90, maxGuestsPerBooking: 14 },
    ],
  },
];

const SEED_TABLES = [
  { tableNumber: 'T01', name: 'Kupela Bay 1', capacity: 2, shape: TABLE_SHAPE.RECTANGULAR, location: TABLE_LOCATION.MAIN_ROOM, position: { x: 50, y: 50, rotation: 0 } },
  { tableNumber: 'T02', name: 'Kupela Bay 2', capacity: 4, shape: TABLE_SHAPE.RECTANGULAR, location: TABLE_LOCATION.MAIN_ROOM, position: { x: 50, y: 150, rotation: 0 } },
  { tableNumber: 'T03', name: 'Orchard View 1', capacity: 4, shape: TABLE_SHAPE.RECTANGULAR, location: TABLE_LOCATION.TERRACE, position: { x: 200, y: 50, rotation: 0 } },
  { tableNumber: 'T04', name: 'Orchard View 2', capacity: 6, shape: TABLE_SHAPE.RECTANGULAR, location: TABLE_LOCATION.TERRACE, position: { x: 200, y: 150, rotation: 0 } },
  { tableNumber: 'T05', name: 'Cellar Hearth', capacity: 2, shape: TABLE_SHAPE.ROUND, location: TABLE_LOCATION.MAIN_ROOM, position: { x: 350, y: 50, rotation: 0 } },
  { tableNumber: 'T06', name: 'Grand Txotx Table', capacity: 8, shape: TABLE_SHAPE.RECTANGULAR, location: TABLE_LOCATION.MAIN_ROOM, position: { x: 350, y: 150, rotation: 0 } },
  { tableNumber: 'T08', name: 'Cider Press Corner', capacity: 2, shape: TABLE_SHAPE.ROUND, location: TABLE_LOCATION.BAR, position: { x: 500, y: 50, rotation: 0 } },
  { tableNumber: 'T09', name: 'Mountain Terrace 1', capacity: 4, shape: TABLE_SHAPE.RECTANGULAR, location: TABLE_LOCATION.TERRACE, position: { x: 500, y: 150, rotation: 0 } },
  { tableNumber: 'T10', name: 'Mountain Terrace 2', capacity: 4, shape: TABLE_SHAPE.RECTANGULAR, location: TABLE_LOCATION.TERRACE, position: { x: 650, y: 50, rotation: 0 } },
  { tableNumber: 'T11', name: 'Applewood Room', capacity: 4, shape: TABLE_SHAPE.RECTANGULAR, location: TABLE_LOCATION.UPSTAIRS, position: { x: 650, y: 150, rotation: 0 } },
  { tableNumber: 'T12', name: 'Private Alcove', capacity: 2, shape: TABLE_SHAPE.ROUND, location: TABLE_LOCATION.UPSTAIRS, position: { x: 800, y: 50, rotation: 0 } },
  { tableNumber: 'T14', name: 'Valley Panorama', capacity: 4, shape: TABLE_SHAPE.RECTANGULAR, location: TABLE_LOCATION.TERRACE, position: { x: 800, y: 150, rotation: 0 } },
];

const DEMO_EVENTS = [
  {
    title: 'Basque Gastronomy Evening: Chuletón & Kupela',
    slug: 'basque-gastronomy-evening',
    shortDescription: 'Prime dry-aged Basque txuleta grilled over apple-wood coals, paired with fresh kupela cider pours.',
    description: 'Join us at Sidrería Iturrieta for an intimate celebration of Basque fire and fruit. Our grill masters prepare dry-aged chuletón steaks over red-hot apple-wood charcoal from our own orchard prunings, seasoned exclusively with coarse sea salt from Añana.\n\nThroughout the evening, the traditional cry of "Txotx!" will echo through the cellar, inviting guests to step directly to the ancient chestnut barrels and catch the streaming natural cider at its peak effervescence.',
    location: 'Sidrería Iturrieta, Kupela Dining Room, Aramaio',
    startDate: '2026-11-20',
    endDate: '2026-11-20',
    startTime: '20:00',
    endTime: '23:30',
    status: EVENT_STATUS.PUBLISHED,
    isPublished: true,
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Txotx & Cider Barrel Opening Experience',
    slug: 'txotx-cider-barrel-opening',
    shortDescription: 'Experience the ancestral ritual of opening the new vintage barrels with our master cider maker in Aramaio.',
    description: 'Step into the atmospheric kupela cellar of Iturrieta where centuries of Basque cidermaking come alive. This special midday gathering begins with an orchard stroll beneath our 1,400 heritage apple trees, followed by an in-depth cellar tasting where you will sample cider from five distinct wooden vats.',
    location: 'Sidrería Iturrieta, Cellar & Orchard, Aramaio',
    startDate: '2026-11-27',
    endDate: '2026-11-27',
    startTime: '13:00',
    endTime: '16:30',
    status: EVENT_STATUS.PUBLISHED,
    isPublished: true,
    imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Sagardo Eguna: Aramaio Valley Cider Festival',
    slug: 'sagardo-eguna-cider-festival',
    shortDescription: 'Our annual valley cider festival with apple pressing demonstrations, artisanal markets, and folk music.',
    description: 'Sagardo Eguna (Cider Day) is the high point of autumn in Aramaio. For this special weekend festival, Sidrería Iturrieta throws open its courtyard and grounds to celebrate the fruit of the harvest.',
    location: 'Sidrería Iturrieta, Valley Grounds & Courtyard, Aramaio',
    startDate: '2026-12-05',
    endDate: '2026-12-06',
    startTime: '12:00',
    endTime: '19:00',
    status: EVENT_STATUS.PUBLISHED,
    isPublished: true,
    imageUrl: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Traditional Basque Charcoal Grill Night',
    slug: 'traditional-basque-charcoal-grill',
    shortDescription: 'A rustic feast highlighting whole fish roasted in traditional wire baskets and charcoal-roasted seasonal vegetables.',
    description: 'On Friday evenings, the charcoal fire at Iturrieta burns late. Fresh sea bream and hake are grilled over glowing embers in traditional wire besuguera baskets, dressed only with garlic, chili, and our own aged cider vinegar.',
    location: 'Sidrería Iturrieta, Main Grill Hall, Aramaio',
    startDate: '2026-12-12',
    endDate: '2026-12-12',
    startTime: '20:00',
    endTime: '23:30',
    status: EVENT_STATUS.PUBLISHED,
    isPublished: true,
    imageUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&auto=format&fit=crop&q=80',
  },
];

const DEMO_NEWS = [
  {
    title: 'The Art of the Basque Txotx: Standing with Cider and Fire',
    slug: 'art-of-basque-txotx',
    excerpt: 'Understanding why cider tastes better standing up at the kupela barrel, caught directly from a streaming arc.',
    content: 'In the Basque Country, cider is not merely consumed; it is caught. The cry of "Txotx!" signals the cellar master unstopping a barrel, releasing a golden stream of fresh natural cider into an outstretched glass tilted at forty-five degrees.\n\nThis ancestral technique—known as *txulotik edatea*—naturally carbonates the cider, liberating volatile fruit esters that cannot be duplicated once bottled. At Sidrería Iturrieta, we invite our guests to stand between courses and visit the barrels throughout their meal.',
    status: NEWS_STATUS.PUBLISHED,
    isPublished: true,
    publishedAt: new Date('2026-10-15T10:00:00Z'),
    imageUrl: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: '2026 Vintage Harvest Report: Exceptional Sun and Acidity',
    slug: '2026-vintage-harvest-report',
    excerpt: 'A warm autumn in the Basque hills has yielded a magnificent balance of sugar and natural acidity in our heirloom apples.',
    content: 'We have concluded the pressing of our 2026 apple crop. Across our five hectares of certified organic orchards in Aramaio, trees laden with indigenous Txalaka, Goikoetxea, and Mozoloa varieties yielded fruit of extraordinary character.\n\nThe initial pressings show bright golden straw color, intense wild green apple aroma, and the sharp, crisp acidity that characterizes genuine Basque mountain sagardoa.',
    status: NEWS_STATUS.PUBLISHED,
    isPublished: true,
    publishedAt: new Date('2026-10-20T14:30:00Z'),
    imageUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&auto=format&fit=crop&q=80',
  },
  {
    title: 'Our Historic Oak Press: Restoring Centuries of Valley Heritage',
    slug: 'restoring-historic-cider-press',
    excerpt: 'How we lovingly preserved the two-ton wooden beam press that has anchored our farmstead since the 18th century.',
    content: 'At the heart of the Iturrieta lagar sits a colossal oak beam press dating to 1782. For generations, this hand-hewn monument crushed the autumn fruit of the Aramaio valley.\n\nThrough a four-month restoration with local timber conservators, every mortise and tenon joint has been stabilized using historical methods, ensuring this vital piece of Basque agrarian memory endures for future generations.',
    status: NEWS_STATUS.PUBLISHED,
    isPublished: true,
    publishedAt: new Date('2026-10-24T09:00:00Z'),
    imageUrl: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1200&auto=format&fit=crop&q=80',
  },
];

async function ensureUsers() {
  for (const u of CORE_USERS) {
    const existing = await User.findOne({ email: u.email });
    if (!existing) {
      await User.create(u);
      logger.info(`[BOOTSTRAP] Created core user: ${u.email} (${u.role})`);
    } else if (u.email === 'amaia@iturrieta.eus' && (existing.blacklistStatus !== 'ACTIVE' || existing.isBlacklisted)) {
      existing.blacklistStatus = 'ACTIVE';
      existing.isBlacklisted = false;
      existing.blacklistReason = null;
      existing.blacklistedAt = null;
      existing.noShowCount = 0;
      await existing.save();
      logger.info('[BOOTSTRAP] Restored Amaia Agirre account to ACTIVE status');
    }
  }

  for (const c of DEMO_CUSTOMERS) {
    const existing = await User.findOne({ email: c.email });
    if (!existing) {
      await User.create({
        name: c.name,
        email: c.email,
        password: DEMO_PASSWORD,
        role: ROLES.CUSTOMER,
        phone: c.phone,
      });
      logger.info(`[BOOTSTRAP] Created demo customer: ${c.email}`);
    }
  }
}

async function ensureSchedules() {
  const count = await Schedule.countDocuments();
  if (count > 0) return;

  for (const s of WEEKLY_SCHEDULES) {
    await Schedule.findOneAndUpdate({ dayOfWeek: s.dayOfWeek }, s, { upsert: true });
  }
  logger.info('[BOOTSTRAP] Seeded 7 weekly schedules');
}

async function ensureTables() {
  const count = await Table.countDocuments();
  if (count > 0) return;

  for (const t of SEED_TABLES) {
    await Table.findOneAndUpdate({ tableNumber: t.tableNumber }, t, { upsert: true });
  }
  logger.info(`[BOOTSTRAP] Seeded ${SEED_TABLES.length} restaurant tables`);
}

async function ensureContent(adminUser) {
  if (!adminUser) return;

  const eventsCount = await Event.countDocuments();
  if (eventsCount === 0) {
    for (const e of DEMO_EVENTS) {
      await Event.create({ ...e, isPublished: true, createdBy: adminUser._id });
    }
    logger.info(`[BOOTSTRAP] Seeded ${DEMO_EVENTS.length} published events`);
  } else {
    await Event.updateMany(
      { status: EVENT_STATUS.PUBLISHED, isPublished: { $ne: true } },
      { $set: { isPublished: true } }
    );
  }

  const newsCount = await News.countDocuments();
  if (newsCount === 0) {
    for (const n of DEMO_NEWS) {
      await News.create({ ...n, isPublished: true, createdBy: adminUser._id });
    }
    logger.info(`[BOOTSTRAP] Seeded ${DEMO_NEWS.length} published news articles`);
  } else {
    await News.updateMany(
      { status: NEWS_STATUS.PUBLISHED, isPublished: { $ne: true } },
      { $set: { isPublished: true } }
    );
  }
}

async function ensureBookings(customers, tables, adminUser) {
  const currentCount = await Booking.countDocuments();
  if (currentCount >= 8) {
    return;
  }

  const tableMap = new Map(tables.map((t) => [t.tableNumber, t]));
  const customerMap = new Map(customers.map((c) => [c.email, c]));

  const getTable = (num) => tableMap.get(num) || tables[0];
  const getCustomer = (email) => customerMap.get(email) || customers[0];

  const BOOKING_BLUEPRINTS = [
    // Today (2026-10-27) Lunch - COMPLETED
    {
      custEmail: 'amaia@iturrieta.eus',
      tableNum: 'T01',
      date: '2026-10-27',
      startTime: '13:00',
      endTime: '14:30',
      service: 'LUNCH',
      guests: 2,
      status: BOOKING_STATUS.COMPLETED,
      source: BOOKING_SOURCE.WEBSITE,
      notes: 'Anniversary celebration. Traditional cider menu.',
      depositRequired: true,
      depositAmount: 20,
      depositStatus: DEPOSIT_STATUS.PAID,
    },
    {
      custEmail: 'mikel.zubia@iturrieta.eus',
      tableNum: 'T02',
      date: '2026-10-27',
      startTime: '13:30',
      endTime: '15:00',
      service: 'LUNCH',
      guests: 3,
      status: BOOKING_STATUS.COMPLETED,
      source: BOOKING_SOURCE.PHONE,
      notes: 'Corner table requested.',
      depositStatus: DEPOSIT_STATUS.NOT_REQUIRED,
    },
    // Today (2026-10-27) Dinner - SEATED & ARRIVED (Live floor operations)
    {
      custEmail: 'aitor.elorza@iturrieta.eus',
      tableNum: 'T03',
      date: '2026-10-27',
      startTime: '20:00',
      endTime: '21:30',
      service: 'DINNER',
      guests: 4,
      status: BOOKING_STATUS.SEATED,
      source: BOOKING_SOURCE.STAFF,
      notes: 'Guests seated in Terrace section, chuletón ordered.',
      depositStatus: DEPOSIT_STATUS.NOT_REQUIRED,
    },
    {
      custEmail: 'unai.goikoetxea@iturrieta.eus',
      tableNum: 'T06',
      date: '2026-10-27',
      startTime: '20:00',
      endTime: '21:30',
      service: 'DINNER',
      guests: 6,
      status: BOOKING_STATUS.ARRIVED,
      source: BOOKING_SOURCE.ADMIN,
      notes: 'Party arrived at reception, waiting at cider bar.',
      depositRequired: true,
      depositAmount: 60,
      depositStatus: DEPOSIT_STATUS.PAID,
    },
    {
      custEmail: 'leire.otxoa@iturrieta.eus',
      tableNum: 'T04',
      date: '2026-10-27',
      startTime: '20:30',
      endTime: '22:00',
      service: 'DINNER',
      guests: 4,
      status: BOOKING_STATUS.CONFIRMED,
      source: BOOKING_SOURCE.WEBSITE,
      notes: 'First time visiting Aramaio sagardotegia.',
      depositStatus: DEPOSIT_STATUS.NOT_REQUIRED,
    },
    // Yesterday (2026-10-26) - COMPLETED & CANCELLED
    {
      custEmail: 'jon.aranburu@iturrieta.eus',
      tableNum: 'T02',
      date: '2026-10-26',
      startTime: '13:00',
      endTime: '14:30',
      service: 'LUNCH',
      guests: 4,
      status: BOOKING_STATUS.COMPLETED,
      source: BOOKING_SOURCE.PHONE,
      notes: 'Business lunch with colleagues from Bilbao.',
      depositStatus: DEPOSIT_STATUS.NOT_REQUIRED,
    },
    {
      custEmail: 'june.arregi@iturrieta.eus',
      tableNum: 'T05',
      date: '2026-10-26',
      startTime: '20:00',
      endTime: '21:30',
      service: 'DINNER',
      guests: 2,
      status: BOOKING_STATUS.CANCELLED,
      source: BOOKING_SOURCE.WEBSITE,
      notes: 'Flight delayed, cancelled with advance notice.',
      depositRequired: true,
      depositAmount: 20,
      depositStatus: DEPOSIT_STATUS.REFUNDED,
    },
    // Tomorrow (2026-10-28) - CONFIRMED
    {
      custEmail: 'iker.etxeberria@iturrieta.eus',
      tableNum: 'T01',
      date: '2026-10-28',
      startTime: '13:00',
      endTime: '14:30',
      service: 'LUNCH',
      guests: 2,
      status: BOOKING_STATUS.CONFIRMED,
      source: BOOKING_SOURCE.WEBSITE,
      notes: 'Txotx menu with bacalao omelette.',
      depositStatus: DEPOSIT_STATUS.NOT_REQUIRED,
    },
    {
      custEmail: 'ane.mendizabal@iturrieta.eus',
      tableNum: 'T03',
      date: '2026-10-28',
      startTime: '13:00',
      endTime: '14:30',
      service: 'LUNCH',
      guests: 4,
      status: BOOKING_STATUS.CONFIRMED,
      source: BOOKING_SOURCE.PHONE,
      notes: 'Family reservation from Donostia.',
      depositStatus: DEPOSIT_STATUS.NOT_REQUIRED,
    },
    {
      custEmail: 'maialen.urrutia@iturrieta.eus',
      tableNum: 'T04',
      date: '2026-10-28',
      startTime: '20:00',
      endTime: '21:30',
      service: 'DINNER',
      guests: 5,
      status: BOOKING_STATUS.CONFIRMED,
      source: BOOKING_SOURCE.WHATSAPP,
      notes: 'Evening cider tasting reservation.',
      depositStatus: DEPOSIT_STATUS.NOT_REQUIRED,
    },
    // Upcoming Weekend (2026-10-31) - CONFIRMED
    {
      custEmail: 'nerea.salazar@iturrieta.eus',
      tableNum: 'T06',
      date: '2026-10-31',
      startTime: '13:30',
      endTime: '15:00',
      service: 'LUNCH',
      guests: 8,
      status: BOOKING_STATUS.CONFIRMED,
      source: BOOKING_SOURCE.WEBSITE,
      notes: 'Large family gathering, outdoor terrace view.',
      depositRequired: true,
      depositAmount: 80,
      depositStatus: DEPOSIT_STATUS.PAID,
    },
    {
      custEmail: 'amaia@iturrieta.eus',
      tableNum: 'T02',
      date: '2026-10-31',
      startTime: '20:00',
      endTime: '21:30',
      service: 'DINNER',
      guests: 4,
      status: BOOKING_STATUS.CONFIRMED,
      source: BOOKING_SOURCE.WEBSITE,
      notes: 'Saturday evening harvest celebration.',
      depositStatus: DEPOSIT_STATUS.NOT_REQUIRED,
    },
  ];

  let createdCount = 0;

  for (const b of BOOKING_BLUEPRINTS) {
    const table = getTable(b.tableNum);
    const customer = getCustomer(b.custEmail);
    const existing = await Booking.findOne({
      tableId: table._id,
      date: b.date,
      startTime: b.startTime,
    });

    if (existing) continue;

    const stamp = b.date.replace(/-/g, '');
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const bookingReference = `TX-${stamp}-${suffix}`;

    const history = [
      {
        action: BOOKING_HISTORY_ACTION.CREATED,
        fromStatus: null,
        toStatus: BOOKING_STATUS.CONFIRMED,
        actorId: customer._id,
        at: new Date(`${b.date}T10:00:00Z`),
        reason: 'Reservation created via ' + b.source,
      },
    ];

    if (b.status === BOOKING_STATUS.ARRIVED) {
      history.push({
        action: BOOKING_HISTORY_ACTION.STATUS_CHANGED,
        fromStatus: BOOKING_STATUS.CONFIRMED,
        toStatus: BOOKING_STATUS.ARRIVED,
        actorId: adminUser?._id || customer._id,
        at: new Date(`${b.date}T${b.startTime}:00Z`),
        reason: 'Guest arrival recorded',
      });
    } else if (b.status === BOOKING_STATUS.SEATED) {
      history.push({
        action: BOOKING_HISTORY_ACTION.STATUS_CHANGED,
        fromStatus: BOOKING_STATUS.CONFIRMED,
        toStatus: BOOKING_STATUS.ARRIVED,
        actorId: adminUser?._id || customer._id,
        at: new Date(`${b.date}T${b.startTime}:00Z`),
        reason: 'Guest arrival recorded',
      });
      history.push({
        action: BOOKING_HISTORY_ACTION.STATUS_CHANGED,
        fromStatus: BOOKING_STATUS.ARRIVED,
        toStatus: BOOKING_STATUS.SEATED,
        actorId: adminUser?._id || customer._id,
        at: new Date(`${b.date}T${b.startTime}:05Z`),
        reason: 'Table seated by floor staff',
      });
    } else if (b.status === BOOKING_STATUS.COMPLETED) {
      history.push({
        action: BOOKING_HISTORY_ACTION.STATUS_CHANGED,
        fromStatus: BOOKING_STATUS.CONFIRMED,
        toStatus: BOOKING_STATUS.COMPLETED,
        actorId: adminUser?._id || customer._id,
        at: new Date(`${b.date}T${b.endTime}:00Z`),
        reason: 'Dining service completed',
      });
    } else if (b.status === BOOKING_STATUS.CANCELLED) {
      history.push({
        action: BOOKING_HISTORY_ACTION.STATUS_CHANGED,
        fromStatus: BOOKING_STATUS.CONFIRMED,
        toStatus: BOOKING_STATUS.CANCELLED,
        actorId: customer._id,
        at: new Date(`${b.date}T09:00:00Z`),
        reason: 'Customer requested cancellation',
      });
    }

    await Booking.create({
      bookingReference,
      customerId: customer._id,
      tableId: table._id,
      tableIds: [table._id],
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      guests: b.guests,
      serviceName: b.service,
      status: b.status,
      source: b.source,
      notes: b.notes,
      depositStatus: b.depositStatus || DEPOSIT_STATUS.NOT_REQUIRED,
      depositRequired: Boolean(b.depositRequired),
      depositAmount: b.depositAmount || 0,
      createdBy: customer._id,
      history,
      slots: [
        {
          date: b.date,
          startTime: b.startTime,
          endTime: b.endTime,
          tableId: table._id,
          serviceName: b.service,
        },
      ],
    });

    createdCount++;
  }

  logger.info(`[BOOTSTRAP] Seeded ${createdCount} realistic demo bookings`);
}

async function ensureWaitlist(customers, adminUser) {
  const currentCount = await Waitlist.countDocuments();
  if (currentCount >= 4) return;

  const WAITLIST_BLUEPRINTS = [
    {
      custEmail: 'unai.goikoetxea@iturrieta.eus',
      guests: 2,
      date: '2026-10-27',
      time: '13:30',
      service: 'LUNCH',
      status: WAITLIST_STATUS.WAITING,
      notes: 'Prefers Terrace if available',
    },
    {
      custEmail: 'ane.mendizabal@iturrieta.eus',
      guests: 4,
      date: '2026-10-27',
      time: '20:00',
      service: 'DINNER',
      status: WAITLIST_STATUS.NOTIFIED,
      notes: 'Notified Table T03 will be ready shortly',
    },
    {
      custEmail: 'aitor.elorza@iturrieta.eus',
      guests: 6,
      date: '2026-10-27',
      time: '20:30',
      service: 'DINNER',
      status: WAITLIST_STATUS.CONVERTED,
      notes: 'Converted to Table T06 Grand Txotx Table',
    },
    {
      custEmail: 'leire.otxoa@iturrieta.eus',
      guests: 3,
      date: '2026-10-28',
      time: '13:30',
      service: 'LUNCH',
      status: WAITLIST_STATUS.CANCELLED,
      notes: 'Customer found alternative arrangement',
    },
  ];

  const customerMap = new Map(customers.map((c) => [c.email, c]));
  let createdCount = 0;

  for (const w of WAITLIST_BLUEPRINTS) {
    const customer = customerMap.get(w.custEmail) || customers[0];
    const existing = await Waitlist.findOne({
      customerId: customer._id,
      date: w.date,
      requestedStartTime: w.time,
    });

    if (existing) continue;

    const stamp = w.date.replace(/-/g, '');
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const waitlistReference = `WL-${stamp}-${suffix}`;

    await Waitlist.create({
      waitlistReference,
      customerId: customer._id,
      date: w.date,
      requestedStartTime: w.time,
      guests: w.guests,
      serviceName: w.service,
      status: w.status,
      source: BOOKING_SOURCE.WEBSITE,
      notes: w.notes,
      createdBy: adminUser?._id || customer._id,
    });
    createdCount++;
  }

  logger.info(`[BOOTSTRAP] Seeded ${createdCount} waitlist entries`);
}

async function ensureNotifications(amaiaUser) {
  if (!amaiaUser) return;
  const currentCount = await Notification.countDocuments({ recipientUserId: amaiaUser._id });
  if (currentCount >= 3) return;

  const NOTIFICATION_BLUEPRINTS = [
    {
      type: NOTIFICATION_TYPE.BOOKING_CREATED,
      title: 'Reservation Confirmed: TX-20261027-ITURRIETA',
      message: 'Your table reservation at Sidrería Iturrieta for 2 guests on 2026-10-27 at 13:00 is confirmed.',
      status: NOTIFICATION_STATUS.READ,
      bookingReference: 'TX-20261027-ITURRIETA',
    },
    {
      type: NOTIFICATION_TYPE.BOOKING_REMINDER,
      title: 'Upcoming Reservation: TX-20261031-HARVEST',
      message: 'Reminder: Your dinner reservation for 4 guests on Saturday 2026-10-31 at 20:00 starts in 4 days.',
      status: NOTIFICATION_STATUS.UNREAD,
      bookingReference: 'TX-20261031-HARVEST',
    },
    {
      type: NOTIFICATION_TYPE.WAITLIST_NOTIFIED,
      title: 'Table Opening in Aramaio',
      message: 'Good news! A table opening matching your waitlist request has become available.',
      status: NOTIFICATION_STATUS.UNREAD,
      waitlistReference: 'WL-20261027-ARAMAIO',
    },
  ];

  for (const n of NOTIFICATION_BLUEPRINTS) {
    const stamp = '20261027';
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const notificationReference = `NT-${stamp}-${suffix}`;

    await Notification.create({
      notificationReference,
      type: n.type,
      recipientUserId: amaiaUser._id,
      bookingReference: n.bookingReference,
      waitlistReference: n.waitlistReference,
      title: n.title,
      message: n.message,
      channel: NOTIFICATION_CHANNEL.IN_APP,
      status: n.status,
      idempotencyKey: `demo:${n.type}:${n.bookingReference || n.waitlistReference}:${suffix}`,
      metadata: { demo: true },
    });
  }

  logger.info(`[BOOTSTRAP] Seeded in-app notifications for Amaia`);
}

async function ensureDepositConfig(adminUser) {
  const existing = await DepositConfig.findOne({});
  if (!existing) {
    await DepositConfig.create({
      enabled: true,
      type: DEPOSIT_TYPE.PER_GUEST,
      amount: 10,
      currency: 'EUR',
      minGuests: 1,
      refundCutoffHours: 24,
      updatedBy: adminUser?._id,
    });
    logger.info('[BOOTSTRAP] Initialized deposit configuration');
  }
}

async function ensurePayments() {
  // Update selected demo bookings to have deposits if not already set
  await Booking.updateOne(
    { notes: { $regex: /Anniversary/i } },
    { $set: { depositRequired: true, depositAmount: 20, depositStatus: DEPOSIT_STATUS.PAID } }
  );
  await Booking.updateOne(
    { notes: { $regex: /Party arrived/i } },
    { $set: { depositRequired: true, depositAmount: 60, depositStatus: DEPOSIT_STATUS.PAID } }
  );
  await Booking.updateOne(
    { notes: { $regex: /Flight delayed/i } },
    { $set: { depositRequired: true, depositAmount: 20, depositStatus: DEPOSIT_STATUS.REFUNDED } }
  );
  await Booking.updateOne(
    { notes: { $regex: /Large family gathering/i } },
    { $set: { depositRequired: true, depositAmount: 80, depositStatus: DEPOSIT_STATUS.PAID } }
  );

  const paymentCount = await Payment.countDocuments();
  if (paymentCount >= 4) return;

  const targetBookings = await Booking.find({
    depositRequired: true,
    depositAmount: { $gt: 0 },
  });

  let createdCount = 0;
  for (const b of targetBookings) {
    const existing = await Payment.findOne({ bookingId: b._id });
    if (existing) continue;

    const stamp = b.date.replace(/-/g, '');
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const paymentReference = `PAY-${stamp}-${suffix}`;

    const isRefunded =
      b.depositStatus === DEPOSIT_STATUS.REFUNDED ||
      b.status === BOOKING_STATUS.CANCELLED;

    await Payment.create({
      paymentReference,
      bookingReference: b.bookingReference,
      bookingId: b._id,
      customerId: b.customerId,
      amount: b.depositAmount,
      currency: 'EUR',
      provider: PAYMENT_PROVIDER.DEV_SIMULATED,
      providerOrderId: `sim_ord_${suffix.toLowerCase()}`,
      providerPaymentId: `sim_pay_${suffix.toLowerCase()}`,
      status: isRefunded ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.PAID,
      type: PAYMENT_TYPE.BOOKING_DEPOSIT,
      paidAt: new Date(`${b.date}T10:00:00Z`),
      refundedAt: isRefunded ? new Date(`${b.date}T11:00:00Z`) : null,
      refundAmount: isRefunded ? b.depositAmount : null,
      refundReason: isRefunded ? 'Customer cancellation requested within policy window' : null,
      idempotencyKey: `demo:payment:${b.bookingReference}:${suffix}`,
      metadata: { demo: true, bookingReference: b.bookingReference },
    });

    if (!b.paymentReference) {
      b.paymentReference = paymentReference;
      await b.save();
    }
    createdCount++;
  }

  logger.info(`[BOOTSTRAP] Seeded ${createdCount} realistic deposit payments`);
}

async function ensureEssentialData() {
  try {
    // 1. Ensure core & demo users
    await ensureUsers();

    // 2. Ensure schedules & tables
    await ensureSchedules();
    await ensureTables();

    // 3. Load references
    const adminUser = await User.findOne({ email: 'admin@iturrieta.eus' });
    const amaiaUser = await User.findOne({ email: 'amaia@iturrieta.eus' });
    const customers = await User.find({ role: ROLES.CUSTOMER });
    const tables = await Table.find({}).sort({ tableNumber: 1 });

    // 4. Ensure demo events & news
    await ensureContent(adminUser);

    // 5. Ensure realistic bookings across dates & statuses
    if (tables.length > 0 && customers.length > 0) {
      await ensureBookings(customers, tables, adminUser);
    }

    // 6. Ensure waitlist entries
    if (customers.length > 0) {
      await ensureWaitlist(customers, adminUser);
    }

    // 7. Ensure notifications for Amaia
    if (amaiaUser) {
      await ensureNotifications(amaiaUser);
    }

    // 8. Ensure deposit config and payments
    await ensureDepositConfig(adminUser);
    await ensurePayments();

    logger.info('[BOOTSTRAP] Database verified and fully ready for demo presentation');
  } catch (err) {
    logger.error(`[BOOTSTRAP] Seeding error: ${err.message}`);
  }
}

module.exports = {
  CORE_USERS,
  DEMO_CUSTOMERS,
  ensureEssentialData,
  ensureUsers,
  ensureSchedules,
  ensureTables,
  ensureBookings,
  ensureWaitlist,
  ensureNotifications,
  ensureDepositConfig,
  ensurePayments,
};
