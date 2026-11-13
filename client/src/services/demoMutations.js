import { generateBatchSerials } from './serialization.js'
import { hasCompleteTraceability, verifySerial } from './verification.js'
import { extractSerialFromInput } from './qrPayload.js'
import {
  ORG_TYPE_TO_EVENT_PREFIX,
  TRACEABILITY_EVENT_TYPES,
  appendTraceabilityEvents,
  getDispatchTransactionTypeForOrgType,
  hasCurrentPreDispatchVerification
} from './traceabilityEvents.js'
import {
  getCurrentDateIso,
  validatePackageForDispatch,
  validateShipmentForDispatch,
  applyReceivingSession,
  closeShipmentReconciliation as closeReconciliationPure,
  recordRejectedHandover as recordHandoverPure,
  validatePackageForDispense
} from './supplyChain.js'
import {
  authorizeActorForRole,
  nextSequentialId,
  nextShipmentRef,
  ROLE_TO_ORG_TYPE,
  VALID_ROLES
} from './demoStorage.js'

export function mutateGenerateSerials(data, { batchId, quantity }, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['manufacturer'])
  if (!auth.ok) return auth

  const batch = data.batches.find(b => b.id === batchId) ?? null
  if (!batch) {
    return { ok: false, error: 'Selected batch was not found.' }
  }

  const product = data.products.find(p => p.id === batch.productId) ?? null
  const ownerOrgId = batch.orgId ?? product?.orgId ?? 'm1'

  if (auth.orgId && ownerOrgId !== auth.orgId) {
    return { ok: false, error: 'Batch belongs to another manufacturer organization.' }
  }

  const ownerOrg = data.organizations.find(o => o.id === ownerOrgId)
  if (!ownerOrg || ownerOrg.type !== 'Manufacturer' || (ownerOrg.status ?? 'active') !== 'active') {
    return { ok: false, error: 'Manufacturer organization is not active or eligible to serialize packages.' }
  }

  const result = generateBatchSerials({
    batch,
    quantity,
    packages: data.packages,
    date: getCurrentDateIso(),
    manufacturerOrgId: ownerOrgId
  })
  if (!result.ok) return result

  return {
    ok: true,
    nextData: {
      ...data,
      packages: [...result.added, ...data.packages]
    },
    result
  }
}

export function mutateVerifyAndRecord(data, rawSerial) {
  const normalized = extractSerialFromInput(rawSerial)
  const today = getCurrentDateIso()
  const targetPkg = normalized ? data.packages.find(p => p.serial === normalized) ?? null : null

  if (!targetPkg) {
    return {
      ok: true,
      mutated: false,
      nextData: data,
      result: verifySerial(rawSerial, {
        packages: data.packages,
        batches: data.batches,
        shipments: data.shipments,
        organizations: data.organizations,
        today
      })
    }
  }

  const nextPackages = data.packages.map(p =>
    p.serial === normalized ? { ...p, verifyCount: (p.verifyCount ?? 0) + 1 } : p
  )

  const verificationResult = verifySerial(normalized, {
    packages: nextPackages,
    batches: data.batches,
    shipments: data.shipments,
    organizations: data.organizations,
    today
  })

  const { nextEvents, created } = appendTraceabilityEvents(data.traceabilityEvents, [
    {
      eventType: TRACEABILITY_EVENT_TYPES.PUBLIC_VERIFICATION_RECORDED,
      serial: normalized,
      packageId: normalized,
      batchId: targetPkg.batchId ?? null,
      actorUserId: null,
      actorRole: 'public_customer',
      organizationId: null,
      shipmentId: null,
      checkpoint: 'public_verification',
      category: 'observation',
      outcome: verificationResult.state,
      failureReason:
        verificationResult.state !== 'verified'
          ? `Verification state reported: ${verificationResult.state}`
          : null
    }
  ])

  return {
    ok: true,
    mutated: true,
    nextData: {
      ...data,
      packages: nextPackages,
      traceabilityEvents: nextEvents
    },
    result: {
      ...verificationResult,
      eventId: created[0]?.id ?? null
    }
  }
}

