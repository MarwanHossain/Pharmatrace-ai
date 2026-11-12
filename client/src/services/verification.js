// Demo-only verification logic. A real backend must replace this; repeated scans alone never prove counterfeiting.
import { packages as seedPackages, batches as seedBatches, shipments as seedShipments, TODAY } from '../data/fixtures/index.js'

const REPEATED_SCAN_THRESHOLD = 2

export function hasCompleteTraceability(pkg, shipments = seedShipments) {
  const history = Array.isArray(pkg?.history) ? pkg.history : []
  if (history.length === 0) return false

  const [firstEvent, firstOrg] = history[0]
  if (firstEvent !== 'Package serialized' || firstOrg !== 'm1') return false

  const hasDispatch = history.some(([evt]) => typeof evt === 'string' && evt.startsWith('Shipment dispatched'))
  const hasAcceptance = history.some(([evt]) => typeof evt === 'string' && evt.startsWith('Custody accepted'))

  if (pkg.status === 'available') {
    return pkg.custodian === 'm1' && !hasDispatch && !hasAcceptance
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
      if (!shp || shp.status !== 'accepted' || !shp.packageSerials?.includes(pkg.serial)) return false
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
  const today = context.today ?? TODAY

  const serial = String(raw ?? '').trim().toUpperCase()
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
  const isUnshipped = p.custodian === 'm1' && p.status === 'available' && !hasDispatch && !hasAcceptance
  const traceComplete = isUnshipped ? true : hasCompleteTraceability(p, shipments)

  const supplyChainStatus = isUnshipped
    ? 'unshipped'
    : !traceComplete
      ? 'incomplete'
      : p.status === 'in_transit'
        ? 'in_transit'
        : 'accepted'

  let state = 'verified'
  if (isExpired) state = 'expired'
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
