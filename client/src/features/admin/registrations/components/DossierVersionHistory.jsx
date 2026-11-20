// PharmaTrace AI — Dossier Version History Component
// Displays read-only chronological snapshots of applicant submissions and cure notes

import { Layers, Calendar, MessageSquare, Building2, User, MapPin, Hash } from 'lucide-react'

export default function DossierVersionHistory({ submissions = [] }) {
  if (!submissions || submissions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface p-6 text-center text-xs text-muted">
        No submission versions recorded.
      </div>
    )
  }

  // Sort versions descending (newest version first)
  const sortedSubmissions = [...submissions].sort((a, b) => b.version - a.version)

  return (
    <div className="space-y-4">
      {sortedSubmissions.map(sub => {
        const data = sub.submittedData || {}
        return (
          <div key={sub.version} className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
                  v{sub.version}
                </span>
                <span className="text-sm font-bold text-navy">
                  Submission Version {sub.version}
                </span>
                {sub.version === 1 && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    Initial Application
                  </span>
                )}
                {sub.version > 1 && (
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                    Applicant Resubmission
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Calendar size={13} />
                <span>{sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : '—'}</span>
              </div>
            </div>

            {sub.applicantNote && (
              <div className="mb-4 rounded border border-blue-200 bg-blue-50/50 p-3 text-xs text-navy">
                <div className="mb-1 flex items-center gap-1.5 font-bold text-blue-900">
                  <MessageSquare size={13} />
                  Applicant Resubmission Note:
                </div>
                <p className="whitespace-pre-wrap text-slate-700">{sub.applicantNote}</p>
              </div>
            )}

            {/* Read-only Data Snapshot */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-muted">
                  <Building2 size={13} />
                  <span className="font-semibold text-slate-700">Organization Name:</span>
                  <span className="text-ink">{data.orgName || data.name || '—'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted">
                  <Hash size={13} />
                  <span className="font-semibold text-slate-700">License Number:</span>
                  <span className="font-mono text-ink">{data.licenseNumber || '—'}</span>
                </div>
                <div className="flex items-start gap-1.5 text-muted">
                  <MapPin size={13} className="mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-slate-700">Address:</span>
                    <span className="ml-1 text-ink">{data.address || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-muted">
                  <User size={13} />
                  <span className="font-semibold text-slate-700">Contact:</span>
                  <span className="text-ink">{data.contactName || '—'}</span>
                </div>
                <div className="text-muted">
                  <span className="font-semibold text-slate-700">Email:</span>{' '}
                  <span className="text-ink">{data.contactEmail || '—'}</span>
                </div>
                <div className="text-muted">
                  <span className="font-semibold text-slate-700">Phone:</span>{' '}
                  <span className="text-ink">{data.contactPhone || '—'}</span>
                </div>
                {data.dghsFacilityCode && (
                  <div className="text-muted">
                    <span className="font-semibold text-slate-700">DGHS Facility Code:</span>{' '}
                    <span className="font-mono font-semibold text-navy">{data.dghsFacilityCode}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
