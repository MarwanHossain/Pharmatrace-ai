// PharmaTrace AI — Sensitive Route Rate Limiters
import rateLimit from 'express-rate-limit'
import { isAuthLockoutBypassEnabled } from '../config/env.js'

/**
 * Determines whether a request is exempt from rate limiting.
 * Strictly permitted ONLY in automated test execution environments (NODE_ENV === 'test').
 * In production or development, request headers CANNOT bypass rate limiting under any circumstance.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isRateLimitExempt(req) {
  return process.env.NODE_ENV === 'test' && req?.headers?.['x-test-suite'] === 'true'
}

/**
 * Determines whether a login request is exempt from IP-based rate limiting.
 * Returns true if the explicit development-only lockout bypass is enabled (non-production only).
 * In production, always falls back to isRateLimitExempt (which returns false in production).
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isLoginRateLimitExempt(req) {
  if (isAuthLockoutBypassEnabled()) {
    return true
  }
  return isRateLimitExempt(req)
}

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: isLoginRateLimitExempt,
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

export const changePasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: isRateLimitExempt,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many password change attempts from this IP address. Please try again after 15 minutes.'
    }
  }
})

export const registrationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 15, // 15 registration submissions per hour per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: isRateLimitExempt,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many registration attempts from this IP address. Please try again after one hour.'
    }
  }
})

export const trackingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 tracking attempts per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: isRateLimitExempt,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many tracking attempts from this IP address. Please try again after 15 minutes.'
    }
  }
})
