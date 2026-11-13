import { useState, useMemo, useEffect } from 'react'
import { Search, Plus } from 'lucide-react'
import { PageHeader, DataTable, StatusBadge, Button, Drawer, Modal, Toast } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'

const ORG_TYPES = ['Manufacturer', 'Distributor', 'Wholesaler', 'Pharmacy']

export default function Organizations() {
  const { organizations, users, addOrganization, updateOrganization } = useDemoData()

  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [toast, setToast] = useState('')

  // Add form state
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('Manufacturer')
  const [addError, setAddError] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState('Manufacturer')
  const [editError, setEditError] = useState('')

  const selected = useMemo(
    () => organizations.find(o => o.id === selectedId) ?? null,
    [organizations, selectedId]
  )

  useEffect(() => {
    if (selected) {
      setEditName(selected.name)
      setEditType(selected.type)
      setEditError('')
    }
  }, [selected])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return organizations.filter(o => {
      const matchesType = !typeFilter || o.type === typeFilter
      const matchesQuery =
        !q || o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
      return matchesType && matchesQuery
    })
  }, [organizations, query, typeFilter])

  const linkedUsers = useMemo(
    () => (selected ? users.filter(u => u.orgId === selected.id) : []),
    [users, selected]
  )

  async function handleAddSubmit(e) {
    e.preventDefault()
    if (saving) return
    const trimmed = newName.trim()
    if (!trimmed) {
      setAddError('Organization name is required.')
      return
    }
    setSaving(true)
    try {
      const created = await addOrganization({ name: trimmed, type: newType, status: 'active' })
      if (!created || created.ok === false) {
        setAddError(created?.error || 'Could not create organization.')
        return
      }
      setAddOpen(false)
      setNewName('')
      setNewType('Manufacturer')
      setAddError('')
      setToast(`Organization "${created?.name ?? trimmed}" added (demo state).`)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDetails(e) {
    e.preventDefault()
    if (!selected || saving) return
    const trimmed = editName.trim()
    if (!trimmed) {
      setEditError('Organization name cannot be empty.')
      return
    }
    setSaving(true)
    try {
      const res = await updateOrganization(selected.id, { name: trimmed, type: editType })
      if (!res || res.ok === false) {
        setEditError(res?.error || 'Could not update organization.')
        return
      }
      setEditError('')
      setToast(`Updated organization "${trimmed}".`)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus() {
    if (!selected || saving) return
    const currentStatus = selected.status ?? 'active'
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active'
    setSaving(true)
    try {
      const res = await updateOrganization(selected.id, { status: nextStatus })
      if (!res || res.ok === false) {
        setEditError(res?.error || 'Could not update organization status.')
        return
      }
      setEditError('')
      setToast(
        nextStatus === 'suspended'
          ? `Organization "${selected.name}" suspended.`
          : `Organization "${selected.name}" reactivated.`
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Manage supply-chain partner organizations, entity types, and platform participation status."
        actions={
          <Button
            onClick={() => {
              setAddError('')
              setAddOpen(true)
            }}
          >
            <Plus size={16} aria-hidden />
            Add Organization
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-2.5 top-3 text-muted" aria-hidden />
          <input
            aria-label="Search organizations"
            placeholder="Search by name or ID..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full rounded-md border border-line bg-white py-2 pl-8 pr-3 text-sm"
          />
        </div>
        <select
          aria-label="Filter by organization type"
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="rounded-md border border-line bg-white px-3 py-2 text-sm"
        >
          <option value="">All types</option>
          {ORG_TYPES.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        rows={rows}
        onRowClick={r => setSelectedId(r.id)}
        empty="No organizations match your search or filter."
        columns={[
          {
            key: 'id',
            label: 'ID',
            render: r => <span className="id-text whitespace-nowrap font-semibold">{r.id}</span>
          },
          {
            key: 'name',
            label: 'Organization Name',
            render: r => <span className="font-semibold text-ink">{r.name}</span>
          },
          { key: 'type', label: 'Type' },
          {
            key: 'status',
            label: 'Status',
            render: r => <StatusBadge status={r.status ?? 'active'} />
          },
          {
            key: 'usersCount',
            label: 'Users',
            render: r => (
              <span className="id-text font-semibold">
                {users.filter(u => u.orgId === r.id).length}
              </span>
            )
          }
        ]}
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? selected.name : 'Organization details'}
      >
        {selected && (
          <div className="space-y-6">
            <dl className="space-y-2 rounded-lg border border-line bg-surface p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Organization ID</dt>
                <dd className="id-text font-semibold">{selected.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Type</dt>
                <dd className="font-semibold">{selected.type}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Status</dt>
                <StatusBadge status={selected.status ?? 'active'} />
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Linked users</dt>
                <dd className="id-text font-semibold">{linkedUsers.length}</dd>
              </div>
            </dl>

            <form onSubmit={handleSaveDetails} className="space-y-3 border-t border-line pt-4">
              <h3 className="text-sm font-bold text-navy">Edit organization</h3>
              <label className="block text-sm font-semibold">
                Organization name
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="block text-sm font-semibold">
                Type
                <select
                  value={editType}
                  onChange={e => setEditType(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm font-normal"
                >
                  {ORG_TYPES.map(t => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              {editError && (
                <p role="alert" className="text-xs font-medium text-quarantine">
                  {editError}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" variant="primary" disabled={saving}>
                  Save changes
                </Button>
                <Button type="button" variant="secondary" disabled={saving} onClick={handleToggleStatus}>
                  {(selected.status ?? 'active') === 'active'
                    ? 'Suspend organization'
                    : 'Reactivate organization'}
                </Button>
              </div>
            </form>

            <div className="border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-bold text-navy">Linked users</h3>
              {linkedUsers.length === 0 ? (
                <p className="text-sm text-muted">No users are currently assigned to this organization.</p>
              ) : (
                <ul className="space-y-2">
                  {linkedUsers.map(u => (
                    <li
                      key={u.id}
                      className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-semibold text-ink">{u.name}</div>
                        <div className="text-xs text-muted">
                          {u.email} · <span className="capitalize">{u.role}</span>
                        </div>
                      </div>
                      <StatusBadge status={u.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Organization"
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="add-org-form" disabled={saving}>
              {saving ? 'Creating...' : 'Create organization'}
            </Button>
          </>
        }
      >
        <form id="add-org-form" onSubmit={handleAddSubmit} className="space-y-4">
          <label className="block text-sm font-semibold">
            Organization name
            <input
              type="text"
              placeholder="e.g. Northstar Pharmacy (demo)"
              value={newName}
              onChange={e => {
                setNewName(e.target.value)
                setAddError('')
              }}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              autoFocus
            />
          </label>
          <label className="block text-sm font-semibold">
            Organization type
            <select
              value={newType}
              onChange={e => setNewType(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm font-normal"
            >
              {ORG_TYPES.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {addError && (
            <p role="alert" className="text-sm text-quarantine">
              {addError}
            </p>
          )}
        </form>
      </Modal>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
