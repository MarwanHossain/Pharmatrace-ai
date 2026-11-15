// PharmaTrace AI — Public Organization Registration Landing
// Presents DGDA regulatory intake purpose, live category availability, and application entry point
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  Factory,
  Truck,
  Boxes,
  Building,
  ArrowRight,
  RefreshCw,
  Search,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  Lock
} from 'lucide-react'
import CategoryCapacityBadge from './components/CategoryCapacityBadge'
import RegistrationForm from './RegistrationForm'
import RegistrationSuccess from './RegistrationSuccess'
import { getCategoriesAvailability } from '../../services/registrationApi'

const CATEGORY_CARDS = [
  {
    category: 'manufacturer',
    title: 'Pharmaceutical Manufacturer',
    subtitle: 'Primary Drug Production & Packaging',
    Icon: Factory,
    description:
      'Licensed pharmaceutical manufacturers authorized to serialize batches, print 2D DataMatrix unit barcodes, and dispatch initial shipments.',
    licenseTypes: 'Drug Manufacturing License, GMP Certificate'
  },
  {
    category: 'distributor',
    title: 'Pharmaceutical Distributor',
    subtitle: 'National Supply Hub / Central Logistics',
    Icon: Truck,
    description:
      'Authorized primary distribution centers receiving verified manufacturer shipments, managing custody transfers, and dispatching to regional wholesalers.',
    licenseTypes: 'Central Distribution License, Wholesale Drug License'
  },
  {
    category: 'wholesaler',
    title: 'Pharmaceutical Wholesaler',
    subtitle: 'Regional Stockist & Depot Logistics',
    Icon: Boxes,
    description:
      'Regional wholesale entities supplying licensed pharmacies, hospitals, and medical dispensaries with tamper-evident batch verification.',
    licenseTypes: 'Regional Wholesale License, Trade License'
  },
  {
    category: 'pharmacy',
    title: 'Retail & Hospital Pharmacy',
    subtitle: 'Point of Care & Dispensing Facilities',
    Icon: Building,
    description:
      'Includes DGHS government healthcare complexes and licensed private retail pharmacies verifying packages at the final dispensing boundary.',
    licenseTypes: 'Retail Drug License or DGHS Facility Gazette',
    classificationsNote: 'Government Facilities & Private Pharmacies'
  }
]

