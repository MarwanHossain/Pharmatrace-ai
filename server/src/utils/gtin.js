// PharmaTrace AI — GS1 GTIN Validator & Check Digit Calculator
// Supports GTIN-8, GTIN-12, GTIN-13, and GTIN-14 with leading-zero preservation

const VALID_GTIN_LENGTHS = new Set([8, 12, 13, 14])

/**
 * Calculates the standard GS1 Modulo 10 check digit for a numeric digit string.
 *
 * @param {string} digitsWithoutCheckDigit - String of numeric digits
 * @returns {number} The calculated single-digit check digit (0-9)
 */
export function calculateGtinCheckDigit(digitsWithoutCheckDigit) {
  const str = String(digitsWithoutCheckDigit ?? '').trim()
  if (!/^\d+$/.test(str)) {
    throw new Error('Input must consist solely of numeric digits.')
  }

  // Weight alternation: rightmost digit before check digit has weight 3, preceding has weight 1, etc.
  let sum = 0
  let multiplier = 3

  for (let i = str.length - 1; i >= 0; i--) {
    sum += Number(str[i]) * multiplier
    multiplier = multiplier === 3 ? 1 : 3
  }

  const remainder = sum % 10
  return remainder === 0 ? 0 : 10 - remainder
}

/**
 * Validates a GTIN string according to GS1 standards.
 * Supports GTIN-8, GTIN-12, GTIN-13, and GTIN-14.
 *
 * @param {string|null|undefined} rawGtin
 * @param {object} [options={}]
 * @param {boolean} [options.required=false] - Whether a non-null GTIN is required
 * @returns {{ valid: boolean, value: string|null, error?: string }}
 */
export function validateGtin(rawGtin, { required = false } = {}) {
  if (rawGtin === null || rawGtin === undefined || String(rawGtin).trim() === '') {
    if (required) {
      return { valid: false, value: null, error: 'GTIN is required.' }
    }
    return { valid: true, value: null }
  }

  const gtin = String(rawGtin).trim()

  if (!/^\d+$/.test(gtin)) {
    return { valid: false, value: null, error: 'GTIN must contain only numeric digits.' }
  }

  if (!VALID_GTIN_LENGTHS.has(gtin.length)) {
    return {
      valid: false,
      value: null,
      error: `GTIN must be 8, 12, 13, or 14 digits (provided ${gtin.length} digits).`
    }
  }

  const payload = gtin.slice(0, -1)
  const expectedCheckDigit = calculateGtinCheckDigit(payload)
  const actualCheckDigit = Number(gtin.slice(-1))

  if (expectedCheckDigit !== actualCheckDigit) {
    return {
      valid: false,
      value: null,
      error: `Invalid GS1 check digit: expected ${expectedCheckDigit}, received ${actualCheckDigit}.`
    }
  }

  return { valid: true, value: gtin }
}
