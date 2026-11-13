import { useEffect, useMemo, useState } from 'react'
import { Plus, ShieldAlert } from 'lucide-react'
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Button,
  Drawer,
  Modal,
  Toast
} from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'

export default function Investigations() {
  const {
    investigations,
    alerts,
    users,
    createInvestigation,
    updateInvestigation
  } = useDemoData()

  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [createErr, setCreateErr] = useState('')
  const [drawerErr, setDrawerErr] = useState('')
  const [toast, setToast] = useState('')

  // Create modal state
  const [newTitle, setNewTitle] = useState('')
  const [newAlertId, setNewAlertId] = useState('')
  const [newFindings, setNewFindings] = useState('')

  // Drawer editing state
  const [findingsDraft, setFindingsDraft] = useState('')
  const [resolutionDraft, setResolutionDraft] = useState('')
  const [evidenceInput, setEvidenceInput] = useState('')

  const sel = investigations.find((inv) => inv.id === selectedId) ?? null
  const linkedAlert = sel?.alertId ? alerts.find((a) => a.id === sel.alertId) ?? null : null

  useEffect(() => {
    if (sel) {
      setFindingsDraft(sel.findings ?? '')
      setResolutionDraft(sel.resolution ?? '')
      setEvidenceInput('')
    }
  }, [sel?.id])

  const filtered = useMemo(
    () =>
      investigations.filter((inv) =>
        statusFilter === 'all' ? true : inv.status === statusFilter
      ),
    [investigations, statusFilter]
  )

  const userName = (id) => users.find((u) => u.id === id)?.name ?? id ?? 'Unassigned'

  async function handleCreateCase(e) {
    e.preventDefault()
    if (submitting) return
    const title = newTitle.trim()
    if (!title) return
    setSubmitting(true)
    setCreateErr('')
    try {
      const created = await createInvestigation({
        alertId: newAlertId || null,
        title,
        findings: newFindings.trim()
      })
      if (!created || created.ok === false) {
        setCreateErr(created?.error || 'Could not create investigation case.')
        return
      }
      setCreateOpen(false)
      setNewTitle('')
      setNewAlertId('')
      setNewFindings('')
      setSelectedId(created.id)
      setToast(`Investigation case ${created.id} created.`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddEvidence(e) {
    e.preventDefault()
    if (!sel || submitting) return
    const line = evidenceInput.trim()
    if (!line) return
    const nextEvidence = [...(sel.evidence ?? []), line]
    setSubmitting(true)
    setDrawerErr('')
    try {
      const res = await updateInvestigation(sel.id, { evidence: nextEvidence })
      if (!res || res.ok === false) {
        setDrawerErr(res?.error || 'Could not add evidence.')
        return
      }
      setEvidenceInput('')
      setToast(`Evidence added to ${sel.id}.`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveNotes() {
    if (!sel || submitting) return
    setSubmitting(true)
    setDrawerErr('')
    try {
      const res = await updateInvestigation(sel.id, {
        findings: findingsDraft,
        resolution: resolutionDraft.trim() || null
      })
      if (!res || res.ok === false) {
        setDrawerErr(res?.error || 'Could not save notes.')
        return
      }
      setToast(`Investigation ${sel.id} notes saved.`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleCaseStatus() {
    if (!sel || submitting) return
    const nextStatus = sel.status === 'open' ? 'closed' : 'open'
    setSubmitting(true)
    setDrawerErr('')
    try {
      const res = await updateInvestigation(sel.id, {
        findings: findingsDraft,
        evidence: sel.evidence ?? [],
        resolution: resolutionDraft.trim() || null,
        status: nextStatus
      })
      if (!res || res.ok === false) {
        setDrawerErr(res?.error || 'Could not update case status.')
        return
      }
      setToast(
        nextStatus === 'closed'
          ? `Case ${sel.id} closed.`
          : `Case ${sel.id} reopened.`
      )
    } finally {
      setSubmitting(false)
    }
  }

  const tabs = [
    { key: 'all', label: `All (${investigations.length})` },
    {
      key: 'open',
      label: `Open (${investigations.filter((i) => i.status === 'open').length})`
    },
    {
      key: 'closed',
      label: `Closed (${investigations.filter((i) => i.status === 'closed').length})`
    }
  ]

  return (
    <>
      <PageHeader
        title="Investigation Cases"
        description="Track findings, attach evidence, and document case resolutions. Linked alerts are an advisory lead — requires investigator review."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} aria-hidden="true" />
            New Case
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter cases by status">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={statusFilter === tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`rounded-md border px-3 py-1.5 text-sm font-semibold transition ${
              statusFilter === tab.key
                ? 'border-navy bg-navy text-white'
                : 'border-line bg-white text-ink hover:bg-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <DataTable
        rows={filtered}
        empty="No investigation cases match this filter."
        onRowClick={(row) => setSelectedId(row.id)}
        columns={[
          {
            key: 'id',
            label: 'ID',
            render: (r) => <span className="id-text font-semibold">{r.id}</span>
          },
          {
            key: 'title',
            label: 'Title',
            render: (r) => <span className="font-medium text-navy">{r.title}</span>
          },
          {
            key: 'alertId',
            label: 'Linked Alert',
            render: (r) => (
              <span className="id-text text-muted">{r.alertId ?? 'Manual'}</span>
            )
          },
          {
            key: 'status',
            label: 'Status',
            render: (r) => <StatusBadge status={r.status} />
          },
          {
            key: 'created',
            label: 'Created',
            render: (r) => <span className="id-text whitespace-nowrap">{r.created}</span>
          }
        ]}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Investigation Case"
        actions={
          <>
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="new-investigation-form"
              disabled={!newTitle.trim() || submitting}
            >
              {submitting ? 'Creating...' : 'Create Case'}
            </Button>
          </>
        }
      >
        <form id="new-investigation-form" onSubmit={handleCreateCase} className="space-y-4">
          <label className="block text-sm font-semibold">
            Case title
            <input
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Custody gap review for batch PCM-2601"
              className="mt-1 w-full rounded-md border border-line px-3 py-2 font-normal"
            />
          </label>

          <label className="block text-sm font-semibold">
            Linked alert (optional)
            <select
              value={newAlertId}
              onChange={(e) => setNewAlertId(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 font-normal"
            >
              <option value="">None (manual case)</option>
              {alerts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} · {a.serial || a.batchNo || 'Network'} — {a.description}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-semibold">
            Initial findings
            <textarea
              rows={3}
              value={newFindings}
              onChange={(e) => setNewFindings(e.target.value)}
              placeholder="Record initial observations or investigative scope..."
              className="mt-1 w-full rounded-md border border-line px-3 py-2 font-normal"
            />
          </label>
          {createErr && (
            <p role="alert" className="text-xs font-semibold text-quarantine">
              {createErr}
            </p>
          )}
        </form>
      </Modal>

      <Drawer
        open={!!sel}
        onClose={() => setSelectedId(null)}
        title={sel ? `Case ${sel.id}` : 'Case details'}
      >
        {sel && (
          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <StatusBadge status={sel.status} />
                <span className="id-text text-xs text-muted">Created {sel.created}</span>
              </div>
              <h3 className="text-base font-bold text-navy">{sel.title}</h3>
              <p className="mt-1 text-xs text-muted">Assignee: {userName(sel.assignee)}</p>
            </div>

            {linkedAlert && (
              <div className="rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
                <div className="mb-1 flex items-center justify-between gap-2 font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldAlert size={14} aria-hidden="true" />
                    Linked Alert {linkedAlert.id}
                  </span>
                  <StatusBadge status={linkedAlert.severity} />
                </div>
                <p>{linkedAlert.description}</p>
                <p className="mt-1 font-medium">
                  Advisory lead — requires investigator review.
                </p>
              </div>
            )}

            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Evidence ({sel.evidence?.length ?? 0})
              </h4>
              {sel.evidence?.length ? (
                <ul className="mb-3 list-disc space-y-1.5 pl-5 text-sm">
                  {sel.evidence.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="mb-3 text-sm text-muted">No evidence recorded yet.</p>
              )}
              <form onSubmit={handleAddEvidence} className="flex gap-2">
                <label className="sr-only" htmlFor="evidence-input">
                  Add evidence line
                </label>
                <input
                  id="evidence-input"
                  value={evidenceInput}
                  onChange={(e) => setEvidenceInput(e.target.value)}
                  placeholder="Add evidence observation or ref..."
                  className="min-w-0 flex-1 rounded-md border border-line px-3 py-1.5 text-sm"
                />
                <Button type="submit" variant="secondary" disabled={!evidenceInput.trim() || submitting}>
                  Add
                </Button>
              </form>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                Findings
                <textarea
                  rows={4}
                  value={findingsDraft}
                  onChange={(e) => setFindingsDraft(e.target.value)}
                  placeholder="Document verified custody findings..."
                  className="mt-1.5 w-full rounded-md border border-line p-2.5 text-sm font-normal text-ink"
                />
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
                Resolution notes
                <textarea
                  rows={3}
                  value={resolutionDraft}
                  onChange={(e) => setResolutionDraft(e.target.value)}
                  placeholder="Record outcome, containment steps, or closure rationale..."
                  className="mt-1.5 w-full rounded-md border border-line p-2.5 text-sm font-normal text-ink"
                />
              </label>
            </div>

            {drawerErr && (
              <p role="alert" className="rounded-md border border-quarantine-line bg-quarantine-soft p-2.5 text-xs font-semibold text-quarantine">
                {drawerErr}
              </p>
            )}

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="secondary" type="button" disabled={submitting} onClick={handleSaveNotes}>
                Save Notes
              </Button>
              <Button
                variant={sel.status === 'open' ? 'primary' : 'success'}
                type="button"
                disabled={submitting}
                onClick={handleToggleCaseStatus}
              >
                {sel.status === 'open' ? 'Close Case' : 'Reopen Case'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