export function mutateRecordTraceabilityEvents(data, rawPayloads, actor = null) {
  const items = Array.isArray(rawPayloads) ? rawPayloads : [rawPayloads]
  if (items.length === 0) {
    return { ok: false, error: 'At least one traceability event payload is required.' }
  }

  const auth = actor
    ? authorizeActorForRole(data, actor, ['manufacturer', 'distributor', 'wholesaler', 'pharmacy', 'investigator', 'admin'])
    : { ok: true, anonymous: true, orgId: null }
  if (!auth.ok) return auth

  const packageBySerial = new Map((data.packages ?? []).map(p => [p.serial, p]))
  const sanitized = []

  for (const item of items) {
    if (!item || !item.eventType) {
      return { ok: false, error: 'Traceability event type is required.' }
    }
    if (item.category === 'transaction') {
      return {
        ok: false,
        error: 'Transaction events can only be emitted by authorized business transactions.'
      }
    }
    const cleanSerial = item.serial
      ? extractSerialFromInput(String(item.serial)) || String(item.serial).trim().toUpperCase()
      : null
    const pkg = cleanSerial ? packageBySerial.get(cleanSerial) ?? null : null
    sanitized.push({
      ...item,
      serial: cleanSerial,
      packageId: cleanSerial,
      batchId: item.batchId ?? pkg?.batchId ?? null,
      actorUserId: actor?.userId ?? item.actorUserId ?? null,
      actorRole: actor?.role ?? item.actorRole ?? 'public_customer',
      organizationId: actor?.orgId ?? item.organizationId ?? null,
      category: 'observation'
    })
  }

  const { nextEvents, created } = appendTraceabilityEvents(data.traceabilityEvents, sanitized)
  return {
    ok: true,
    nextData: {
      ...data,
      traceabilityEvents: nextEvents
    },
    result: { ok: true, events: created }
  }
}

export function mutateAddProduct(data, product, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['manufacturer'])
  if (!auth.ok) return auth

  const ownerOrgId = auth.orgId ?? product?.orgId ?? 'm1'
  const ownerOrg = data.organizations.find(o => o.id === ownerOrgId)
  if (!ownerOrg || ownerOrg.type !== 'Manufacturer' || (ownerOrg.status ?? 'active') !== 'active') {
    return { ok: false, error: 'Only an active manufacturer organization can register products.' }
  }

  const name = String(product?.name ?? '').trim()
  const strength = String(product?.strength ?? '').trim()
  const form = String(product?.form ?? '').trim()
  const packSize = String(product?.packSize ?? '').trim()
  const gtin = String(product?.gtin ?? '').trim().toUpperCase()

  if (!name || !strength || !form || !packSize || !gtin) {
    return { ok: false, error: 'All product fields are required.' }
  }

  if (data.products.some(p => String(p.gtin ?? '').trim().toUpperCase() === gtin)) {
    return { ok: false, error: 'A product with this GTIN already exists.' }
  }

  const item = {
    status: 'active',
    ...product,
    id: nextSequentialId(data.products, 'pr'),
    orgId: ownerOrgId,
    name,
    strength,
    form,
    packSize,
    gtin
  }

  return {
    ok: true,
    nextData: {
      ...data,
      products: [...data.products, item]
    },
    result: { ...item, ok: true, product: item }
  }
}

export function mutateUpdateProduct(data, id, updates, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['manufacturer'])
  if (!auth.ok) return auth

  const existing = data.products.find(p => p.id === id)
  if (!existing) {
    return { ok: false, error: 'Product was not found.' }
  }
  const ownerOrgId = existing.orgId ?? 'm1'
  if (auth.orgId && ownerOrgId !== auth.orgId) {
    return { ok: false, error: 'Cross-organization access denied: product belongs to another manufacturer.' }
  }

  const updated = { ...existing, ...updates, id: existing.id, orgId: ownerOrgId }
  return {
    ok: true,
    nextData: {
      ...data,
      products: data.products.map(p => (p.id === id ? updated : p))
    },
    result: { ok: true, product: updated }
  }
}

