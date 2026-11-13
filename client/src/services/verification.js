// Demo-only verification logic. A real backend must replace this; repeated scans alone never prove counterfeiting.
import { packages as seedPackages, batches as seedBatches, shipments as seedShipments } from '../data/fixtures/index.js'
import { COMPLETED_RECEIPT_SHIPMENT_STATUSES, getCurrentDateIso } from './supplyChain.js'
import { extractSerialFromInput } from './qrPayload.js'

const REPEATED_SCAN_THRESHOLD = 2

export function hasCompleteTraceability(pkg, shipments = seedShipments, organizations = null) {
  const history = Array.isArray(pkg?.history) ? pkg.history : []
  if (history.length === 0) return false

  const [firstEvent, firstOrg] = history[0]
  if (firstEvent !== 'Package serialized' || !firstOrg) return false
  if (Array.isArray(organizations) && organizations.length > 0) {
    const originOrg = organizations.find(o => o.id === firstOrg)
    if (!originOrg || originOrg.type !== 'Manufacturer') return false
  } else if (firstOrg !== 'm1') {
    return false
  }

  const hasDispatch = history.some(([evt]) => typeof evt === 'string' && evt.startsWith('Shipment dispatched'))
  const hasAcceptance = history.some(([evt]) => typeof evt === 'string' && evt.startsWith('Custody accepted'))

  if (pkg.status === 'available') {
    return pkg.custodian === firstOrg && !hasDispatch && !hasAcceptance
  }

  if (pkg.status === 'in_transit') {
    if (!hasDispatch || history.length < 2) return false
    if (pkg.shipmentRef) {
      const shp = shipments.find(s => s.ref === pkg.shipmentRef)
      if (!shp || shp.status !== 'in_transit' || !shp.packageSerials?.includes(pkg.serial)) return false
    }
    return true
  }

  if (pkg.status === 'accepted') {
    if (!hasDispatch || !hasAcceptance) return false
    const lastAccepted = [...history].reverse().find(([evt]) => typeof evt === 'string' && evt.startsWith('Custody accepted'))
    if (!lastAccepted || lastAccepted[1] !== pkg.custodian) return false
    if (pkg.shipmentRef) {
      const shp = shipments.find(s => s.ref === pkg.shipmentRef)
      if (
        !shp ||
        !COMPLETED_RECEIPT_SHIPMENT_STATUSES.has(shp.status) ||
        !shp.packageSerials?.includes(pkg.serial)
      ) {
        return false
      }
    }
    return true
  }

  if (pkg.status === 'dispensed') {
    const last = history[history.length - 1]
    if (!hasDispatch || !hasAcceptance || !last || last[0] !== 'Dispensed' || last[1] !== pkg.custodian) {
      return false
    }
    return true
  }

  return false
}

export function verifySerial(raw, context = {}) {
  const packages = context.packages ?? seedPackages
  const batches = context.batches ?? seedBatches
  const shipments = context.shipments ?? seedShipments
  const organizations = context.organizations ?? null
  const today = context.today ?? getCurrentDateIso()

  const serial = extractSerialFromInput(raw)
  const p = serial ? packages.find(x => x.serial === serial) : null

  if (!p) {
    return {
      state: 'invalid',
      found: false,
      serial,
      authenticityStatus: 'invalid',
      supplyChainStatus: null,
      dispensingStatus: null,
      expiryStatus: null,
      unusualActivity: false,
      verifyCount: 0
    }
  }

  const b = batches.find(x => x.id === p.batchId) ?? null
  const verifyCount = p.verifyCount ?? 0
  const unusualActivity = verifyCount > REPEATED_SCAN_THRESHOLD
  const isDispensed = p.status === 'dispensed'
  const dispensingStatus = isDispensed ? 'dispensed' : 'not_dispensed'

  if (!b) {
    return {
      state: 'incomplete',
      found: true,
      serial,
      p,
      b: null,
      authenticityStatus: 'registered',
      supplyChainStatus: 'incomplete',
      dispensingStatus,
      expiryStatus: null,
      unusualActivity,
      verifyCount
    }
  }

  const isExpired = b.exp < today
  const expiryStatus = isExpired ? 'expired' : 'valid'

  const hasDispatch = p.history.some(([evt]) => typeof evt === 'string' && evt.startsWith('Shipment dispatched'))
  const hasAcceptance = p.history.some(([evt]) => typeof evt === 'string' && evt.startsWith('Custody accepted'))
  const [firstEvent, firstOrg] = p.history[0] ?? []
  const isKnownMfgOrigin =
    firstEvent === 'Package serialized' &&
    Boolean(firstOrg) &&
    (Array.isArray(organizations) && organizations.length > 0
      ? organizations.find(o => o.id === firstOrg)?.type === 'Manufacturer'
      : firstOrg === 'm1')
  const isUnshipped =
    isKnownMfgOrigin && p.custodian === firstOrg && p.status === 'available' && !hasDispatch && !hasAcceptance
  const isQuarantined = p.status === 'quarantined'
  const traceComplete = isUnshipped ? true : hasCompleteTraceability(p, shipments, organizations)

  const supplyChainStatus = isUnshipped
    ? 'unshipped'
    : isQuarantined
      ? 'quarantined'
      : !traceComplete
        ? 'incomplete'
        : p.status === 'in_transit'
          ? 'in_transit'
          : 'accepted'

  let state = 'verified'
  if (isExpired) state = 'expired'
  else if (isQuarantined) state = 'quarantined'
  else if (isDispensed) state = 'dispensed'
  else if (isUnshipped) state = 'unshipped'
  else if (!traceComplete) state = 'incomplete'

  return {
    state,
    found: true,
    serial,
    p,
    b,
    authenticityStatus: 'verified',
    supplyChainStatus,
    dispensingStatus,
    expiryStatus,
    unusualActivity,
    verifyCount
  }
}

export function formatPublicHistoryTitle(title) {
  const raw = String(title ?? '').trim()
  if (!raw) return 'Supply-chain milestone'
  if (raw.startsWith('Shipment dispatched')) return 'Shipment dispatched'
  if (raw.startsWith('Custody accepted')) return 'Custody accepted'
  if (raw.startsWith('Received damaged')) return 'Quarantined during inspection'
  return raw
    .replace(/\s*\([^)]*(?:SHP-|ses-|usr-|org-)[^)]*\)/gi, '')
    .replace(/\b(?:SHP|SES)-\d+\b/gi, '')
    .trim()
}
