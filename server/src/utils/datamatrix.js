// PharmaTrace AI — GS1 DataMatrix & QR Code Generation Engine
// Implements GS1 General Specifications §5.2 for pharmaceutical serialization
import bwipjs from 'bwip-js'
import QRCode from 'qrcode'
import { calculateGtinCheckDigit, validateGtin } from './gtin.js'

/**
 * Normalizes a GTIN to standard 14-digit format by left-padding with zeroes.
 * If GTIN is missing, generates a fallback pharmaceutical GTIN-14.
 *
 * @param {string|null|undefined} rawGtin
 * @param {string} [fallbackSeed='']
 * @returns {string} 14-digit GTIN string
 */
export function normalizeGtin14(rawGtin, fallbackSeed = '') {
  if (rawGtin && String(rawGtin).trim() !== '') {
    const cleaned = String(rawGtin).trim()
    const validation = validateGtin(cleaned)
    if (validation.valid && validation.value) {
      return validation.value.padStart(14, '0')
    }
  }

  // Derive reproducible fallback GTIN-14 from seed if no GTIN registered
  // Format: 0894 (Bangladesh DGDA prefix) + 9 digits + check digit
  const numericSeed = String(fallbackSeed).replace(/\D/g, '').padEnd(9, '0').slice(0, 9)
  const base13 = `0894${numericSeed}`
  const checkDigit = calculateGtinCheckDigit(base13)
  return `${base13}${checkDigit}`
}

/**
 * Formats an ISO date string (YYYY-MM-DD) into GS1 Date format (YYMMDD).
 *
 * @param {string|Date} dateVal
 * @returns {string} 6-digit YYMMDD string
 */
export function formatGs1Date(dateVal) {
  if (!dateVal) return '000000'
  const d = typeof dateVal === 'string' ? new Date(dateVal + 'T00:00:00Z') : new Date(dateVal)
  if (isNaN(d.getTime())) return '000000'

  const yy = String(d.getUTCFullYear()).slice(-2)
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

/**
 * Builds standard GS1 DataMatrix element strings and HRI (Human-Readable Interpretation).
 *
 * GS1 Application Identifiers used:
 *  (01) Global Trade Item Number (GTIN-14)
 *  (21) Serial Number (variable alphanumeric, up to 20 chars)
 *  (17) Expiration Date (YYMMDD)
 *  (10) Batch / Lot Number (variable alphanumeric, up to 20 chars)
 *
 * @param {object} params
 * @param {string} [params.gtin]
 * @param {string} params.serial
 * @param {string|Date} params.exp
 * @param {string} params.batchNo
 * @param {string} [params.fallbackSeed]
 * @returns {{ gtin14: string, hri: string, barcodeText: string }}
 */
export function buildGs1DataMatrixPayload({ gtin, serial, exp, batchNo, fallbackSeed }) {
  const gtin14 = normalizeGtin14(gtin, fallbackSeed || batchNo)
  const cleanSerial = String(serial).trim().toUpperCase()
  const expYymmdd = formatGs1Date(exp)
  const cleanBatchNo = String(batchNo).trim().toUpperCase()

  // Standard Human-Readable Interpretation (HRI) with bracketed AIs
  const hri = `(01)${gtin14}(21)${cleanSerial}(17)${expYymmdd}(10)${cleanBatchNo}`

  // Machine-readable barcode text for bwip-js GS1 DataMatrix parser
  // bwip-js uses bracketed notation for GS1 Application Identifiers
  const barcodeText = `(01)${gtin14}(21)${cleanSerial}(17)${expYymmdd}(10)${cleanBatchNo}`

  return {
    gtin14,
    serial: cleanSerial,
    expYymmdd,
    batchNo: cleanBatchNo,
    hri,
    barcodeText
  }
}

/**
 * Generates an SVG string for a GS1 DataMatrix code using bwip-js.
 *
 * @param {string} barcodeText - GS1 bracketed element string, e.g. (01)0894...(21)...
 * @param {object} [options={}]
 * @param {number} [options.scale=3]
 * @param {boolean} [options.includeHri=false]
 * @returns {string} SVG markup string
 */
export function generateGs1DataMatrixSvg(barcodeText, options = {}) {
  const scale = options.scale || 3
  const includeHri = Boolean(options.includeHri)

  return bwipjs.toSVG({
    bcid: 'gs1datamatrix',
    text: barcodeText,
    scale,
    includetext: includeHri,
    textxalign: 'center'
  })
}

/**
 * Generates an SVG string for a PharmaTrace QR verification code.
 *
 * @param {string} verificationUrl - Canonical /verify?serial=... URL
 * @param {object} [options={}]
 * @param {number} [options.width=220]
 * @returns {Promise<string>} SVG markup string
 */
export async function generateQrCodeSvg(verificationUrl, options = {}) {
  const width = options.width || 220
  return QRCode.toString(verificationUrl, {
    type: 'svg',
    width,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#0f172a', // Navy deep
      light: '#ffffff'
    }
  })
}

/**
 * Builds the canonical public verification URL for a given serial.
 *
 * @param {string} serial
 * @param {string} [appBaseUrl]
 * @returns {string} Full verification URL
 */
export function buildCanonicalVerificationUrl(serial, appBaseUrl) {
  const cleanSerial = encodeURIComponent(String(serial).trim().toUpperCase())
  const base = (appBaseUrl || process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '')
  return `${base}/verify?serial=${cleanSerial}`
}
