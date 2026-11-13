import { CheckSquare, Square, ShieldAlert } from 'lucide-react'
import { StatusBadge, EmptyState } from '../ui'

export default function OutgoingEligibilityList({
  eligibleItems = [],
  ineligibleItems = [],
  selectedSerials = [],
  onToggle,
  onSelectAllEligible,
  onClearSelected,
  emptyEligibleText = 'No eligible packages are available for dispatch.'
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-navy">
            Eligible packages ({selectedSerials.length} of {eligibleItems.length} selected)
          </span>
          {eligibleItems.length > 0 && (
            <div className="flex gap-3 text-xs font-semibold">
              <button
                type="button"
                onClick={onSelectAllEligible}
                className="inline-flex items-center gap-1 text-clinical hover:underline"
              >
                <CheckSquare size={13} aria-hidden="true" /> Select all eligible
              </button>
              {selectedSerials.length > 0 && (
                <button
                  type="button"
                  onClick={onClearSelected}
                  className="inline-flex items-center gap-1 text-muted hover:text-navy"
                >
                  <Square size={13} aria-hidden="true" /> Clear
                </button>
              )}
            </div>
          )}
        </div>

        {eligibleItems.length === 0 ? (
          <EmptyState title="No eligible packages" text={emptyEligibleText} />
        ) : (
          <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line bg-white">
            {eligibleItems.map(({ pkg, batch, product }) => {
              const checked = selectedSerials.includes(pkg.serial)
              return (
                <li key={pkg.serial}>
                  <label
                    className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs transition hover:bg-surface ${
                      checked ? 'bg-clinical-soft/50' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(pkg.serial)}
                        className="h-4 w-4 rounded border-line accent-clinical"
                      />
                      <span>
                        <span className="id-text block font-semibold text-navy">{pkg.serial}</span>
                        <span className="text-muted">
                          {product ? `${product.name} ${product.strength}` : '—'}
                          {batch ? ` · Batch ${batch.no} · Exp ${batch.exp}` : ''}
                        </span>
                      </span>
                    </span>
                    <StatusBadge status={pkg.status} />
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {ineligibleItems.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-quarantine">
            <ShieldAlert size={13} aria-hidden="true" />
            Blocked / Ineligible Custody Stock ({ineligibleItems.length})
          </div>
          <ul className="max-h-40 divide-y divide-line overflow-y-auto rounded-lg border border-quarantine-line bg-quarantine-soft/30">
            {ineligibleItems.map(({ pkg, batch, product, reasons }) => (
              <li
                key={pkg.serial}
                className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled
                      checked={false}
                      aria-label={`${pkg.serial} ineligible for dispatch`}
                      className="h-3.5 w-3.5 opacity-50"
                    />
                    <span className="id-text font-semibold text-navy">{pkg.serial}</span>
                    <span className="text-muted">
                      {product ? `${product.name} ${product.strength}` : ''}
                      {batch ? ` · ${batch.no}` : ''}
                    </span>
                  </div>
                  <div className="mt-0.5 pl-5 font-medium text-quarantine">
                    Blocked: {reasons.join(' ')}
                  </div>
                </div>
                <StatusBadge
                  status={batch && reasons.some(r => r.includes('expired')) ? 'expired' : pkg.status}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
