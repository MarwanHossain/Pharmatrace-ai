import { Link, useParams } from 'react-router-dom'
import { ShieldCheck, ArrowLeft, AlertTriangle, Search } from 'lucide-react'
import { StatusBadge, Timeline, Button } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { parseQrPayload } from '../../../services/qrPayload'
import { formatPublicHistoryTitle } from '../../../services/verification'

const COPY = {
  verified: 'This package matches a recorded, unbroken supply-chain journey.',
  invalid: 'This identifier could not be found in the registry. Check for typing errors or ask your pharmacist to inspect the pack.',
  expired: 'This package is past its expiry date. Do not use it.',
  quarantined: 'This package has been quarantined due to a quality or damage report. Do not use it; ask your pharmacist.',
  dispensed: 'This package has already been recorded as dispensed.',
  unshipped: 'This serial is registered to the manufacturer, but the package has not been dispatched into the supply chain yet. It should not appear for retail sale.',
  incomplete: 'The complete journey of this package could not be established. This is not proof of a problem; ask your pharmacist.'
}

export default function Results() {
  const { serial } = useParams()
  const { inspectSerial, productOf } = useDemoData()
  const parsed = serial ? parseQrPayload(serial) : null
  const lookupSerial = parsed?.ok ? parsed.serial : serial
  // Read-only lookup: explicit submission on /verify is the single authoritative verification event point.
  const result = lookupSerial ? inspectSerial(lookupSerial) : null

  const normalizedSerial = (result?.serial || lookupSerial || '').trim().toUpperCase()
  const product = result?.b ? productOf(result.b.productId) : null

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
              Demo sign-in →
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

        {result && (
          <section aria-live="polite" className="mt-6 rounded-lg border border-line bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={result.state} />
              <span className="id-text text-xs text-muted">
                {result.found ? `${result.verifyCount} verification check(s) recorded` : 'Not in registry'}
              </span>
            </div>

            <p className="mt-3 text-sm text-ink">{COPY[result.state]}</p>

            {result.unusualActivity && (
              <div className="mt-4 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <StatusBadge status="unusual" />
                  <span>{result.verifyCount} checks recorded</span>
                </div>
                Repeated verification was detected for this serial. Repeated scans can occur legitimately and are not proof of counterfeiting; ask your pharmacist if you have concerns.
              </div>
            )}

            {result.found && (
              <>
                <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-line pt-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted">Authenticity</dt>
                    <dd className="mt-1">
                      <StatusBadge status={result.authenticityStatus} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Supply-chain status</dt>
                    <dd className="mt-1">
                      <StatusBadge status={result.supplyChainStatus} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Dispensing status</dt>
                    <dd className="mt-1">
                      <StatusBadge status={result.dispensingStatus} />
                    </dd>
                  </div>
                </dl>

                {result.b && (
                  <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
                    <dt className="text-muted">Medicine</dt>
                    <dd className="font-semibold text-navy">
                      {product ? `${product.name} ${product.strength}` : '—'}
                    </dd>
                    {product && (
                      <>
                        <dt className="text-muted">Form & pack size</dt>
                        <dd>
                          {product.form} · {product.packSize}
                        </dd>
                      </>
                    )}
                    <dt className="text-muted">Batch</dt>
                    <dd className="id-text font-semibold">{result.b.no}</dd>
                    <dt className="text-muted">Manufactured</dt>
                    <dd className="id-text">{result.b.mfd}</dd>
                    <dt className="text-muted">Expiry</dt>
                    <dd className="id-text font-semibold">{result.b.exp}</dd>
                  </dl>
                )}

                {result.p?.history?.length > 0 && (
                  <div className="mt-5 border-t border-line pt-4">
                    <h2 className="mb-3 text-sm font-bold text-navy">Simplified journey</h2>
                    <Timeline
                      items={result.p.history.map(([t, , d]) => ({
                        title: formatPublicHistoryTitle(t),
                        meta: d
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
