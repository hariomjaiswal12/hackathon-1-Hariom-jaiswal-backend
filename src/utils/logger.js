function sanitize(message) {
  if (typeof message !== 'string') {
    return message;
  }
  return message
    .replace(/(bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi, '$1[REDACTED]')
    .replace(/(password["':\s=]+)[^\s"',;&]+/gi, '$1[REDACTED]')
    .replace(/(secret["':\s=]+)[^\s"',;&]+/gi, '$1[REDACTED]')
    .replace(/(token["':\s=]+)[^\s"',;&]+/gi, '$1[REDACTED]');
}

function write(level, message) {
  const safeMessage = sanitize(typeof message === 'string' ? message : String(message));
  const line = `[${new Date().toISOString()}] ${level} ${safeMessage}`;

  if (level === 'ERROR') {
    console.error(line);
    return;
  }

  if (level === 'WARN') {
    console.warn(line);
    return;
  }

  console.log(line);
}

const logger = {
  info(message) {
    write('INFO', message);
  },
  warn(message) {
    write('WARN', message);
  },
  error(message) {
    write('ERROR', message);
  },
};

module.exports = logger;
