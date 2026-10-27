const crypto = require('crypto');

function text(value) {
  return String(value || '').trim();
}

function wholeNumber(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function requestFields(args) {
  return {
    date: text(args.date),
    startTime: text(args.time || args.startTime),
    guests: wholeNumber(args.guests),
    location: text(args.location || args.preference || (args.preferences && args.preferences.location)),
    shape: text(args.shape || (args.preferences && args.preferences.shape)),
    tag: text(args.tag || (args.preferences && args.preferences.tag)),
  };
}

function customerFrom(args, call) {
  return {
    name: text(args.name || args.customerName),
    email: text(args.email).toLowerCase(),
    phone: text(args.phone || call.from_number || call.fromNumber),
    customerId: text(args.customerId),
  };
}

function idempotencyKey(call, name, args) {
  const callId = text(call.call_id || call.callId) || 'call';
  const digest = crypto.createHash('sha256').update(JSON.stringify(args || {})).digest('hex').slice(0, 32);
  return `retell:${callId}:${name}:${digest}`.slice(0, 200);
}

function collectTableNumbers(args) {
  const values = [];
  if (Array.isArray(args.tableNumbers)) {
    values.push(...args.tableNumbers);
  } else if (args.tableNumbers) {
    values.push(...String(args.tableNumbers).split(','));
  }
  if (args.tableNumber || args.tablePreference) {
    values.push(args.tableNumber || args.tablePreference);
  }
  return [...new Set(values.map((value) => text(value)).filter(Boolean))];
}

function tableIdForNumber(number, availability) {
  const candidates = [
    ...(availability.recommendations || []),
    ...(availability.tables || []),
  ];
  const match = candidates.find((table) => String(table.tableNumber) === String(number));
  return match ? String(match.tableId || match.id) : '';
}

function selectTables(args, availability) {
  const numbers = collectTableNumbers(args);
  if (numbers.length > 3) {
    const error = new Error('A booking can include at most three tables');
    error.isOperational = true;
    error.statusCode = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (numbers.length > 1) {
    const tableIds = numbers.map((number) => tableIdForNumber(number, availability));
    if (tableIds.some((id) => !id)) {
      const error = new Error('One or more tables are not available');
      error.isOperational = true;
      error.statusCode = 400;
      error.code = 'INVALID_TABLE_SELECTION';
      throw error;
    }
    return { tableIds };
  }

  return { tableId: selectTableId(args, availability) };
}

function selectTableId(args, availability) {
  const requestedId = text(args.tableId);
  if (/^[a-f0-9]{24}$/i.test(requestedId)) {
    return requestedId;
  }

  const requestedNumber = text(args.tableNumber || args.tablePreference);
  const candidates = [
    ...(availability.recommendations || []),
    ...(availability.tables || []),
  ];

  if (requestedNumber) {
    const match = candidates.find((table) => String(table.tableNumber) === requestedNumber);
    return match ? String(match.tableId || match.id) : '';
  }

  const first = (availability.recommendations || [])[0];
  return first ? String(first.tableId) : '';
}

function parseRetellBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { kind: 'invalid' };
  }

  if (body.event && body.call && !body.name) {
    return { kind: 'call', event: text(body.event), callId: text(body.call.call_id) };
  }

  if (!text(body.name) || !body.args || typeof body.args !== 'object' || Array.isArray(body.args)) {
    return { kind: 'invalid' };
  }

  return {
    kind: 'function',
    name: text(body.name),
    args: body.args,
    call: body.call && typeof body.call === 'object' ? body.call : {},
  };
}

module.exports = {
  requestFields,
  customerFrom,
  idempotencyKey,
  selectTableId,
  selectTables,
  parseRetellBody,
};
