// PharmaTrace AI — Registration Reference & Tracking PIN Utilities
// Conforms to Revision 3.2 §1.2 & §4.1 specifications
import crypto from 'crypto'
import {
  hashTrackingPin,
  compareTrackingPin,
  validateTrackingPin,
  PIN_LENGTH
} from './passwords.js'

/**
 * Generates an ephemeral 6-digit numeric tracking PIN.
 * Uses high-entropy cryptographically secure random integers.
 * Range: 100000 through 999999 inclusive.
 *
 * @returns {string} 6-digit string
 */
export function generateTrackingPin() {
  return crypto.randomInt(100000, 1000000).toString()
}

/**
 * Generates a unique sequential registration reference number for the current calendar year.
 * Format: REG-YYYY-XXXX (e.g. REG-2026-0001).
 * Executes with row-level locking (FOR UPDATE) inside an existing InnoDB transaction.
 *
 * @param {import('mysql2/promise').Connection} connection
 * @returns {Promise<string>}
 */
export async function generateReferenceNumber(connection) {
  const currentYear = new Date().getUTCFullYear()
  const prefix = `REG-${currentYear}-`

  const [rows] = await connection.query(
    `SELECT reference_number 
     FROM organization_registrations 
     WHERE reference_number LIKE CONCAT(?, '%') 
     ORDER BY reference_number DESC 
     LIMIT 1 
     FOR UPDATE`,
    [prefix]
  )

  let nextSequence = 1
  if (rows.length > 0 && rows[0].reference_number) {
    const parts = rows[0].reference_number.split('-')
    const lastSeq = parseInt(parts[2], 10)
    if (!isNaN(lastSeq) && lastSeq >= 1) {
      nextSequence = lastSeq + 1
    }
  }

  const sequencePadded = String(nextSequence).padStart(4, '0')
  return `${prefix}${sequencePadded}`
}

export {
  hashTrackingPin,
  compareTrackingPin,
  validateTrackingPin,
  PIN_LENGTH
}