export default function RegistrationLanding() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [successData, setSuccessData] = useState(null)

  async function fetchAvailability() {
    setLoading(true)
    setError(null)
    try {
      const data = await getCategoriesAvailability()
      setCategories(data.categories || [])
    } catch (err) {
      setError(err.message || 'Unable to retrieve regulatory category availability from the server.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAvailability()
  }, [])

  // If an application has just succeeded, show the success confirmation
  if (successData) {
    return (
      <RegistrationSuccess
        registrationData={successData}
        onReset={() => {
          setSuccessData(null)
          setSelectedCategory(null)
          fetchAvailability()
        }}
      />
    )
  }

  // If a category is actively selected, show the dynamic intake form
  if (selectedCategory) {
    const policy = categories.find(c => c.category === selectedCategory) || {}
    return (
      <RegistrationForm
        category={selectedCategory}
        policy={policy}
        onBack={() => setSelectedCategory(null)}
        onSuccess={(result) => setSuccessData(result.data)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Navigation Bar */}
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy text-white">
                <ShieldCheck className="h-5 w-5 text-clinical" />
              </div>
              <div>
                <span className="text-sm font-bold tracking-tight text-navy">PharmaTrace AI</span>
                <span className="ml-1.5 rounded bg-clinical-soft px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                  DGDA Regulatory Portal
                </span>
              </div>
            </Link>
          </div>

          <nav className="flex items-center gap-3 text-xs font-semibold">
            <Link
              to="/register/track"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-navy hover:bg-surface transition"
            >
              <Search className="h-3.5 w-3.5 text-clinical" />
              <span>Track Application</span>
            </Link>
            <Link
              to="/verify"
              className="hidden sm:inline-flex items-center gap-1.5 text-muted hover:text-navy transition"
            >
              Public Verification
            </Link>
            <Link
              to="/login"
              className="rounded-md bg-navy px-3 py-1.5 text-white hover:bg-navy-deep transition"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 py-10">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-navy shadow-sm">
            <span className="h-2 w-2 rounded-full bg-clinical animate-pulse" />
            <span>National Pharmaceutical Track & Trace Registry</span>
          </div>
          <h1 className="text-3xl font-extrabold text-navy tracking-tight sm:text-4xl">
            Organization Registration & Licensing
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            Authorized pharmaceutical entities operating within Bangladesh must register with the Directorate General of Drug Administration (DGDA) to participate in national supply chain serialization, custody verification, and dispensing compliance.
          </p>
        </div>

        {/* Live Availability Status Bar */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="h-2.5 w-2.5 rounded-full bg-clinical" />
            <span className="text-xs font-bold uppercase tracking-wider text-navy">
              Live Regulatory Capacity & Category Quotas
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={fetchAvailability}
              disabled={loading}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-navy disabled:opacity-50 transition"
              title="Refresh quota availability from server"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Refreshing...' : 'Refresh Quotas'}</span>
            </button>
            <Link
              to="/register/track"
              className="text-xs font-semibold text-clinical hover:underline"
            >
              Already applied? Check status &rarr;
            </Link>
          </div>
        </div>

        {/* API Error Message */}
        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-3 rounded-xl border border-quarantine-line bg-quarantine-soft p-4 text-xs text-quarantine"
          >
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold">Failed to load real-time category policies:</span>
              <p>{error}</p>
              <button
                type="button"
                onClick={fetchAvailability}
                className="mt-1 font-semibold underline hover:text-red-900"
              >
                Click here to retry
              </button>
            </div>
          </div>
        )}

        {/* Category Cards Grid */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
          {CATEGORY_CARDS.map((card) => {
            const policy = categories.find(c => c.category === card.category) || {}
            const isAvailable = policy.isAvailable !== false && policy.isRegistrationAllowed !== false
            const isClosed = policy.isRegistrationAllowed === false
            const isFull = policy.isRegistrationAllowed && !policy.isAvailable

            return (
              <div
                key={card.category}
                className={`flex flex-col justify-between rounded-xl border bg-white p-6 shadow-sm transition hover:shadow-md ${
                  isAvailable
                    ? 'border-line hover:border-navy/60'
                    : 'border-slate-200 bg-slate-50/50 opacity-90'
                }`}
              >
                <div>
                  {/* Top Bar: Icon and Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface text-navy border border-line">
                      <card.Icon className="h-6 w-6 text-navy" />
                    </div>
                    <CategoryCapacityBadge policy={policy} />
                  </div>

                  {/* Title & Description */}
                  <h2 className="mt-4 text-lg font-bold text-navy">{card.title}</h2>
                  <div className="text-xs font-semibold text-clinical mt-0.5">{card.subtitle}</div>
                  <p className="mt-2 text-xs text-muted leading-relaxed">{card.description}</p>

                  {/* Requirements List */}
                  <div className="mt-4 rounded-lg bg-surface p-3 text-xs space-y-1 border border-line/60">
                    <div className="font-semibold text-navy">Licensing Documentation:</div>
                    <div className="text-muted">{card.licenseTypes}</div>
                    {card.classificationsNote && (
                      <div className="text-[11px] font-medium text-emerald-800 pt-1">
                        • {card.classificationsNote}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom CTA */}
                <div className="mt-6 pt-4 border-t border-line">
                  {isAvailable ? (
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(card.category)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-navy-deep transition"
                    >
                      <span>Apply for {card.title}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <div className="rounded-lg bg-slate-100 p-2.5 text-center text-xs text-muted">
                      {isClosed ? (
                        <span className="font-medium text-slate-700">
                          Registrations administratively closed by DGDA policy.
                        </span>
                      ) : (
                        <span className="font-medium text-amber-ink">
                          Maximum active capacity reached. New applications paused.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Regulatory Notice & Information */}
        <div className="mt-12 rounded-xl border border-line bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold text-navy">
            <HelpCircle className="h-4 w-4 text-clinical" />
            <span>DGDA Regulatory Review Process</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted">
            <div className="space-y-1.5 rounded-lg bg-surface p-4 border border-line/50">
              <div className="font-bold text-navy">1. Intake & Legal Verification</div>
              <p>
                Applications require certified drug manufacturing, wholesale, or retail pharmacy licenses issued by the DGDA and Trade Registration.
              </p>
            </div>
            <div className="space-y-1.5 rounded-lg bg-surface p-4 border border-line/50">
              <div className="font-bold text-navy">2. Ephemeral PIN & Tracking</div>
              <p>
                Each submission receives an official reference number and one-time 6-digit tracking PIN. Store this PIN safely; it is required to track status or resubmit notes.
              </p>
            </div>
            <div className="space-y-1.5 rounded-lg bg-surface p-4 border border-line/50">
              <div className="font-bold text-navy">3. Atomic Organization Provisioning</div>
              <p>
                Upon DGDA officer approval, your organization entity is provisioned in the central registry and an account activation link is dispatched via secure email.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