export function mutateAddBatch(data, batch, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['manufacturer'])
  if (!auth.ok) return auth

  const no = String(batch?.no ?? '').trim().toUpperCase()
  const quantity = Number(batch?.quantity)

  if (!batch?.productId || !no || !batch?.mfd || !batch?.exp || !Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: 'Complete batch details and a positive whole quantity are required.' }
  }

  if (batch.exp <= batch.mfd) {
    return { ok: false, error: 'Expiry date must be after the manufactured date.' }
  }

  const product = data.products.find(p => p.id === batch.productId)
  if (!product) {
    return { ok: false, error: 'Selected product was not found.' }
  }

  const ownerOrgId = product.orgId ?? auth.orgId ?? 'm1'
  if (auth.orgId && ownerOrgId !== auth.orgId) {
    return { ok: false, error: 'Cross-organization access denied: product belongs to another manufacturer.' }
  }

  if ((product.status ?? 'active') !== 'active') {
    return { ok: false, error: `Product "${product.name}" is inactive and cannot create new batches.` }
  }

  const ownerOrg = data.organizations.find(o => o.id === ownerOrgId)
  if (!ownerOrg || ownerOrg.type !== 'Manufacturer' || (ownerOrg.status ?? 'active') !== 'active') {
    return { ok: false, error: 'Manufacturer organization is not active.' }
  }

  if (data.batches.some(b => String(b.no ?? '').trim().toUpperCase() === no)) {
    return { ok: false, error: `Batch number ${no} already exists.` }
  }

  const item = {
    release: 'Pending QA',
    ...batch,
    no,
    quantity,
    orgId: ownerOrgId,
    id: nextSequentialId(data.batches, 'b')
  }

  return {
    ok: true,
    nextData: {
      ...data,
      batches: [...data.batches, item]
    },
    result: { ...item, ok: true, batch: item }
  }
}

export function mutateReleaseBatch(data, id, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['manufacturer'])
  if (!auth.ok) return auth

  const batch = data.batches.find(b => b.id === id)
  if (!batch) {
    return { ok: false, error: 'Batch not found.' }
  }

  const product = data.products.find(p => p.id === batch.productId)
  const ownerOrgId = batch.orgId ?? product?.orgId ?? 'm1'
  if (auth.orgId && ownerOrgId !== auth.orgId) {
    return { ok: false, error: 'Cross-organization access denied: batch belongs to another manufacturer.' }
  }

  const ownerOrg = data.organizations.find(o => o.id === ownerOrgId)
  if (!ownerOrg || (ownerOrg.status ?? 'active') !== 'active') {
    return { ok: false, error: 'Manufacturer organization is not active.' }
  }

  return {
    ok: true,
    nextData: {
      ...data,
      batches: data.batches.map(b => (b.id === id ? { ...b, release: 'Released' } : b))
    },
    result: { ok: true }
  }
}

