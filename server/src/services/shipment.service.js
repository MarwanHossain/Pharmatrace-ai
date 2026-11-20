// PharmaTrace AI — Shipment & Custody Transfer Service
// Implements MariaDB transaction-backed custody transfers, itemized receiving, and append-only traceability events
import { getPool, execute } from '../config/database.js'
import { logger } from '../utils/logger.js'

export class ShipmentServiceError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message)
    this.name = 'ShipmentServiceError'
    this.code = code
    this.statusCode = statusCode
  }
}

/**
 * Validates whether an origin tier can ship to a destination tier.
 * Allowed tiers:
 *   manufacturer -> distributor (or government)
 *   distributor  -> wholesaler
 *   wholesaler   -> pharmacy
 */
export function validateTierCompatibility(fromType, toType) {
  const normFrom = String(fromType || '').toLowerCase()
  const normTo = String(toType || '').toLowerCase()

  if (normFrom === 'manufacturer') {
    return normTo === 'distributor' || normTo === 'government'
  }
  if (normFrom === 'distributor') {
    return normTo === 'wholesaler'
  }
  if (normFrom === 'wholesaler') {
    return normTo === 'pharmacy'
  }
  return false
}

/**
 * Creates and dispatches a shipment in a concurrency-safe MariaDB transaction.
 * Locks candidate package rows (`FOR UPDATE`), validates eligibility, assigns shipment,
 * updates custody statuses, and logs immutable DISPATCHED traceability events.
 *
 * @param {string} fromOrgId
 * @param {object} user - Authenticated user creating dispatch
 * @param {object} params
 * @param {string} params.toOrgId - Recipient organization ID
 * @param {Array<string>} params.packageSerials - Array of package serial numbers
 * @param {string} [params.allocationScope='COMMERCIAL_ONLY']
 * @param {string} [params.notes]
 * @returns {Promise<object>} Created shipment details
 */
