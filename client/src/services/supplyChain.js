export const ACTIVE_ALLOCATION_STATUSES = new Set([
  'draft',
  'preparing',
  'pending',
  'in_transit'
])

export const RECEIVABLE_SHIPMENT_STATUSES = new Set([
  'in_transit',
  'partially_received',
  'reconciliation_required'
])

export const COMPLETED_RECEIPT_SHIPMENT_STATUSES = new Set([
  'accepted',
  'partially_received',
  'reconciliation_required',
  'reconciled',
  'closed'
])

export function getCurrentDateIso() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function validatePackageForDispatch({
  pkg,
  batch,
  fromOrgId,
  fromOrgType,
  organizations,
  shipments = [],
  activeShipmentRef = null,
  today = getCurrentDateIso()
}) {
  const reasons = []

  if (!pkg) {
    return { eligible: false, reasons: ['Package serial was not found in the registry.'] }
  }

  if (pkg.custodian !== fromOrgId) {
    reasons.push('Current organization does not hold custody of this package.')
  }

  if (pkg.status === 'quarantined') {
    reasons.push('Package is quarantined and cannot be dispatched.')
  } else if (pkg.status === 'dispensed') {
    reasons.push('Package has already been dispensed.')
  } else if (pkg.status === 'lost' || pkg.status === 'missing') {
    reasons.push(`Package is marked ${pkg.status} and cannot be dispatched.`)
  } else if (pkg.status === 'in_transit') {
    reasons.push('Package is already in transit.')
  } else if (pkg.status === 'damaged' || pkg.status === 'rejected' || pkg.status === 'discrepancy') {
    reasons.push(`Package has status "${pkg.status}" and requires reconciliation before movement.`)
  } else {
    const resolvedFromType =
      fromOrgType ??
      (Array.isArray(organizations) ? organizations.find(o => o.id === fromOrgId)?.type : undefined)
    const isManufacturer = resolvedFromType ? resolvedFromType === 'Manufacturer' : fromOrgId === 'm1'
    const allowed = isManufacturer ? ['available', 'accepted'] : ['accepted']
    if (!allowed.includes(pkg.status)) {
      reasons.push(`Package status "${pkg.status}" is not eligible for dispatch.`)
    }
  }

  for (const s of shipments) {
    if (s.ref === activeShipmentRef) continue
    const inManifest = (s.packageSerials ?? []).includes(pkg.serial) || pkg.shipmentRef === s.ref
    if (!inManifest) continue

    if (ACTIVE_ALLOCATION_STATUSES.has(s.status)) {
      reasons.push(`Package is already assigned to active shipment ${s.ref} (${s.status}).`)
      break
    }

    if (s.status === 'partially_received' || s.status === 'reconciliation_required') {
      const dispStatus = s.packageDispositions?.[pkg.serial]?.status
      const acceptedByCurrentOrg = s.to === fromOrgId && dispStatus === 'accepted'
      if (!acceptedByCurrentOrg && (s.packageSerials ?? []).includes(pkg.serial)) {
        reasons.push(`Package is tied to open reconciliation on shipment ${s.ref}.`)
        break
      }
    }
  }

  if (!batch) {
    reasons.push('Batch record is missing for this package.')
  } else {
    if (batch.release !== 'Released') {
      reasons.push(`Batch ${batch.no} is ${batch.release} (QA release required before dispatch).`)
    }
    if (batch.exp && batch.exp < today) {
      reasons.push(`Batch ${batch.no} expired on ${batch.exp} and cannot be dispatched.`)
    }
  }

  return { eligible: reasons.length === 0, reasons }
}

