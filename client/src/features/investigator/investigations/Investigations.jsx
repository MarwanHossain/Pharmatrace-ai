// PharmaTrace AI — Regulatory Case Management & Evidence Dossier
// Milestone M8 Implementation — Connected to Live MariaDB Backend
import { useEffect, useState, useCallback } from 'react'
import { Plus, ShieldAlert, FileText, CheckCircle2, Lock, History, AlertTriangle, RefreshCw } from 'lucide-react'
import {
  PageHeader,
  DataTable,
  StatusBadge,
  Button,
  Drawer,
  Modal,
  Toast
} from '../../../components/ui'
import * as investigatorApi from '../../../services/investigatorApi'

const EVIDENCE_TYPE_LABELS = {
  verified_fact: 'Verified Fact',
  reported_allegation: 'Reported Allegation',
  investigator_conclusion: 'Investigator Conclusion',
  system_event: 'System Trace Event',
  custody_record: 'Physical Custody Record',
  document: 'Official Regulatory Document'
}

const EVIDENCE_BADGE_STYLES = {
  verified_fact: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  reported_allegation: 'bg-amber-50 text-amber-800 border-amber-200',
  investigator_conclusion: 'bg-blue-50 text-blue-800 border-blue-200',
  system_event: 'bg-slate-50 text-slate-800 border-slate-200',
  custody_record: 'bg-purple-50 text-purple-800 border-purple-200',
  document: 'bg-indigo-50 text-indigo-800 border-indigo-200'
}

