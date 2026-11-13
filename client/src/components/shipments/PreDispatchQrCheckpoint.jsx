import { useMemo, useState } from 'react'
import { CheckCircle2, QrCode, ShieldAlert, XCircle } from 'lucide-react'
import QrScanner from '../scanner/QrScanner'
import { StatusBadge } from '../ui'
import { extractSerialFromInput } from '../../services/qrPayload'
import { validatePackageForDispatch, getCurrentDateIso } from '../../services/supplyChain'
import {
  TRACEABILITY_EVENT_TYPES,
  hasCurrentPreDispatchVerification
} from '../../services/traceabilityEvents'

export default function PreDispatchQrCheckpoint({
  shipment,
  role,
  orgId,
  packages,
  batches,
  organizations,
  shipments,
  traceabilityEvents,
  productOf,
  onRecordEvents
}) {
  const [scanStatus, setScanStatus] = useState(null)
  const [busy, setBusy] = useState(false)

  const manifest = shipment?.packageSerials ?? []

  const packageStatusList = useMemo(() => {
    return manifest.map(serial => {
      const pkg = packages.find(p => p.serial === serial) ?? null
      const batch = pkg ? batches.find(b => b.id === pkg.batchId) ?? null : null
      const product = batch ? productOf(batch.productId) : null
      const verification = hasCurrentPreDispatchVerification(traceabilityEvents, {
        serial,
        orgId,
        role
      })
      return {
        serial,
        pkg,
        batch,
        product,
        verified: verification.verified,
        event: verification.event
      }
    })
  }, [manifest, packages, batches, productOf, traceabilityEvents, orgId, role])

  const verifiedCount = packageStatusList.filter(item => item.verified).length
  const allVerified = manifest.length > 0 && verifiedCount === manifest.length

  async function handleCheckpointScan(raw) {
    if (!shipment || busy) return
    const serial = extractSerialFromInput(raw)
    if (!serial) return

    const existingPkg = packages.find(p => p.serial === serial) ?? null
    const batch = existingPkg ? batches.find(b => b.id === existingPkg.batchId) ?? null : null
    const onManifest = manifest.includes(serial)

    const dispatchCheck = validatePackageForDispatch({
      pkg: existingPkg,
      batch,
      fromOrgId: orgId,
      organizations,
      shipments,
      activeShipmentRef: shipment.ref,
      today: getCurrentDateIso()
    })

    const failureReasons = []
    if (!existingPkg) {
      failureReasons.push(`Package serial ${serial} was not found in the registry.`)
    } else if (!onManifest) {
      failureReasons.push(`Package ${serial} does not belong to shipment ${shipment.ref}.`)
    }
    if (!dispatchCheck.eligible) {
      for (const reason of dispatchCheck.reasons) {
        if (!failureReasons.includes(reason)) {
          failureReasons.push(reason)
        }
      }
    }

    const passed = Boolean(existingPkg && onManifest && dispatchCheck.eligible)
    const failureText = failureReasons.join(' ')
    const timestamp = new Date().toISOString()

    const eventsToRecord = []
    if (role === 'manufacturer') {
      eventsToRecord.push({
        eventType: passed
          ? TRACEABILITY_EVENT_TYPES.MANUFACTURER_QR_VERIFIED
          : TRACEABILITY_EVENT_TYPES.MANUFACTURER_QR_VERIFICATION_FAILED,
        serial,
        packageId: serial,
        batchId: existingPkg?.batchId ?? null,
        shipmentId: shipment.ref,
        timestamp,
        checkpoint: 'manufacturer_pre_dispatch',
        category: 'observation',
        outcome: passed ? 'success' : existingPkg ? 'blocked' : 'failed',
        failureReason: passed ? null : failureText
      })
    } else {
      const prefix = role === 'distributor' ? 'DISTRIBUTOR' : 'WHOLESALER'
      eventsToRecord.push(
        {
          eventType: TRACEABILITY_EVENT_TYPES[`${prefix}_PRE_DISPATCH_SCANNED`],
          serial,
          packageId: serial,
          batchId: existingPkg?.batchId ?? null,
          shipmentId: shipment.ref,
          timestamp,
          checkpoint: `${role}_pre_dispatch`,
          category: 'observation',
          outcome: existingPkg ? 'success' : 'failed',
          failureReason: existingPkg ? null : failureText
        },
        {
          eventType: TRACEABILITY_EVENT_TYPES[`${prefix}_PRE_DISPATCH_VERIFIED`],
          serial,
          packageId: serial,
          batchId: existingPkg?.batchId ?? null,
          shipmentId: shipment.ref,
          timestamp,
          checkpoint: `${role}_pre_dispatch`,
          category: 'observation',
          outcome: passed ? 'success' : existingPkg ? 'blocked' : 'failed',
          failureReason: passed ? null : failureText
        }
      )
    }

    setBusy(true)
    try {
      const res = await onRecordEvents(eventsToRecord)
      if (res && res.ok === false) {
        setScanStatus({ ok: false, text: res.error || 'Unable to record QR verification checkpoint.' })
        return
      }
      if (passed) {
        const prod = batch ? productOf(batch.productId) : null
        setScanStatus({
          ok: true,
          text: `QR verified for ${serial}${prod ? ` (${prod.name} ${prod.strength})` : ''}${batch ? ` · Batch ${batch.no}` : ''}. Eligible for dispatch.`
        })
      } else {
        setScanStatus({
          ok: false,
          text: `Pre-dispatch QR verification failed for ${serial}: ${failureText}`
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-navy">
          <QrCode size={14} aria-hidden="true" />
          Mandatory Pre-Dispatch QR Verification ({verifiedCount}/{manifest.length})
        </div>
        <StatusBadge status={allVerified ? 'verified' : 'pending'} />
      </div>

      {!allVerified ? (
        <p className="text-xs text-muted">
          Scan each package&apos;s QR code or verification URL before confirming dispatch. Scanning verifies package identity, current ownership, batch eligibility, expiry, and quarantine status.
        </p>
      ) : (
        <p className="text-xs font-medium text-emerald-800">
          All {manifest.length} package(s) passed pre-dispatch QR verification in current custody.
        </p>
      )}

      <QrScanner
        onScan={handleCheckpointScan}
        placeholder={`Scan or enter QR URL / serial for ${shipment?.ref ?? 'shipment'}`}
        label="Pre-dispatch QR verification scan"
      />

      {scanStatus && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
            scanStatus.ok
              ? 'border-emerald-200 bg-clinical-soft text-emerald-900'
              : 'border-quarantine-line bg-quarantine-soft text-quarantine'
          }`}
        >
          {scanStatus.ok ? (
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          ) : (
            <XCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          )}
          <span>{scanStatus.text}</span>
        </div>
      )}

      <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-md border border-line bg-white">
        {packageStatusList.map(({ serial, batch, product, verified, event }) => (
          <li key={serial} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <div className="min-w-0">
              <div className="id-text font-semibold text-navy">{serial}</div>
              <div className="truncate text-muted">
                {product ? `${product.name} ${product.strength}` : 'Package'}
                {batch ? ` · ${batch.no} · Exp ${batch.exp}` : ''}
              </div>
              {event && (
                <div className="id-text text-[10px] text-emerald-700">
                  Verified ({event.id} · {event.timestamp})
                </div>
              )}
            </div>
            {verified ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-200 bg-clinical-soft px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                <CheckCircle2 size={11} aria-hidden="true" /> Verified
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-line bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber-ink">
                <ShieldAlert size={11} aria-hidden="true" /> Scan required
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
