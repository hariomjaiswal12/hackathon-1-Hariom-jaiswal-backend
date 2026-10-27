function text(value) {
  return String(value || '').trim();
}

function commandText(message) {
  if (!message || typeof message !== 'object') {
    return '';
  }
  if (message.type === 'text') {
    return text(message.text && message.text.body);
  }
  if (message.type === 'interactive') {
    const interactive = message.interactive || {};
    return text(
      (interactive.button_reply && interactive.button_reply.id)
      || (interactive.list_reply && interactive.list_reply.id)
    );
  }
  return '';
}

function parseCommand(raw) {
  const input = text(raw);
  let match = /^availability\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{1,3})$/i.exec(input);
  if (match) {
    return { action: 'availability', date: match[1], startTime: match[2], guests: Number(match[3]) };
  }

  match = /^book\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{1,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*(?:\|\s*([^|]*))?(?:\|\s*([A-Za-z0-9,\s]+))?\s*$/i.exec(input);
  if (match) {
    return {
      action: 'book',
      date: match[1],
      startTime: match[2],
      guests: Number(match[3]),
      name: match[4].trim(),
      email: match[5].trim().toLowerCase(),
      notes: match[6] ? match[6].trim() : '',
      tableNumbers: match[7] ? match[7].split(',').map((value) => value.trim()).filter(Boolean) : [],
    };
  }

  match = /^waitlist\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(\d{1,3})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*$/i.exec(input);
  if (match) {
    return {
      action: 'waitlist',
      date: match[1],
      startTime: match[2],
      guests: Number(match[3]),
      name: match[4].trim(),
      email: match[5].trim().toLowerCase(),
    };
  }

  match = /^cancel\s+(TX-[A-Z0-9-]+)(?:\s+([\s\S]*))?$/i.exec(input);
  if (match) {
    return { action: 'cancel', reference: match[1].toUpperCase(), reason: match[2] ? match[2].trim() : '' };
  }

  match = /^reschedule\s+(TX-[A-Z0-9-]+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/i.exec(input);
  if (match) {
    return { action: 'reschedule', reference: match[1].toUpperCase(), date: match[2], startTime: match[3] };
  }

  return null;
}

function phoneFrom(message) {
  const digits = text(message && message.from).replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '';
}

function contactName(contact) {
  return text(contact && contact.profile && contact.profile.name);
}

function incomingMessages(body) {
  const messages = [];
  const entries = Array.isArray(body && body.entry) ? body.entry : [];

  entries.forEach((entry) => {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    changes.forEach((change) => {
      const value = change.value || {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const batch = Array.isArray(value.messages) ? value.messages : [];
      batch.forEach((message) => {
        const contact = contacts.find((item) => item.wa_id === message.from) || contacts[0] || null;
        messages.push({ message, contact });
      });
    });
  });

  return messages;
}

function idempotencyKey(messageId, action) {
  return `whatsapp:${text(messageId)}:${action}`.slice(0, 200);
}

module.exports = {
  commandText,
  parseCommand,
  phoneFrom,
  contactName,
  incomingMessages,
  idempotencyKey,
};
