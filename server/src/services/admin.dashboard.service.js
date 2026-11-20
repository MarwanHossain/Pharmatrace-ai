// PharmaTrace AI — Administrative Dashboard Aggregation Service
// Implements Phase 4 M6 Dashboard requirements connecting live MariaDB records
import { execute } from '../config/database.js'

/**
 * Retrieves platform-wide live summary metrics across registrations, organizations, and users.
 *
 * @returns {Promise<object>}
 */
export async function getDashboardSummary() {
  // 1. Live Registration Metrics
  const regSql = `
    SELECT 
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END), 0) AS submitted,
      COALESCE(SUM(CASE WHEN status = 'UNDER_REVIEW' THEN 1 ELSE 0 END), 0) AS underReview,
      COALESCE(SUM(CASE WHEN status = 'INFORMATION_REQUESTED' THEN 1 ELSE 0 END), 0) AS infoRequested,
      COALESCE(SUM(CASE WHEN status = 'APPROVED' THEN 1 ELSE 0 END), 0) AS approved,
      COALESCE(SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END), 0) AS rejected
    FROM organization_registrations
  `
  const [regRows] = await execute(regSql)
  const regMetrics = {
    total: Number(regRows[0]?.total || 0),
    submitted: Number(regRows[0]?.submitted || 0),
    underReview: Number(regRows[0]?.underReview || 0),
    infoRequested: Number(regRows[0]?.infoRequested || 0),
    approved: Number(regRows[0]?.approved || 0),
    rejected: Number(regRows[0]?.rejected || 0)
  }

  // 2. Live Organizations Summary
  const orgSql = `
    SELECT 
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
      COALESCE(SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END), 0) AS suspended,
      COALESCE(SUM(CASE WHEN status = 'decommissioned' THEN 1 ELSE 0 END), 0) AS decommissioned
    FROM organizations
  `
  const [orgRows] = await execute(orgSql)
  const orgSummary = {
    total: Number(orgRows[0]?.total || 0),
    active: Number(orgRows[0]?.active || 0),
    suspended: Number(orgRows[0]?.suspended || 0),
    decommissioned: Number(orgRows[0]?.decommissioned || 0)
  }

  // 3. Organization Category Breakdown (with live linked user counts)
  const breakdownSql = `
    SELECT 
      o.type,
      COUNT(DISTINCT o.id) AS orgCount,
      COALESCE(SUM(CASE WHEN o.status = 'active' THEN 1 ELSE 0 END), 0) AS activeCount,
      COUNT(DISTINCT u.id) AS userCount
    FROM organizations o
    LEFT JOIN users u ON u.org_id = o.id
    GROUP BY o.type
  `
  const [breakdownRows] = await execute(breakdownSql)
  const breakdownMap = {}
  for (const row of breakdownRows) {
    breakdownMap[row.type.toLowerCase()] = {
      type: row.type,
      orgCount: Number(row.orgCount || 0),
      activeCount: Number(row.activeCount || 0),
      userCount: Number(row.userCount || 0)
    }
  }

  // Ensure standard supply chain roles are always represented
  const standardTypes = ['manufacturer', 'distributor', 'wholesaler', 'pharmacy']
  const organizationBreakdown = standardTypes.map(type => {
    const existing = breakdownMap[type]
    return existing || {
      type,
      orgCount: 0,
      activeCount: 0,
      userCount: 0
    }
  })

  // 4. Live Users Summary
  const userSql = `
    SELECT 
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
      COALESCE(SUM(CASE WHEN status = 'pending_activation' THEN 1 ELSE 0 END), 0) AS pendingActivation,
      COALESCE(SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END), 0) AS inactive,
      COALESCE(SUM(CASE WHEN status = 'locked' THEN 1 ELSE 0 END), 0) AS locked
    FROM users
  `
  const [userRows] = await execute(userSql)
  const userSummary = {
    total: Number(userRows[0]?.total || 0),
    active: Number(userRows[0]?.active || 0),
    pendingActivation: Number(userRows[0]?.pendingActivation || 0),
    inactive: Number(userRows[0]?.inactive || 0),
    locked: Number(userRows[0]?.locked || 0)
  }

  return {
    registrations: regMetrics,
    organizations: orgSummary,
    organizationBreakdown,
    users: userSummary,
    timestamp: new Date().toISOString()
  }
}

/**
 * Retrieves recent chronological system audit activity from MariaDB.
 *
 * @param {object} params
 * @param {number} [params.limit=10]
 * @param {number} [params.days]
 * @returns {Promise<object>}
 */
export async function getDashboardActivity({ limit = 10, days } = {}) {
  const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10))
  const conditions = []
  const values = []

  if (days && !isNaN(parseInt(days, 10))) {
    const numDays = parseInt(days, 10)
    if (numDays > 0) {
      conditions.push('a.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)')
      values.push(numDays)
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const activitySql = `
    SELECT 
      a.id,
      a.registration_id AS registrationId,
      r.reference_number AS referenceNumber,
      r.org_name AS orgName,
      r.category AS orgCategory,
      a.actor_user_id AS actorUserId,
      COALESCE(u.name, a.actor_role) AS actorName,
      a.actor_role AS actorRole,
      a.from_status AS fromStatus,
      a.to_status AS toStatus,
      a.action_type AS actionType,
      a.comment,
      a.created_at AS createdAt
    FROM registration_audit_log a
    LEFT JOIN organization_registrations r ON a.registration_id = r.id
    LEFT JOIN users u ON a.actor_user_id = u.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ?
  `
  values.push(limitNum)
  const [items] = await execute(activitySql, values)

  return {
    items
  }
}