export function validateShipmentForDispatch({
  shipment,
  packages = [],
  batches = [],
  organizations = [],
  shipments = [],
  today = getCurrentDateIso()
}) {
  const errors = []
  const packageReasons = {}

  if (!shipment) {
    return { eligible: false, errors: ['Shipment was not found.'], packageReasons }
  }

  if (!['pending', 'draft', 'preparing'].includes(shipment.status)) {
    errors.push(`Shipment ${shipment.ref} has status "${shipment.status}" and cannot be dispatched.`)
  }

  const fromOrg = organizations.find(o => o.id === shipment.from)
  if (organizations.length > 0 && !fromOrg) {
    errors.push(`Origin organization (${shipment.from}) was not found.`)
  } else if (fromOrg && (fromOrg.status ?? 'active') !== 'active') {
    errors.push(`Origin organization "${fromOrg.name}" is ${fromOrg.status} and cannot dispatch shipments.`)
  }

  const destOrg = organizations.find(o => o.id === shipment.to)
  if (!destOrg) {
    errors.push(`Destination organization (${shipment.to}) was not found.`)
  } else if ((destOrg.status ?? 'active') !== 'active') {
    errors.push(`Destination organization "${destOrg.name}" is ${destOrg.status} and cannot receive shipments.`)
  }

  const serials = shipment.packageSerials ?? []
  if (serials.length === 0) {
    errors.push('Shipment has no packages attached.')
  }

  for (const serial of serials) {
    const pkg = packages.find(p => p.serial === serial) ?? null
    const batch = pkg ? batches.find(b => b.id === pkg.batchId) ?? null : null
    const check = validatePackageForDispatch({
      pkg,
      batch,
      fromOrgId: shipment.from,
      fromOrgType: fromOrg?.type,
      organizations,
      shipments,
      activeShipmentRef: shipment.ref,
      today
    })
    if (!check.eligible) {
      packageReasons[serial] = check.reasons
      errors.push(`${serial}: ${check.reasons.join(' ')}`)
    }
  }

  return { eligible: errors.length === 0, errors, packageReasons }
}

export function initializeShipmentReconciliation(shipment, packages = []) {
  const manifest = shipment?.packageSerials ?? []
  const existing = shipment?.packageDispositions ?? {}
  const dispositions = {}

  for (const serial of manifest) {
    if (existing[serial]) {
      dispositions[serial] = { ...existing[serial] }
      continue
    }
    const pkg = packages.find(p => p.serial === serial)
    if (shipment?.status === 'accepted') {
      dispositions[serial] = {
        serial,
        status: 'accepted',
        reason: '',
        notes: '',
        scanned: true,
        sessionId: 'SEED',
        updatedAt: shipment.dispatched ?? shipment.created ?? '',
        physicallyReceived: true,
        custodyTransferred: true
      }
    } else if (pkg?.status === 'quarantined') {
      dispositions[serial] = {
        serial,
        status: 'damaged',
        reason: pkg.quarantineReason ?? 'Quarantined',
        notes: '',
        scanned: true,
        sessionId: 'SEED',
        updatedAt: '',
        physicallyReceived: true,
        custodyTransferred: true
      }
    } else if (pkg?.status === 'rejected' || pkg?.status === 'discrepancy') {
      dispositions[serial] = {
        serial,
        status: 'rejected',
        reason: pkg.rejectionReason ?? 'Rejected during receiving',
        notes: '',
        scanned: true,
        sessionId: 'SEED',
        updatedAt: '',
        physicallyReceived: true,
        custodyTransferred: false
      }
    } else if (pkg?.status === 'missing') {
      dispositions[serial] = {
        serial,
        status: 'missing',
        reason: pkg.missingReason ?? 'Missing from delivery',
        notes: '',
        scanned: false,
        sessionId: 'SEED',
        updatedAt: '',
        physicallyReceived: false,
        custodyTransferred: false
      }
    } else {
      dispositions[serial] = {
        serial,
        status: 'outstanding',
        reason: '',
        notes: '',
        scanned: false,
        sessionId: null,
        updatedAt: null,
        physicallyReceived: false,
        custodyTransferred: false
      }
    }
  }

  return dispositions
}

export function summarizeDispositions(manifest = [], dispositions = {}) {
  const counts = {
    total: manifest.length,
    accepted: 0,
    damaged: 0,
    missing: 0,
    rejected: 0,
    outstanding: 0,
    unresolved: 0
  }

  for (const serial of manifest) {
    const status = dispositions[serial]?.status ?? 'outstanding'
    if (status === 'accepted') counts.accepted += 1
    else if (status === 'damaged') counts.damaged += 1
    else if (status === 'missing') counts.missing += 1
    else if (status === 'rejected') counts.rejected += 1
    else counts.outstanding += 1
  }

  counts.unresolved = counts.outstanding + counts.missing
  return counts
}

