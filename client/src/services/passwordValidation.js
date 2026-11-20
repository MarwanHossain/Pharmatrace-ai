// PharmaTrace AI — Client Password Policy Validation
// Conforms to Revision 3.2 §1.2 & §4.1 Password Security Specification

/**
 * Validates password complexity against Revision 3.2 rules:
 * - Minimum 10 characters
 * - Maximum 72 UTF-8 bytes
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 digit
 * - At least 1 special character
 *
 * @param {string} password
 * @returns {{
 *   hasMinLength: boolean,
 *   hasMaxLength: boolean,
 *   hasUppercase: boolean,
 *   hasLowercase: boolean,
 *   hasDigit: boolean,
 *   hasSymbol: boolean,
 *   isValid: boolean
 * }}
 */
export function validatePasswordComplexity(password) {
  const pwd = password || ''
  const hasMinLength = pwd.length >= 10
  const hasMaxLength = new TextEncoder().encode(pwd).length <= 72
  const hasUppercase = /[A-Z]/.test(pwd)
  const hasLowercase = /[a-z]/.test(pwd)
  const hasDigit = /[0-9]/.test(pwd)
  const hasSymbol = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/.test(pwd)

  const isValid =
    hasMinLength &&
    hasMaxLength &&
    hasUppercase &&
    hasLowercase &&
    hasDigit &&
    hasSymbol

  return {
    hasMinLength,
    hasMaxLength,
    hasUppercase,
    hasLowercase,
    hasDigit,
    hasSymbol,
    isValid
  }
}
