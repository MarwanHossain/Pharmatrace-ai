// PharmaTrace AI — Category Capacity Badge
// Renders dynamic organization capacity state (Open, Full, Closed)
import { CheckCircle2, AlertTriangle, Ban } from 'lucide-react'
import { getCategoryBadgeInfo } from '../../../services/registrationApi.js'

export { getCategoryBadgeInfo }

export default function CategoryCapacityBadge({ policy, className = '', showHint = false }) {
  const info = getCategoryBadgeInfo(policy)
  const { state, label, hint, tone } = info

  const Icon = state === 'available' ? CheckCircle2 : state === 'full' ? AlertTriangle : Ban

  return (
    <div className={`inline-flex flex-col ${className}`}>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone}`}
        role="status"
        aria-label={label}
      >
        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
        <span>{label}</span>
      </span>
      {showHint && (
        <span className="mt-1 text-xs text-muted">{hint}</span>
      )}
    </div>
  )
}
