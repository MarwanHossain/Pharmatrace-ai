// PharmaTrace AI — Centralized Development & Operational Logger
// Ensures consistent formatting, ISO timestamps, and credential redaction.

const SENSITIVE_KEY_REGEX = /(password|token|secret|authorization|credential|api[_-]?key)/i

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta
  if (Array.isArray(meta)) return meta.map(sanitizeMeta)

  const sanitized = {}
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      sanitized[key] = '[REDACTED]'
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeMeta(value)
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}

function formatMessage(level, message, meta) {
  const timestamp = new Date().toISOString()
  const metaString = meta ? ` ${JSON.stringify(sanitizeMeta(meta))}` : ''
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaString}`
}

export const logger = {
  info(message, meta) {
    console.log(formatMessage('info', message, meta))
  },

  warn(message, meta) {
    console.warn(formatMessage('warn', message, meta))
  },

  error(message, meta) {
    console.error(formatMessage('error', message, meta))
  },

  debug(message, meta) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatMessage('debug', message, meta))
    }
  }
}
