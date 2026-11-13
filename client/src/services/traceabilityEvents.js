import { nextSequentialId } from './demoStorage.js'

export const TRACEABILITY_EVENT_TYPES = {
  // Manufacturer
  MANUFACTURER_QR_VERIFIED: 'MANUFACTURER_QR_VERIFIED',
  MANUFACTURER_QR_VERIFICATION_FAILED: 'MANUFACTURER_QR_VERIFICATION_FAILED',
  MANUFACTURER_DISPATCHED: 'MANUFACTURER_DISPATCHED',

  // Distributor
  DISTRIBUTOR_RECEIVING_SCANNED: 'DISTRIBUTOR_RECEIVING_SCANNED',
  DISTRIBUTOR_RECEIVING_VERIFIED: 'DISTRIBUTOR_RECEIVING_VERIFIED',
  DISTRIBUTOR_RECEIVED: 'DISTRIBUTOR_RECEIVED',
  DISTRIBUTOR_PRE_DISPATCH_SCANNED: 'DISTRIBUTOR_PRE_DISPATCH_SCANNED',
  DISTRIBUTOR_PRE_DISPATCH_VERIFIED: 'DISTRIBUTOR_PRE_DISPATCH_VERIFIED',
  DISTRIBUTOR_DISPATCHED: 'DISTRIBUTOR_DISPATCHED',

  // Wholesaler
  WHOLESALER_RECEIVING_SCANNED: 'WHOLESALER_RECEIVING_SCANNED',
  WHOLESALER_RECEIVING_VERIFIED: 'WHOLESALER_RECEIVING_VERIFIED',
  WHOLESALER_RECEIVED: 'WHOLESALER_RECEIVED',
  WHOLESALER_PRE_DISPATCH_SCANNED: 'WHOLESALER_PRE_DISPATCH_SCANNED',
  WHOLESALER_PRE_DISPATCH_VERIFIED: 'WHOLESALER_PRE_DISPATCH_VERIFIED',
  WHOLESALER_DISPATCHED: 'WHOLESALER_DISPATCHED',

  // Pharmacy
  PHARMACY_RECEIVING_SCANNED: 'PHARMACY_RECEIVING_SCANNED',
  PHARMACY_RECEIVING_VERIFIED: 'PHARMACY_RECEIVING_VERIFIED',
  PHARMACY_RECEIVED: 'PHARMACY_RECEIVED',
  PHARMACY_PRE_DISPENSE_SCANNED: 'PHARMACY_PRE_DISPENSE_SCANNED',
  PHARMACY_PRE_DISPENSE_VERIFIED: 'PHARMACY_PRE_DISPENSE_VERIFIED',
  PHARMACY_DISPENSED: 'PHARMACY_DISPENSED',

  // Public Customer
  PUBLIC_VERIFICATION_RECORDED: 'PUBLIC_VERIFICATION_RECORDED'
}

export const ROLE_TO_EVENT_PREFIX = {
  manufacturer: 'MANUFACTURER',
  distributor: 'DISTRIBUTOR',
  wholesaler: 'WHOLESALER',
  pharmacy: 'PHARMACY'
}

export const ORG_TYPE_TO_EVENT_PREFIX = {
  Manufacturer: 'MANUFACTURER',
  Distributor: 'DISTRIBUTOR',
  Wholesaler: 'WHOLESALER',
  Pharmacy: 'PHARMACY'
}

const VALID_CATEGORIES = new Set(['observation', 'transaction'])