function appendUniqueHistory(history = [], entry) {
  const [evt, org, date] = entry
  const last = history[history.length - 1]
  if (last && last[0] === evt && last[1] === org && last[2] === date) {
    return history
  }
  return [...history, entry]
}

export function applyReceivingSession({
  shipment,
  packages = [],
  sessionDispositions = {},
  unmatchedScans = [],
  date = getCurrentDateIso()
}) {
  if (!shipment) {
    return { ok: false, error: 'Shipment was not found.' }
  }
  if (!RECEIVABLE_SHIPMENT_STATUSES.has(shipment.status)) {
    return {
      ok: false,
      error: `Shipment ${shipment.ref} has status "${shipment.status}" and is not open for receiving.`
    }
  }

  const manifest = shipment.packageSerials ?? []
  const manifestSet = new Set(manifest)
  const currentDispositions = initializeShipmentReconciliation(shipment, packages)

  const normalizedUnmatched = [
    ...new Set(
      (unmatchedScans ?? [])
        .map(s => String(s ?? '').trim().toUpperCase())
        .filter(Boolean)
    )
  ]

  const changedEntries = Object.entries(sessionDispositions ?? {}).filter(([, val]) => val && val.status)
  if (changedEntries.length === 0 && normalizedUnmatched.length === 0) {
    return {
      ok: false,
      error: 'Record at least one package outcome or scan before saving this receiving session.'
    }
  }

  const nextSessions = [...(shipment.receivingSessions ?? [])]
  const sessionId = `SES-${nextSessions.length + 1}`
  const nextDispositions = { ...currentDispositions }
  const sessionActions = []

  for (const [rawSerial, payload] of changedEntries) {
    const serial = String(rawSerial).trim().toUpperCase()
    if (!manifestSet.has(serial)) {
      return { ok: false, error: `Serial ${serial} is not on manifest ${shipment.ref}.` }
    }

    const prevDisp = currentDispositions[serial]
    const targetStatus = payload.status
    const reason = String(payload.reason ?? '').trim()
    const notes = String(payload.notes ?? '').trim()
    const scanned = Boolean(payload.scanned)

    if (!['accepted', 'damaged', 'missing', 'rejected'].includes(targetStatus)) {
      return { ok: false, error: `Invalid disposition "${targetStatus}" for ${serial}.` }
    }

    if (prevDisp.status === 'accepted') {
      return {
        ok: false,
        error: `Package ${serial} was already accepted in session ${prevDisp.sessionId || 'earlier'} and cannot be accepted again.`
      }
    }

    if (prevDisp.status === 'damaged') {
      return {
        ok: false,
        error: `Package ${serial} was already received damaged and quarantined.`
      }
    }

    if (prevDisp.status === 'rejected' && targetStatus === 'accepted') {
      return {
        ok: false,
        error: `Previously rejected package ${serial} cannot be directly accepted in receiving; record an explicit return/handover or new shipment.`
      }
    }

    if (['damaged', 'missing', 'rejected'].includes(targetStatus) && !reason) {
      return {
        ok: false,
        error: `An explanation or reason is required when marking ${serial} as ${targetStatus}.`
      }
    }

    nextDispositions[serial] = {
      serial,
      status: targetStatus,
      reason,
      notes,
      scanned: scanned || prevDisp.scanned,
      sessionId,
      updatedAt: date,
      physicallyReceived: targetStatus === 'accepted' || targetStatus === 'damaged' || targetStatus === 'rejected',
      custodyTransferred: targetStatus === 'accepted' || targetStatus === 'damaged'
    }

    sessionActions.push({
      serial,
      status: targetStatus,
      reason,
      notes,
      scanned: scanned || prevDisp.scanned
    })
  }

  const actionBySerial = new Map(sessionActions.map(a => [a.serial, a]))

  const nextPackages = packages.map(pkg => {
    const action = actionBySerial.get(pkg.serial)
    if (!action) return pkg

    if (action.status === 'accepted') {
      return {
        ...pkg,
        custodian: shipment.to,
        status: 'accepted',
        history: appendUniqueHistory(pkg.history, [`Custody accepted (${shipment.ref})`, shipment.to, date])
      }
    }

    if (action.status === 'damaged') {
      return {
        ...pkg,
        custodian: shipment.to,
        status: 'quarantined',
        quarantineReason: action.reason,
        quarantineNotes: action.notes || undefined,
        history: appendUniqueHistory(pkg.history, [
          `Received damaged — quarantined (${action.reason})`,
          shipment.to,
          date
        ])
      }
    }

    if (action.status === 'missing') {
      // Do NOT transfer custody; keep package outstanding for follow-up reconciliation
      return {
        ...pkg,
        status: 'missing',
        missingReason: action.reason,
        history: appendUniqueHistory(pkg.history, [
          `Reported missing on receiving (${action.reason})`,
          shipment.to,
          date
        ])
      }
    }

    if (action.status === 'rejected') {
      // Do NOT transfer normal custody on rejection
      return {
        ...pkg,
        status: 'rejected',
        rejectionReason: action.reason,
        history: appendUniqueHistory(pkg.history, [
          `Package rejected on receiving (${action.reason})`,
          shipment.to,
          date
        ])
      }
    }

    return pkg
  })

  const summary = summarizeDispositions(manifest, nextDispositions)

  let nextStatus = shipment.status
  let receivingText = shipment.receiving

  if (summary.unresolved === 0 && summary.damaged === 0 && summary.rejected === 0 && summary.accepted === summary.total) {
    nextStatus = 'accepted'
    receivingText = `Accepted ${date} (${summary.accepted}/${summary.total})`
  } else if (summary.unresolved > 0) {
    nextStatus = 'partially_received'
    receivingText = `Partial (${summary.accepted}/${summary.total} accepted, ${summary.unresolved} unresolved)`
  } else {
    nextStatus = 'reconciliation_required'
    receivingText = `Reconciliation required (${summary.accepted} accepted, ${summary.damaged} damaged, ${summary.rejected} rejected)`
  }

  const prevUnmatched = shipment.unmatchedScans ?? []
  const mergedUnmatched = [...prevUnmatched]
  const seenUnmatched = new Set(prevUnmatched.map(u => `${u.serial}@${u.sessionId}`))
  for (const serial of normalizedUnmatched) {
    const key = `${serial}@${sessionId}`
    if (!seenUnmatched.has(key)) {
      seenUnmatched.add(key)
      mergedUnmatched.push({
        serial,
        sessionId,
        date,
        knownInRegistry: packages.some(p => p.serial === serial)
      })
    }
  }

  const sessionRecord = {
    id: sessionId,
    date,
    actions: sessionActions,
    unmatchedSerials: normalizedUnmatched,
    summaryAfterSession: summary
  }

  const nextShipment = {
    ...shipment,
    status: nextStatus,
    receiving: receivingText,
    packageDispositions: nextDispositions,
    receivingSessions: [...nextSessions, sessionRecord],
    unmatchedScans: mergedUnmatched
  }

  return { ok: true, nextShipment, nextPackages, summary, sessionRecord }
}