export function mutateCreateShipment(data, { from, to, packageSerials = [] }, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['manufacturer', 'distributor', 'wholesaler'])
  if (!auth.ok) return auth

  const effectiveFrom = actor?.orgId ?? from
  if (actor?.orgId && from && from !== actor.orgId) {
    return { ok: false, error: 'Cross-organization dispatch creation denied.' }
  }

  const today = getCurrentDateIso()
  const uniqueSerials = [
    ...new Set((packageSerials ?? []).map(s => String(s).trim().toUpperCase()).filter(Boolean))
  ]

  if (!effectiveFrom || !to) {
    return { ok: false, error: 'Origin and destination organizations are required.' }
  }
  if (effectiveFrom === to) {
    return { ok: false, error: 'Origin and destination organizations must be different.' }
  }
  if (uniqueSerials.length === 0) {
    return { ok: false, error: 'Select at least one eligible package for the shipment.' }
  }

  const fromOrg = data.organizations.find(o => o.id === effectiveFrom)
  if (!fromOrg) {
    return { ok: false, error: 'Origin organization was not found.' }
  }
  if ((fromOrg.status ?? 'active') !== 'active') {
    return {
      ok: false,
      error: `Origin organization "${fromOrg.name}" is ${fromOrg.status} and cannot create shipments.`
    }
  }

  const destOrg = data.organizations.find(o => o.id === to)
  if (!destOrg) {
    return { ok: false, error: 'Destination organization was not found.' }
  }
  if ((destOrg.status ?? 'active') !== 'active') {
    return {
      ok: false,
      error: `Destination organization "${destOrg.name}" is ${destOrg.status} and cannot receive shipments.`
    }
  }

  const blocked = []
  for (const serial of uniqueSerials) {
    const pkg = data.packages.find(p => p.serial === serial) ?? null
    const batch = pkg ? data.batches.find(b => b.id === pkg.batchId) ?? null : null
    const res = validatePackageForDispatch({
      pkg,
      batch,
      fromOrgId: effectiveFrom,
      fromOrgType: fromOrg.type,
      organizations: data.organizations,
      shipments: data.shipments,
      today
    })
    if (!res.eligible) {
      blocked.push(`${serial}: ${res.reasons.join(' ')}`)
    }
  }

  if (blocked.length > 0) {
    return {
      ok: false,
      error: blocked[0],
      errors: blocked
    }
  }

  const ref = nextShipmentRef(data.shipments)
  const shipment = {
    ref,
    from: effectiveFrom,
    to,
    count: uniqueSerials.length,
    packageSerials: uniqueSerials,
    created: today,
    dispatched: null,
    status: 'pending',
    receiving: 'Not dispatched',
    packageDispositions: {},
    receivingSessions: [],
    unmatchedScans: []
  }

  const serialSet = new Set(uniqueSerials)
  return {
    ok: true,
    nextData: {
      ...data,
      shipments: [shipment, ...data.shipments],
      packages: data.packages.map(p => (serialSet.has(p.serial) ? { ...p, shipmentRef: ref } : p))
    },
    result: { ok: true, shipment, ref: shipment.ref }
  }
}

export function mutateDispatchShipment(data, ref, actor = null, options = {}) {
  const shipment = data.shipments.find(s => s.ref === ref) ?? null
  const auth = authorizeActorForRole(data, actor, ['manufacturer', 'distributor', 'wholesaler'], {
    targetOrgId: shipment?.from
  })
  if (!auth.ok) return auth

  const today = getCurrentDateIso()
  const validation = validateShipmentForDispatch({
    shipment,
    packages: data.packages,
    batches: data.batches,
    organizations: data.organizations,
    shipments: data.shipments,
    today
  })

  if (!validation.eligible) {
    return {
      ok: false,
      error: validation.errors[0] ?? 'Shipment is not eligible for dispatch.',
      errors: validation.errors,
      packageReasons: validation.packageReasons
    }
  }

  const fromOrg = data.organizations.find(o => o.id === shipment.from) ?? null
  const effectiveRole = actor?.role ?? (fromOrg?.type ? fromOrg.type.toLowerCase() : null)

  if (options?.requireQrVerification) {
    const missingVerification = (shipment.packageSerials ?? []).filter(serial => {
      const check = hasCurrentPreDispatchVerification(data.traceabilityEvents, {
        serial,
        orgId: shipment.from,
        role: effectiveRole
      })
      return !check.verified
    })
    if (missingVerification.length > 0) {
      return {
        ok: false,
        error: `Pre-dispatch QR verification is required before dispatching ${ref}: missing verified scan for ${missingVerification.join(', ')}.`,
        missingVerification
      }
    }
  }

  const serialSet = new Set(shipment.packageSerials ?? [])
  const pkgBySerial = new Map(data.packages.map(p => [p.serial, p]))
  const dispatchEventType = getDispatchTransactionTypeForOrgType(fromOrg?.type)
  const timestamp = new Date().toISOString()

  const dispatchEvents = dispatchEventType
    ? (shipment.packageSerials ?? []).map(serial => ({
        eventType: dispatchEventType,
        serial,
        packageId: serial,
        batchId: pkgBySerial.get(serial)?.batchId ?? null,
        actorUserId: actor?.userId ?? null,
        actorRole: effectiveRole,
        organizationId: shipment.from,
        shipmentId: ref,
        timestamp,
        checkpoint: `${String(effectiveRole || 'org')}_dispatch`,
        category: 'transaction',
        outcome: 'success'
      }))
    : []

  const { nextEvents } = appendTraceabilityEvents(data.traceabilityEvents, dispatchEvents)

  return {
    ok: true,
    nextData: {
      ...data,
      shipments: data.shipments.map(s =>
        s.ref === ref
          ? { ...s, status: 'in_transit', dispatched: today, receiving: 'Awaiting acceptance' }
          : s
      ),
      packages: data.packages.map(p =>
        serialSet.has(p.serial)
          ? {
              ...p,
              status: 'in_transit',
              shipmentRef: ref,
              history: [...p.history, [`Shipment dispatched (${ref})`, shipment.from, today]]
            }
          : p
      ),
      traceabilityEvents: nextEvents
    },
    result: { ok: true }
  }
}