export async function createAndDispatchShipment(fromOrgId, user, params = {}) {
  if (!fromOrgId) {
    throw new ShipmentServiceError('UNAUTHORIZED_ORG', 'Sender organization required.', 401)
  }

  const toOrgId = String(params.toOrgId || '').trim()
  if (!toOrgId) {
    throw new ShipmentServiceError('MISSING_DESTINATION', 'Recipient destination organization is required.', 400)
  }

  if (toOrgId === fromOrgId) {
    throw new ShipmentServiceError('SELF_DISPATCH_PROHIBITED', 'Cannot dispatch a shipment to your own organization.', 400)
  }

  const rawSerials = Array.isArray(params.packageSerials) ? params.packageSerials : []
  const serials = [...new Set(rawSerials.map(s => String(s || '').trim().toUpperCase()).filter(Boolean))]

  if (serials.length === 0) {
    throw new ShipmentServiceError('EMPTY_MANIFEST', 'At least one eligible package serial must be selected for dispatch.', 400)
  }

  const allocationScope = ['COMMERCIAL_ONLY', 'GOVERNMENT_ONLY', 'MIXED'].includes(params.allocationScope)
    ? params.allocationScope
    : 'COMMERCIAL_ONLY'

  const pool = getPool()
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    // 1. Verify origin and destination organizations
    const [orgRows] = await conn.query(
      'SELECT id, name, type, status FROM organizations WHERE id IN (?, ?)',
      [fromOrgId, toOrgId]
    )

    const fromOrg = orgRows.find(o => o.id === fromOrgId)
    const toOrg = orgRows.find(o => o.id === toOrgId)

    if (!fromOrg) {
      throw new ShipmentServiceError('ORIGIN_ORG_NOT_FOUND', 'Origin organization not found.', 404)
    }

    if (!toOrg) {
      throw new ShipmentServiceError('DESTINATION_NOT_FOUND', 'Destination organization not found in registry.', 404)
    }

    if (toOrg.status !== 'active') {
      throw new ShipmentServiceError(
        'RECIPIENT_ORGANIZATION_SUSPENDED',
        `Destination organization "${toOrg.name}" is currently ${toOrg.status} and cannot receive shipments.`,
        400
      )
    }

    // Role-to-tier compatibility enforcement
    if (!validateTierCompatibility(fromOrg.type, toOrg.type)) {
      throw new ShipmentServiceError(
        'INVALID_DESTINATION_TIER',
        `Authorized supply-chain flow requires ${fromOrg.type} to dispatch to an authorized downstream tier. ` +
        `Direct dispatch from ${fromOrg.type} to ${toOrg.type} is prohibited.`,
        400
      )
    }

    // 2. Lock requested packages FOR UPDATE to prevent concurrent double-dispatch
    const [pkgRows] = await conn.query(
      `SELECT 
        p.serial,
        p.batch_id,
        p.manufacturer_org_id,
        p.custodian_org_id,
        p.status,
        p.current_shipment_ref,
        p.allocation_type,
        b.batch_no,
        b.release_status,
        DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
        prod.name AS product_name
      FROM packages p
      JOIN batches b ON p.batch_id = b.id
      JOIN products prod ON b.product_id = prod.id
      WHERE p.serial IN (?)
      FOR UPDATE`,
      [serials]
    )

    if (pkgRows.length !== serials.length) {
      const foundSerials = new Set(pkgRows.map(r => r.serial))
      const missing = serials.filter(s => !foundSerials.has(s))
      throw new ShipmentServiceError('PACKAGES_NOT_FOUND', `Package(s) not found in registry: ${missing.join(', ')}`, 404)
    }

    const todayStr = new Date().toISOString().slice(0, 10)
    const isMfg = String(fromOrg.type).toLowerCase() === 'manufacturer'

    // 3. Strict package dispatch eligibility checks
    for (const pkg of pkgRows) {
      if (pkg.custodian_org_id !== fromOrgId) {
        throw new ShipmentServiceError(
          'PACKAGE_NOT_IN_CUSTODY',
          `Package ${pkg.serial} is not held in custody by your organization.`,
          403
        )
      }

      const allowedStatuses = isMfg ? ['available', 'accepted'] : ['accepted', 'available']
      if (!allowedStatuses.includes(pkg.status)) {
        throw new ShipmentServiceError(
          'PACKAGE_NOT_DISPATCHABLE',
          `Package ${pkg.serial} has status "${pkg.status}" and cannot be dispatched.`,
          400
        )
      }

      if (pkg.status === 'in_transit' || pkg.current_shipment_ref) {
        throw new ShipmentServiceError(
          'PACKAGE_ALREADY_IN_TRANSIT',
          `Package ${pkg.serial} is already assigned to active shipment ${pkg.current_shipment_ref || ''}.`,
          400
        )
      }

      if (pkg.release_status !== 'Released') {
        throw new ShipmentServiceError(
          'BATCH_NOT_RELEASED',
          `Package ${pkg.serial} belongs to batch ${pkg.batch_no} which has release status "${pkg.release_status}". QA release required before dispatch.`,
          400
        )
      }

      if (pkg.exp < todayStr) {
        throw new ShipmentServiceError(
          'PACKAGE_EXPIRED',
          `Package ${pkg.serial} (Batch ${pkg.batch_no}) expired on ${pkg.exp} and cannot be dispatched.`,
          400
        )
      }
    }

    // 4. Generate unique shipment reference (Format: SHP-<RUN_ID>-<RANDOM>)
    const nowTimestamp = Date.now().toString(36).toUpperCase()
    const randSuffix = Math.floor(1000 + Math.random() * 9000).toString()
    const shipmentRef = `SHP-${nowTimestamp}-${randSuffix}`

    // 5. Insert shipment record
    await conn.query(
      `INSERT INTO shipments (
        ref,
        from_org_id,
        to_org_id,
        status,
        package_count,
        allocation_scope,
        dispatched_at
      ) VALUES (?, ?, ?, 'in_transit', ?, ?, NOW())`,
      [shipmentRef, fromOrgId, toOrgId, serials.length, allocationScope]
    )

    // 6. Bulk insert shipment_packages manifest
    const manifestValues = serials.map(serial => [
      shipmentRef,
      serial,
      'outstanding',
      0, // scanned_at_receiving
      null // disposition_reason
    ])
    await conn.query(
      `INSERT INTO shipment_packages (
        shipment_ref,
        package_serial,
        disposition_status,
        scanned_at_receiving,
        disposition_reason
      ) VALUES ?`,
      [manifestValues]
    )

    // 7. Update packages table to in_transit and attach current_shipment_ref
    await conn.query(
      `UPDATE packages 
       SET status = 'in_transit', current_shipment_ref = ?, updated_at = NOW()
       WHERE serial IN (?)`,
      [shipmentRef, serials]
    )

    // 8. Bulk insert immutable DISPATCHED traceability events
    const eventPayload = JSON.stringify({
      fromOrgName: fromOrg.name,
      toOrgName: toOrg.name,
      toOrgType: toOrg.type,
      notes: params.notes || null,
      dispatchedByUserId: user?.id || null
    })

    const eventValues = serials.map(serial => [
      serial,
      'DISPATCHED',
      user?.id || null,
      fromOrgId,
      toOrgId,
      shipmentRef,
      eventPayload
    ])

    await conn.query(
      `INSERT INTO traceability_events (
        serial,
        event_type,
        actor_user_id,
        actor_org_id,
        target_org_id,
        shipment_ref,
        event_payload
      ) VALUES ?`,
      [eventValues]
    )

    await conn.commit()

    logger.info('Shipment successfully created and dispatched', {
      shipmentRef,
      fromOrgId,
      toOrgId,
      packageCount: serials.length,
      userId: user?.id
    })

    return {
      success: true,
      ref: shipmentRef,
      fromOrgId,
      fromOrgName: fromOrg.name,
      toOrgId,
      toOrgName: toOrg.name,
      status: 'in_transit',
      packageCount: serials.length,
      serials,
      dispatchedAt: new Date().toISOString()
    }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/**
 * Receives an incoming shipment with itemized package dispositions.
 * Operates in a strict MariaDB transaction with row-level locks on shipments,
 * shipment_packages, and packages.
 *
 * @param {string} toOrgId - Authenticated recipient organization ID
 * @param {object} user - Authenticated user receiving packages
 * @param {string} shipmentRef - Shipment reference
 * @param {object} params
 * @param {Array<{ serial: string, status: string, reason?: string }>} params.dispositions
 * @returns {Promise<object>} Updated shipment result
 */
export async function receiveShipment(toOrgId, user, shipmentRef, params = {}) {
  const ref = String(shipmentRef || '').trim()
  if (!ref) {
    throw new ShipmentServiceError('INVALID_SHIPMENT_REF', 'Shipment reference is required.', 400)
  }

  let dispositions = Array.isArray(params.dispositions) ? params.dispositions : []
  if (dispositions.length === 0 && params.sessionDispositions && typeof params.sessionDispositions === 'object') {
    dispositions = Object.entries(params.sessionDispositions)
      .filter(([_, d]) => d?.status)
      .map(([serial, item]) => ({
        serial,
        status: item.status,
        reason: item.reason || item.notes || ''
      }))
  }
  if (dispositions.length === 0) {
    throw new ShipmentServiceError('EMPTY_DISPOSITIONS', 'At least one package disposition must be provided for receiving.', 400)
  }

  const pool = getPool()
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    // 1. Lock shipment row FOR UPDATE
    const [shipmentRows] = await conn.query(
      `SELECT s.*, orig.name AS from_org_name, dest.name AS to_org_name
       FROM shipments s
       JOIN organizations orig ON s.from_org_id = orig.id
       JOIN organizations dest ON s.to_org_id = dest.id
       WHERE s.ref = ?
       FOR UPDATE`,
      [ref]
    )

    if (shipmentRows.length === 0) {
      throw new ShipmentServiceError('SHIPMENT_NOT_FOUND', `Shipment ${ref} not found.`, 404)
    }

    const shipment = shipmentRows[0]

    // Tenancy Check: recipient must match shipment destination
    if (shipment.to_org_id !== toOrgId) {
      throw new ShipmentServiceError(
        'UNAUTHORIZED_DESTINATION_RECIPIENT',
        `Your organization is not the authorized destination for shipment ${ref}.`,
        403
      )
    }

    const receivableStatuses = ['in_transit', 'partially_received', 'reconciliation_required']
    if (!receivableStatuses.includes(shipment.status)) {
      throw new ShipmentServiceError(
        'SHIPMENT_ALREADY_RECEIVED',
        `Shipment ${ref} is already in status "${shipment.status}" and cannot accept further receiving scans.`,
        400
      )
    }

    // 2. Lock manifest items FOR UPDATE
    const [manifestRows] = await conn.query(
      `SELECT sp.*, p.custodian_org_id, p.status AS pkg_status
       FROM shipment_packages sp
       JOIN packages p ON sp.package_serial = p.serial
       WHERE sp.shipment_ref = ?
       FOR UPDATE`,
      [ref]
    )

    const manifestMap = new Map(manifestRows.map(m => [m.package_serial, m]))

    // 3. Validate every disposition in request
    for (const disp of dispositions) {
      const serial = String(disp.serial || '').trim().toUpperCase()
      const status = String(disp.status || '').toLowerCase()

      if (!manifestMap.has(serial)) {
        throw new ShipmentServiceError(
          'PACKAGE_NOT_IN_MANIFEST',
          `Package ${serial} is not listed on the manifest for shipment ${ref}.`,
          400
        )
      }

      const validStatuses = ['accepted', 'damaged', 'rejected', 'missing']
      if (!validStatuses.includes(status)) {
        throw new ShipmentServiceError(
          'INVALID_DISPOSITION_STATUS',
          `Invalid disposition status "${status}" for package ${serial}. Must be one of: ${validStatuses.join(', ')}`,
          400
        )
      }

      if (['damaged', 'rejected', 'missing'].includes(status) && !disp.reason?.trim()) {
        throw new ShipmentServiceError(
          'DISPOSITION_REASON_REQUIRED',
          `A specific reason is required when marking package ${serial} as ${status}.`,
          400
        )
      }
    }

    // 4. Apply dispositions atomically
    for (const disp of dispositions) {
      const serial = String(disp.serial || '').trim().toUpperCase()
      const status = String(disp.status || '').toLowerCase()
      const reason = disp.reason?.trim() || null

      const manifestItem = manifestMap.get(serial)

      // Prevent duplicate processing if already completed
      if (manifestItem.disposition_status === 'accepted' && status === 'accepted') {
        continue
      }

      let nextPackageCustodian = toOrgId
      let nextPackageStatus = 'accepted'
      let eventType = 'RECEIVING_ACCEPTED'
      let scannedAtReceiving = 1

      if (status === 'accepted') {
        nextPackageCustodian = toOrgId
        nextPackageStatus = 'accepted'
        eventType = 'RECEIVING_ACCEPTED'
        scannedAtReceiving = 1
      } else if (status === 'damaged') {
        nextPackageCustodian = toOrgId
        nextPackageStatus = 'quarantined'
        eventType = 'RECEIVING_DAMAGED'
        scannedAtReceiving = 1
      } else if (status === 'rejected') {
        // Rejected packages do NOT transfer custody; they remain with sender
        nextPackageCustodian = shipment.from_org_id
        nextPackageStatus = 'rejected'
        eventType = 'RECEIVING_REJECTED'
        scannedAtReceiving = 1
      } else if (status === 'missing') {
        // Missing packages do not transfer custody
        nextPackageCustodian = shipment.from_org_id
        nextPackageStatus = 'missing'
        eventType = 'RECEIVING_MISSING'
        scannedAtReceiving = 0
      }

      // Update package row
      await conn.query(
        `UPDATE packages 
         SET custodian_org_id = ?, status = ?, current_shipment_ref = NULL, updated_at = NOW()
         WHERE serial = ?`,
        [nextPackageCustodian, nextPackageStatus, serial]
      )

      // Update manifest item
      await conn.query(
        `UPDATE shipment_packages 
         SET disposition_status = ?, scanned_at_receiving = ?, disposition_reason = ?
         WHERE shipment_ref = ? AND package_serial = ?`,
        [status, scannedAtReceiving, reason, ref, serial]
      )

      // Record immutable traceability event
      const eventPayload = JSON.stringify({
        shipmentRef: ref,
        fromOrgId: shipment.from_org_id,
        toOrgId: shipment.to_org_id,
        dispositionStatus: status,
        reason,
        receiverUserId: user?.id || null
      })

      await conn.query(
        `INSERT INTO traceability_events (
          serial,
          event_type,
          actor_user_id,
          actor_org_id,
          target_org_id,
          shipment_ref,
          event_payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [serial, eventType, user?.id || null, toOrgId, shipment.from_org_id, ref, eventPayload]
      )
    }

    // 5. Evaluate overall shipment status
    const [countsRows] = await conn.query(
      `SELECT disposition_status, COUNT(*) AS cnt
       FROM shipment_packages
       WHERE shipment_ref = ?
       GROUP BY disposition_status`,
      [ref]
    )

    let acceptedCount = 0
    let damagedCount = 0
    let rejectedCount = 0
    let missingCount = 0
    let outstandingCount = 0

    for (const c of countsRows) {
      if (c.disposition_status === 'accepted') acceptedCount = c.cnt
      else if (c.disposition_status === 'damaged') damagedCount = c.cnt
      else if (c.disposition_status === 'rejected') rejectedCount = c.cnt
      else if (c.disposition_status === 'missing') missingCount = c.cnt
      else if (c.disposition_status === 'outstanding') outstandingCount = c.cnt
    }

    const totalPackages = shipment.package_count

    let nextShipmentStatus = shipment.status
    if (outstandingCount === 0) {
      if (damagedCount === 0 && rejectedCount === 0 && missingCount === 0) {
        nextShipmentStatus = 'accepted'
      } else {
        nextShipmentStatus = 'reconciliation_required'
      }
    } else {
      nextShipmentStatus = 'partially_received'
    }

    await conn.query(
      `UPDATE shipments 
       SET status = ?, received_at = IF(? = 'accepted', NOW(), received_at), updated_at = NOW()
       WHERE ref = ?`,
      [nextShipmentStatus, nextShipmentStatus, ref]
    )

    await conn.commit()

    logger.info('Shipment receiving session committed', {
      shipmentRef: ref,
      toOrgId,
      userId: user?.id,
      nextShipmentStatus,
      summary: { acceptedCount, damagedCount, rejectedCount, missingCount, outstandingCount, totalPackages }
    })

    return {
      success: true,
      ref,
      status: nextShipmentStatus,
      summary: {
        total: totalPackages,
        accepted: acceptedCount,
        damaged: damagedCount,
        rejected: rejectedCount,
        missing: missingCount,
        outstanding: outstandingCount
      }
    }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/**
 * Closes reconciliation on a shipment with discrepancies once all items are dispositioned.
 */
export async function closeReconciliation(toOrgId, user, shipmentRef, params = {}) {
  const ref = String(shipmentRef || '').trim()
  const note = String(params.note || params.closureNote || '').trim()

  const pool = getPool()
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    const [rows] = await conn.query('SELECT * FROM shipments WHERE ref = ? FOR UPDATE', [ref])
    if (rows.length === 0) {
      throw new ShipmentServiceError('SHIPMENT_NOT_FOUND', `Shipment ${ref} not found.`, 404)
    }

    const shipment = rows[0]
    if (shipment.to_org_id !== toOrgId) {
      throw new ShipmentServiceError('UNAUTHORIZED_ORG', 'Only the destination organization can close reconciliation.', 403)
    }

    if (shipment.status !== 'reconciliation_required' && shipment.status !== 'partially_received') {
      throw new ShipmentServiceError(
        'INVALID_STATUS_FOR_CLOSURE',
        `Shipment ${ref} is currently "${shipment.status}". Only shipments awaiting reconciliation can be closed.`,
        400
      )
    }

    // Verify zero outstanding packages remain
    const [outstandingRows] = await conn.query(
      'SELECT COUNT(*) AS cnt FROM shipment_packages WHERE shipment_ref = ? AND disposition_status = "outstanding"',
      [ref]
    )

    if (outstandingRows[0].cnt > 0) {
      throw new ShipmentServiceError(
        'OUTSTANDING_ITEMS_EXIST',
        `Cannot close reconciliation: ${outstandingRows[0].cnt} package(s) remain outstanding.`,
        400
      )
    }

    await conn.query(
      'UPDATE shipments SET status = "closed", updated_at = NOW() WHERE ref = ?',
      [ref]
    )

    // Record audit event in traceability_events
    const eventPayload = JSON.stringify({
      closureNote: note || 'Reconciliation finalized by receiving party.',
      closedByUserId: user?.id || null
    })

    const [manifestSerials] = await conn.query(
      'SELECT package_serial FROM shipment_packages WHERE shipment_ref = ?',
      [ref]
    )

    for (const r of manifestSerials) {
      await conn.query(
        `INSERT INTO traceability_events (serial, event_type, actor_user_id, actor_org_id, target_org_id, shipment_ref, event_payload)
         VALUES (?, 'RECONCILIATION_CLOSED', ?, ?, ?, ?, ?)`,
        [r.package_serial, user?.id || null, toOrgId, shipment.from_org_id, ref, eventPayload]
      )
    }

    await conn.commit()

    return {
      success: true,
      ref,
      status: 'closed',
      note
    }
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/**
 * Records physical return handover of a rejected package.
 */
export async function recordRejectedHandover(toOrgId, user, shipmentRef, params = {}) {
  const ref = String(shipmentRef || '').trim()
  const serial = String(params.serial || params.packageSerial || '').trim().toUpperCase()
  const note = String(params.note || params.notes || '').trim()

  if (!serial) {
    throw new ShipmentServiceError('MISSING_SERIAL', 'Package serial is required for rejected handover.', 400)
  }

  const [rows] = await execute(
    `SELECT sp.*, s.from_org_id, s.to_org_id
     FROM shipment_packages sp
     JOIN shipments s ON sp.shipment_ref = s.ref
     WHERE sp.shipment_ref = ? AND sp.package_serial = ?`,
    [ref, serial]
  )

  if (rows.length === 0) {
    throw new ShipmentServiceError('PACKAGE_NOT_FOUND', `Package ${serial} not found in shipment ${ref}.`, 404)
  }

  const item = rows[0]
  if (item.to_org_id !== toOrgId) {
    throw new ShipmentServiceError('UNAUTHORIZED_ORG', 'Access denied.', 403)
  }

  if (item.disposition_status !== 'rejected') {
    throw new ShipmentServiceError('PACKAGE_NOT_REJECTED', `Package ${serial} has status "${item.disposition_status}". Only rejected items can be handed over.`, 400)
  }

  const eventPayload = JSON.stringify({
    handoverNote: note || 'Physical package returned to courier/supplier.',
    userId: user?.id || null
  })

  await execute(
    `INSERT INTO traceability_events (serial, event_type, actor_user_id, actor_org_id, target_org_id, shipment_ref, event_payload)
     VALUES (?, 'REJECTED_HANDOVER', ?, ?, ?, ?, ?)`,
    [serial, user?.id || null, toOrgId, item.from_org_id, ref, eventPayload]
  )

  return { success: true, serial, ref }
}

/**
 * Lists shipments for the authenticated organization with direction, status, and search filters.
 */
export async function listShipments(orgId, role, params = {}) {
  const direction = String(params.direction || 'all').toLowerCase()
  const status = params.status ? String(params.status).trim() : null
  const search = params.search ? String(params.search).trim() : null
  const limit = Math.min(Math.max(Number(params.limit) || 50, 1), 200)
  const offset = Math.max(Number(params.offset) || 0, 0)

  const isInspector = role === 'admin' || role === 'investigator'

  const conditions = []
  const queryParams = []

  if (!isInspector) {
    if (direction === 'incoming') {
      conditions.push('s.to_org_id = ?')
      queryParams.push(orgId)
    } else if (direction === 'outgoing') {
      conditions.push('s.from_org_id = ?')
      queryParams.push(orgId)
    } else {
      conditions.push('(s.from_org_id = ? OR s.to_org_id = ?)')
      queryParams.push(orgId, orgId)
    }
  }

  if (status && status !== 'all') {
    conditions.push('s.status = ?')
    queryParams.push(status)
  }

  if (search) {
    conditions.push('(s.ref LIKE ? OR orig.name LIKE ? OR dest.name LIKE ?)')
    queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM shipments s
    JOIN organizations orig ON s.from_org_id = orig.id
    JOIN organizations dest ON s.to_org_id = dest.id
    ${whereClause}
  `
  const [countRows] = await execute(countQuery, queryParams)
  const total = countRows[0]?.total || 0

  const listQuery = `
    SELECT 
      s.ref,
      s.from_org_id,
      orig.name AS from_org_name,
      orig.type AS from_org_type,
      s.to_org_id,
      dest.name AS to_org_name,
      dest.type AS to_org_type,
      s.status,
      s.package_count,
      s.allocation_scope,
      DATE_FORMAT(s.dispatched_at, '%Y-%m-%d %H:%i:%s') AS dispatched_at,
      DATE_FORMAT(s.received_at, '%Y-%m-%d %H:%i:%s') AS received_at,
      DATE_FORMAT(s.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
      COUNT(CASE WHEN sp.disposition_status = 'accepted' THEN 1 END) AS accepted_count,
      COUNT(CASE WHEN sp.disposition_status = 'damaged' THEN 1 END) AS damaged_count,
      COUNT(CASE WHEN sp.disposition_status = 'rejected' THEN 1 END) AS rejected_count,
      COUNT(CASE WHEN sp.disposition_status = 'missing' THEN 1 END) AS missing_count,
      COUNT(CASE WHEN sp.disposition_status = 'outstanding' THEN 1 END) AS outstanding_count
    FROM shipments s
    JOIN organizations orig ON s.from_org_id = orig.id
    JOIN organizations dest ON s.to_org_id = dest.id
    LEFT JOIN shipment_packages sp ON s.ref = sp.shipment_ref
    ${whereClause}
    GROUP BY s.ref
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `
  const [rows] = await execute(listQuery, [...queryParams, limit, offset])

  const shipments = rows.map(r => ({
    ref: r.ref,
    from: r.from_org_id,
    from_org_id: r.from_org_id,
    fromName: r.from_org_name,
    from_org_name: r.from_org_name,
    fromType: r.from_org_type,
    to: r.to_org_id,
    to_org_id: r.to_org_id,
    toName: r.to_org_name,
    to_org_name: r.to_org_name,
    toType: r.to_org_type,
    status: r.status,
    count: r.package_count,
    packageCount: r.package_count,
    package_count: r.package_count,
    allocationScope: r.allocation_scope,
    dispatchedAt: r.dispatched_at,
    dispatched_at: r.dispatched_at,
    receivedAt: r.received_at,
    received_at: r.received_at,
    createdAt: r.created_at,
    created_at: r.created_at,
    accepted_count: Number(r.accepted_count || 0),
    damaged_count: Number(r.damaged_count || 0),
    rejected_count: Number(r.rejected_count || 0),
    missing_count: Number(r.missing_count || 0),
    outstanding_count: Number(r.outstanding_count || 0),
    summary: {
      accepted: Number(r.accepted_count || 0),
      damaged: Number(r.damaged_count || 0),
      rejected: Number(r.rejected_count || 0),
      missing: Number(r.missing_count || 0),
      outstanding: Number(r.outstanding_count || 0)
    }
  }))

  return { shipments, total }
}

/**
 * Retrieves full details for a shipment including manifest items, products, and batches.
 */
export async function getShipmentByRef(orgId, role, shipmentRef) {
  const ref = String(shipmentRef || '').trim()
  const isInspector = role === 'admin' || role === 'investigator'

  const [shipmentRows] = await execute(
    `SELECT 
      s.ref,
      s.from_org_id,
      orig.name AS from_org_name,
      orig.type AS from_org_type,
      s.to_org_id,
      dest.name AS to_org_name,
      dest.type AS to_org_type,
      s.status,
      s.package_count,
      s.allocation_scope,
      DATE_FORMAT(s.dispatched_at, '%Y-%m-%d %H:%i:%s') AS dispatched_at,
      DATE_FORMAT(s.received_at, '%Y-%m-%d %H:%i:%s') AS received_at,
      DATE_FORMAT(s.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
    FROM shipments s
    JOIN organizations orig ON s.from_org_id = orig.id
    JOIN organizations dest ON s.to_org_id = dest.id
    WHERE s.ref = ?`,
    [ref]
  )

  if (shipmentRows.length === 0) return null
  const shipment = shipmentRows[0]

  // Tenancy check
  if (!isInspector && shipment.from_org_id !== orgId && shipment.to_org_id !== orgId) {
    throw new ShipmentServiceError('FORBIDDEN_SHIPMENT_ACCESS', 'Access denied to this shipment.', 403)
  }

  // Fetch manifest packages
  const [pkgRows] = await execute(
    `SELECT 
      sp.package_serial AS serial,
      sp.disposition_status,
      sp.scanned_at_receiving,
      sp.disposition_reason,
      p.batch_id,
      p.status AS package_status,
      p.allocation_type,
      b.batch_no,
      DATE_FORMAT(b.mfd, '%Y-%m-%d') AS mfd,
      DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
      prod.name AS product_name,
      prod.generic_name,
      prod.strength,
      prod.dosage_form,
      prod.pack_size,
      prod.gtin
    FROM shipment_packages sp
    JOIN packages p ON sp.package_serial = p.serial
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    WHERE sp.shipment_ref = ?
    ORDER BY sp.package_serial ASC`,
    [ref]
  )

  const summary = {
    total: shipment.package_count,
    accepted: pkgRows.filter(p => p.disposition_status === 'accepted').length,
    damaged: pkgRows.filter(p => p.disposition_status === 'damaged').length,
    rejected: pkgRows.filter(p => p.disposition_status === 'rejected').length,
    missing: pkgRows.filter(p => p.disposition_status === 'missing').length,
    outstanding: pkgRows.filter(p => p.disposition_status === 'outstanding').length
  }

  return {
    ...shipment,
    packageSerials: pkgRows.map(p => p.serial),
    packages: pkgRows,
    summary
  }
}

/**
 * Returns packages currently held in custody of the caller organization that are eligible for dispatch.
 */
export async function getEligiblePackages(orgId, role) {
  if (!orgId) return []

  const todayStr = new Date().toISOString().slice(0, 10)
  const isMfg = role === 'manufacturer'
  const validStatus = isMfg ? ['available', 'accepted'] : ['accepted', 'available']

  const [rows] = await execute(
    `SELECT 
      p.serial,
      p.batch_id,
      p.status,
      p.current_shipment_ref,
      p.allocation_type,
      b.batch_no,
      b.release_status,
      DATE_FORMAT(b.mfd, '%Y-%m-%d') AS mfd,
      DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
      prod.name AS product_name,
      prod.generic_name,
      prod.strength,
      prod.dosage_form,
      prod.pack_size,
      prod.gtin
    FROM packages p
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    WHERE p.custodian_org_id = ?
    ORDER BY p.created_at DESC`,
    [orgId]
  )

  return rows.map(r => {
    const reasons = []
    if (!validStatus.includes(r.status)) {
      reasons.push(`Status is "${r.status}" (must be ${validStatus.join(' or ')})`)
    }
    if (r.current_shipment_ref) {
      reasons.push(`Already assigned to shipment ${r.current_shipment_ref}`)
    }
    if (r.release_status !== 'Released') {
      reasons.push(`Batch ${r.batch_no} is ${r.release_status} (QA release required)`)
    }
    if (r.exp < todayStr) {
      reasons.push(`Batch ${r.batch_no} expired on ${r.exp}`)
    }

    return {
      ...r,
      eligible: reasons.length === 0,
      reasons
    }
  })
}

/**
 * Returns eligible destination organizations based on the sender's supply chain tier.
 */
export async function getEligibleDestinations(orgId, role) {
  let targetTypes = []
  if (role === 'manufacturer') {
    targetTypes = ['distributor']
  } else if (role === 'distributor') {
    targetTypes = ['wholesaler']
  } else if (role === 'wholesaler') {
    targetTypes = ['pharmacy']
  } else {
    targetTypes = ['distributor', 'wholesaler', 'pharmacy']
  }

  const pool = getPool()
  const placeholders = targetTypes.map(() => '?').join(',')
  const [rows] = await pool.query(
    `SELECT id, name, type, license_number, address, contact_name, contact_email, contact_phone, status
     FROM organizations
     WHERE type IN (${placeholders}) AND status = 'active' AND id != ?
     ORDER BY name ASC`,
    [...targetTypes, orgId || '']
  )

  return rows
}

/**
 * Returns inventory packages currently held in custody of the organization.
 */
export async function getCustodyInventory(orgId, params = {}) {
  const status = params.status ? String(params.status).trim() : null
  const search = params.search ? String(params.search).trim() : null
  const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 500)
  const offset = Math.max(Number(params.offset) || 0, 0)

  const conditions = ['p.custodian_org_id = ?']
  const queryParams = [orgId]

  if (status && status !== 'all') {
    conditions.push('p.status = ?')
    queryParams.push(status)
  } else {
    conditions.push('p.status IN ("accepted", "quarantined", "available")')
  }

  if (search) {
    conditions.push('(p.serial LIKE ? OR prod.name LIKE ? OR b.batch_no LIKE ?)')
    queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  const [countRows] = await execute(
    `SELECT COUNT(*) AS total
     FROM packages p
     JOIN batches b ON p.batch_id = b.id
     JOIN products prod ON b.product_id = prod.id
     ${whereClause}`,
    queryParams
  )
  const total = countRows[0]?.total || 0

  const [rows] = await execute(
    `SELECT 
      p.serial,
      p.batch_id,
      p.status,
      p.allocation_type,
      p.verify_count,
      DATE_FORMAT(p.created_at, '%Y-%m-%d') AS created_at,
      b.batch_no,
      DATE_FORMAT(b.mfd, '%Y-%m-%d') AS mfd,
      DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
      b.release_status,
      prod.name AS product_name,
      prod.generic_name,
      prod.strength,
      prod.dosage_form,
      prod.pack_size,
      prod.gtin,
      mfg.name AS manufacturer_name
    FROM packages p
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    JOIN organizations mfg ON p.manufacturer_org_id = mfg.id
    ${whereClause}
    ORDER BY p.updated_at DESC
    LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  )

  return { inventory: rows, total }
}
