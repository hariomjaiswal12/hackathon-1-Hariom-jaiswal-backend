const { Server } = require('socket.io');
const User = require('../models/User');
const { isAllowedOrigin } = require('../config/cors');
const { verifyAccessToken } = require('../utils/jwt');
const logger = require('../utils/logger');
const { ROLES, ROLE_LIST } = require('../constants/roles');
const { FLOOR_LIVE_ROOM, REALTIME_EVENT, userRoom } = require('../constants/realtime');

const OPERATIONAL_ROLES = new Set([ROLES.STAFF, ROLES.ADMIN]);

let io = null;

function readHandshakeToken(socket) {
  const authToken = socket.handshake.auth && socket.handshake.auth.token;

  if (typeof authToken === 'string' && authToken.trim()) {
    return authToken.replace(/^Bearer\s+/i, '').trim();
  }

  const header = socket.handshake.headers && socket.handshake.headers.authorization;
  const match = /^Bearer\s+(\S+)$/.exec(header || '');
  return match ? match[1] : '';
}

async function authorizeSocket(socket, next) {
  try {
    const token = readHandshakeToken(socket);

    if (!token) {
      next(new Error('Authentication required'));
      return;
    }

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.userId);

    if (!user || !user.isActive || user.isBlacklisted) {
      next(new Error('Authentication failed'));
      return;
    }

    if (!ROLE_LIST.includes(user.role)) {
      next(new Error('Forbidden'));
      return;
    }

    socket.data.user = {
      id: String(user.id),
      role: user.role,
    };
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
}

function initializeRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Origin is not allowed by CORS'));
      },
      credentials: true,
    },
  });

  io.use(authorizeSocket);
  io.on('connection', (socket) => {
    const ownRoom = userRoom(socket.data.user.id);
    socket.join(ownRoom);

    if (OPERATIONAL_ROLES.has(socket.data.user.role)) {
      socket.join(FLOOR_LIVE_ROOM);
    }

    socket.on('subscribe', (room, ack) => {
      const respond = (payload) => {
        if (typeof ack === 'function') {
          ack(payload);
        }
      };

      if (room === ownRoom) {
        socket.join(ownRoom);
        respond({ ok: true });
        return;
      }

      if (room === FLOOR_LIVE_ROOM && OPERATIONAL_ROLES.has(socket.data.user.role)) {
        socket.join(FLOOR_LIVE_ROOM);
        respond({ ok: true });
        return;
      }

      respond({ ok: false });
    });
  });

  return io;
}

function closeRealtime() {
  if (!io) {
    return;
  }

  const current = io;
  io = null;
  current.disconnectSockets(true);
}

function idString(value) {
  if (value === undefined || value === null) {
    return value;
  }

  return String(value);
}

function bookingEventPayload(event, booking) {
  const tableIds = Array.isArray(booking.tableIds) && booking.tableIds.length > 0
    ? booking.tableIds.map(idString)
    : [idString(booking.tableId)];

  return {
    event,
    bookingReference: booking.bookingReference,
    tableId: tableIds[0],
    tableIds,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    guests: booking.guests,
    status: booking.status,
  };
}

function tableEventPayload(table) {
  const plain = table && table.toObject ? table.toObject() : table;
  const position = plain.position || {};

  return {
    event: REALTIME_EVENT.TABLE_UPDATED,
    id: idString(plain.id || plain._id),
    tableNumber: plain.tableNumber,
    name: plain.name,
    capacity: plain.capacity,
    status: plain.status,
    shape: plain.shape,
    location: plain.location,
    tags: plain.tags,
    position: {
      x: position.x,
      y: position.y,
      rotation: position.rotation,
    },
    isActive: plain.isActive,
  };
}

function publish(event, payload) {
  try {
    if (!io) {
      logger.error(`Realtime emit failed for ${event}: Socket.io is not initialized`);
      return;
    }

    io.to(FLOOR_LIVE_ROOM).emit(event, payload);
  } catch (error) {
    logger.error(`Realtime emit failed for ${event}: ${error.message}`);
  }
}

function publishBooking(event, booking) {
  publish(event, bookingEventPayload(event, booking));
}

function publishTableUpdated(table) {
  publish(REALTIME_EVENT.TABLE_UPDATED, tableEventPayload(table));
}

function publishWaitlist(event, entry) {
  publish(event, {
    event,
    waitlistReference: entry.waitlistReference,
    date: entry.date,
    requestedStartTime: entry.requestedStartTime,
    guests: entry.guests,
    status: entry.status,
  });
}

function publishToUser(userId, event, payload) {
  try {
    if (!io) {
      logger.error(`Realtime emit failed for ${event}: Socket.io is not initialized`);
      return;
    }

    io.to(userRoom(userId)).emit(event, payload);
  } catch (error) {
    logger.error(`Realtime emit failed for ${event}: ${error.message}`);
  }
}

module.exports = {
  initializeRealtime,
  closeRealtime,
  publishBooking,
  publishTableUpdated,
  publishWaitlist,
  publishToUser,
};
