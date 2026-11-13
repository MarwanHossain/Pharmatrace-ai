// TEMPORARY FRONTEND DEMO STATE REPOSITORY (browser localStorage via demoStorage.js).
// Replace with API-backed persistence in Phase 2 without rewriting portal components.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEMO_DATA_STORAGE_KEY,
  WEB_LOCKS_UNAVAILABLE_ERROR,
  commitDemoMutation,
  getBrowserStorage,
  isWebLocksSupported,
  loadPersistedDemoData,
  resetPersistedDemoData,
  shouldAdoptStorageEnvelope,
  validateAndMigrateDemoData
} from '../services/demoStorage'
import {
  mutateAddBatch,
  mutateAddOrganization,
  mutateAddProduct,
  mutateAddUser,
  mutateCloseShipmentReconciliation,
  mutateCreateInvestigation,
  mutateCreateShipment,
  mutateDispatchShipment,
  mutateDispensePackage,
  mutateGenerateSerials,
  mutateRecordReceivingSession,
  mutateRecordRejectedHandover,
  mutateRecordTraceabilityEvents,
  mutateReleaseBatch,
  mutateSubmitReport,
  mutateUpdateAlert,
  mutateUpdateInvestigation,
  mutateUpdateOrganization,
  mutateUpdateProduct,
  mutateUpdateUser,
  mutateVerifyAndRecord
} from '../services/demoMutations'
import { verifySerial } from '../services/verification'
import { getCurrentDateIso } from '../services/supplyChain'

const DemoDataCtx = createContext(null)

