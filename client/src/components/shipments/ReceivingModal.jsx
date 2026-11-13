import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  PackageCheck,
  ShieldAlert,
  XCircle
} from 'lucide-react'
import { Button, Modal, StatusBadge } from '../ui'
import QrScanner from '../scanner/QrScanner'
import { useDemoData } from '../../contexts/DemoData'
import { useDemoSession } from '../../contexts/DemoSession'
import { extractSerialFromInput } from '../../services/qrPayload'
import {
  ORG_TYPE_TO_EVENT_PREFIX,
  ROLE_TO_EVENT_PREFIX,
  TRACEABILITY_EVENT_TYPES
} from '../../services/traceabilityEvents'
import {
  initializeShipmentReconciliation,
  summarizeDispositions
} from '../../services/supplyChain'

const REASON_PLACEHOLDERS = {
  damaged: 'Required reason (e.g. Crushed carton, broken tamper seal)',
  missing: 'Required explanation (e.g. Short-shipped carton on pallet 2)',
  rejected: 'Required rejection reason (e.g. Label mismatch / unverified pack)'
}

export default function ReceivingModal({
  open,
  shipment,
  packages,
  batches,
  orgName,
  productOf,
  onClose,
  onSaveSession
}) {
  const { recordTraceabilityEvents } = useDemoData() ?? {}
  const { role, organization } = useDemoSession() ?? {}
  const eventPrefix =
    ROLE_TO_EVENT_PREFIX[role] ?? ORG_TYPE_TO_EVENT_PREFIX[organization?.type] ?? 'DISTRIBUTOR'
  const checkpointName = `${String(role || organization?.type || 'distributor').toLowerCase()}_receiving`

  const [sessionDraft, setSessionDraft] = useState({})
  const [scannedThisSession, setScannedThisSession] = useState(() => new Set())
  const [unmatchedThisSession, setUnmatchedThisSession] = useState([])
  const [scanFeedback, setScanFeedback] = useState(null)
  const [formErr, setFormErr] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && shipment) {
      setSessionDraft({})
      setScannedThisSession(new Set())
      setUnmatchedThisSession([])
      setScanFeedback(null)
      setFormErr('')
      setSaving(false)
    }
  }, [open, shipment?.ref])

  const persistedDispositions = useMemo(
    () => (shipment ? initializeShipmentReconciliation(shipment, packages) : {}),
    [shipment, packages]
  )

  const manifest = shipment?.packageSerials ?? []

  const effectiveDispositions = useMemo(() => {
    const merged = { ...persistedDispositions }
    for (const [serial, draft] of Object.entries(sessionDraft)) {
      if (draft?.status) {
        merged[serial] = { ...persistedDispositions[serial], ...draft }
      }
    }
    return merged
  }, [persistedDispositions, sessionDraft])

  const summary = useMemo(
    () => summarizeDispositions(manifest, effectiveDispositions),
    [manifest, effectiveDispositions]
  )

  const packageMeta = serial => {
    const pkg = packages.find(p => p.serial === serial) ?? null
    const batch = pkg ? batches.find(b => b.id === pkg.batchId) ?? null : null
    const product = batch ? productOf(batch.productId) : null
    return { pkg, batch, product }
  }

  async function emitReceivingObservation(serial, { pkg = null, scannedOutcome, verifiedOutcome, failureReason = null }) {
    if (!recordTraceabilityEvents || !shipment) return { ok: true }
    const scannedType = TRACEABILITY_EVENT_TYPES[`${eventPrefix}_RECEIVING_SCANNED`]
    const verifiedType = TRACEABILITY_EVENT_TYPES[`${eventPrefix}_RECEIVING_VERIFIED`]
    if (!scannedType || !verifiedType) return { ok: true }

    const timestamp = new Date().toISOString()
    return recordTraceabilityEvents([
      {
        eventType: scannedType,
        serial,
        packageId: serial,
        batchId: pkg?.batchId ?? null,
        shipmentId: shipment.ref,
        timestamp,
        checkpoint: checkpointName,
        category: 'observation',
        outcome: scannedOutcome,
        failureReason: scannedOutcome === 'success' ? null : failureReason
      },
      {
        eventType: verifiedType,
        serial,
        packageId: serial,
        batchId: pkg?.batchId ?? null,
        shipmentId: shipment.ref,
        timestamp,
        checkpoint: checkpointName,
        category: 'observation',
        outcome: verifiedOutcome,
        failureReason: verifiedOutcome === 'success' ? null : failureReason
      }
    ])
  }

  async function handleScan(rawSerial) {
    if (!shipment) return
    const serial = extractSerialFromInput(rawSerial) || String(rawSerial ?? '').trim().toUpperCase()
    if (!serial) return
    setFormErr('')

    const existingPkg = packages.find(p => p.serial === serial) ?? null

    if (!manifest.includes(serial)) {
      const known = Boolean(existingPkg)
      const message = known
        ? `Unexpected serial ${serial} — registered in system, but not on manifest ${shipment.ref}. Logged as unmatched.`
        : `Unknown serial ${serial} — not found in registry or ${shipment.ref} manifest. Logged as unmatched.`

      const res = await emitReceivingObservation(serial, {
        pkg: existingPkg,
        scannedOutcome: known ? 'unmatched' : 'failed',
        verifiedOutcome: 'unmatched',
        failureReason: message
      })
      if (res && res.ok === false) {
        setFormErr(res.error || 'Unable to record receiving scan.')
        return
      }

      setUnmatchedThisSession(prev => (prev.includes(serial) ? prev : [...prev, serial]))
      setScanFeedback({
        tone: 'error',
        text: message
      })
      return
    }

    const prevDisp = persistedDispositions[serial]
    if (prevDisp?.status === 'accepted') {
      const message = `Duplicate/locked: ${serial} was already accepted in session ${prevDisp.sessionId || 'earlier'} and cannot be accepted again.`
      await emitReceivingObservation(serial, {
        pkg: existingPkg,
        scannedOutcome: 'duplicate',
        verifiedOutcome: 'blocked',
        failureReason: message
      })
      setScanFeedback({
        tone: 'warn',
        text: message
      })
      return
    }

    if (prevDisp?.status === 'damaged') {
      const message = `Locked: ${serial} was already received damaged and quarantined.`
      await emitReceivingObservation(serial, {
        pkg: existingPkg,
        scannedOutcome: 'blocked',
        verifiedOutcome: 'blocked',
        failureReason: message
      })
      setScanFeedback({
        tone: 'warn',
        text: message
      })
      return
    }

    if (prevDisp?.status === 'rejected') {
      const message = `Locked: ${serial} was previously rejected and requires return handover/reconciliation, not re-acceptance.`
      await emitReceivingObservation(serial, {
        pkg: existingPkg,
        scannedOutcome: 'blocked',
        verifiedOutcome: 'blocked',
        failureReason: message
      })
      setScanFeedback({
        tone: 'warn',
        text: message
      })
      return
    }

    if (scannedThisSession.has(serial)) {
      const message = `Duplicate scan: ${serial} was already scanned in this receiving session.`
      await emitReceivingObservation(serial, {
        pkg: existingPkg,
        scannedOutcome: 'duplicate',
        verifiedOutcome: 'duplicate',
        failureReason: message
      })
      setScanFeedback({
        tone: 'warn',
        text: message
      })
      return
    }

    const res = await emitReceivingObservation(serial, {
      pkg: existingPkg,
      scannedOutcome: 'success',
      verifiedOutcome: 'success',
      failureReason: null
    })
    if (res && res.ok === false) {
      setFormErr(res.error || 'Unable to record receiving scan verification.')
      return
    }

    setScannedThisSession(prev => {
      const next = new Set(prev)
      next.add(serial)
      return next
    })
    setSessionDraft(prev => ({
      ...prev,
      [serial]: {
        status: 'accepted',
        reason: '',
        notes: '',
        scanned: true
      }
    }))
    setScanFeedback({
      tone: 'ok',
      text: `Matched ${serial} — marked Accepted for this session.`
    })
  }

  function setPackageDraftStatus(serial, nextStatus) {
    setFormErr('')
    const prevDisp = persistedDispositions[serial]
    if (prevDisp?.status === 'accepted' || prevDisp?.status === 'damaged' || prevDisp?.status === 'rejected') {
      return
    }

    if (!nextStatus) {
      setSessionDraft(prev => {
        const copy = { ...prev }
        delete copy[serial]
        return copy
      })
      return
    }

    setSessionDraft(prev => {
      const existing = prev[serial] ?? {}
      return {
        ...prev,
        [serial]: {
          status: nextStatus,
          reason: nextStatus === 'accepted' ? '' : existing.reason ?? '',
          notes: nextStatus === 'damaged' ? existing.notes ?? '' : '',
          scanned: scannedThisSession.has(serial) || nextStatus !== 'missing'
        }
      }
    })
  }

  function updateDraftField(serial, field, value) {
    setFormErr('')
    setSessionDraft(prev => ({
      ...prev,
      [serial]: {
        ...prev[serial],
        [field]: value
      }
    }))
  }

  async function handleSave() {
    if (!shipment || saving) return
    const entries = Object.entries(sessionDraft).filter(([, d]) => d?.status)
    if (entries.length === 0 && unmatchedThisSession.length === 0) {
      setFormErr('Scan or record at least one package disposition (or unmatched scan) to save this session.')
      return
    }

    for (const [serial, draft] of entries) {
      if (['damaged', 'missing', 'rejected'].includes(draft.status) && !String(draft.reason ?? '').trim()) {
        setFormErr(`Please enter a required reason/explanation for ${draft.status} package ${serial}.`)
        return
      }
    }

    setSaving(true)
    setFormErr('')
    try {
      const res = await onSaveSession({
        shipmentRef: shipment.ref,
        sessionDispositions: sessionDraft,
        unmatchedScans: unmatchedThisSession
      })
      if (res && !res.ok) {
        setFormErr(res.error || 'Unable to save receiving session.')
      }
    } finally {
      setSaving(false)
    }
  }

  const draftChangeCount = Object.keys(sessionDraft).length
  const sessionNumber = (shipment?.receivingSessions?.length ?? 0) + 1

  return (
    <Modal
      open={open && Boolean(shipment)}
      onClose={onClose}
      title={shipment ? `Receive Shipment ${shipment.ref} (Session ${sessionNumber})` : 'Receive Shipment'}
      actions={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="success"
            type="button"
            disabled={
              saving ||
              manifest.length === 0 ||
              (draftChangeCount === 0 && unmatchedThisSession.length === 0)
            }
            onClick={handleSave}
          >
            <PackageCheck size={15} aria-hidden="true" />
            {saving ? 'Saving...' : `Save Receiving Session (${draftChangeCount})`}
          </Button>
        </>
      }
    >
      {shipment && (
        <div className="space-y-4">
          <div className="rounded-md border border-line bg-surface p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Origin: <strong className="text-navy">{orgName(shipment.from)}</strong>
              </span>
              <StatusBadge status={shipment.status} />
            </div>
            <div className="id-text mt-2 flex flex-wrap gap-3 font-semibold text-navy">
              <span className="text-emerald-700">Accepted: {summary.accepted}/{summary.total}</span>
              <span className="text-quarantine">Damaged/Quarantined: {summary.damaged}</span>
              <span className="text-amber-ink">Missing: {summary.missing}</span>
              <span className="text-quarantine">Rejected: {summary.rejected}</span>
              <span className="text-muted">Outstanding: {summary.outstanding}</span>
            </div>
          </div>

          <QrScanner
            onScan={handleScan}
            placeholder="Scan QR URL or enter package serial on manifest"
            label="Scan incoming package serial"
          />

          {scanFeedback && (
            <div
              role="status"
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
                scanFeedback.tone === 'ok'
                  ? 'border-emerald-200 bg-clinical-soft text-emerald-900'
                  : scanFeedback.tone === 'warn'
                    ? 'border-amber-line bg-amber-soft text-amber-ink'
                    : 'border-quarantine-line bg-quarantine-soft text-quarantine'
              }`}
            >
              {scanFeedback.tone === 'ok' ? (
                <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              ) : scanFeedback.tone === 'warn' ? (
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              ) : (
                <XCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              )}
              <span>{scanFeedback.text}</span>
            </div>
          )}

          {unmatchedThisSession.length > 0 && (
            <div className="rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
              <div className="mb-1 flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle size={14} aria-hidden="true" /> Unmatched Scans ({unmatchedThisSession.length} — will persist with session)
                </span>
              </div>
              <div className="id-text flex flex-wrap gap-1.5">
                {unmatchedThisSession.map(s => (
                  <span key={s} className="rounded border border-amber-line bg-white px-2 py-0.5 font-semibold">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted">
                Package Manifest Reconciliation ({manifest.length})
              </h3>
              <span className="text-[11px] text-muted">
                Partial progress allowed — outstanding items stay open for later sessions
              </span>
            </div>

            <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-white">
              {manifest.map(serial => {
                const { batch, product } = packageMeta(serial)
                const prevDisp = persistedDispositions[serial]
                const draft = sessionDraft[serial]
                const isLocked = ['accepted', 'damaged', 'rejected'].includes(prevDisp?.status)
                const activeStatus = isLocked ? prevDisp.status : draft?.status ?? prevDisp?.status ?? 'outstanding'
                const showReasonInput = !isLocked && draft && ['damaged', 'missing', 'rejected'].includes(draft.status)

                return (
                  <li key={serial} className="space-y-2 px-3 py-2.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="id-text font-semibold text-navy">{serial}</span>
                          <StatusBadge status={activeStatus} />
                          {scannedThisSession.has(serial) && (
                            <span className="rounded bg-clinical-soft px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                              Scanned now
                            </span>
                          )}
                          {isLocked && (
                            <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-muted">
                              <Lock size={10} aria-hidden="true" /> Locked ({prevDisp.sessionId || 'prior'})
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-muted">
                          {product ? `${product.name} ${product.strength}` : 'Medicine'}
                          {batch ? ` · ${batch.no} · Exp ${batch.exp}` : ''}
                        </div>
                        {prevDisp?.reason && !draft && (
                          <div className="mt-0.5 font-medium text-amber-ink">
                            Prior note: {prevDisp.reason}
                          </div>
                        )}
                      </div>

                      {!isLocked && (
                        <div className="flex flex-wrap items-center gap-1">
                          {[
                            ['accepted', 'Accept', 'border-clinical bg-clinical text-white'],
                            ['damaged', 'Damaged', 'border-quarantine bg-quarantine text-white'],
                            ['missing', 'Missing', 'border-amber-600 bg-amber-600 text-white'],
                            ['rejected', 'Reject', 'border-quarantine bg-quarantine text-white']
                          ].map(([key, label, activeCls]) => {
                            const selected = draft?.status === key
                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setPackageDraftStatus(serial, selected ? null : key)}
                                className={`rounded border px-2 py-1 text-[11px] font-semibold transition ${
                                  selected
                                    ? activeCls
                                    : 'border-line bg-white text-ink hover:bg-surface'
                                }`}
                              >
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {showReasonInput && (
                      <div className="grid grid-cols-1 gap-2 rounded-md border border-line bg-surface p-2 sm:grid-cols-2">
                        <label className="block">
                          <span className="sr-only">Reason for {serial}</span>
                          <input
                            type="text"
                            value={draft.reason ?? ''}
                            onChange={e => updateDraftField(serial, 'reason', e.target.value)}
                            placeholder={REASON_PLACEHOLDERS[draft.status]}
                            className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink"
                          />
                        </label>
                        {draft.status === 'damaged' && (
                          <label className="block">
                            <span className="sr-only">Optional damage notes for {serial}</span>
                            <input
                              type="text"
                              value={draft.notes ?? ''}
                              onChange={e => updateDraftField(serial, 'notes', e.target.value)}
                              placeholder="Optional inspection notes"
                              className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink"
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {formErr && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-quarantine-line bg-quarantine-soft p-2.5 text-xs font-semibold text-quarantine">
              <ShieldAlert size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{formErr}</span>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
