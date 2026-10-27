const APP = require('../constants/app');

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'TXOTX OS & Sidería Iturrieta REST API',
    version: APP.API_VERSION || '1.0.0',
    description:
      'Production-grade restaurant operations, table allocation, booking management, waitlist, notifications, and real-time floor monitoring API for Sidería Iturrieta.',
    contact: {
      name: 'TXOTX OS Team',
      email: 'tech@iturrieta.eus',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1 Base URL',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token as: Bearer <token>',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          code: { type: 'string', example: 'BOOKING_CONFLICT' },
          message: { type: 'string', example: 'The selected table is already booked.' },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'BOOKING_CONFLICT' },
              message: { type: 'string', example: 'The selected table is already booked.' },
            },
          },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string', example: 'startTime' },
                message: { type: 'string', example: 'Start time must be HH:mm' },
              },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '60c72b2f9b1d8b2bad5e0123' },
          name: { type: 'string', example: 'Amaia Goikoetxea' },
          email: { type: 'string', format: 'email', example: 'amaia@iturrieta.eus' },
          phone: { type: 'string', example: '+34 945 123 456' },
          role: { type: 'string', enum: ['ADMIN', 'STAFF', 'CUSTOMER'], example: 'CUSTOMER' },
          isActive: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Table: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '60c72b2f9b1d8b2bad5e0001' },
          tableNumber: { type: 'string', example: 'T-01' },
          name: { type: 'string', example: 'Main Dining Table 1' },
          capacity: { type: 'integer', example: 4 },
          status: { type: 'string', enum: ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'CLEANING', 'OUT_OF_SERVICE'], example: 'AVAILABLE' },
          shape: { type: 'string', enum: ['RECTANGLE', 'ROUND', 'SQUARE'], example: 'RECTANGLE' },
          location: { type: 'string', enum: ['WINDOW', 'BAR', 'CENTER', 'PRIVATE', 'OUTDOOR', 'OTHER'], example: 'WINDOW' },
          tags: { type: 'array', items: { type: 'string' }, example: ['window', 'near-kupela'] },
          position: {
            type: 'object',
            properties: {
              x: { type: 'number', example: 120 },
              y: { type: 'number', example: 80 },
              rotation: { type: 'number', example: 0 },
            },
          },
          isActive: { type: 'boolean', example: true },
          notes: { type: 'string', example: 'Next to apple press display' },
        },
      },
      Booking: {
        type: 'object',
        properties: {
          bookingReference: { type: 'string', example: 'TX-20261114-A1B2C3' },
          customerId: { type: 'string', example: '60c72b2f9b1d8b2bad5e0123' },
          tableId: { type: 'string', example: '60c72b2f9b1d8b2bad5e0001' },
          tableIds: { type: 'array', items: { type: 'string' }, example: ['60c72b2f9b1d8b2bad5e0001'] },
          date: { type: 'string', example: '2026-11-14' },
          startTime: { type: 'string', example: '13:30' },
          endTime: { type: 'string', example: '15:30' },
          guests: { type: 'integer', example: 4 },
          serviceName: { type: 'string', example: 'LUNCH' },
          source: { type: 'string', enum: ['ONLINE', 'WALK_IN', 'PHONE'], example: 'ONLINE' },
          status: { type: 'string', enum: ['CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'], example: 'CONFIRMED' },
          notes: { type: 'string', example: 'Anniversary celebration' },
          cancellationReason: { type: 'string', nullable: true },
          cancelledAt: { type: 'string', format: 'date-time', nullable: true },
          createdBy: { type: 'string' },
          table: { $ref: '#/components/schemas/Table' },
          tables: { type: 'array', items: { $ref: '#/components/schemas/Table' } },
        },
      },
      Waitlist: {
        type: 'object',
        properties: {
          waitlistReference: { type: 'string', example: 'WL-20261114-D4E5F6' },
          customerId: { type: 'string' },
          date: { type: 'string', example: '2026-11-14' },
          requestedStartTime: { type: 'string', example: '13:30' },
          guests: { type: 'integer', example: 4 },
          serviceName: { type: 'string', example: 'LUNCH' },
          status: { type: 'string', enum: ['WAITING', 'NOTIFIED', 'CONVERTED', 'EXPIRED', 'CANCELLED'], example: 'WAITING' },
          source: { type: 'string', example: 'ONLINE' },
          notes: { type: 'string' },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          notificationReference: { type: 'string', example: 'NT-20261114-1A2B3C' },
          type: { type: 'string', example: 'BOOKING_CREATED' },
          recipientUserId: { type: 'string' },
          bookingReference: { type: 'string' },
          title: { type: 'string', example: 'Booking confirmed' },
          message: { type: 'string', example: 'Your booking TX-20261114-A1B2C3 is confirmed.' },
          channel: { type: 'string', example: 'IN_APP' },
          status: { type: 'string', enum: ['UNREAD', 'READ'], example: 'UNREAD' },
          metadata: { type: 'object' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'System health check',
        description: 'Returns server operational status, database connectivity, version, and uptime.',
        tags: ['System'],
        responses: {
          200: {
            description: 'Health status OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        status: { type: 'string', example: 'ok' },
                        service: { type: 'string', example: 'txotx-os-api' },
                        version: { type: 'string', example: '1.0.0' },
                        environment: { type: 'string', example: 'development' },
                        uptimeSeconds: { type: 'integer', example: 120 },
                        database: {
                          type: 'object',
                          properties: {
                            configured: { type: 'boolean', example: true },
                            status: { type: 'string', example: 'connected' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register new customer account',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'email', 'password'],
                properties: {
                  name: { type: 'string', example: 'Amaia Goikoetxea' },
                  email: { type: 'string', format: 'email', example: 'amaia@iturrieta.eus' },
                  password: { type: 'string', minLength: 8, example: 'Customer12345!' },
                  phone: { type: 'string', example: '+34 945 123 456' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Account registered successfully' },
          400: { $ref: '#/components/schemas/ErrorResponse' },
          409: { description: 'Email already registered' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate user credentials',
        tags: ['Auth'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'amaia@iturrieta.eus' },
                  password: { type: 'string', example: 'Customer12345!' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Signed in with JWT access token' },
          401: { description: 'Invalid email or password' },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get current authenticated user session',
        tags: ['Auth'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Authenticated user profile' },
          401: { description: 'Authentication required' },
        },
      },
    },
    '/tables': {
      get: {
        summary: 'List tables with optional filtering',
        tags: ['Tables'],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'capacity', in: 'query', schema: { type: 'integer' } },
          { name: 'location', in: 'query', schema: { type: 'string' } },
          { name: 'tag', in: 'query', schema: { type: 'string' } },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          200: { description: 'List of restaurant tables' },
        },
      },
      post: {
        summary: 'Create table (Admin only)',
        tags: ['Tables'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tableNumber', 'capacity', 'shape', 'location', 'position'],
                properties: {
                  tableNumber: { type: 'string', example: 'T-10' },
                  name: { type: 'string', example: 'Barrel View Table' },
                  capacity: { type: 'integer', example: 6 },
                  shape: { type: 'string', example: 'RECTANGLE' },
                  location: { type: 'string', example: 'MAIN_ROOM' },
                  tags: { type: 'array', items: { type: 'string' }, example: ['window'] },
                  position: {
                    type: 'object',
                    properties: {
                      x: { type: 'number', example: 100 },
                      y: { type: 'number', example: 150 },
                      rotation: { type: 'number', example: 0 },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Table created' },
          403: { description: 'Admin role required' },
        },
      },
    },
    '/tables/floor': {
      get: {
        summary: 'Get 2D floor plan layout',
        tags: ['Tables'],
        responses: {
          200: { description: 'Complete floor map tables with coordinate positions' },
        },
      },
    },
    '/tables/floor/live': {
      get: {
        summary: 'Get live operational floor state (Staff & Admin)',
        tags: ['Tables'],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Real-time floor status including active reservations' },
          403: { description: 'Staff or Admin role required' },
        },
      },
    },
    '/tables/recommendation': {
      get: {
        summary: 'Recommendation engine for optimal table allocation',
        tags: ['Tables'],
        parameters: [
          { name: 'date', in: 'query', required: true, schema: { type: 'string', example: '2026-11-14' } },
          { name: 'time', in: 'query', required: true, schema: { type: 'string', example: '13:30' } },
          { name: 'guests', in: 'query', required: true, schema: { type: 'integer', example: 4 } },
        ],
        responses: {
          200: { description: 'Ranked list of best fitting tables for the party size' },
        },
      },
    },
    '/tables/{id}': {
      get: {
        summary: 'Get single table details',
        tags: ['Tables'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Table found' }, 404: { description: 'Table not found' } },
      },
      patch: {
        summary: 'Update table properties (Staff & Admin)',
        tags: ['Tables'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Table updated' } },
      },
      delete: {
        summary: 'Deactivate table (Admin only)',
        tags: ['Tables'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Table deactivated' } },
      },
    },
    '/tables/{id}/status': {
      patch: {
        summary: 'Update table operational status (Staff & Admin)',
        tags: ['Tables'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', example: 'CLEANING' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Status updated' } },
      },
    },
    '/tables/{id}/position': {
      patch: {
        summary: 'Update table canvas position (Staff & Admin)',
        tags: ['Tables'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['x', 'y', 'rotation'],
                properties: {
                  x: { type: 'number', example: 150 },
                  y: { type: 'number', example: 200 },
                  rotation: { type: 'number', example: 90 },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Position updated' } },
      },
    },
    '/schedules': {
      get: {
        summary: 'Get weekly operating schedule',
        tags: ['Schedule'],
        responses: { 200: { description: 'All 7 days of weekly operating schedule' } },
      },
    },
    '/schedules/effective/{date}': {
      get: {
        summary: 'Get effective operating schedule for a specific calendar date',
        tags: ['Schedule'],
        parameters: [{ name: 'date', in: 'path', required: true, schema: { type: 'string', example: '2026-11-14' } }],
        responses: { 200: { description: 'Schedule taking closed days into account' } },
      },
    },
    '/schedules/{day}': {
      get: {
        summary: 'Get schedule for a specific day of the week',
        tags: ['Schedule'],
        parameters: [{ name: 'day', in: 'path', required: true, schema: { type: 'string', example: 'SATURDAY' } }],
        responses: { 200: { description: 'Operating hours and services for the day' } },
      },
      put: {
        summary: 'Configure schedule for a day (Admin only)',
        tags: ['Schedule'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'day', in: 'path', required: true, schema: { type: 'string', example: 'SATURDAY' } }],
        responses: { 200: { description: 'Schedule updated' } },
      },
    },
    '/closed-days': {
      get: {
        summary: 'List special closed days / holidays',
        tags: ['Closed Days'],
        responses: { 200: { description: 'List of closed days' } },
      },
      post: {
        summary: 'Add a restaurant closure date (Admin only)',
        tags: ['Closed Days'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['date', 'reason'],
                properties: {
                  date: { type: 'string', example: '2026-12-25' },
                  reason: { type: 'string', example: 'Christmas Holiday' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Closed day recorded' } },
      },
    },
    '/closed-days/{date}': {
      get: {
        summary: 'Check if a specific date is closed',
        tags: ['Closed Days'],
        parameters: [{ name: 'date', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Closure status' } },
      },
    },
    '/closed-days/{id}': {
      patch: {
        summary: 'Update or deactivate closed day (Admin only)',
        tags: ['Closed Days'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Closed day updated' } },
      },
    },
    '/availability': {
      get: {
        summary: 'Check booking time slots and availability',
        tags: ['Availability'],
        parameters: [
          { name: 'date', in: 'query', required: true, schema: { type: 'string', example: '2026-11-14' } },
          { name: 'time', in: 'query', required: true, schema: { type: 'string', example: '13:30' } },
          { name: 'guests', in: 'query', required: true, schema: { type: 'integer', example: 4 } },
        ],
        responses: { 200: { description: 'Available services, bookable slots, and table capacity' } },
      },
    },
    '/bookings': {
      get: {
        summary: 'List bookings (Customer sees own; Staff/Admin sees all)',
        tags: ['Bookings'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'date', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'customerId', in: 'query', schema: { type: 'string' } },
          { name: 'tableId', in: 'query', schema: { type: 'string' } },
          { name: 'source', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Bookings list' } },
      },
      post: {
        summary: 'Create reservation (Single or Multi-table Group Booking)',
        tags: ['Bookings'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['date', 'startTime', 'guests'],
                properties: {
                  date: { type: 'string', example: '2026-11-14' },
                  startTime: { type: 'string', example: '13:30' },
                  guests: { type: 'integer', example: 4 },
                  tableId: { type: 'string', example: '60c72b2f9b1d8b2bad5e0001', description: 'Single table reservation' },
                  tableIds: { type: 'array', items: { type: 'string' }, example: ['60c72b2f9b1d8b2bad5e0001', '60c72b2f9b1d8b2bad5e0002'], description: 'Multi-table group reservation' },
                  notes: { type: 'string', example: 'Table near the window please' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Booking confirmed' },
          409: { description: 'Conflict: Table already reserved for that time' },
        },
      },
    },
    '/bookings/{reference}': {
      get: {
        summary: 'Get reservation details by reference',
        tags: ['Bookings'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string', example: 'TX-20261114-A1B2C3' } }],
        responses: { 200: { description: 'Booking details' } },
      },
    },
    '/bookings/{reference}/cancel': {
      patch: {
        summary: 'Cancel reservation with reason',
        tags: ['Bookings'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { reason: { type: 'string', example: 'Plans changed' } },
              },
            },
          },
        },
        responses: { 200: { description: 'Booking marked as CANCELLED' } },
      },
    },
    '/bookings/{reference}/reschedule': {
      patch: {
        summary: 'Reschedule booking to new date, time or table',
        tags: ['Bookings'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['date', 'startTime', 'tableId'],
                properties: {
                  date: { type: 'string', example: '2026-11-15' },
                  startTime: { type: 'string', example: '14:00' },
                  tableId: { type: 'string', example: '60c72b2f9b1d8b2bad5e0001' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Booking rescheduled successfully' } },
      },
    },
    '/bookings/{reference}/arrive': {
      patch: {
        summary: 'Mark guest arrived (Staff & Admin)',
        tags: ['Bookings'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Status updated to ARRIVED' } },
      },
    },
    '/bookings/{reference}/seat': {
      patch: {
        summary: 'Seat guests at reserved table (Staff & Admin)',
        tags: ['Bookings'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Status updated to SEATED' } },
      },
    },
    '/bookings/{reference}/complete': {
      patch: {
        summary: 'Complete dining session (Staff & Admin)',
        tags: ['Bookings'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Status updated to COMPLETED' } },
      },
    },
    '/bookings/{reference}/no-show': {
      patch: {
        summary: 'Mark booking as no-show (Staff & Admin)',
        tags: ['Bookings'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Status updated to NO_SHOW' } },
      },
    },
    '/waitlist': {
      get: {
        summary: 'List waitlist entries (Customer sees own; Staff/Admin sees all)',
        tags: ['Waitlist'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'date', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'source', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Waitlist entries' } },
      },
      post: {
        summary: 'Join waitlist for fully booked date/time',
        tags: ['Waitlist'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['date', 'requestedStartTime', 'guests'],
                properties: {
                  date: { type: 'string', example: '2026-11-14' },
                  requestedStartTime: { type: 'string', example: '13:30' },
                  guests: { type: 'integer', example: 4 },
                  notes: { type: 'string', example: 'Flexible +/- 30 minutes' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Waitlist entry created' } },
      },
    },
    '/waitlist/{reference}': {
      get: {
        summary: 'Get waitlist entry by reference',
        tags: ['Waitlist'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Waitlist entry' } },
      },
    },
    '/waitlist/{reference}/cancel': {
      patch: {
        summary: 'Cancel waitlist request',
        tags: ['Waitlist'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Waitlist cancelled' } },
      },
    },
    '/waitlist/{reference}/notify': {
      patch: {
        summary: 'Notify customer of available table (Staff & Admin)',
        tags: ['Waitlist'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Waitlist entry updated to NOTIFIED' } },
      },
    },
    '/waitlist/{reference}/convert': {
      patch: {
        summary: 'Convert waitlist request into a confirmed booking (Staff & Admin)',
        tags: ['Waitlist'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Waitlist entry converted' } },
      },
    },
    '/waitlist/{reference}/expire': {
      patch: {
        summary: 'Expire waitlist entry (Staff & Admin)',
        tags: ['Waitlist'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Waitlist entry expired' } },
      },
    },
    '/notifications': {
      get: {
        summary: 'List user in-app notifications',
        tags: ['Notifications'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['UNREAD', 'READ'] } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Notifications list' } },
      },
    },
    '/notifications/read-all': {
      patch: {
        summary: 'Mark all notifications as read',
        tags: ['Notifications'],
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'All notifications marked as read' } },
      },
    },
    '/notifications/{id}': {
      get: {
        summary: 'Get notification by ID',
        tags: ['Notifications'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Notification details' } },
      },
    },
    '/notifications/{id}/read': {
      patch: {
        summary: 'Mark single notification as read',
        tags: ['Notifications'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Notification marked as READ' } },
      },
    },
    '/admin/jobs/status': {
      get: {
        summary: 'Get scheduler background jobs configuration and execution status (Admin only)',
        tags: ['Admin'],
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Scheduler job statuses and next execution times' } },
      },
    },
    '/admin/dashboard': {
      get: {
        summary: 'Get operational executive overview (Admin only)',
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'date', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'Executive dashboard metrics' } },
      },
    },
    '/admin/dashboard/bookings': {
      get: {
        summary: 'Get booking status distribution analytics (Staff & Admin)',
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Booking analytics breakdown' } },
      },
    },
    '/admin/dashboard/hourly': {
      get: {
        summary: 'Get hourly seating and booking distribution (Staff & Admin)',
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Hourly distribution metrics' } },
      },
    },
    '/admin/dashboard/services': {
      get: {
        summary: 'Get service-level analytics (Lunch, Dinner) (Staff & Admin)',
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Service breakdown metrics' } },
      },
    },
    '/admin/dashboard/tables': {
      get: {
        summary: 'Get table utilization rates and turnover (Staff & Admin)',
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Table utilization metrics' } },
      },
    },
    '/admin/dashboard/waitlist': {
      get: {
        summary: 'Get waitlist analytics and conversion rates (Staff & Admin)',
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'date', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'Waitlist metrics' } },
      },
    },
    '/admin/dashboard/live': {
      get: {
        summary: 'Get live floor operational summary count (Staff & Admin)',
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Live summary state counts' } },
      },
    },
    '/admin/dashboard/activity': {
      get: {
        summary: 'Get recent operational audit activity feed (Staff & Admin)',
        tags: ['Dashboard'],
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Recent audit activity events' } },
      },
    },
  },
};

module.exports = openApiSpec;
