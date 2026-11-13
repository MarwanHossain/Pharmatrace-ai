// TEMPORARY FRONTEND DEVELOPMENT PERSISTENCE ADAPTER ONLY.
// Stores illustrative demo state in browser localStorage behind a versioned schema so reloads
// preserve workflow progress. Replace this repository layer with real backend API calls later.
// Never claim browser storage is secure, multi-user, or production-grade persistence.

import {
  products as seedProducts,
  batches as seedBatches,
  packages as seedPackages,
  shipments as seedShipments,
  organizations as seedOrganizations,
  users as seedUsers,
  alerts as seedAlerts,
  investigations as seedInvestigations,
  reports as seedReports
} from '../data/fixtures/index.js'

export const DEMO_DATA_STORAGE_KEY = 'pharmatrace.demo.data.v2'
export const LEGACY_DEMO_DATA_STORAGE_KEY = 'pharmatrace.demo.data.v1'
export const DEMO_SESSION_STORAGE_KEY = 'pharmatrace.demo.session.v1'
export const DEMO_DATA_LOCK_NAME = 'pharmatrace.demo.data.lock.v1'
export const DEMO_DATA_SCHEMA_VERSION = 1
export const DEMO_SESSION_SCHEMA_VERSION = 1

export const WEB_LOCKS_UNAVAILABLE_ERROR =
  'Cross-tab transaction locking (Web Locks API / navigator.locks) is unavailable in this browser or non-secure context. Operational changes are blocked to prevent conflicting multi-tab writes; open the app in a current browser over HTTPS or localhost.'