export function mutateRecordReceivingSession(
  data,
  ref,
  { sessionDispositions = {}, unmatchedScans = [] } = {},
  actor = null
) {
  const shipment = data.shipments.find(s => s.ref === ref) ?? null
  const auth = authorizeActorForRole(data, actor, ['distributor', 'wholesaler', 'pharmacy'], {
    targetOrgId: shipment?.to
  })
  if (!auth.ok) return auth

  let destOrg = null
  if (shipment) {
    destOrg = data.organizations.find(o => o.id === shipment.to) ?? null
    if (!destOrg || (destOrg.status ?? 'active') !== 'active') {
      return {
        ok: false,
        error: `Receiving organization is ${destOrg ? destOrg.status : 'missing'} and cannot record receipts.`
      }
    }
  }

  const result = applyReceivingSession({
    shipment,
    packages: data.packages,
    sessionDispositions,
    unmatchedScans,
    date: getCurrentDateIso()
  })

  if (!result.ok) return result

  const orgPrefix = ORG_TYPE_TO_EVENT_PREFIX[destOrg?.type] ?? null
  const receivedEventType = orgPrefix ? `${orgPrefix}_RECEIVED` : null
  const pkgBySerial = new Map(data.packages.map(p => [p.serial, p]))
  const effectiveRole = actor?.role ?? (destOrg?.type ? destOrg.type.toLowerCase() : null)
  const timestamp = new Date().toISOString()

  const receiptEvents =
    receivedEventType && result.sessionRecord?.actions?.length
      ? result.sessionRecord.actions.map(action => ({
          eventType: receivedEventType,
          serial: action.serial,
          packageId: action.serial,
          batchId: pkgBySerial.get(action.serial)?.batchId ?? null,
          actorUserId: actor?.userId ?? null,
          actorRole: effectiveRole,
          organizationId: shipment.to,
          shipmentId: ref,
          timestamp,
          checkpoint: `${String(effectiveRole || 'org')}_receiving`,
          category: 'transaction',
          outcome:
            action.status === 'accepted'
              ? 'success'
              : action.status === 'damaged'
                ? 'quarantined'
                : action.status,
          failureReason: action.reason || null
        }))
      : []

  const { nextEvents } = appendTraceabilityEvents(data.traceabilityEvents, receiptEvents)

  return {
    ok: true,
    nextData: {
      ...data,
      shipments: data.shipments.map(s => (s.ref === ref ? result.nextShipment : s)),
      packages: result.nextPackages,
      traceabilityEvents: nextEvents
    },
    result: {
      ok: true,
      shipment: result.nextShipment,
      summary: result.summary,
      sessionRecord: result.sessionRecord
    }
  }
}