export function closeShipmentReconciliation({
  shipment,
  packages = [],
  date = getCurrentDateIso(),
  note = ''
}) {
  if (!shipment) {
    return { ok: false, error: 'Shipment was not found.' }
  }
  const dispositions = initializeShipmentReconciliation(shipment, packages)
  const summary = summarizeDispositions(shipment.packageSerials ?? [], dispositions)

  if (summary.unresolved > 0) {
    return {
      ok: false,
      error: `Cannot close shipment ${shipment.ref}: ${summary.unresolved} package(s) remain unresolved (${summary.outstanding} outstanding, ${summary.missing} missing).`
    }
  }

  const trimmedNote = String(note ?? '').trim()
  if ((summary.damaged > 0 || summary.rejected > 0) && !trimmedNote) {
    return {
      ok: false,
      error: 'Provide a reconciliation closure note explaining damaged or rejected dispositions before closing.'
    }
  }

  const nextShipment = {
    ...shipment,
    status: summary.damaged === 0 && summary.rejected === 0 ? 'accepted' : 'closed',
    receiving:
      summary.damaged === 0 && summary.rejected === 0
        ? `Accepted ${date}`
        : `Closed ${date} (${summary.accepted} accepted, ${summary.damaged} damaged, ${summary.rejected} rejected)`,
    packageDispositions: dispositions,
    reconciliationClosedAt: date,
    reconciliationNote: trimmedNote
  }

  return { ok: true, nextShipment, summary }
}

