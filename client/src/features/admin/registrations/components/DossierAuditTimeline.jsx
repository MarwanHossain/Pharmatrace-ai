// PharmaTrace AI — Dossier Regulatory Audit Timeline Component
// Renders chronological timeline of applicant submissions, review transitions, and administrative decisions

import { Clock, ShieldCheck, User, AlertCircle } from 'lucide-react'

function formatRole(role) {
  if (role === 'ADMIN') return 'System Administrator'
  if (role === 'APPLICANT') return 'Applicant'
  return role || 'System'
}

function formatActionType(action) {
  if (!action) return 'Action Recorded'
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, l => l.toUpperCase())
}

export default function DossierAuditTimeline({ auditLog = [] }) {
  if (!auditLog || auditLog.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface p-6 text-center text-xs text-muted">
        No audit log events recorded for this application.
      </div>
    )
  }

  return (
    <div className="relative pl-6 before:absolute before:bottom-0 before:left-2.5 before:top-2 before:w-0.5 before:bg-line">
      <div className="space-y-6">
        {auditLog.map((event, idx) => {
          const isAdmin = event.actorRole === 'ADMIN'
          return (
            <div key={event.id || idx} className="relative flex items-start gap-4">
              {/* Bullet icon */}
              <div
                className={`absolute -left-6 mt-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white ${
                  isAdmin ? 'bg-navy text-white' : 'bg-clinical text-white'
                }`}
              >
                {isAdmin ? <ShieldCheck size={11} /> : <User size={11} />}
              </div>

              <div className="flex-1 rounded-lg border border-line bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-navy">
                      {formatActionType(event.actionType)}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                        isAdmin
                          ? 'border border-navy/20 bg-slate-100 text-navy'
                          : 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      {formatRole(event.actorRole)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-muted">
                    <Clock size={12} />
                    <span>{event.createdAt ? new Date(event.createdAt).toLocaleString() : '—'}</span>
                  </div>
                </div>

                <div className="mt-2 text-xs text-ink">
                  {event.fromStatus || event.toStatus ? (
                    <div className="mb-1 text-[11px] text-muted">
                      Status transition:{' '}
                      <span className="font-semibold text-slate-700">{event.fromStatus || '[None]'}</span>
                      {' → '}
                      <span className="font-semibold text-navy">{event.toStatus}</span>
                    </div>
                  ) : null}
                  {event.comment && <p className="whitespace-pre-wrap text-slate-700">{event.comment}</p>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
