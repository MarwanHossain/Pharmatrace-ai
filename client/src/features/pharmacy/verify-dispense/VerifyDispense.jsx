import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, PackageCheck, ShieldAlert } from 'lucide-react'
import { PageHeader, StatusBadge, Button, Timeline, Toast } from '../../../components/ui'
import QrScanner from '../../../components/scanner/QrScanner'
import { useDemoData } from '../../../contexts/DemoData'
import { useDemoSession } from '../../../contexts/DemoSession'
import { extractSerialFromInput } from '../../../services/qrPayload'
import { TRACEABILITY_EVENT_TYPES } from '../../../services/traceabilityEvents'
import { verifySerial, hasCompleteTraceability } from '../../../services/verification'
import { getCurrentDateIso, validatePackageForDispense } from '../../../services/supplyChain'

export default function VerifyDispense() {
  const {
    organizations,
    packages,
    batches,
    shipments,
    orgName,
    productOf,
    dispensePackage,
    recordTraceabilityEvents
  } = useDemoData()
  const { orgId, organization } = useDemoSession()
  const currentOrgName = organization?.name ?? orgName(orgId)

  const [selectedSerial, setSelectedSerial] = useState('')
  const [dispensing, setDispensing] = useState(false)
  const [dispenseErr, setDispenseErr] = useState('')
  const [toast, setToast] = useState('')

  async function handleLookup(raw) {
    const normalized = extractSerialFromInput(raw) || String(raw ?? '').trim().toUpperCase()
    if (!normalized) return
    setDispenseErr('')
    setSelectedSerial(normalized)

    const today = getCurrentDateIso()
    const snapshotVerification = verifySerial(normalized, {
      packages,
      batches,
      shipments,
      organizations,
      today
    })
    const pkg = snapshotVerification.p ?? null
    const batch = snapshotVerification.b ?? null
    const traceComplete = pkg ? hasCompleteTraceability(pkg, shipments, organizations) : false
    const dispenseCheck = validatePackageForDispense({
      pkg,
      batch,
      traceComplete,
      pharmacyId: orgId,
      pharmacyName: currentOrgName,
      today
    })

    const passed = Boolean(snapshotVerification.found && dispenseCheck.eligible)
    const failureReason = !snapshotVerification.found
      ? 'Serial number was not found in the PharmaTrace registry.'
      : dispenseCheck.reasons.join(' ')
    const timestamp = new Date().toISOString()

    await recordTraceabilityEvents([
      {
        eventType: TRACEABILITY_EVENT_TYPES.PHARMACY_PRE_DISPENSE_SCANNED,
        serial: normalized,
        packageId: normalized,
        batchId: pkg?.batchId ?? null,
        shipmentId: pkg?.shipmentRef ?? null,
        timestamp,
        checkpoint: 'pharmacy_pre_dispense',
        category: 'observation',
        outcome: snapshotVerification.found ? 'success' : 'failed',
        failureReason: snapshotVerification.found ? null : failureReason
      },
      {
        eventType: TRACEABILITY_EVENT_TYPES.PHARMACY_PRE_DISPENSE_VERIFIED,
        serial: normalized,
        packageId: normalized,
        batchId: pkg?.batchId ?? null,
        shipmentId: pkg?.shipmentRef ?? null,
        timestamp,
        checkpoint: 'pharmacy_pre_dispense',
        category: 'observation',
        outcome: passed ? 'success' : snapshotVerification.found ? 'blocked' : 'failed',
        failureReason: passed ? null : failureReason
      }
    ])
  }

  const verification = useMemo(() => {
    if (!selectedSerial) return null
    return verifySerial(selectedSerial, {
      packages,
      batches,
      shipments,
      organizations,
      today: getCurrentDateIso()
    })
  }, [selectedSerial, packages, batches, shipments, organizations])

  const evaluation = useMemo(() => {
    if (!verification) return null

    const today = getCurrentDateIso()
    const pkg = verification.p ?? null
    const batch = verification.b ?? null
    const product = batch ? productOf(batch.productId) : null
    const inPharmacyCustody = Boolean(pkg && pkg.custodian === orgId)
    const isExpired = verification.expiryStatus === 'expired'
    const isAlreadyDispensed = Boolean(pkg && pkg.status === 'dispensed')
    const isIncompleteTrace = verification.found && verification.supplyChainStatus === 'incomplete'
    const traceComplete = pkg ? hasCompleteTraceability(pkg, shipments, organizations) : false
    const dispenseCheck = validatePackageForDispense({
      pkg,
      batch,
      traceComplete,
      pharmacyId: orgId,
      pharmacyName: currentOrgName,
      today
    })

    const blockReasons = verification.found
      ? dispenseCheck.reasons.map(r =>
          r.includes('currently held in') && pkg
            ? `Package is not in ${currentOrgName} custody (current custodian: ${orgName(pkg.custodian)}).`
            : r
        )
      : ['Serial number was not found in the PharmaTrace registry.']

    return {
      pkg,
      batch,
      product,
      inPharmacyCustody,
      isExpired,
      isAlreadyDispensed,
      isIncompleteTrace,
      blockReasons,
      isEligible: verification.found && dispenseCheck.eligible
    }
  }, [verification, productOf, orgName, shipments, organizations, orgId, currentOrgName])

  async function handleConfirmDispense() {
    if (!verification || !evaluation?.isEligible || dispensing) return
    setDispensing(true)
    setDispenseErr('')
    try {
      const res = await dispensePackage(verification.serial, { pharmacyId: orgId })
      if (!res?.ok) {
        setDispenseErr(res?.error || 'Could not dispense package.')
        return
      }
      setToast(`Dispensed ${verification.serial} at ${currentOrgName}.`)
    } finally {
      setDispensing(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Verify & Dispense"
        description="Verify package authenticity, chain of custody, expiry date, and pharmacy custody before dispensing to a patient."
      />

      <div className="space-y-4">
        <QrScanner
          onScan={handleLookup}
          placeholder="Scan QR URL or enter package serial"
          label="Scan or enter package serial for verification"
        />

        {packages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Recent pharmacy packages:
            </span>
            {packages
              .filter(p => p.custodian === orgId)
              .slice(0, 4)
              .map(pkg => {
                const active = selectedSerial === pkg.serial
                return (
                  <button
                    key={pkg.serial}
                    type="button"
                    onClick={() => handleLookup(pkg.serial)}
                    className={`id-text rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      active
                        ? 'border-navy bg-navy text-white'
                        : 'border-line bg-white text-ink hover:bg-surface'
                    }`}
                  >
                    {pkg.serial} · {pkg.status}
                  </button>
                )
              })}
          </div>
        )}

        {verification && evaluation && (
          <section
            aria-live="polite"
            className="space-y-5 rounded-lg border border-line bg-white p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Checked serial
                </div>
                <div className="id-text mt-0.5 text-lg font-bold text-navy">
                  {verification.serial}
                </div>
                {evaluation.product && evaluation.batch && (
                  <div className="mt-1 text-sm text-muted">
                    {evaluation.product.name} {evaluation.product.strength} · Batch{' '}
                    <span className="id-text font-semibold text-ink">{evaluation.batch.no}</span> ·
                    Exp <span className="id-text font-semibold text-ink">{evaluation.batch.exp}</span>
                  </div>
                )}
              </div>
              <StatusBadge status={verification.state} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-md border border-line bg-surface p-3">
                <div className="text-xs font-semibold text-muted">Authenticity</div>
                <div className="mt-1.5">
                  <StatusBadge status={verification.authenticityStatus} />
                </div>
              </div>

              <div className="rounded-md border border-line bg-surface p-3">
                <div className="text-xs font-semibold text-muted">Supply-chain status</div>
                <div className="mt-1.5">
                  <StatusBadge status={verification.supplyChainStatus ?? 'invalid'} />
                </div>
              </div>

              <div className="rounded-md border border-line bg-surface p-3">
                <div className="text-xs font-semibold text-muted">Dispensing status</div>
                <div className="mt-1.5">
                  <StatusBadge status={verification.dispensingStatus ?? 'invalid'} />
                </div>
              </div>

              <div className="rounded-md border border-line bg-surface p-3">
                <div className="text-xs font-semibold text-muted">Expiry status</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusBadge
                    status={
                      verification.expiryStatus === 'valid'
                        ? 'active'
                        : verification.expiryStatus ?? 'invalid'
                    }
                  />
                  {evaluation.batch && (
                    <span className="id-text text-xs text-muted">{evaluation.batch.exp}</span>
                  )}
                </div>
              </div>

              <div className="rounded-md border border-line bg-surface p-3">
                <div className="text-xs font-semibold text-muted">Custody check ({currentOrgName})</div>
                <div className="mt-1.5">
                  {evaluation.inPharmacyCustody ? (
                    <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-clinical-soft px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      <CheckCircle2 size={12} aria-hidden="true" />
                      In {currentOrgName} custody
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded border border-quarantine-line bg-quarantine-soft px-2 py-0.5 text-xs font-semibold text-quarantine">
                      <ShieldAlert size={12} aria-hidden="true" />
                      {evaluation.pkg ? orgName(evaluation.pkg.custodian) : 'Not in custody'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {verification.unusualActivity && (
              <div className="flex items-start gap-2 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
                <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="font-semibold">
                    Repeated verification checks recorded ({verification.verifyCount} prior checks)
                  </div>
                  <div>
                    Inspect physical tamper-evident seals carefully. Repeated scans alone do not prove counterfeiting.
                  </div>
                </div>
              </div>
            )}

            {evaluation.blockReasons.length > 0 ? (
              <div
                role="alert"
                className={`rounded-md border p-4 text-sm ${
                  evaluation.isIncompleteTrace &&
                  !evaluation.isExpired &&
                  !evaluation.isAlreadyDispensed &&
                  evaluation.inPharmacyCustody
                    ? 'border-amber-line bg-amber-soft text-amber-ink'
                    : 'border-quarantine-line bg-quarantine-soft text-quarantine'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {evaluation.isIncompleteTrace &&
                  !evaluation.isExpired &&
                  !evaluation.isAlreadyDispensed &&
                  evaluation.inPharmacyCustody ? (
                    <AlertTriangle size={16} aria-hidden="true" />
                  ) : (
                    <ShieldAlert size={16} aria-hidden="true" />
                  )}
                  Dispensing blocked
                </div>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs">
                  {evaluation.blockReasons.map((reason, idx) => (
                    <li key={idx}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-clinical-soft p-3 text-xs text-emerald-900">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="font-semibold">Eligible for dispensing</div>
                  <div>
                    Package is verified, unexpired, in {currentOrgName} custody, and has an unbroken chain of custody.
                  </div>
                </div>
              </div>
            )}

            {dispenseErr && (
              <p role="alert" className="rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs font-semibold text-quarantine">
                {dispenseErr}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <div className="text-xs text-muted">
                {evaluation.pkg?.shipmentRef
                  ? `Shipment reference: ${evaluation.pkg.shipmentRef}`
                  : 'No shipment reference on file'}
              </div>
              <Button
                variant="success"
                disabled={!evaluation.isEligible || dispensing}
                onClick={handleConfirmDispense}
              >
                <PackageCheck size={16} aria-hidden="true" />
                {dispensing ? 'Dispensing...' : 'Confirm Dispense'}
              </Button>
            </div>

            {verification.found && evaluation.pkg && (
              <div className="border-t border-line pt-4">
                <h2 className="mb-3 text-sm font-bold text-navy">Package custody history</h2>
                <Timeline
                  items={(evaluation.pkg.history ?? []).map(([evt, orgId, date]) => ({
                    title: evt,
                    meta: `${orgName(orgId)} · ${date}`
                  }))}
                />
              </div>
            )}
          </section>
        )}
      </div>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
