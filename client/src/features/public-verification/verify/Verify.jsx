import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ShieldCheck, Search, QrCode, AlertTriangle, ArrowRight } from 'lucide-react'
import { StatusBadge, Timeline } from '../../../components/ui'
import QrScanner from '../../../components/scanner/QrScanner'
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

export default function Verify() {
  const [searchParams] = useSearchParams()
  const querySerialParam = searchParams.get('serial')

  const {
    verifyAndRecord,
    inspectSerial,
    productOf,
    locksSupported,
    locksUnavailableError
  } = useDemoData()
  const [v, setV] = useState('')
  const [r, setR] = useState(null)
  const [verifying, setVerifying] = useState(false)
  const [err, setErr] = useState('')
  const [readOnlyMode, setReadOnlyMode] = useState(false)
  const [urlPreviewNotice, setUrlPreviewNotice] = useState(false)
  const [showScanner, setShowScanner] = useState(false)

  useEffect(() => {
    if (querySerialParam === null) return
    const parsed = parseQrPayload(querySerialParam)
    if (!parsed.ok) {
      setV(String(querySerialParam))
      setR(null)
      setUrlPreviewNotice(false)
      setReadOnlyMode(false)
      setErr(parsed.reason || 'Malformed or unsupported verification serial in URL.')
      return
    }
    // Strictly read-only preview on URL open / F5 reload so refresh never inflates verifyCount
    setV(parsed.serial)
    setErr('')
    setReadOnlyMode(false)
    setUrlPreviewNotice(true)
    setR(inspectSerial(parsed.serial))
  }, [querySerialParam, inspectSerial])

  async function runVerify(rawInput) {
    if (verifying) return
    const raw = String(rawInput ?? '').trim()
    if (!raw) return

    const parsed = parseQrPayload(raw)
    if (!parsed.ok) {
      setErr(parsed.reason || 'Scan or enter a valid package serial or PharmaTrace verification URL.')
      setUrlPreviewNotice(false)
      return
    }

    const serial = parsed.serial
    setV(serial)
    setVerifying(true)
    setErr('')
    setReadOnlyMode(false)
    setUrlPreviewNotice(false)
    try {
      const res = await verifyAndRecord(serial)
      if (!res || res.ok === false) {
        setErr(res?.error || 'Unable to verify package serial.')
        if (res?.code === 'locks_unavailable') {
          setReadOnlyMode(true)
          setR(inspectSerial(serial))
        }
        return
      }
      setR(res)
    } finally {
      setVerifying(false)
    }
  }

  const targetSerial = encodeURIComponent(r?.serial || v.trim().toUpperCase())

  return (
    <div className="min-h-screen bg-white">
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

      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold text-navy">Verify your medicine</h1>
        <p className="mt-2 text-muted">
          Enter the serial number printed on the pack or use the QR scanner to check its recorded journey.
        </p>

        <form
          onSubmit={e => {
            e.preventDefault()
            runVerify(v)
          }}
          className="mt-6 flex flex-wrap gap-2"
        >
          <label className="sr-only" htmlFor="s">
            Serial number
          </label>
          <input
            id="s"
            value={v}
            onChange={e => setV(e.target.value)}
            placeholder="e.g. DEMO-PCM-2601-00031"
            className="id-text min-w-0 flex-1 rounded-md border border-line px-4 py-3"
          />
          <button
            type="submit"
            disabled={verifying}
            className="flex items-center gap-2 rounded-md bg-clinical px-5 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <Search size={16} aria-hidden="true" />
            {verifying ? 'Checking...' : 'Verify'}
          </button>
          <button
            type="button"
            onClick={() => setShowScanner(s => !s)}
            aria-expanded={showScanner}
            className="flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-3 text-sm font-semibold text-navy hover:bg-slate-100"
          >
            <QrCode size={16} aria-hidden="true" />
            {showScanner ? 'Hide scanner' : 'Scan QR'}
          </button>
        </form>

        {showScanner && (
          <div className="mt-4">
            <QrScanner
              onScan={serial => {
                runVerify(serial)
                setShowScanner(false)
              }}
              placeholder="Scan or enter serial (e.g. DEMO-PCM-2601-00031)"
            />
          </div>
        )}

        <p className="mt-3 text-xs text-muted">
          Enter a serialized package identifier or scan a package QR verification link to view its recorded journey.
        </p>

        {(!locksSupported || err) && (
          <div
            role="alert"
            className="mt-4 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs font-medium text-quarantine"
          >
            {err || locksUnavailableError}
            {readOnlyMode && ' Showing read-only lookup result; verification check was not recorded.'}
          </div>
        )}

        {urlPreviewNotice && r && !err && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-3 text-xs text-ink">
            <span>
              Loaded current traceability status from QR link without altering verification count.
            </span>
            <button
              type="button"
              disabled={verifying}
              onClick={() => runVerify(r.serial || v)}
              className="rounded-md bg-clinical px-3 py-1.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {verifying ? 'Recording...' : 'Record Verification Check'}
            </button>
          </div>
        )}

        {r && (
          <section aria-live="polite" className="mt-8 rounded-lg border border-line p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={r.state} />
                {r.found && (
                  <span className="id-text text-xs text-muted">
                    {r.verifyCount} verification check(s) recorded
                  </span>
                )}
              </div>
              {r.serial && <span className="id-text text-xs font-semibold text-muted">{r.serial}</span>}
            </div>
            <p className="mt-3 text-sm">{COPY[r.state]}</p>

            {r.unusualActivity && (
              <div className="mt-4 rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <StatusBadge status="unusual" />
                  <span>{r.verifyCount} checks recorded</span>
                </div>
                Repeated verification was detected for this serial. Repeated scans can occur legitimately and are not proof of counterfeiting; ask your pharmacist if you have concerns.
              </div>
            )}

            {r.found && (
              <>
                <dl className="mt-4 grid grid-cols-1 gap-2 border-t border-line pt-4 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted">Authenticity</dt>
                    <dd className="mt-1">
                      <StatusBadge status={r.authenticityStatus} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Supply-chain status</dt>
                    <dd className="mt-1">
                      <StatusBadge status={r.supplyChainStatus} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Dispensing status</dt>
                    <dd className="mt-1">
                      <StatusBadge status={r.dispensingStatus} />
                    </dd>
                  </div>
                </dl>

                {r.b && (
                  <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 text-sm">
                    <dt className="text-muted">Medicine</dt>
                    <dd className="font-semibold">
                      {productOf(r.b.productId)?.name} {productOf(r.b.productId)?.strength}
                    </dd>
                    <dt className="text-muted">Batch</dt>
                    <dd className="id-text font-semibold">{r.b.no}</dd>
                    <dt className="text-muted">Expiry</dt>
                    <dd className="id-text font-semibold">{r.b.exp}</dd>
                  </dl>
                )}

                {r.p?.history?.length > 0 && (
                  <>
                    <h2 className="mb-2 mt-5 text-sm font-bold text-navy">Simplified journey</h2>
                    <Timeline
                      items={r.p.history.map(([t, , d]) => ({
                        title: formatPublicHistoryTitle(t),
                        meta: d
                      }))}
                    />
                  </>
                )}
              </>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
              <Link
                to={`/verify/results/${targetSerial}`}
                className="inline-flex items-center gap-1.5 font-semibold text-clinical hover:underline"
              >
                View full result page <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <Link
                to={`/report?serial=${targetSerial}`}
                className="inline-flex items-center gap-1.5 font-medium text-amber-ink hover:underline"
              >
                <AlertTriangle size={14} aria-hidden="true" />
                Report a problem with this package
              </Link>
            </div>
          </section>
        )}

        <footer className="mt-10 border-t border-line pt-4 text-xs text-muted">
          Notice something suspicious or damaged?{' '}
          <Link to="/report" className="font-semibold text-navy hover:underline">
            Report a problem
          </Link>
          .
        </footer>
      </main>
    </div>
  )
}