export default function Investigations() {
  const [cases, setCases] = useState([])
  const [totalCases, setTotalCases] = useState(0)
  const [officers, setOfficers] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState('medium')
  const [newAlertId, setNewAlertId] = useState('')
  const [newPackageSerial, setNewPackageSerial] = useState('')
  const [newAssigneeId, setNewAssigneeId] = useState('')
  const [newFindings, setNewFindings] = useState('')
  const [createErr, setCreateErr] = useState('')

  // Drawer & detail state
  const [selectedCaseId, setSelectedCaseId] = useState(null)
  const [caseDetail, setCaseDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [findingsDraft, setFindingsDraft] = useState('')
  const [resolutionDraft, setResolutionDraft] = useState('')
  const [drawerErr, setDrawerErr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState('')

  // New evidence form state inside drawer
  const [evidenceType, setEvidenceType] = useState('verified_fact')
  const [evidenceDesc, setEvidenceDesc] = useState('')
  const [evidenceSourceRef, setEvidenceSourceRef] = useState('')
  const [sourceEntityType, setSourceEntityType] = useState('')
  const [sourceEntityId, setSourceEntityId] = useState('')

  const loadOfficers = useCallback(async () => {
    try {
      const res = await investigatorApi.getOfficers()
      setOfficers(res || [])
    } catch {
      // non-blocking
    }
  }, [])

  const loadCases = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await investigatorApi.getCases({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        limit: 100
      })
      setCases(res.cases || [])
      setTotalCases(res.total || 0)
    } catch (err) {
      setError(err.message || 'Failed to load investigation cases.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  const loadCaseDetail = useCallback(async (id) => {
    if (!id) {
      setCaseDetail(null)
      return
    }
    setLoadingDetail(true)
    setDrawerErr('')
    try {
      const res = await investigatorApi.getCase(id)
      setCaseDetail(res)
      setFindingsDraft(res.findings || '')
      setResolutionDraft(res.resolution || '')
    } catch (err) {
      setDrawerErr(err.message || 'Failed to load case dossier.')
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    loadOfficers()
    loadCases()
  }, [loadOfficers, loadCases])

  useEffect(() => {
    if (selectedCaseId) {
      loadCaseDetail(selectedCaseId)
    } else {
      setCaseDetail(null)
    }
  }, [selectedCaseId, loadCaseDetail])

  async function handleCreateCase(e) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    setSubmitting(true)
    setCreateErr('')
    try {
      const created = await investigatorApi.createCase({
        title,
        priority: newPriority,
        alertId: newAlertId.trim() || undefined,
        packageSerial: newPackageSerial.trim() || undefined,
        assignedOfficerId: newAssigneeId || undefined,
        findings: newFindings.trim() || undefined
      })
      setCreateOpen(false)
      setNewTitle('')
      setNewAlertId('')
      setNewPackageSerial('')
      setNewFindings('')
      setToast(`Investigation case ${created.case_number} created successfully.`)
      loadCases()
      setSelectedCaseId(created.id)
    } catch (err) {
      setCreateErr(err.message || 'Failed to create investigation case.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAddEvidence(e) {
    e.preventDefault()
    if (!caseDetail || submitting) return
    const desc = evidenceDesc.trim()
    if (!desc) return
    setSubmitting(true)
    setDrawerErr('')
    try {
      await investigatorApi.addCaseEvidence(caseDetail.id, {
        evidenceType,
        description: desc,
        sourceRef: evidenceSourceRef.trim() || undefined,
        sourceEntityType: sourceEntityType || undefined,
        sourceEntityId: sourceEntityId.trim() || undefined
      })
      setEvidenceDesc('')
      setEvidenceSourceRef('')
      setSourceEntityType('')
      setSourceEntityId('')
      setToast('Evidence record immutably attached to case dossier.')
      loadCaseDetail(caseDetail.id)
      loadCases()
    } catch (err) {
      setDrawerErr(err.message || 'Failed to attach evidence record.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveFindings() {
    if (!caseDetail || submitting) return
    setSubmitting(true)
    setDrawerErr('')
    try {
      await investigatorApi.updateCase(caseDetail.id, {
        findings: findingsDraft
      })
      setToast('Investigation findings updated.')
      loadCaseDetail(caseDetail.id)
    } catch (err) {
      setDrawerErr(err.message || 'Failed to update findings.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSaveResolution() {
    if (!caseDetail || submitting) return
    setSubmitting(true)
    setDrawerErr('')
    try {
      await investigatorApi.updateCase(caseDetail.id, {
        resolution: resolutionDraft
      })
      setToast('Case resolution notes updated.')
      loadCaseDetail(caseDetail.id)
    } catch (err) {
      setDrawerErr(err.message || 'Failed to update resolution.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleTransitionStatus(nextStatus) {
    if (!caseDetail || submitting) return
    setSubmitting(true)
    setDrawerErr('')
    try {
      await investigatorApi.updateCase(caseDetail.id, {
        status: nextStatus,
        resolution: resolutionDraft.trim() || undefined
      })
      setToast(`Case ${caseDetail.case_number} transitioned to ${nextStatus}.`)
      loadCaseDetail(caseDetail.id)
      loadCases()
    } catch (err) {
      setDrawerErr(err.message || 'Failed to update case status.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReassignOfficer(officerId) {
    if (!caseDetail || submitting) return
    setSubmitting(true)
    setDrawerErr('')
    try {
      await investigatorApi.updateCase(caseDetail.id, {
        assignedOfficerId: officerId || null
      })
      setToast('Case assignee updated.')
      loadCaseDetail(caseDetail.id)
      loadCases()
    } catch (err) {
      setDrawerErr(err.message || 'Failed to reassign officer.')
    } finally {
      setSubmitting(false)
    }
  }

  const tabs = [
    { key: 'all', label: `All Cases (${totalCases})` },
    { key: 'open', label: 'Open' },
    { key: 'under_review', label: 'Under Review' },
    { key: 'resolved', label: 'Resolved' },
    { key: 'closed', label: 'Closed' }
  ]

  return (
    <>
      <PageHeader
        title="Regulatory Investigation Cases &amp; Dossiers"
        description="Formal case management, evidence preservation, and immutable statutory audit trail under DGDA authority."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={loadCases} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
              Refresh
            </Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus size={16} aria-hidden="true" />
              New Case
            </Button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mb-5 rounded-lg border border-quarantine-line bg-quarantine-soft p-4 text-sm font-semibold text-quarantine">
          {error}
        </div>
      )}

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
        rows={cases}
        empty={loading ? 'Querying investigation cases...' : 'No investigation cases match the selected filter.'}
        onRowClick={(row) => setSelectedCaseId(row.id)}
        columns={[
          {
            key: 'case_number',
            label: 'Case Number',
            render: (r) => <span className="id-text font-bold text-navy">{r.case_number}</span>
          },
          {
            key: 'title',
            label: 'Case Title',
            render: (r) => <span className="font-semibold text-navy">{r.title}</span>
          },
          {
            key: 'priority',
            label: 'Priority',
            render: (r) => <StatusBadge status={r.priority} />
          },
          {
            key: 'target',
            label: 'Target Serial / Alert',
            render: (r) => (
              <span className="id-text whitespace-nowrap text-xs">
                {r.package_serial || r.alert_id || 'Broad lead'}
              </span>
            )
          },
          {
            key: 'assignee_name',
            label: 'Assigned Officer',
            render: (r) => r.assignee_name || <span className="text-muted italic">Unassigned</span>
          },
          {
            key: 'evidence_count',
            label: 'Evidence',
            render: (r) => <span className="id-text font-semibold">{r.evidence_count ?? 0}</span>
          },
          {
            key: 'status',
            label: 'Status',
            render: (r) => <StatusBadge status={r.status} />
          },
          {
            key: 'created_at',
            label: 'Opened Date',
            render: (r) => (
              <span className="id-text whitespace-nowrap text-xs">
                {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
              </span>
            )
          }
        ]}
      />

      {/* Create Case Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Open New Investigation Case"
      >
        <form onSubmit={handleCreateCase} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy">
              Case Title *
            </label>
            <input
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Counterfeit Napa Rapid in Dhanmondi Pharmacy"
              className="w-full rounded-md border border-line px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy">
                Priority Tier
              </label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value)}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="critical">Critical Priority</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy">
                Assign Lead Officer
              </label>
              <select
                value={newAssigneeId}
                onChange={(e) => setNewAssigneeId(e.target.value)}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
              >
                <option value="">Assign to Me (Self)</option>
                {officers.map((off) => (
                  <option key={off.id} value={off.id}>{off.name} ({off.email})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy">
                Target Serial (Optional)
              </label>
              <input
                value={newPackageSerial}
                onChange={(e) => setNewPackageSerial(e.target.value)}
                placeholder="SN-..."
                className="id-text w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy">
                Linked Alert ID (Optional)
              </label>
              <input
                value={newAlertId}
                onChange={(e) => setNewAlertId(e.target.value)}
                placeholder="alt-..."
                className="id-text w-full rounded-md border border-line px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-navy">
              Initial Investigation Findings
            </label>
            <textarea
              rows={3}
              value={newFindings}
              onChange={(e) => setNewFindings(e.target.value)}
              placeholder="Record initial verified facts, context, or witness statements..."
              className="w-full rounded-md border border-line p-2 text-sm"
            />
          </div>

          {createErr && (
            <p role="alert" className="rounded-md border border-quarantine-line bg-quarantine-soft p-2.5 text-xs font-semibold text-quarantine">
              {createErr}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-line">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Case Dossier'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Case Details Drawer */}
      <Drawer
        open={!!selectedCaseId}
        onClose={() => setSelectedCaseId(null)}
        title={caseDetail ? `${caseDetail.case_number} — Dossier` : 'Case Details'}
      >
        {loadingDetail ? (
          <p className="p-4 text-sm text-muted">Loading case details...</p>
        ) : caseDetail ? (
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <StatusBadge status={caseDetail.status} />
                <StatusBadge status={caseDetail.priority} />
                <span className="id-text text-xs text-muted">
                  Opened {new Date(caseDetail.created_at).toLocaleString()}
                </span>
              </div>
              <h3 className="text-base font-bold text-navy">{caseDetail.title}</h3>
            </div>

            {/* Officer Assignment */}
            <div className="rounded-md border border-line bg-surface p-3 text-sm">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">
                Assigned Lead Investigator
              </label>
              <select
                value={caseDetail.assigned_officer_id || ''}
                onChange={(e) => handleReassignOfficer(e.target.value)}
                disabled={submitting}
                className="w-full rounded border border-line bg-white px-2 py-1.5 text-sm"
              >
                <option value="">Unassigned</option>
                {officers.map((off) => (
                  <option key={off.id} value={off.id}>{off.name} ({off.email})</option>
                ))}
              </select>
            </div>

            {/* Linked Alert */}
            {caseDetail.alert_id && (
              <div className="rounded-md border border-amber-line bg-amber-soft p-3 text-xs text-amber-ink">
                <div className="font-semibold">Linked Alert: {caseDetail.alert_id}</div>
                <p className="mt-0.5">{caseDetail.alert_summary}</p>
              </div>
            )}

            {/* Findings Section */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-navy">
                  Investigation Findings &amp; Analysis
                </h4>
                <Button variant="secondary" size="sm" onClick={handleSaveFindings} disabled={submitting}>
                  Save Findings
                </Button>
              </div>
              <textarea
                rows={3}
                value={findingsDraft}
                onChange={(e) => setFindingsDraft(e.target.value)}
                placeholder="Document active findings, chemical analysis results, or interview statements..."
                className="w-full rounded-md border border-line p-2 text-sm"
              />
            </div>

            {/* Evidence Section */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy flex items-center gap-1.5">
                <FileText size={14} /> Preserved Evidence Records ({caseDetail.evidence?.length ?? 0})
              </h4>
              <p className="mb-3 text-xs text-muted">
                Immutable evidentiary exhibits recorded by regulatory inspectors. Once attached, records cannot be altered or purged.
              </p>

              {caseDetail.evidence?.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {caseDetail.evidence.map((ev) => (
                    <div key={ev.id} className="rounded-md border border-line bg-white p-3 text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold border ${EVIDENCE_BADGE_STYLES[ev.evidence_type] || 'bg-slate-100'}`}>
                          {EVIDENCE_TYPE_LABELS[ev.evidence_type] || ev.evidence_type}
                        </span>
                        <span className="id-text text-xs text-muted">
                          {new Date(ev.recorded_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-ink">{ev.description}</p>
                      <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-muted pt-1">
                        <span>Recorded by: <strong>{ev.recorded_by_name}</strong></span>
                        <div className="flex items-center gap-2">
                          {ev.source_entity_type && ev.source_entity_id && (
                            <span className="id-text font-mono text-clinical bg-surface px-1.5 py-0.5 rounded border border-line">
                              Linked: {ev.source_entity_type} ({ev.source_entity_id})
                            </span>
                          )}
                          {ev.source_ref && (
                            <span className="id-text">
                              Ref: {ev.source_ref}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed border-line p-3 text-center text-xs text-muted mb-4">
                  No evidence exhibits attached to this case dossier yet.
                </p>
              )}

              {/* Add Evidence Form */}
              <form onSubmit={handleAddEvidence} className="rounded-md border border-line bg-surface p-3 space-y-3">
                <h5 className="text-xs font-bold text-navy uppercase tracking-wide">Attach Immutable Evidence</h5>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-muted">Evidence Category *</label>
                    <select
                      value={evidenceType}
                      onChange={(e) => setEvidenceType(e.target.value)}
                      className="w-full rounded border border-line bg-white px-2 py-1 text-xs"
                    >
                      <option value="verified_fact">Verified Fact</option>
                      <option value="reported_allegation">Reported Allegation</option>
                      <option value="investigator_conclusion">Investigator Conclusion</option>
                      <option value="system_event">System Trace Event</option>
                      <option value="custody_record">Physical Custody Record</option>
                      <option value="document">Official Document</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Source Ref (Descriptive)</label>
                    <input
                      value={evidenceSourceRef}
                      onChange={(e) => setEvidenceSourceRef(e.target.value)}
                      placeholder="e.g. Depot Physical Inspection Log"
                      className="id-text w-full rounded border border-line px-2 py-1 text-xs"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-muted">Linked Entity Type (Optional)</label>
                    <select
                      value={sourceEntityType}
                      onChange={(e) => setSourceEntityType(e.target.value)}
                      className="w-full rounded border border-line bg-white px-2 py-1 text-xs"
                    >
                      <option value="">None / External Document</option>
                      <option value="package">Package (Serial)</option>
                      <option value="shipment">Shipment (Ref)</option>
                      <option value="traceability_event">Traceability Event (ID)</option>
                      <option value="investigation_alert">Investigation Alert (ID)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Linked Entity ID</label>
                    <input
                      value={sourceEntityId}
                      onChange={(e) => setSourceEntityId(e.target.value)}
                      placeholder={sourceEntityType ? `e.g. ${sourceEntityType === 'package' ? 'SN-...' : sourceEntityType === 'shipment' ? 'SHP-...' : 'ID'}` : 'Requires Entity Type'}
                      disabled={!sourceEntityType}
                      className="id-text w-full rounded border border-line px-2 py-1 text-xs disabled:bg-slate-50"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">Evidence Description *</label>
                  <textarea
                    required
                    rows={2}
                    value={evidenceDesc}
                    onChange={(e) => setEvidenceDesc(e.target.value)}
                    placeholder="Enter verifiable statement, laboratory assay, or manifest exhibit details..."
                    className="w-full rounded border border-line p-2 text-xs"
                  />
                </div>
                <Button type="submit" variant="primary" size="sm" disabled={submitting}>
                  {submitting ? 'Attaching...' : 'Attach Evidence Record'}
                </Button>
              </form>
            </div>

            {/* Resolution Section */}
            <div>
              <div className="mb-1 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-navy">
                  Resolution &amp; Regulatory Disposition
                </h4>
                <Button variant="secondary" size="sm" onClick={handleSaveResolution} disabled={submitting}>
                  Save Resolution
                </Button>
              </div>
              <textarea
                rows={2}
                value={resolutionDraft}
                onChange={(e) => setResolutionDraft(e.target.value)}
                placeholder="Document enforcement action, seizure order, product recall, or case closure rationale..."
                className="w-full rounded-md border border-line p-2 text-sm"
              />
            </div>

            {/* Status Transition Actions */}
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {caseDetail.status === 'open' && (
                <Button variant="secondary" onClick={() => handleTransitionStatus('under_review')} disabled={submitting}>
                  Mark Under Review
                </Button>
              )}
              {caseDetail.status !== 'resolved' && caseDetail.status !== 'closed' && (
                <Button variant="primary" onClick={() => handleTransitionStatus('resolved')} disabled={submitting}>
                  Resolve Case
                </Button>
              )}
              {caseDetail.status !== 'closed' && (
                <Button variant="danger" onClick={() => handleTransitionStatus('closed')} disabled={submitting}>
                  Close Case
                </Button>
              )}
              {(caseDetail.status === 'resolved' || caseDetail.status === 'closed') && (
                <Button variant="secondary" onClick={() => handleTransitionStatus('open')} disabled={submitting}>
                  Reopen Case
                </Button>
              )}
            </div>

            {drawerErr && (
              <p role="alert" className="rounded-md border border-quarantine-line bg-quarantine-soft p-2.5 text-xs font-semibold text-quarantine">
                {drawerErr}
              </p>
            )}

            {/* Immutable Audit Log */}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy flex items-center gap-1.5">
                <History size={14} /> Immutable Case Audit Trail ({caseDetail.auditLog?.length ?? 0})
              </h4>
              <div className="space-y-2 border-l-2 border-slate-200 pl-3">
                {caseDetail.auditLog?.map((log) => (
                  <div key={log.id} className="text-xs">
                    <div className="flex items-center justify-between text-muted">
                      <span className="font-bold text-navy">{log.action}</span>
                      <span className="id-text">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-ink">
                      <span>By <strong>{log.actor_name}</strong></span>
                      {log.notes && <span className="ml-2 italic">— {log.notes}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
