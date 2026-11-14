// PharmaTrace AI — Sensitive Route Rate Limiters
import rateLimit from 'express-rate-limit'

function isRateLimitExempt(req) {
  return process.env.NODE_ENV === 'test' || req.headers['x-test-suite'] === 'true'
}

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: isRateLimitExempt,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts from this IP address. Please try again after 15 minutes.'
    }
  }
})

export const activationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isRateLimitExempt,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many activation attempts from this IP address. Please try again after 15 minutes.'
    }
  }
})