export function recordRejectedHandover({
  shipment,
  packages = [],
  serial,
  handoverNote,
  date = getCurrentDateIso()
}) {
  if (!shipment) return { ok: false, error: 'Shipment was not found.' }
  const normalized = String(serial ?? '').trim().toUpperCase()
  const note = String(handoverNote ?? '').trim()
  if (!note) return { ok: false, error: 'A handover or return reference note is required.' }

  const dispositions = initializeShipmentReconciliation(shipment, packages)
  const disp = dispositions[normalized]
  if (!disp || disp.status !== 'rejected') {
    return { ok: false, error: `Package ${normalized} is not currently marked rejected on ${shipment.ref}.` }
  }

  const nextDispositions = {
    ...dispositions,
    [normalized]: {
      ...disp,
      handoverRecorded: true,
      handoverNote: note,
      handoverDate: date
    }
  }

  const nextPackages = packages.map(pkg =>
    pkg.serial === normalized
      ? {
          ...pkg,
          custodian: shipment.from,
          status: 'rejected',
          history: appendUniqueHistory(pkg.history, [
            `Physical return handover recorded (${shipment.ref}: ${note})`,
            shipment.from,
            date
          ])
        }
      : pkg
  )

  return {
    ok: true,
    nextShipment: {
      ...shipment,
      packageDispositions: nextDispositions
    },
    nextPackages
  }
}

export function validatePackageForDispense({
  pkg,
  batch,
  traceComplete = true,
  pharmacyId = 'p1',
  pharmacyName,
  today = getCurrentDateIso()
}) {
  const reasons = []
  if (!pkg) {
    return { eligible: false, reasons: ['Serial number was not found in the PharmaTrace registry.'] }
  }
  if (!batch) {
    reasons.push('Batch record is missing.')
  } else if (batch.exp && batch.exp < today) {
    reasons.push(`Package is expired (batch expiry ${batch.exp}). Do not dispense.`)
  }
  if (pkg.status === 'dispensed') {
    reasons.push('Package has already been recorded as dispensed.')
  }
  if (pkg.status === 'quarantined') {
    reasons.push('Package is quarantined and blocked from dispensing.')
  }
  if (pkg.status === 'missing' || pkg.status === 'lost') {
    reasons.push(`Package is flagged as ${pkg.status} and cannot be dispensed.`)
  }
  if (pkg.status === 'rejected' || pkg.status === 'discrepancy' || pkg.status === 'damaged') {
    reasons.push(`Package has a receiving discrepancy (${pkg.status}) and cannot be dispensed.`)
  }
  if (pkg.custodian !== pharmacyId) {
    const label = pharmacyName ?? (pharmacyId === 'p1' ? 'Greenleaf Pharmacy' : 'the active pharmacy')
    reasons.push(`Package is not currently held in ${label} custody.`)
  }
  if (pkg.status === 'in_transit') {
    reasons.push('Package is still in transit and has not been received at the pharmacy.')
  }
  if (!traceComplete) {
    reasons.push('Incomplete traceability: missing dispatch or intermediate custody events in supply-chain history.')
  }
  const eligible =
    reasons.length === 0 && pkg.custodian === pharmacyId && pkg.status === 'accepted' && traceComplete
  return { eligible, reasons }
}