export function DemoDataProvider({ children }) {
  const [envelope, setEnvelope] = useState(() => loadPersistedDemoData().envelope)
  const [syncConflict, setSyncConflict] = useState('')
  const envelopeRef = useRef(envelope)
  envelopeRef.current = envelope

  const locksSupported = useMemo(() => isWebLocksSupported(), [])

  const actorRef = useRef(null)
  const registerActor = useCallback(actor => {
    actorRef.current = actor ?? null
  }, [])

  useEffect(() => {
    function handleStorage(e) {
      if (e.key !== DEMO_DATA_STORAGE_KEY && e.key !== null) return

      // Full storage clear or explicit key removal -> reinitialize from disk
      if (e.key === null || e.newValue === null) {
        const loaded = loadPersistedDemoData()
        envelopeRef.current = loaded.envelope
        setSyncConflict('')
        setEnvelope(loaded.envelope)
        return
      }

      // Inspect event payload first so delayed or equal-revision conflicting snapshots are detected accurately
      if (typeof e.newValue === 'string' && e.newValue) {
        const parsedEvent = validateAndMigrateDemoData(e.newValue)
        if (parsedEvent.ok) {
          const eventDecision = shouldAdoptStorageEnvelope(envelopeRef.current, parsedEvent.envelope)
          if (eventDecision.conflict) {
            setSyncConflict(
              'Conflicting browser storage snapshot detected (equal revision with differing commit ID). Retained current persisted state.'
            )
          } else if (eventDecision.adopt) {
            envelopeRef.current = parsedEvent.envelope
            setSyncConflict('')
            setEnvelope(parsedEvent.envelope)
          }
        }
      }

      // Also check latest disk snapshot in case disk advanced beyond this storage event payload
      const loaded = loadPersistedDemoData()
      const diskDecision = shouldAdoptStorageEnvelope(envelopeRef.current, loaded.envelope)
      if (diskDecision.adopt) {
        envelopeRef.current = loaded.envelope
        setSyncConflict('')
        setEnvelope(loaded.envelope)
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const runTransaction = useCallback(async mutator => {
    try {
      const storage = getBrowserStorage()
      const committed = await commitDemoMutation(storage, mutator)
      if (committed?.committed && committed.envelope) {
        const decision = shouldAdoptStorageEnvelope(envelopeRef.current, committed.envelope)
        if (decision.adopt || !envelopeRef.current) {
          envelopeRef.current = committed.envelope
          setSyncConflict('')
          setEnvelope(committed.envelope)
        }
      }
      return (
        committed?.result ?? {
          ok: Boolean(committed?.ok),
          code: committed?.code,
          error: committed?.error
        }
      )
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to commit transaction.'
      }
    }
  }, [])

  const {
    organizations,
    products,
    batches,
    packages,
    shipments,
    users,
    alerts,
    investigations,
    reports,
    traceabilityEvents = []
  } = envelope.data

  const orgName = useCallback(
    id => organizations.find(o => o.id === id)?.name ?? '—',
    [organizations]
  )

  const productOf = useCallback(
    id => products.find(p => p.id === id),
    [products]
  )

  const generateSerials = useCallback(
    payload => runTransaction(data => mutateGenerateSerials(data, payload, actorRef.current)),
    [runTransaction]
  )

  const inspectSerial = useCallback(rawSerial => {
    const current = envelopeRef.current.data
    return verifySerial(rawSerial, {
      packages: current.packages,
      batches: current.batches,
      shipments: current.shipments,
      organizations: current.organizations,
      today: getCurrentDateIso()
    })
  }, [])

  const verifyAndRecord = useCallback(
    rawSerial => runTransaction(data => mutateVerifyAndRecord(data, rawSerial)),
    [runTransaction]
  )

  const addProduct = useCallback(
    product => runTransaction(data => mutateAddProduct(data, product, actorRef.current)),
    [runTransaction]
  )

  const updateProduct = useCallback(
    (id, updates) => runTransaction(data => mutateUpdateProduct(data, id, updates, actorRef.current)),
    [runTransaction]
  )

  const addBatch = useCallback(
    batch => runTransaction(data => mutateAddBatch(data, batch, actorRef.current)),
    [runTransaction]
  )

  const releaseBatch = useCallback(
    id => runTransaction(data => mutateReleaseBatch(data, id, actorRef.current)),
    [runTransaction]
  )

  const createShipment = useCallback(
    payload => runTransaction(data => mutateCreateShipment(data, payload, actorRef.current)),
    [runTransaction]
  )

  const dispatchShipment = useCallback(
    (ref, options = {}) => runTransaction(data => mutateDispatchShipment(data, ref, actorRef.current, options)),
    [runTransaction]
  )

  const recordTraceabilityEvents = useCallback(
    events => runTransaction(data => mutateRecordTraceabilityEvents(data, events, actorRef.current)),
    [runTransaction]
  )

  const recordReceivingSession = useCallback(
    (ref, payload) =>
      runTransaction(data => mutateRecordReceivingSession(data, ref, payload, actorRef.current)),
    [runTransaction]
  )

  const acceptShipment = useCallback(
    (ref, { accepted = [], rejected = [], damaged = [], missing = [], unmatchedScans = [] } = {}) => {
      const sessionDispositions = {}
      for (const item of accepted) {
        const serial = typeof item === 'string' ? item : item.serial
        sessionDispositions[serial] = { status: 'accepted', scanned: true }
      }
      for (const item of damaged) {
        const serial = typeof item === 'string' ? item : item.serial
        sessionDispositions[serial] = {
          status: 'damaged',
          reason: (typeof item === 'object' ? item.reason : '') || 'Physical damage reported on receiving',
          notes: typeof item === 'object' ? item.notes : '',
          scanned: true
        }
      }
      for (const item of missing) {
        const serial = typeof item === 'string' ? item : item.serial
        sessionDispositions[serial] = {
          status: 'missing',
          reason: (typeof item === 'object' ? item.reason : '') || 'Package missing from physical delivery',
          notes: typeof item === 'object' ? item.notes : '',
          scanned: false
        }
      }
      for (const item of rejected) {
        const serial = typeof item === 'string' ? item : item.serial
        sessionDispositions[serial] = {
          status: 'rejected',
          reason: (typeof item === 'object' ? item.reason : '') || 'Rejected on receiving inspection',
          notes: typeof item === 'object' ? item.notes : '',
          scanned: true
        }
      }
      return recordReceivingSession(ref, { sessionDispositions, unmatchedScans })
    },
    [recordReceivingSession]
  )

  const closeShipmentReconciliation = useCallback(
    (ref, note = '') =>
      runTransaction(data => mutateCloseShipmentReconciliation(data, ref, note, actorRef.current)),
    [runTransaction]
  )

  const recordRejectedHandover = useCallback(
    (ref, serial, handoverNote) =>
      runTransaction(data => mutateRecordRejectedHandover(data, ref, serial, handoverNote, actorRef.current)),
    [runTransaction]
  )

  const dispensePackage = useCallback(
    (serial, options = {}) =>
      runTransaction(data => mutateDispensePackage(data, serial, options, actorRef.current)),
    [runTransaction]
  )

  const submitReport = useCallback(
    payload => runTransaction(data => mutateSubmitReport(data, payload)),
    [runTransaction]
  )

  const addOrganization = useCallback(
    org => runTransaction(data => mutateAddOrganization(data, org, actorRef.current)),
    [runTransaction]
  )

  const updateOrganization = useCallback(
    (id, updates) => runTransaction(data => mutateUpdateOrganization(data, id, updates, actorRef.current)),
    [runTransaction]
  )

  const addUser = useCallback(
    user => runTransaction(data => mutateAddUser(data, user, actorRef.current)),
    [runTransaction]
  )

  const updateUser = useCallback(
    (id, updates) => runTransaction(data => mutateUpdateUser(data, id, updates, actorRef.current)),
    [runTransaction]
  )

  const createInvestigation = useCallback(
    payload => runTransaction(data => mutateCreateInvestigation(data, payload, actorRef.current)),
    [runTransaction]
  )

  const updateInvestigation = useCallback(
    (id, updates) => runTransaction(data => mutateUpdateInvestigation(data, id, updates, actorRef.current)),
    [runTransaction]
  )

  const updateAlert = useCallback(
    (id, updates) => runTransaction(data => mutateUpdateAlert(data, id, updates, actorRef.current)),
    [runTransaction]
  )

  const resetDemoData = useCallback(async () => {
    try {
      const res = await resetPersistedDemoData(getBrowserStorage(), {
        knownResetEpoch: envelopeRef.current?.resetEpoch ?? 1
      })
      if (!res?.ok || !res.envelope) {
        return {
          ok: false,
          committed: false,
          code: res?.code,
          error: res?.error ?? 'Unable to reset demo data.'
        }
      }
      envelopeRef.current = res.envelope
      actorRef.current = null
      setSyncConflict('')
      setEnvelope(res.envelope)
      return res
    } catch (err) {
      return {
        ok: false,
        committed: false,
        error: err instanceof Error ? err.message : 'Unable to reset demo data.'
      }
    }
  }, [])

  const value = useMemo(
    () => ({
      schemaVersion: envelope.version,
      revision: envelope.revision,
      resetEpoch: envelope.resetEpoch ?? 1,
      commitId: envelope.commitId ?? '',
      locksSupported,
      locksUnavailableError: WEB_LOCKS_UNAVAILABLE_ERROR,
      syncConflict,
      organizations,
      products,
      batches,
      packages,
      shipments,
      users,
      alerts,
      investigations,
      reports,
      traceabilityEvents,
      orgName,
      productOf,
      registerActor,
      generateSerials,
      inspectSerial,
      verifyAndRecord,
      recordTraceabilityEvents,
      addProduct,
      updateProduct,
      addBatch,
      releaseBatch,
      createShipment,
      dispatchShipment,
      recordReceivingSession,
      acceptShipment,
      closeShipmentReconciliation,
      recordRejectedHandover,
      dispensePackage,
      submitReport,
      addOrganization,
      updateOrganization,
      addUser,
      updateUser,
      createInvestigation,
      updateInvestigation,
      updateAlert,
      resetDemoData
    }),
    [
      envelope.version,
      envelope.revision,
      envelope.resetEpoch,
      envelope.commitId,
      locksSupported,
      syncConflict,
      organizations,
      products,
      batches,
      packages,
      shipments,
      users,
      alerts,
      investigations,
      reports,
      traceabilityEvents,
      orgName,
      productOf,
      registerActor,
      generateSerials,
      inspectSerial,
      verifyAndRecord,
      recordTraceabilityEvents,
      addProduct,
      updateProduct,
      addBatch,
      releaseBatch,
      createShipment,
      dispatchShipment,
      recordReceivingSession,
      acceptShipment,
      closeShipmentReconciliation,
      recordRejectedHandover,
      dispensePackage,
      submitReport,
      addOrganization,
      updateOrganization,
      addUser,
      updateUser,
      createInvestigation,
      updateInvestigation,
      updateAlert,
      resetDemoData
    ]
  )

  return <DemoDataCtx.Provider value={value}>{children}</DemoDataCtx.Provider>
}

export const useDemoData = () => useContext(DemoDataCtx)