export function mutateCloseShipmentReconciliation(data, ref, note = '', actor = null) {
  const shipment = data.shipments.find(s => s.ref === ref) ?? null
  const auth = authorizeActorForRole(data, actor, ['distributor', 'wholesaler', 'pharmacy'], {
    targetOrgId: shipment?.to
  })
  if (!auth.ok) return auth

  if (shipment) {
    const destOrg = data.organizations.find(o => o.id === shipment.to)
    if (!destOrg || (destOrg.status ?? 'active') !== 'active') {
      return {
        ok: false,
        error: `Receiving organization is ${destOrg ? destOrg.status : 'missing'} and cannot close reconciliation.`
      }
    }
  }

  const result = closeReconciliationPure({
    shipment,
    packages: data.packages,
    date: getCurrentDateIso(),
    note
  })
  if (!result.ok) return result

  return {
    ok: true,
    nextData: {
      ...data,
      shipments: data.shipments.map(s => (s.ref === ref ? result.nextShipment : s))
    },
    result
  }
}

export function mutateRecordRejectedHandover(data, ref, serial, handoverNote, actor = null) {
  const shipment = data.shipments.find(s => s.ref === ref) ?? null
  const auth = authorizeActorForRole(data, actor, ['distributor', 'wholesaler', 'pharmacy'], {
    targetOrgId: shipment?.to
  })
  if (!auth.ok) return auth

  if (shipment) {
    const destOrg = data.organizations.find(o => o.id === shipment.to)
    if (!destOrg || (destOrg.status ?? 'active') !== 'active') {
      return {
        ok: false,
        error: `Receiving organization is ${destOrg ? destOrg.status : 'missing'} and cannot record handover.`
      }
    }
  }

  const result = recordHandoverPure({
    shipment,
    packages: data.packages,
    serial,
    handoverNote,
    date: getCurrentDateIso()
  })
  if (!result.ok) return result

  return {
    ok: true,
    nextData: {
      ...data,
      shipments: data.shipments.map(s => (s.ref === ref ? result.nextShipment : s)),
      packages: result.nextPackages
    },
    result
  }
}

export function mutateDispensePackage(data, serial, options = {}, actor = null) {
  const explicitPharmacyId = typeof options === 'string' ? options : options?.pharmacyId ?? null
  const targetPharmacyId = actor?.orgId ?? explicitPharmacyId

  const auth = authorizeActorForRole(data, actor, ['pharmacy'], {
    targetOrgId: targetPharmacyId
  })
  if (!auth.ok) return auth

  if (!targetPharmacyId) {
    return { ok: false, error: 'Active pharmacy organization context is required for dispensing.' }
  }

  const pharmacyOrg = data.organizations.find(o => o.id === targetPharmacyId)
  if (!pharmacyOrg || pharmacyOrg.type !== 'Pharmacy' || (pharmacyOrg.status ?? 'active') !== 'active') {
    return {
      ok: false,
      error: `Pharmacy organization "${pharmacyOrg?.name ?? targetPharmacyId}" is not active or eligible to dispense.`
    }
  }

  const today = getCurrentDateIso()
  const normalized = extractSerialFromInput(serial) || String(serial ?? '').trim().toUpperCase()
  const pkg = data.packages.find(p => p.serial === normalized) ?? null
  const batch = pkg ? data.batches.find(b => b.id === pkg.batchId) ?? null : null
  const traceComplete = pkg ? hasCompleteTraceability(pkg, data.shipments, data.organizations) : false
  const check = validatePackageForDispense({
    pkg,
    batch,
    traceComplete,
    pharmacyId: targetPharmacyId,
    pharmacyName: pharmacyOrg.name,
    today
  })

  if (!check.eligible) {
    return {
      ok: false,
      error: check.reasons[0] ?? 'Package is not eligible for dispensing.',
      reasons: check.reasons
    }
  }

  const { nextEvents } = appendTraceabilityEvents(data.traceabilityEvents, [
    {
      eventType: TRACEABILITY_EVENT_TYPES.PHARMACY_DISPENSED,
      serial: normalized,
      packageId: normalized,
      batchId: pkg?.batchId ?? null,
      actorUserId: actor?.userId ?? null,
      actorRole: actor?.role ?? 'pharmacy',
      organizationId: targetPharmacyId,
      shipmentId: pkg?.shipmentRef ?? null,
      timestamp: new Date().toISOString(),
      checkpoint: 'pharmacy_dispense',
      category: 'transaction',
      outcome: 'success'
    }
  ])

  return {
    ok: true,
    nextData: {
      ...data,
      packages: data.packages.map(p =>
        p.serial === normalized
          ? {
              ...p,
              status: 'dispensed',
              history: [...p.history, ['Dispensed', p.custodian, today]]
            }
          : p
      ),
      traceabilityEvents: nextEvents
    },
    result: { ok: true, pharmacyId: targetPharmacyId }
  }
}

