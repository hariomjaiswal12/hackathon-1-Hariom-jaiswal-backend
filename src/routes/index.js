const express = require('express');
const healthRoutes = require('./health.routes');
const authRoutes = require('./auth.routes');
const tableRoutes = require('./table.routes');
const scheduleRoutes = require('./schedule.routes');
const closedDayRoutes = require('./closedDay.routes');
const availabilityRoutes = require('./availability.routes');
const bookingRoutes = require('./booking.routes');
const waitlistRoutes = require('./waitlist.routes');
const notificationRoutes = require('./notification.routes');
const adminRoutes = require('./admin.routes');
const paymentRoutes = require('./payment.routes');
const { publicRouter: eventRoutes } = require('./event.routes');
const { publicRouter: newsRoutes } = require('./news.routes');
const integrationRoutes = require('./integration.routes');

const v1Router = express.Router();

v1Router.use('/health', healthRoutes);
v1Router.use('/auth', authRoutes);
v1Router.use('/tables', tableRoutes);
v1Router.use('/schedules', scheduleRoutes);
v1Router.use('/closed-days', closedDayRoutes);
v1Router.use('/availability', availabilityRoutes);
v1Router.use('/bookings', bookingRoutes);
v1Router.use('/waitlist', waitlistRoutes);
v1Router.use('/notifications', notificationRoutes);
v1Router.use('/admin', adminRoutes);
v1Router.use('/payments', paymentRoutes);
v1Router.use('/deposit', paymentRoutes);
v1Router.use('/events', eventRoutes);
v1Router.use('/news', newsRoutes);
v1Router.use('/integrations', integrationRoutes);

module.exports = v1Router;
