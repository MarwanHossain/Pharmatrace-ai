// PharmaTrace AI — Multi-Tenant Query Scoping & Boundary Enforcer
// Enforces tenant isolation inside database queries (Revision 3.2 §4.1)

export class TenantAccessDeniedError extends Error {
  constructor(message = 'Cross-organization access is strictly forbidden.') {
    super(message)
    this.name = 'TenantAccessDeniedError'
    this.status = 403
    this.code = 'TENANT_ACCESS_DENIED'
  }
}

/**
 * Asserts that the authenticated user has legitimate authorization to access
 * resources belonging to the specified target organization ID.
 *
 * @param {object} user - req.user
 * @param {string} targetOrgId - The organization ID of the record being accessed
 * @throws {TenantAccessDeniedError} If access violates tenant isolation
 */
export function assertTenantAccess(user, targetOrgId) {
  if (!user) {
    throw new TenantAccessDeniedError('Unauthenticated access attempt.')
  }

  // System-level roles with regulatory oversight across all organizations
  if (user.role === 'admin' || user.role === 'investigator') {
    return true
  }

  // Supply-chain roles (manufacturer, distributor, wholesaler, pharmacy)
  // must match their assigned organization ID exactly
  if (!user.orgId || user.orgId !== targetOrgId) {
    throw new TenantAccessDeniedError(
      `Tenant boundary violation: User from organization '${user.orgId || 'none'}' cannot access resources belonging to '${targetOrgId}'.`
    )
  }

  return true
}

/**
 * Builds an organization filtering WHERE clause and parameter binding for database queries.
 * Ensures data queries cannot leak cross-tenant records.
 *
 * @param {object} user - req.user
 * @param {string} column - SQL column reference (e.g., 'org_id' or 'p.org_id')
 * @returns {{ sql: string, params: Array<string> }}
 */
export function buildTenantQueryScope(user, column = 'org_id') {
  if (!user) {
    throw new TenantAccessDeniedError('Unauthenticated query attempt.')
  }

  // System-level administrative roles inspect all supply-chain participants
  if (user.role === 'admin' || user.role === 'investigator') {
    return { sql: '1=1', params: [] }
  }

  if (!user.orgId) {
    throw new TenantAccessDeniedError('User does not have an assigned organization.')
  }

  return {
    sql: `${column} = ?`,
    params: [user.orgId]
  }
}
