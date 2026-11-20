// PharmaTrace AI — Public Verification Full Result Page
// Connected to live MariaDB verification engine (Milestone M7.2)

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ShieldCheck, ArrowLeft, AlertTriangle, Search, Info } from 'lucide-react'
import { StatusBadge, Timeline, Button } from '../../../components/ui'
import { verifyPackage } from '../../../services/verificationApi'
import { parseQrPayload } from '../../../services/qrPayload'
import { formatPublicHistoryTitle } from '../../../services/verification'

const COPY = {
  verified: 'This package matches a recorded, unbroken supply-chain journey.',
  invalid: 'This identifier could not be found in the registry. Check for typing errors or ask your pharmacist to inspect the pack.',
  expired: 'This package is past its expiry date. Do not use it.',
  quarantined: 'This package has been quarantined due to a quality or damage report. Do not use it; ask your pharmacist.',
  rejected: 'This package was rejected during regulatory review or receiving inspection. Do not use it.',
  dispensed: 'This package has already been recorded as dispensed.',
  unshipped: 'This serial is registered to the manufacturer, but the package has not been dispatched into the supply chain yet. It should not appear for retail sale.',
  in_transit: 'This package is currently in transit within the authorized supply chain.',
  incomplete: 'The complete journey of this package could not be established. This is not proof of a problem; ask your pharmacist.'
}

export default function Results() {
  const { serial } = useParams()
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const parsed = serial ? parseQrPayload(serial) : null
  const lookupSerial = parsed?.ok ? parsed.serial : serial

  useEffect(() => {
    if (!lookupSerial) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setErr('')
    verifyPackage(lookupSerial, { record: false })
      .then(res => {
        if (!cancelled) setResult(res)
      })
      .catch(e => {
        if (!cancelled) setErr(e.message || 'Unable to inspect package serial.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [lookupSerial])

  const normalizedSerial = (result?.serial || lookupSerial || '').trim().toUpperCase()

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-navy-deep py-3 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4">
          <Link to="/verify" className="flex items-center gap-2 font-bold text-white">
            <ShieldCheck className="text-emerald-400" aria-hidden="true" />
            PharmaTrace AI
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/report" className="text-sm font-medium text-slate-300 hover:text-white">
              Report a problem
            </Link>
            <Link to="/login" className="text-sm font-medium text-slate-300 hover:text-white">
              Portal sign-in →
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link
          to="/verify"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-navy"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back to verification
        </Link>

        <div className="mt-4">
          <h1 className="text-2xl font-bold text-navy">Verification result</h1>
          <p className="id-text mt-1 text-sm text-muted">Serial: {normalizedSerial || '—'}</p>
        </div>

        {loading && (
          <div className="mt-6 rounded-lg border border-line bg-white p-8 text-center text-sm text-muted">
            Checking MariaDB registry...
          </div>
        )}

        {err && (
          <div className="mt-6 rounded-lg border border-quarantine-line bg-quarantine-soft p-4 text-xs font-semibold text-quarantine">
            {err}
          </div>
        )}

        {!loading && result && (
          <section aria-live="polite" className="mt-6 rounded-lg border border-line bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={result.status || (result.valid ? 'verified' : 'invalid')} />
              <span className="id-text text-xs text-muted">
                {result.valid ? `${result.verifyCount ?? 0} verification check(s) recorded` : 'Not in registry'}
              </span>
            </div>

            <p className="mt-3 text-sm text-ink font-medium">
              {result.message || COPY[result.status] || COPY.verified}
            </p>

            {/* Mandatory Statutory Physical Authenticity Notice */}
            <div className="mt-4 rounded-md border border-line bg-slate-50 p-3.5 text-xs text-slate-700 leading-relaxed">
              <div className="flex items-center gap-1.5 font-bold text-navy mb-1">
                <Info size={14} className="text-clinical shrink-0" />
                Statutory Physical Verification Notice
              </div>
              <p>
                {result.disclaimer ||
                  'Digital verification confirms this package identifier is recorded in the DGDA-registered supply chain. A valid QR verification response does not constitute physical proof of chemical composition or physical pack authenticity. Always inspect tamper-evident seals, packaging integrity, and physical hologram before use.'}
              </p>
            </div>

            {result.verifyCount >= 5 && (
              <div className="mt-4 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <StatusBadge status="unusual" />
                  <span>{result.verifyCount} checks recorded</span>
                </div>
                Repeated verification was detected for this serial. Repeated scans can occur legitimately and are not proof of counterfeiting; ask your pharmacist if you have concerns.
              </div>
            )}

            {result.valid && (
              <>
                <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted">Supply-chain status</dt>
                    <dd className="mt-1">
                      <StatusBadge status={result.status === 'expired' ? 'expired' : result.status === 'quarantined' ? 'quarantined' : 'released'} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Current Custodian</dt>
                    <dd className="mt-1 font-semibold text-navy truncate">
                      {result.custody?.currentCustodianName || result.manufacturer?.name || 'Manufacturer'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Allocation</dt>
                    <dd className="mt-1 font-semibold text-navy">
                      {result.custody?.allocationType || 'COMMERCIAL'}
                    </dd>
                  </div>
                </dl>

                {result.batch && result.product && (
                  <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
                    <dt className="text-muted">Medicine</dt>
                    <dd className="font-semibold text-navy">
                      {result.product.name} {result.product.strength}
                      {result.product.genericName && (
                        <span className="block text-xs font-normal text-clinical">
                          {result.product.genericName}
                        </span>
                      )}
                    </dd>
                    <dt className="text-muted">Form & pack size</dt>
                    <dd>
                      {result.product.dosageForm || '—'} · {result.product.packSize || '—'}
                    </dd>
                    <dt className="text-muted">GTIN-14</dt>
                    <dd className="id-text font-semibold">{result.product.gtin || '—'}</dd>
                    <dt className="text-muted">Batch</dt>
                    <dd className="id-text font-semibold">{result.batch.batchNo}</dd>
                    <dt className="text-muted">Manufactured</dt>
                    <dd className="id-text">{result.batch.mfd}</dd>
                    <dt className="text-muted">Expiry</dt>
                    <dd className={`id-text font-semibold ${result.status === 'expired' ? 'text-quarantine' : ''}`}>
                      {result.batch.exp}
                    </dd>
                    <dt className="text-muted">Manufacturer</dt>
                    <dd className="text-navy">{result.manufacturer?.name || '—'}</dd>
                  </dl>
                )}

                {result.journey && result.journey.length > 0 && (
                  <div className="mt-5 border-t border-line pt-4">
                    <h2 className="mb-3 text-sm font-bold text-navy">Recorded journey</h2>
                    <Timeline
                      items={result.journey.map(j => ({
                        title: formatPublicHistoryTitle(j.eventType),
                        meta: `${j.actorOrg || ''}${j.targetOrg ? ` → ${j.targetOrg}` : ''} · ${String(j.timestamp || '').slice(0, 10)}`
                      }))}
                    />
                  </div>
                )}
              </>
            )}

            <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5">
              <Link to={normalizedSerial ? `/verify?serial=${encodeURIComponent(normalizedSerial)}` : '/verify'}>
                <Button variant="success">
                  <Search size={15} aria-hidden="true" />
                  Verify package
                </Button>
              </Link>
              <Link to={`/report?serial=${encodeURIComponent(normalizedSerial)}`}>
                <Button variant="secondary">
                  <AlertTriangle size={15} aria-hidden="true" />
                  Report a problem
                </Button>
              </Link>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