export function mutateSubmitReport(data, { serial, type, description }) {
  const cleanDesc = String(description ?? '').trim()
  if (!cleanDesc) {
    return { ok: false, error: 'Report description is required.' }
  }

  const today = getCurrentDateIso()
  const cleanSerial = serial ? String(serial).trim().toUpperCase() : null
  const item = {
    id: nextSequentialId(data.reports, 'rpt'),
    serial: cleanSerial,
    type: type || 'other',
    reporter: 'anonymous',
    created: today,
    status: 'open',
    description: cleanDesc
  }

  return {
    ok: true,
    nextData: {
      ...data,
      reports: [item, ...data.reports]
    },
    result: { ...item, ok: true, report: item }
  }
}

export function mutateAddOrganization(data, org, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['admin'])
  if (!auth.ok) return auth

  const name = String(org?.name ?? '').trim()
  const type = String(org?.type ?? '').trim()
  if (!name) return { ok: false, error: 'Organization name is required.' }
  if (!['Manufacturer', 'Distributor', 'Wholesaler', 'Pharmacy'].includes(type)) {
    return { ok: false, error: 'Valid organization type is required.' }
  }
  if (data.organizations.some(o => o.name.trim().toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: `Organization "${name}" already exists.` }
  }

  const item = {
    status: 'active',
    ...org,
    name,
    type,
    id: nextSequentialId(data.organizations, 'o')
  }

  return {
    ok: true,
    nextData: {
      ...data,
      organizations: [...data.organizations, item]
    },
    result: { ...item, ok: true, organization: item }
  }
}

export function mutateUpdateOrganization(data, id, updates, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['admin'])
  if (!auth.ok) return auth

  const existing = data.organizations.find(o => o.id === id)
  if (!existing) {
    return { ok: false, error: 'Organization was not found.' }
  }

  const nextName = updates?.name !== undefined ? String(updates.name).trim() : existing.name
  if (!nextName) {
    return { ok: false, error: 'Organization name cannot be empty.' }
  }

  const updated = { ...existing, ...updates, id: existing.id, name: nextName }
  return {
    ok: true,
    nextData: {
      ...data,
      organizations: data.organizations.map(o => (o.id === id ? updated : o))
    },
    result: { ok: true, organization: updated }
  }
}