export function createTraceabilityEventRecord(
  existingEvents = [],
  {
    eventType,
    serial = null,
    packageId = null,
    batchId = null,
    actorUserId = null,
    actorRole = null,
    organizationId = null,
    shipmentId = null,
    timestamp = null,
    checkpoint = '',
    category = 'observation',
    outcome = 'success',
    failureReason = null
  }
) {
  const cleanSerial = serial ? String(serial).trim().toUpperCase() : null
  const cleanPkgId = packageId ? String(packageId).trim().toUpperCase() : cleanSerial
  const cleanCategory = VALID_CATEGORIES.has(category) ? category : 'observation'

  return {
    id: nextSequentialId(existingEvents, 'evt'),
    eventType: String(eventType ?? '').trim(),
    packageId: cleanPkgId,
    serial: cleanSerial,
    batchId: batchId ?? null,
    actorUserId: actorUserId ?? null,
    actorRole: actorRole ?? null,
    organizationId: organizationId ?? null,
    shipmentId: shipmentId ?? null,
    timestamp: timestamp || new Date().toISOString(),
    checkpoint: String(checkpoint ?? '').trim(),
    category: cleanCategory,
    outcome: String(outcome ?? 'success').trim(),
    failureReason: failureReason ? String(failureReason).trim() : null
  }
}

export function appendTraceabilityEvents(existingEvents = [], payloads = []) {
  const next = Array.isArray(existingEvents) ? [...existingEvents] : []
  const created = []

  for (const payload of payloads) {
    if (!payload || !payload.eventType) continue
    const record = createTraceabilityEventRecord(next, payload)
    next.push(record)
    created.push(record)
  }

  return { nextEvents: next, created }
}

export function getPackageTraceabilityEvents(events = [], serial) {
  const normalized = String(serial ?? '').trim().toUpperCase()
  if (!normalized || !Array.isArray(events)) return []
  return events.filter(
    e => e?.serial === normalized || e?.packageId === normalized
  )
}

export function getPreDispatchEventTypeForRole(role) {
  if (role === 'manufacturer') return TRACEABILITY_EVENT_TYPES.MANUFACTURER_QR_VERIFIED
  if (role === 'distributor') return TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_PRE_DISPATCH_VERIFIED
  if (role === 'wholesaler') return TRACEABILITY_EVENT_TYPES.WHOLESALER_PRE_DISPATCH_VERIFIED
  return null
}

export function getDispatchTransactionTypeForOrgType(orgType) {
  if (orgType === 'Manufacturer') return TRACEABILITY_EVENT_TYPES.MANUFACTURER_DISPATCHED
  if (orgType === 'Distributor') return TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_DISPATCHED
  if (orgType === 'Wholesaler') return TRACEABILITY_EVENT_TYPES.WHOLESALER_DISPATCHED
  return null
}

export function hasCurrentPreDispatchVerification(events = [], { serial, orgId, role }) {
  const normalized = String(serial ?? '').trim().toUpperCase()
  const targetEventType = getPreDispatchEventTypeForRole(role)
  if (!normalized || !orgId || !targetEventType || !Array.isArray(events)) {
    return { verified: false, event: null }
  }

  const pkgEvents = getPackageTraceabilityEvents(events, normalized)
  const boundaryTypes = new Set([
    TRACEABILITY_EVENT_TYPES.MANUFACTURER_DISPATCHED,
    TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_DISPATCHED,
    TRACEABILITY_EVENT_TYPES.WHOLESALER_DISPATCHED,
    TRACEABILITY_EVENT_TYPES.DISTRIBUTOR_RECEIVED,
    TRACEABILITY_EVENT_TYPES.WHOLESALER_RECEIVED,
    TRACEABILITY_EVENT_TYPES.PHARMACY_RECEIVED,
    TRACEABILITY_EVENT_TYPES.PHARMACY_DISPENSED
  ])

  for (let i = pkgEvents.length - 1; i >= 0; i -= 1) {
    const evt = pkgEvents[i]
    if (
      evt.eventType === targetEventType &&
      evt.organizationId === orgId &&
      evt.outcome === 'success'
    ) {
      return { verified: true, event: evt }
    }
    if (boundaryTypes.has(evt.eventType)) {
      return { verified: false, event: null }
    }
  }

  return { verified: false, event: null }
}