export function createCommitId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return `cmt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function getWebLocksApi(explicitLocks) {
  if (explicitLocks !== undefined) return explicitLocks
  try {
    if (typeof navigator !== 'undefined' && navigator?.locks && typeof navigator.locks.request === 'function') {
      return navigator.locks
    }
  } catch {
    return null
  }
  return null
}

export function isWebLocksSupported(explicitLocks) {
  return Boolean(getWebLocksApi(explicitLocks))
}

export const ROLE_TO_ORG_TYPE = {
  manufacturer: 'Manufacturer',
  distributor: 'Distributor',
  wholesaler: 'Wholesaler',
  pharmacy: 'Pharmacy'
}

export const PLATFORM_ROLES = new Set(['admin', 'investigator'])
export const VALID_ROLES = new Set([...Object.keys(ROLE_TO_ORG_TYPE), ...PLATFORM_ROLES])

const COLLECTION_KEYS = [
  'organizations',
  'products',
  'batches',
  'packages',
  'shipments',
  'users',
  'alerts',
  'investigations',
  'reports',
  'traceabilityEvents'
]

const CORE_REQUIRED_KEYS = ['organizations', 'products', 'batches', 'packages', 'shipments', 'users']

export function getBrowserStorage(explicitStorage) {
  if (explicitStorage !== undefined) return explicitStorage
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
  } catch {
    return null
  }
  return null
}

function clonePackage(pkg) {
  return {
    verifyCount: 0,
    shipmentRef: null,
    ...pkg,
    history: Array.isArray(pkg.history) ? pkg.history.map(h => (Array.isArray(h) ? [...h] : h)) : []
  }
}

function cloneShipment(shp) {
  const next = {
    ...shp,
    packageSerials: Array.isArray(shp.packageSerials) ? [...shp.packageSerials] : []
  }
  if (shp.packageDispositions && typeof shp.packageDispositions === 'object') {
    next.packageDispositions = Object.fromEntries(
      Object.entries(shp.packageDispositions).map(([k, v]) => [k, { ...v }])
    )
  }
  if (Array.isArray(shp.receivingSessions)) {
    next.receivingSessions = shp.receivingSessions.map(ses => ({
      ...ses,
      actions: Array.isArray(ses.actions) ? ses.actions.map(a => ({ ...a })) : [],
      unmatchedSerials: Array.isArray(ses.unmatchedSerials) ? [...ses.unmatchedSerials] : [],
      summaryAfterSession: ses.summaryAfterSession ? { ...ses.summaryAfterSession } : undefined
    }))
  }
  if (Array.isArray(shp.unmatchedScans)) {
    next.unmatchedScans = shp.unmatchedScans.map(u => ({ ...u }))
  }
  return next
}

export function normalizeDemoData(rawData) {
  const organizations = (rawData.organizations ?? []).map(o => ({
    ...o,
    status: o.status ?? 'active'
  }))

  const products = (rawData.products ?? []).map(p => ({
    ...p,
    orgId: p.orgId ?? 'm1',
    status: p.status ?? 'active'
  }))

  const productOrgById = new Map(products.map(p => [p.id, p.orgId]))
  const batches = (rawData.batches ?? []).map(b => ({
    ...b,
    orgId: b.orgId ?? productOrgById.get(b.productId) ?? 'm1'
  }))

  const batchOrgById = new Map(batches.map(b => [b.id, b.orgId]))
  const packages = (rawData.packages ?? []).map(pkg => {
    const cloned = clonePackage(pkg)
    return {
      ...cloned,
      manufacturerOrgId: cloned.manufacturerOrgId ?? batchOrgById.get(cloned.batchId) ?? 'm1'
    }
  })

  const shipments = (rawData.shipments ?? []).map(cloneShipment)

  const users = (rawData.users ?? []).map(u => ({
    ...u,
    orgId: u.orgId ?? null,
    status: u.status ?? 'active'
  }))

  const alerts = (rawData.alerts ?? []).map(a => ({ ...a }))
  const investigations = (rawData.investigations ?? []).map(inv => ({
    ...inv,
    evidence: Array.isArray(inv.evidence) ? [...inv.evidence] : []
  }))
  const reports = (rawData.reports ?? []).map(r => ({ ...r }))
  const traceabilityEvents = (rawData.traceabilityEvents ?? []).map(evt => ({ ...evt }))

  return {
    organizations,
    products,
    batches,
    packages,
    shipments,
    users,
    alerts,
    investigations,
    reports,
    traceabilityEvents
  }
}

export function createCleanDemoData() {
  return normalizeDemoData({
    organizations: seedOrganizations,
    products: [],
    batches: [],
    packages: [],
    shipments: [],
    users: seedUsers.filter(u => (u.status ?? 'active') === 'active'),
    alerts: [],
    investigations: [],
    reports: [],
    traceabilityEvents: []
  })
}

export function createCleanEnvelope(revision = 1, resetEpoch = 1) {
  return {
    version: DEMO_DATA_SCHEMA_VERSION,
    revision,
    resetEpoch,
    commitId: createCommitId(),
    updatedAt: new Date().toISOString(),
    data: createCleanDemoData()
  }
}

export function createSeedDemoData() {
  return normalizeDemoData({
    organizations: seedOrganizations,
    products: seedProducts,
    batches: seedBatches,
    packages: seedPackages,
    shipments: seedShipments,
    users: seedUsers,
    alerts: seedAlerts,
    investigations: seedInvestigations,
    reports: seedReports,
    traceabilityEvents: []
  })
}

export function createSeedEnvelope(revision = 1, resetEpoch = 1) {
  return {
    version: DEMO_DATA_SCHEMA_VERSION,
    revision,
    resetEpoch,
    commitId: createCommitId(),
    updatedAt: new Date().toISOString(),
    data: createSeedDemoData()
  }
}

export function classifyEnvelopeRelation(currentEnvelope, candidateEnvelope) {
  if (!candidateEnvelope || typeof candidateEnvelope !== 'object') return 'invalid'
  if (!currentEnvelope || typeof currentEnvelope !== 'object') return 'newer_revision'

  const curEpoch = Number.isInteger(currentEnvelope.resetEpoch) ? currentEnvelope.resetEpoch : 0
  const candEpoch = Number.isInteger(candidateEnvelope.resetEpoch) ? candidateEnvelope.resetEpoch : 0
  if (candEpoch > curEpoch) return 'newer_epoch'
  if (candEpoch < curEpoch) return 'stale_epoch'

  const curRev = Number.isInteger(currentEnvelope.revision) ? currentEnvelope.revision : 0
  const candRev = Number.isInteger(candidateEnvelope.revision) ? candidateEnvelope.revision : 0
  if (candRev > curRev) return 'newer_revision'
  if (candRev < curRev) return 'stale_revision'

  if (
    typeof currentEnvelope.commitId === 'string' &&
    typeof candidateEnvelope.commitId === 'string' &&
    currentEnvelope.commitId === candidateEnvelope.commitId
  ) {
    return 'identical'
  }
  return 'conflict'
}

export function shouldAdoptStorageEnvelope(currentEnvelope, candidateEnvelope) {
  const relation = classifyEnvelopeRelation(currentEnvelope, candidateEnvelope)
  return {
    adopt: relation === 'newer_epoch' || relation === 'newer_revision',
    conflict: relation === 'conflict',
    relation
  }
}

function hasAnyValidCollection(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false
  return COLLECTION_KEYS.some(key => Array.isArray(obj[key]))
}

function mergeWithCleanDefaults(candidateData) {
  const clean = createCleanDemoData()
  const merged = {}
  for (const key of COLLECTION_KEYS) {
    merged[key] = Array.isArray(candidateData[key]) ? candidateData[key] : clean[key]
  }
  return normalizeDemoData(merged)
}

export function validateAndMigrateDemoData(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { ok: false, status: 'missing', envelope: createCleanEnvelope(1, 1) }
  }

  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { ok: false, status: 'recovered', reason: 'corrupt_json', envelope: createCleanEnvelope(1, 1) }
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, status: 'recovered', reason: 'invalid_root', envelope: createCleanEnvelope(1, 1) }
  }

  // Case 1: Versioned envelope (version 1)
  if (parsed.version === DEMO_DATA_SCHEMA_VERSION) {
    const dataObj = parsed.data
    if (!dataObj || typeof dataObj !== 'object' || Array.isArray(dataObj)) {
      return { ok: false, status: 'recovered', reason: 'invalid_v1_data', envelope: createCleanEnvelope(1, 1) }
    }
    for (const key of CORE_REQUIRED_KEYS) {
      if (!Array.isArray(dataObj[key])) {
        return {
          ok: false,
          status: 'recovered',
          reason: `invalid_collection_${key}`,
          envelope: createCleanEnvelope(1, 1)
        }
      }
    }
    for (const key of COLLECTION_KEYS) {
      if (dataObj[key] !== undefined && !Array.isArray(dataObj[key])) {
        return {
          ok: false,
          status: 'recovered',
          reason: `invalid_collection_${key}`,
          envelope: createCleanEnvelope(1, 1)
        }
      }
    }

    const revision = Number.isInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 1
    const resetEpoch = Number.isInteger(parsed.resetEpoch) && parsed.resetEpoch >= 0 ? parsed.resetEpoch : 1
    const commitId = typeof parsed.commitId === 'string' && parsed.commitId ? parsed.commitId : 'legacy_v1'
    return {
      ok: true,
      status: 'loaded',
      envelope: {
        version: DEMO_DATA_SCHEMA_VERSION,
        revision,
        resetEpoch,
        commitId,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
        data: mergeWithCleanDefaults(dataObj)
      }
    }
  }

  // Case 2: Older schema version (v0 envelope) or legacy unversioned collection snapshot
  if (parsed.version === 0 && hasAnyValidCollection(parsed.data)) {
    const rev = Number.isInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 1
    return {
      ok: true,
      status: 'migrated',
      fromVersion: 0,
      envelope: {
        version: DEMO_DATA_SCHEMA_VERSION,
        revision: rev,
        resetEpoch: 1,
        commitId: createCommitId(),
        updatedAt: new Date().toISOString(),
        data: mergeWithCleanDefaults(parsed.data)
      }
    }
  }

  if (parsed.version === undefined && !('data' in parsed) && hasAnyValidCollection(parsed)) {
    // Reject if any provided collection key is malformed (non-array)
    for (const key of COLLECTION_KEYS) {
      if (parsed[key] !== undefined && !Array.isArray(parsed[key])) {
        return { ok: false, status: 'recovered', reason: `invalid_legacy_${key}`, envelope: createCleanEnvelope(1, 1) }
      }
    }
    return {
      ok: true,
      status: 'migrated',
      fromVersion: 0,
      envelope: {
        version: DEMO_DATA_SCHEMA_VERSION,
        revision: 1,
        resetEpoch: 1,
        commitId: createCommitId(),
        updatedAt: new Date().toISOString(),
        data: mergeWithCleanDefaults(parsed)
      }
    }
  }

  // Unsupported or incompatible schema version -> safe recovery to clean baseline
  return {
    ok: false,
    status: 'recovered',
    reason: `unsupported_version_${String(parsed.version)}`,
    envelope: createCleanEnvelope(1, 1)
  }
}

export function savePersistedDemoData(storage, envelope) {
  const target = getBrowserStorage(storage)
  if (!target) return false
  try {
    target.setItem(DEMO_DATA_STORAGE_KEY, JSON.stringify(envelope))
    return true
  } catch {
    return false
  }
}

export function peekPersistedDemoData(storage) {
  const target = getBrowserStorage(storage)
  if (!target) return null
  try {
    const raw = target.getItem(DEMO_DATA_STORAGE_KEY)
    if (raw === null || raw === undefined || raw === '') return null
    const res = validateAndMigrateDemoData(raw)
    return res.ok ? res.envelope : null
  } catch {
    return null
  }
}

export function loadPersistedDemoData(storage) {
  const target = getBrowserStorage(storage)
  if (!target) {
    return { envelope: createCleanEnvelope(1, 1), status: 'memory_only' }
  }

  let raw = null
  try {
    raw = target.getItem(DEMO_DATA_STORAGE_KEY)
  } catch {
    return { envelope: createCleanEnvelope(1, 1), status: 'storage_unreadable' }
  }

  if (raw === null || raw === undefined || raw === '') {
    try {
      if (target.getItem(LEGACY_DEMO_DATA_STORAGE_KEY) !== null) {
        target.removeItem(LEGACY_DEMO_DATA_STORAGE_KEY)
        target.removeItem(DEMO_SESSION_STORAGE_KEY)
      }
    } catch {
      // ignore legacy cleanup error
    }
    const envelope = createCleanEnvelope(1, 1)
    savePersistedDemoData(target, envelope)
    return { envelope, status: 'initialized' }
  }

  const res = validateAndMigrateDemoData(raw)
  if (res.status === 'migrated' || res.status === 'recovered') {
    savePersistedDemoData(target, res.envelope)
  }
  return { envelope: res.envelope, status: res.status, reason: res.reason }
}

export async function resetPersistedDemoData(storage, options = {}) {
  const targetStorage = getBrowserStorage(storage)
  const locks = getWebLocksApi(options.locks)
  if (!locks) {
    return {
      ok: false,
      committed: false,
      code: 'locks_unavailable',
      error: WEB_LOCKS_UNAVAILABLE_ERROR
    }
  }

  const lockName = options.lockName || DEMO_DATA_LOCK_NAME
  return locks.request(lockName, { mode: 'exclusive' }, async () => {
    const current = targetStorage ? peekPersistedDemoData(targetStorage) : null
    const diskEpoch = Number.isInteger(current?.resetEpoch) ? current.resetEpoch : 0
    const knownEpoch = Number.isInteger(options.knownResetEpoch) ? options.knownResetEpoch : 0
    const nextResetEpoch = Math.max(diskEpoch, knownEpoch, 0) + 1

    const envelope = createCleanEnvelope(1, nextResetEpoch)
    const saved = savePersistedDemoData(targetStorage, envelope)
    if (!saved) {
      return {
        ok: false,
        committed: false,
        code: 'storage_write_failed',
        error: 'Unable to reset demo data to clean starting state in browser local storage.'
      }
    }
    try {
      targetStorage?.removeItem(LEGACY_DEMO_DATA_STORAGE_KEY)
    } catch {
      // ignore legacy key cleanup failure
    }
    clearPersistedSession(targetStorage)
    return {
      ok: true,
      committed: true,
      envelope
    }
  })
}

export async function commitDemoMutation(storage, mutator, options = {}) {
  const targetStorage = getBrowserStorage(storage)
  const locks = getWebLocksApi(options.locks)
  if (!locks) {
    return {
      ok: false,
      committed: false,
      code: 'locks_unavailable',
      error: WEB_LOCKS_UNAVAILABLE_ERROR,
      result: { ok: false, code: 'locks_unavailable', error: WEB_LOCKS_UNAVAILABLE_ERROR }
    }
  }

  if (!targetStorage) {
    const storageErr = 'Browser localStorage is unavailable; operational mutations cannot be persisted.'
    return {
      ok: false,
      committed: false,
      code: 'storage_unavailable',
      error: storageErr,
      result: { ok: false, code: 'storage_unavailable', error: storageErr }
    }
  }

  const lockName = options.lockName || DEMO_DATA_LOCK_NAME
  return locks.request(lockName, { mode: 'exclusive' }, async () => {
    const loaded = loadPersistedDemoData(targetStorage)
    const currentEnvelope = loaded.envelope

    let outcome
    try {
      outcome = await mutator(currentEnvelope.data, currentEnvelope)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Mutation execution failed.'
      return {
        ok: false,
        committed: false,
        envelope: currentEnvelope,
        error: msg,
        result: { ok: false, error: msg }
      }
    }

    if (!outcome || outcome.ok === false) {
      return {
        ok: false,
        committed: false,
        envelope: currentEnvelope,
        error: outcome?.error ?? 'Operation failed.',
        result: outcome ?? { ok: false, error: 'Operation failed.' }
      }
    }

    // Explicit non-mutating lookup (e.g., verifySerial for unknown serial) does not bump revision or write disk.
    if (outcome.mutated === false) {
      return {
        ok: true,
        committed: false,
        envelope: currentEnvelope,
        result: outcome.result
      }
    }

    const normalizedData = normalizeDemoData(outcome.nextData)
    const check = validateAndMigrateDemoData({
      version: DEMO_DATA_SCHEMA_VERSION,
      revision: (currentEnvelope.revision ?? 0) + 1,
      resetEpoch: currentEnvelope.resetEpoch ?? 1,
      commitId: createCommitId(),
      updatedAt: new Date().toISOString(),
      data: normalizedData
    })

    if (!check.ok) {
      return {
        ok: false,
        committed: false,
        envelope: currentEnvelope,
        error: 'Resulting state failed schema validation and was not saved.',
        result: { ok: false, error: 'Resulting state failed schema validation and was not saved.' }
      }
    }

    const nextEnvelope = {
      ...check.envelope,
      commitId: createCommitId()
    }

    const saved = savePersistedDemoData(targetStorage, nextEnvelope)
    if (!saved) {
      const writeErr = 'Unable to save changes to browser localStorage (storage may be full or restricted).'
      return {
        ok: false,
        committed: false,
        envelope: currentEnvelope,
        error: writeErr,
        result: { ok: false, error: writeErr }
      }
    }

    return {
      ok: true,
      committed: true,
      envelope: nextEnvelope,
      result: outcome.result
    }
  })
}

// --- Session storage & validation ---

export function loadPersistedSession(storage) {
  const target = getBrowserStorage(storage)
  if (!target) return null
  try {
    const raw = target.getItem(DEMO_SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.version !== DEMO_SESSION_SCHEMA_VERSION ||
      typeof parsed.userId !== 'string' ||
      !VALID_ROLES.has(parsed.role)
    ) {
      target.removeItem(DEMO_SESSION_STORAGE_KEY)
      return null
    }
    return {
      version: DEMO_SESSION_SCHEMA_VERSION,
      userId: parsed.userId,
      role: parsed.role,
      orgId: typeof parsed.orgId === 'string' && parsed.orgId ? parsed.orgId : null
    }
  } catch {
    try {
      target.removeItem(DEMO_SESSION_STORAGE_KEY)
    } catch {
      // ignore storage failure
    }
    return null
  }
}

export function savePersistedSession(storage, session) {
  const target = getBrowserStorage(storage)
  if (!target) return false
  try {
    if (!session) {
      target.removeItem(DEMO_SESSION_STORAGE_KEY)
      return true
    }
    target.setItem(
      DEMO_SESSION_STORAGE_KEY,
      JSON.stringify({
        version: DEMO_SESSION_SCHEMA_VERSION,
        userId: session.userId,
        role: session.role,
        orgId: session.orgId ?? null
      })
    )
    return true
  } catch {
    return false
  }
}

export function clearPersistedSession(storage) {
  const target = getBrowserStorage(storage)
  if (!target) return false
  try {
    target.removeItem(DEMO_SESSION_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}

export function validateDemoSession(candidate, data) {
  if (!candidate || !data) {
    return { valid: false, code: 'missing', reason: 'No active demo session.' }
  }

  const users = data.users ?? []
  const organizations = data.organizations ?? []

  if (!VALID_ROLES.has(candidate.role)) {
    return { valid: false, code: 'invalid_role', reason: 'Session role is not recognized.' }
  }

  const user = users.find(u => u.id === candidate.userId)
  if (!user) {
    return { valid: false, code: 'user_not_found', reason: 'User account no longer exists.' }
  }

  if ((user.status ?? 'active') !== 'active') {
    return {
      valid: false,
      code: 'user_suspended',
      reason: `User account "${user.name}" is ${user.status} and cannot access the platform.`
    }
  }

  if (user.role !== candidate.role) {
    return {
      valid: false,
      code: 'role_mismatch',
      reason: `User role has changed to "${user.role}"; re-authentication required.`
    }
  }

  const requiredOrgType = ROLE_TO_ORG_TYPE[user.role]
  if (requiredOrgType) {
    const effectiveOrgId = candidate.orgId ?? user.orgId ?? null
    if (!effectiveOrgId || user.orgId !== effectiveOrgId) {
      return {
        valid: false,
        code: 'org_mismatch',
        reason: 'User organization membership does not match session context.'
      }
    }
    const org = organizations.find(o => o.id === effectiveOrgId)
    if (!org) {
      return { valid: false, code: 'org_not_found', reason: 'Assigned organization no longer exists.' }
    }
    if ((org.status ?? 'active') !== 'active') {
      return {
        valid: false,
        code: 'org_suspended',
        reason: `Organization "${org.name}" is ${org.status} and blocked from access.`
      }
    }
    if (org.type !== requiredOrgType) {
      return {
        valid: false,
        code: 'org_type_mismatch',
        reason: `Organization "${org.name}" (${org.type}) does not match role "${user.role}".`
      }
    }
    return {
      valid: true,
      session: {
        version: DEMO_SESSION_SCHEMA_VERSION,
        userId: user.id,
        role: user.role,
        orgId: org.id
      },
      user,
      organization: org
    }
  }

  // Platform role (admin, investigator)
  if (user.orgId) {
    const org = organizations.find(o => o.id === user.orgId) ?? null
    if (org && (org.status ?? 'active') !== 'active') {
      return {
        valid: false,
        code: 'org_suspended',
        reason: `Organization "${org.name}" is ${org.status}.`
      }
    }
    return {
      valid: true,
      session: {
        version: DEMO_SESSION_SCHEMA_VERSION,
        userId: user.id,
        role: user.role,
        orgId: org?.id ?? null
      },
      user,
      organization: org
    }
  }

  return {
    valid: true,
    session: {
      version: DEMO_SESSION_SCHEMA_VERSION,
      userId: user.id,
      role: user.role,
      orgId: null
    },
    user,
    organization: null
  }
}

export function authenticateDemoUser(userId, data) {
  const user = (data?.users ?? []).find(u => u.id === userId)
  if (!user) {
    return { ok: false, error: 'Selected user account was not found.' }
  }
  const check = validateDemoSession(
    {
      version: DEMO_SESSION_SCHEMA_VERSION,
      userId: user.id,
      role: user.role,
      orgId: user.orgId ?? null
    },
    data
  )
  if (!check.valid) {
    return { ok: false, error: check.reason, code: check.code }
  }
  return { ok: true, ...check }
}

export function authenticateDefaultUserForRole(role, data) {
  if (!VALID_ROLES.has(role)) {
    return { ok: false, error: `Unknown role "${role}".` }
  }
  const candidates = (data?.users ?? []).filter(u => u.role === role)
  for (const user of candidates) {
    const check = authenticateDemoUser(user.id, data)
    if (check.ok) return check
  }
  return {
    ok: false,
    error: `No active eligible user and active organization exist for role "${role}".`
  }
}

export function authorizeActorForRole(data, actor, allowedRoles, { targetOrgId = null } = {}) {
  if (!actor) {
    return { ok: true, anonymous: true, orgId: targetOrgId }
  }
  const check = validateDemoSession(actor, data)
  if (!check.valid) {
    return { ok: false, error: check.reason }
  }
  if (Array.isArray(allowedRoles) && !allowedRoles.includes(check.session.role)) {
    return {
      ok: false,
      error: `Role "${check.session.role}" is not authorized for this operation.`
    }
  }
  if (targetOrgId && check.session.orgId && check.session.orgId !== targetOrgId) {
    return {
      ok: false,
      error: 'Cross-organization access denied: operation belongs to another organization.'
    }
  }
  return {
    ok: true,
    user: check.user,
    organization: check.organization,
    orgId: check.session.orgId ?? targetOrgId
  }
}

// --- Unique ID generators ---

export function nextSequentialId(items = [], prefix, field = 'id') {
  const existing = new Set()
  const pattern = new RegExp(`^${prefix}(\\d+)$`)
  let max = 0
  for (const item of items) {
    const val = item?.[field]
    if (typeof val === 'string') {
      existing.add(val)
      const match = val.match(pattern)
      if (match) {
        const num = Number(match[1])
        if (Number.isInteger(num) && num > max) max = num
      }
    }
  }
  let candidate = max + 1
  while (existing.has(`${prefix}${candidate}`)) {
    candidate += 1
  }
  return `${prefix}${candidate}`
}

export function nextShipmentRef(shipments = []) {
  const existing = new Set()
  let max = -1
  for (const s of shipments) {
    if (typeof s?.ref === 'string') {
      existing.add(s.ref)
      const match = s.ref.match(/^SHP-(\d+)$/)
      if (match) {
        const num = Number(match[1])
        if (Number.isInteger(num) && num > max) max = num
      }
    }
  }
  let candidate = max + 1
  let ref = `SHP-${String(candidate).padStart(4, '0')}`
  while (existing.has(ref)) {
    candidate += 1
    ref = `SHP-${String(candidate).padStart(4, '0')}`
  }
  return ref
}
