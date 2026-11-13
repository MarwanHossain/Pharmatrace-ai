import { formatSerial } from '../data/fixtures/index.js'

const escapeRegex = str => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function parseSerialIndex(serial, batchNo) {
  if (typeof serial !== 'string' || typeof batchNo !== 'string') return null
  const match = serial.match(new RegExp(`^DEMO-${escapeRegex(batchNo)}-(\\d+)$`))
  if (!match) return null
  const num = Number(match[1])
  return Number.isInteger(num) && num > 0 ? num : null
}

export function generateBatchSerials({ batch, quantity, packages, date, manufacturerOrgId }) {
  if (!batch) {
    return { ok: false, error: 'Selected batch was not found.' }
  }

  const ownerOrgId = manufacturerOrgId ?? batch.orgId ?? 'm1'

  if (batch.release !== 'Released') {
    return {
      ok: false,
      error: `Batch ${batch.no} is ${batch.release} and cannot be serialized until QA release.`
    }
  }

  const raw = typeof quantity === 'string' ? quantity.trim() : quantity
  if (raw === '' || raw === null || raw === undefined || typeof raw === 'boolean') {
    return { ok: false, error: 'Enter a whole number of at least 1.' }
  }

  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    return { ok: false, error: 'Enter a whole number of at least 1.' }
  }

  const batchPackages = packages.filter(p => p.batchId === batch.id)
  const remaining = batch.quantity - batchPackages.length
  if (remaining <= 0) {
    return { ok: false, error: `Batch ${batch.no} has reached its maximum quantity (${batch.quantity}).` }
  }
  if (n > remaining) {
    return { ok: false, error: `Only ${remaining} packages remain for batch ${batch.no}.` }
  }

  const existingSerials = new Set(packages.map(p => p.serial))
  const maxExisting = batchPackages.reduce((max, p) => {
    const idx = parseSerialIndex(p.serial, batch.no)
    return idx && idx > max ? idx : max
  }, 0)

  const added = []
  let candidate = maxExisting + 1

  while (added.length < n && candidate <= batch.quantity) {
    const serial = formatSerial(batch.no, candidate)
    if (!existingSerials.has(serial)) {
      existingSerials.add(serial)
      added.push({
        serial,
        batchId: batch.id,
        manufacturerOrgId: ownerOrgId,
        status: 'available',
        custodian: ownerOrgId,
        history: [['Package serialized', ownerOrgId, date ?? batch.mfd]],
        verifyCount: 0,
        shipmentRef: null
      })
    }
    candidate += 1
  }

  // Fallback scan within 1..batch.quantity if existing identifiers contain gaps
  if (added.length < n) {
    for (let idx = 1; idx <= batch.quantity && added.length < n; idx += 1) {
      const serial = formatSerial(batch.no, idx)
      if (!existingSerials.has(serial)) {
        existingSerials.add(serial)
        added.push({
          serial,
          batchId: batch.id,
          manufacturerOrgId: ownerOrgId,
          status: 'available',
          custodian: ownerOrgId,
          history: [['Package serialized', ownerOrgId, date ?? batch.mfd]],
          verifyCount: 0,
          shipmentRef: null
        })
      }
    }
  }

  if (added.length < n) {
    return { ok: false, error: `Unable to allocate ${n} unique serial identifiers within batch quantity.` }
  }

  return { ok: true, added }
}