export function mutateAddUser(data, user, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['admin'])
  if (!auth.ok) return auth

  const name = String(user?.name ?? '').trim()
  const email = String(user?.email ?? '').trim()
  const role = String(user?.role ?? '').trim()
  const orgId = user?.orgId ? String(user.orgId).trim() : null

  if (!name || !email) {
    return { ok: false, error: 'Name and email address are required.' }
  }
  if (!VALID_ROLES.has(role)) {
    return { ok: false, error: 'Valid user role is required.' }
  }
  if (data.users.some(u => u.email.trim().toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: `A user with email "${email}" already exists.` }
  }

  const requiredOrgType = ROLE_TO_ORG_TYPE[role]
  if (requiredOrgType) {
    const org = data.organizations.find(o => o.id === orgId)
    if (!org) {
      return { ok: false, error: `Please select a valid ${requiredOrgType} organization.` }
    }
    if (org.type !== requiredOrgType) {
      return {
        ok: false,
        error: `Role "${role}" must be assigned to a ${requiredOrgType} organization (selected: ${org.type}).`
      }
    }
  }

  const today = getCurrentDateIso()
  const item = {
    status: 'active',
    created: today,
    ...user,
    name,
    email,
    role,
    orgId,
    id: nextSequentialId(data.users, 'u')
  }

  return {
    ok: true,
    nextData: {
      ...data,
      users: [...data.users, item]
    },
    result: { ...item, ok: true, user: item }
  }
}

export function mutateUpdateUser(data, id, updates, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['admin'])
  if (!auth.ok) return auth

  const existing = data.users.find(u => u.id === id)
  if (!existing) {
    return { ok: false, error: 'User account was not found.' }
  }

  const nextRole = updates?.role ?? existing.role
  const nextOrgId = updates?.orgId !== undefined ? updates.orgId || null : existing.orgId ?? null

  if (!VALID_ROLES.has(nextRole)) {
    return { ok: false, error: 'Valid user role is required.' }
  }

  const requiredOrgType = ROLE_TO_ORG_TYPE[nextRole]
  if (requiredOrgType) {
    const org = data.organizations.find(o => o.id === nextOrgId)
    if (!org) {
      return { ok: false, error: `Role "${nextRole}" requires a ${requiredOrgType} organization.` }
    }
    if (org.type !== requiredOrgType) {
      return {
        ok: false,
        error: `Role "${nextRole}" must belong to a ${requiredOrgType} organization (selected: ${org.type}).`
      }
    }
  }

  const updated = { ...existing, ...updates, id: existing.id, role: nextRole, orgId: nextOrgId }
  return {
    ok: true,
    nextData: {
      ...data,
      users: data.users.map(u => (u.id === id ? updated : u))
    },
    result: { ok: true, user: updated }
  }
}

export function mutateCreateInvestigation(data, { alertId = null, title, ...rest }, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['investigator'])
  if (!auth.ok) return auth

  const cleanTitle = String(title ?? '').trim()
  if (!cleanTitle) {
    return { ok: false, error: 'Investigation title is required.' }
  }

  const today = getCurrentDateIso()
  const item = {
    id: nextSequentialId(data.investigations, 'inv'),
    alertId,
    title: cleanTitle,
    status: 'open',
    assignee: actor?.userId ?? 'u6',
    created: today,
    findings: '',
    evidence: [],
    resolution: null,
    ...rest
  }

  return {
    ok: true,
    nextData: {
      ...data,
      investigations: [item, ...data.investigations]
    },
    result: { ...item, ok: true, investigation: item }
  }
}

export function mutateUpdateInvestigation(data, id, updates, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['investigator'])
  if (!auth.ok) return auth

  const existing = data.investigations.find(inv => inv.id === id)
  if (!existing) {
    return { ok: false, error: 'Investigation case was not found.' }
  }

  const updated = { ...existing, ...updates, id: existing.id }
  return {
    ok: true,
    nextData: {
      ...data,
      investigations: data.investigations.map(inv => (inv.id === id ? updated : inv))
    },
    result: { ok: true, investigation: updated }
  }
}

export function mutateUpdateAlert(data, id, updates, actor = null) {
  const auth = authorizeActorForRole(data, actor, ['investigator'])
  if (!auth.ok) return auth

  const existing = data.alerts.find(a => a.id === id)
  if (!existing) {
    return { ok: false, error: 'Alert was not found.' }
  }

  const updated = { ...existing, ...updates, id: existing.id }
  return {
    ok: true,
    nextData: {
      ...data,
      alerts: data.alerts.map(a => (a.id === id ? updated : a))
    },
    result: { ok: true, alert: updated }
  }
}
