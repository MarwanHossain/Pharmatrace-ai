import { ShieldAlert, Building2 } from 'lucide-react'
import { PageHeader, MetricCard, DataTable, StatusBadge } from '../../../components/ui'
import { useDemoData } from '../../../contexts/DemoData'

const ORG_TYPES = ['Manufacturer', 'Distributor', 'Wholesaler', 'Pharmacy']

export default function Dashboard() {
  const { organizations, users, products, packages, alerts, reports, orgName } = useDemoData()

  const activeUsers = users.filter(u => u.status === 'active').length
  const openAlertsCount = alerts.filter(a => a.status === 'open').length
  const openReportsCount = reports.filter(r => r.status === 'open').length
  const openIssues = openAlertsCount + openReportsCount

  const recentUsers = [...users].sort((a, b) => (b.created || '').localeCompare(a.created || ''))

  return (
    <>
      <PageHeader
        title="Platform Administration Dashboard"
        description="System-wide overview of registered organizations, platform users, serialized inventory, and open governance items."
      />

      <div
        role="note"
        className="mb-6 flex items-start gap-3 rounded-lg border border-amber-line bg-amber-soft px-4 py-3 text-sm text-amber-ink"
      >
        <ShieldAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
        <div>
          <span className="font-semibold">Demo-only administration state:</span> Changes made to organizations and
          user accounts are stored in browser local storage for this preview only. No backend database or
          server-side authentication occurs.
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard
          label="Organizations"
          value={organizations.length}
          hint={`${organizations.filter(o => (o.status ?? 'active') === 'active').length} active`}
        />
        <MetricCard
          label="Active users"
          value={activeUsers}
          hint={`${users.length} total accounts`}
        />
        <MetricCard
          label="Registered products"
          value={products.length}
          hint="Active catalog items"
        />
        <MetricCard
          label="Serialized packages"
          value={packages.length}
          hint="Tracked in demo ledger"
        />
        <MetricCard
          label="Open alerts & reports"
          value={openIssues}
          hint={`${openAlertsCount} alerts · ${openReportsCount} reports`}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <h2 className="mb-2 text-sm font-bold text-navy">Organization breakdown</h2>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ORG_TYPES.map(type => {
          const ofType = organizations.filter(o => o.type === type)
          const activeOfType = ofType.filter(o => (o.status ?? 'active') === 'active').length
          const linkedUsers = users.filter(u => ofType.some(o => o.id === u.orgId)).length
          return (
            <div key={type} className="rounded-lg border border-line bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">{type}</span>
                <Building2 size={15} className="text-navy" aria-hidden />
              </div>
              <div className="id-text mt-1 text-2xl font-bold text-navy">{ofType.length}</div>
              <div className="mt-1 text-xs text-muted">
                {activeOfType} active · {linkedUsers} {linkedUsers === 1 ? 'user' : 'users'}
              </div>
            </div>
          )
        })}
      </div>

      <h2 className="mb-2 text-sm font-bold text-navy">Recent users</h2>
      <DataTable
        rows={recentUsers}
        pageSize={6}
        columns={[
          {
            key: 'name',
            label: 'User',
            render: r => (
              <div>
                <div className="font-semibold text-ink">{r.name}</div>
                <div className="text-xs text-muted">{r.email}</div>
              </div>
            )
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
    </>
  )
}
