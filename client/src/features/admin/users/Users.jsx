import { useState, useMemo, useEffect } from 'react'
import { Search, Plus } from 'lucide-react'
import { PageHeader, DataTable, StatusBadge, Button, Drawer, Modal, Toast } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'
import { ROLE_TO_ORG_TYPE, PLATFORM_ROLES } from '../../../services/demoStorage'

const USER_ROLES = [
  { value: 'admin', label: 'System Administrator' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'investigator', label: 'Investigation Officer' }
]

function orgsForRole(organizations, role) {
  const requiredType = ROLE_TO_ORG_TYPE[role]
  if (!requiredType) return organizations
  return organizations.filter(o => o.type === requiredType)
}

function defaultOrgIdForRole(organizations, role) {
  if (PLATFORM_ROLES.has(role)) return ''
  const matching = orgsForRole(organizations, role)
  const activeFirst = matching.find(o => (o.status ?? 'active') === 'active') ?? matching[0]
  return activeFirst?.id ?? ''
}

export default function Users() {
  const { users, organizations, orgName, addUser, updateUser } = useDemoData()

  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [toast, setToast] = useState('')

  // Create user modal state
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState('manufacturer')
  const [newOrgId, setNewOrgId] = useState('')
  const [createError, setCreateError] = useState('')
  const [saving, setSaving] = useState(false)

  // Drawer editor state
  const [editRole, setEditRole] = useState('manufacturer')
  const [editOrgId, setEditOrgId] = useState('')
  const [editError, setEditError] = useState('')

  const selected = useMemo(
    () => users.find(u => u.id === selectedId) ?? null,
    [users, selectedId]
  )

  useEffect(() => {
    if (selected) {
      setEditRole(selected.role)
      setEditOrgId(selected.orgId ?? '')
      setEditError('')
    }
  }, [selected])

  const createOrgOptions = useMemo(() => orgsForRole(organizations, newRole), [organizations, newRole])
  const editOrgOptions = useMemo(() => orgsForRole(organizations, editRole), [organizations, editRole])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter(u => {
      const matchesRole = !roleFilter || u.role === roleFilter
      const matchesStatus = !statusFilter || u.status === statusFilter
      const matchesQuery =
        !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      return matchesRole && matchesStatus && matchesQuery
    })
  }, [users, query, roleFilter, statusFilter])

  async function handleCreateSubmit(e) {
    e.preventDefault()
    if (saving) return
    const trimmedName = newName.trim()
    const trimmedEmail = newEmail.trim()
    if (!trimmedName || !trimmedEmail) {
      setCreateError('Name and email address are required.')
      return
    }
    if (!PLATFORM_ROLES.has(newRole) && !newOrgId) {
      setCreateError(`Please select a ${ROLE_TO_ORG_TYPE[newRole]} organization for this role.`)
      return
    }
    setSaving(true)
    try {
      const created = await addUser({
        name: trimmedName,
        email: trimmedEmail,
        role: newRole,
        orgId: newOrgId || null
      })
      if (!created || created.ok === false) {
        setCreateError(created?.error || 'Could not create user.')
        return
      }
      setCreateOpen(false)
      setNewName('')
      setNewEmail('')
      setNewRole('manufacturer')
      setNewOrgId('')
      setCreateError('')
      setToast(`User "${created?.name ?? trimmedName}" created (demo state).`)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveAssignment(e) {
    e.preventDefault()
    if (!selected || saving) return
    setSaving(true)
    try {
      const res = await updateUser(selected.id, {
        role: editRole,
        orgId: editOrgId || null
      })
      if (!res || res.ok === false) {
        setEditError(res?.error || 'Could not update role & organization.')
        return
      }
      setEditError('')
      setToast(`Updated role & organization for "${selected.name}".`)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleStatus() {
    if (!selected || saving) return
    const nextStatus = selected.status === 'active' ? 'suspended' : 'active'
    setSaving(true)
    try {
      const res = await updateUser(selected.id, { status: nextStatus })
      if (!res || res.ok === false) {
        setEditError(res?.error || 'Could not update user status.')
        return
      }
      setEditError('')
      setToast(
        nextStatus === 'suspended'
          ? `User "${selected.name}" suspended.`
          : `User "${selected.name}" reactivated.`
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="User & Access Management"
        description="Manage platform user accounts, role assignments, organization links, and account status."
        actions={
          <Button
            onClick={() => {
              setCreateError('')
              setNewRole('manufacturer')
              setNewOrgId(defaultOrgIdForRole(organizations, 'manufacturer'))
              setCreateOpen(true)
            }}
          >
            <Plus size={16} aria-hidden />
            Create User
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-2.5 top-3 text-muted" aria-hidden />
          <input
            aria-label="Search users"
            placeholder="Search by name or email..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full rounded-md border border-line bg-white py-2 pl-8 pr-3 text-sm"
          />
        </div>
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value)}
          className="rounded-md border border-line bg-white px-3 py-2 text-sm"
        >
          <option value="">All roles</option>
          {USER_ROLES.map(r => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="rounded-md border border-line bg-white px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      <DataTable
        rows={rows}
        onRowClick={r => setSelectedId(r.id)}
        empty="No users match your search or filters."
        columns={[
          {
            key: 'name',
            label: 'Name',
            render: r => <span className="font-semibold text-ink">{r.name}</span>
          },
          {
            key: 'email',
            label: 'Email',
            render: r => <span className="text-muted">{r.email}</span>
          },
          {
            key: 'role',
            label: 'Role',
            render: r => <span className="capitalize">{r.role}</span>
          },
          {
            key: 'orgId',
            label: 'Organization',
            render: r => (r.orgId ? orgName(r.orgId) : 'Platform')
          },
          {
            key: 'status',
            label: 'Status',
            render: r => <StatusBadge status={r.status} />
          },
          {
            key: 'created',
            label: 'Created',
            render: r => <span className="id-text whitespace-nowrap text-muted">{r.created}</span>
          }
        ]}
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? selected.name : 'User details'}
      >
        {selected && (
          <div className="space-y-6">
            <dl className="space-y-2 rounded-lg border border-line bg-surface p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">User ID</dt>
                <dd className="id-text font-semibold">{selected.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Email</dt>
                <dd className="font-medium">{selected.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Created</dt>
                <dd className="id-text">{selected.created}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted">Status</dt>
                <StatusBadge status={selected.status} />
              </div>
            </dl>

            <form onSubmit={handleSaveAssignment} className="space-y-3 border-t border-line pt-4">
              <h3 className="text-sm font-bold text-navy">Role & organization assignment</h3>
              <label className="block text-sm font-semibold">
                Role
                <select
                  value={editRole}
                  onChange={e => {
                    const next = e.target.value
                    setEditRole(next)
                    setEditError('')
                    if (PLATFORM_ROLES.has(next)) {
                      setEditOrgId('')
                    } else {
                      const matching = orgsForRole(organizations, next)
                      if (!matching.some(o => o.id === editOrgId)) {
                        setEditOrgId(defaultOrgIdForRole(organizations, next))
                      }
                    }
                  }}
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm font-normal"
                >
                  {USER_ROLES.map(r => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Organization {PLATFORM_ROLES.has(editRole) ? '(optional)' : `(${ROLE_TO_ORG_TYPE[editRole]})`}
                <select
                  value={editOrgId}
                  onChange={e => {
                    setEditOrgId(e.target.value)
                    setEditError('')
                  }}
                  className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm font-normal"
                >
                  {PLATFORM_ROLES.has(editRole) && <option value="">Platform (no organization)</option>}
                  {editOrgOptions.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.name} ({o.type})
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
                  {selected.status === 'active' ? 'Suspend user' : 'Reactivate user'}
                </Button>
              </div>
            </form>
          </div>
        )}
      </Drawer>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create User"
        actions={
          <>
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="create-user-form" disabled={saving}>
              {saving ? 'Creating...' : 'Create user'}
            </Button>
          </>
        }
      >
        <form id="create-user-form" onSubmit={handleCreateSubmit} className="space-y-4">
          <label className="block text-sm font-semibold">
            Full name
            <input
              type="text"
              placeholder="e.g. Elena Rostova"
              value={newName}
              onChange={e => {
                setNewName(e.target.value)
                setCreateError('')
              }}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
              autoFocus
            />
          </label>
          <label className="block text-sm font-semibold">
            Email address
            <input
              type="email"
              placeholder="e.g. elena@meridian.demo"
              value={newEmail}
              onChange={e => {
                setNewEmail(e.target.value)
                setCreateError('')
              }}
              className="mt-1 w-full rounded-md border border-line px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="block text-sm font-semibold">
            Role
            <select
              value={newRole}
              onChange={e => {
                const next = e.target.value
                setNewRole(next)
                setNewOrgId(defaultOrgIdForRole(organizations, next))
                setCreateError('')
              }}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm font-normal"
            >
              {USER_ROLES.map(r => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Organization {PLATFORM_ROLES.has(newRole) ? '(optional)' : `(${ROLE_TO_ORG_TYPE[newRole]})`}
            <select
              value={newOrgId}
              onChange={e => {
                setNewOrgId(e.target.value)
                setCreateError('')
              }}
              className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm font-normal"
            >
              {PLATFORM_ROLES.has(newRole) && <option value="">Platform (no organization)</option>}
              {createOrgOptions.map(o => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.type})
                </option>
              ))}
            </select>
          </label>
          {createError && (
            <p role="alert" className="text-sm text-quarantine">
              {createError}
            </p>
          )}
        </form>
      </Modal>

      {toast && <Toast msg={toast} onDone={() => setToast('')} />}
    </>
  )
}
