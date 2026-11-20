// PharmaTrace AI — Public Verification Engine
// Implements canonical /verify resolution against live MariaDB package records
import { execute } from '../config/database.js'
import {
  buildGs1DataMatrixPayload,
  buildCanonicalVerificationUrl
} from '../utils/datamatrix.js'
import { logger } from '../utils/logger.js'

export const VERIFICATION_DISCLAIMER =
  'Digital verification confirms this package identifier is recorded in the DGDA-registered supply chain. ' +
  'A valid QR verification response does not constitute physical proof of chemical composition or physical pack authenticity. ' +
  'Always inspect tamper-evident seals, packaging integrity, and physical hologram before use.'

/**
 * Resolves a package serial against the live MariaDB registry, determines statutory
 * supply chain status, and retrieves audit trail history.
 *
 * @param {string} rawSerial
 * @param {object} [options={}]
 * @param {boolean} [options.record=false] - Whether to increment verify_count
 * @param {string} [options.appBaseUrl]
 * @returns {Promise<object>} Verification result payload
 */
export async function verifyPackage(rawSerial, options = {}) {
  const serial = String(rawSerial || '').trim().toUpperCase()
  if (!serial) {
    return {
      valid: false,
      status: 'invalid',
      serial: '',
      message: 'Scan or enter a valid package serial or PharmaTrace verification URL.',
      disclaimer: VERIFICATION_DISCLAIMER
    }
  }

  const [rows] = await execute(
    `SELECT 
      p.serial,
      p.batch_id,
      p.manufacturer_org_id,
      p.allocation_type,
      p.government_allocation_id,
      p.custodian_org_id,
      p.status AS package_status,
      p.verify_count,
      p.created_at,
      p.updated_at,
      b.batch_no,
      DATE_FORMAT(b.mfd, '%Y-%m-%d') AS mfd,
      DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
      b.release_status AS batch_release_status,
      prod.id AS product_id,
      prod.name AS product_name,
      prod.generic_name,
      prod.strength,
      prod.dosage_form,
      prod.pack_size,
      prod.gtin,
      mfg.name AS manufacturer_name,
      cust.name AS custodian_name
    FROM packages p
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    JOIN organizations mfg ON p.manufacturer_org_id = mfg.id
    LEFT JOIN organizations cust ON p.custodian_org_id = cust.id
    WHERE p.serial = ?`,
    [serial]
  )

  if (rows.length === 0) {
    logger.warn('Public verification check failed: identifier not found in registry', { serial })
    return {
      valid: false,
      status: 'invalid',
      serial,
      message: 'This identifier could not be found in the registry. Check for typing errors or ask your pharmacist to inspect the pack.',
      disclaimer: VERIFICATION_DISCLAIMER
    }
  }

  const pkg = rows[0]
  const todayStr = new Date().toISOString().slice(0, 10)

  // Increment verification counter if requested
  let currentVerifyCount = Number(pkg.verify_count || 0)
  if (options.record) {
    await execute('UPDATE packages SET verify_count = verify_count + 1 WHERE serial = ?', [serial])
    currentVerifyCount += 1
  }

  // Derive statutory verification status
  let status = 'verified'
  let message = 'This package matches a recorded, unbroken supply-chain journey.'
  let statusReason = null

  if (pkg.exp < todayStr) {
    status = 'expired'
    message = 'This package is past its expiry date. Do not use it.'
    statusReason = `Expired on ${pkg.exp}`
  } else if (pkg.package_status === 'quarantined' || pkg.batch_release_status === 'Quarantined') {
    status = 'quarantined'
    message = 'This package has been quarantined due to a quality or damage report. Do not use it; ask your pharmacist.'
    statusReason = 'Quarantine status active'
  } else if (pkg.package_status === 'rejected' || pkg.batch_release_status === 'Rejected') {
    status = 'rejected'
    message = 'This package was rejected during regulatory review or receiving inspection. Do not use it.'
    statusReason = 'Rejected by QA or regulatory inspection'
  } else if (pkg.package_status === 'dispensed') {
    status = 'dispensed'
    message = 'This package has already been recorded as dispensed.'
    statusReason = 'Previously dispensed'
  } else if (pkg.package_status === 'available' && pkg.custodian_org_id === pkg.manufacturer_org_id) {
    status = 'unshipped'
    message = 'This serial is registered to the manufacturer, but the package has not been dispatched into the supply chain yet. It should not appear for retail sale.'
    statusReason = 'Withheld at manufacturer facility; not yet dispatched'
  } else if (pkg.package_status === 'missing') {
    status = 'missing'
    message = 'This package was recorded as missing during transit receiving reconciliation. Do not accept this pack.'
    statusReason = 'Reported missing during shipment receiving inspection'
  } else if (pkg.package_status === 'in_transit') {
    status = 'in_transit'
    message = 'This package is currently in transit within the authorized supply chain.'
  }

  // Fetch traceability events for journey reconstruction
  const [events] = await execute(
    `SELECT 
      e.id,
      e.event_type,
      e.actor_org_id,
      e.target_org_id,
      e.shipment_ref,
      e.event_payload,
      e.created_at,
      actor.name AS actor_name,
      target.name AS target_name
    FROM traceability_events e
    LEFT JOIN organizations actor ON e.actor_org_id = actor.id
    LEFT JOIN organizations target ON e.target_org_id = target.id
    WHERE e.serial = ?
    ORDER BY e.created_at ASC`,
    [serial]
  )

  const gs1 = buildGs1DataMatrixPayload({
    gtin: pkg.gtin,
    serial: pkg.serial,
    exp: pkg.exp,
    batchNo: pkg.batch_no,
    fallbackSeed: pkg.product_id
  })

  const verificationUrl = buildCanonicalVerificationUrl(pkg.serial, options.appBaseUrl)

  return {
    valid: true,
    status,
    message,
    statusReason,
    serial: pkg.serial,
    verificationUrl,
    gs1Hri: gs1.hri,
    verifyCount: currentVerifyCount,
    disclaimer: VERIFICATION_DISCLAIMER,
    product: {
      id: pkg.product_id,
      name: pkg.product_name,
      genericName: pkg.generic_name,
      strength: pkg.strength,
      dosageForm: pkg.dosage_form,
      packSize: pkg.pack_size,
      gtin: gs1.gtin14
    },
    batch: {
      id: pkg.batch_id,
      batchNo: pkg.batch_no,
      mfd: pkg.mfd,
      exp: pkg.exp,
      releaseStatus: pkg.batch_release_status
    },
    manufacturer: {
      id: pkg.manufacturer_org_id,
      name: pkg.manufacturer_name
    },
    custody: {
      currentCustodianOrgId: pkg.custodian_org_id,
      currentCustodianName: pkg.custodian_name,
      allocationType: pkg.allocation_type
    },
    journey: events.map(e => ({
      id: e.id,
      eventType: e.event_type,
      actorOrg: e.actor_name || e.actor_org_id,
      targetOrg: e.target_name || e.target_org_id || null,
      shipmentRef: e.shipment_ref || null,
      timestamp: e.created_at,
      details: typeof e.event_payload === 'string' ? JSON.parse(e.event_payload) : e.event_payload
    }))
  }
}
