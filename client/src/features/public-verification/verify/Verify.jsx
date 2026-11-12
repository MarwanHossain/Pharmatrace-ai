import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Search } from 'lucide-react'
import { StatusBadge, Timeline } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'

const COPY = {
  verified: 'This package matches a recorded, unbroken supply-chain journey.',
  invalid: 'This identifier could not be found in the registry. Check for typing errors or ask your pharmacist to inspect the pack.',
  expired: 'This package is past its expiry date. Do not use it.',
  dispensed: 'This package has already been recorded as dispensed.',
  unshipped: 'This serial is registered to the manufacturer, but the package has not been dispatched into the supply chain yet. It should not appear for retail sale.',
  incomplete: 'The complete journey of this package could not be established. This is not proof of a problem; ask your pharmacist.'
}

export default function Verify() {
  const { verifyAndRecord, productOf } = useDemoData()
  const [v, setV] = useState('')
  const [r, setR] = useState(null)

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-navy-deep py-3 text-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2 font-bold">
            <ShieldCheck className="text-emerald-400" aria-hidden="true" />
            PharmaTrace AI
          </div>
          <Link to="/login" className="text-sm font-medium text-slate-300 hover:text-white">
            Demo sign-in →
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold text-navy">Verify your medicine</h1>
        <p className="mt-2 text-muted">Enter the serial number printed on the pack to check its recorded journey.</p>
        <form
          onSubmit={e => {
            e.preventDefault()
            v.trim() && setR(verifyAndRecord(v))
          }}
          className="mt-6 flex gap-2"
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
          <button className="flex items-center gap-2 rounded-md bg-clinical px-5 font-semibold text-white">
            <Search size={16} aria-hidden="true" />
            Verify
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">
          QR scanning is not implemented yet. Demo serials: DEMO-PCM-2601-00031 (verified), -00047 (dispensed), -00046 (repeated checks), -00048 (incomplete), -00023 (not yet shipped), DEMO-AMX-2603-00001 (expired).
        </p>
        {r && (
          <section aria-live="polite" className="mt-8 rounded-lg border border-line p-5">
            <StatusBadge status={r.state} />
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
            {r.found && r.b && (
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
                <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 text-sm">
                  <dt className="text-muted">Medicine</dt>
                  <dd className="font-semibold">
                    {productOf(r.b.productId).name} {productOf(r.b.productId).strength}
                  </dd>
                  <dt className="text-muted">Batch</dt>
                  <dd className="id-text font-semibold">{r.b.no}</dd>
                  <dt className="text-muted">Expiry</dt>
                  <dd className="id-text font-semibold">{r.b.exp}</dd>
                </dl>
                <h2 className="mb-2 mt-5 text-sm font-bold text-navy">Simplified journey</h2>
                <Timeline items={r.p.history.map(([t, , d]) => ({ title: t, meta: d }))} />
              </>
            )}
          </section>
        )}
      </main>
    </div>
  )
}
