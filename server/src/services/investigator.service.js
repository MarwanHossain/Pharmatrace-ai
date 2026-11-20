// PharmaTrace AI — Regulatory Investigation & Enforcement Service
// Milestone M8 Implementation
import crypto from 'crypto'
import { execute, getPool } from '../config/database.js'
import { logger } from '../utils/logger.js'

/**
 * Generates a clean random UUID
 */
function generateId(prefix = 'id') {
  return `${prefix}-${crypto.randomUUID()}`
}

/**
 * Generates sequential case numbers: INV-YYYY-XXXX
 */
async function generateNextCaseNumber() {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const [rows] = await execute(
    'SELECT case_number FROM investigation_cases WHERE case_number LIKE ? ORDER BY case_number DESC LIMIT 1',
    [`${prefix}%`]
  )
  if (rows.length === 0) {
    return `${prefix}0001`
  }
  const lastNum = rows[0].case_number.replace(prefix, '')
  const nextSeq = parseInt(lastNum, 10) + 1
  return `${prefix}${String(nextSeq).padStart(4, '0')}`
}

/**
 * 1. Dashboard Metrics & Operational Feeds
 */
export async function getDashboardSummary() {
  const [openAlertsRow] = await execute(
    `SELECT 
      COUNT(*) AS total_open,
      SUM(CASE WHEN severity IN ('HIGH', 'CRITICAL') THEN 1 ELSE 0 END) AS high_severity
    FROM investigation_alerts 
    WHERE status IN ('OPEN', 'TRIAGED', 'INVESTIGATING')`
  )

  const [casesRow] = await execute(
    `SELECT 
      COUNT(*) AS total_cases,
      SUM(CASE WHEN status IN ('open', 'under_review') THEN 1 ELSE 0 END) AS open_cases
    FROM investigation_cases`
  )

  const [reportsRow] = await execute(
    `SELECT 
      COUNT(*) AS total_reports,
      SUM(CASE WHEN status IN ('PENDING', 'INVESTIGATING') THEN 1 ELSE 0 END) AS pending_reports
    FROM public_reports`
  )

  const [packagesRow] = await execute(
    `SELECT 
      COUNT(*) AS total_packages,
      SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) AS quarantined_packages,
      SUM(CASE WHEN status = 'missing' THEN 1 ELSE 0 END) AS missing_packages,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_packages,
      SUM(CASE WHEN verify_count > 0 THEN 1 ELSE 0 END) AS verified_packages
    FROM packages`
  )

  const [batchesRow] = await execute('SELECT COUNT(*) AS total_batches FROM batches')
  const [shipmentsRow] = await execute('SELECT COUNT(*) AS total_shipments FROM shipments')

  // Retrieve top recent open alerts
  const [recentAlerts] = await execute(
    `SELECT 
      a.id,
      a.alert_type,
      a.severity,
      a.summary,
      a.status,
      a.package_serial,
      a.reported_store_name,
      a.created_at,
      p.batch_id,
      b.batch_no,
      prod.name AS product_name,
      o.name AS suspect_org_name
    FROM investigation_alerts a
    LEFT JOIN packages p ON a.package_serial = p.serial
    LEFT JOIN batches b ON p.batch_id = b.id
    LEFT JOIN products prod ON b.product_id = prod.id
    LEFT JOIN organizations o ON a.suspect_org_id = o.id
    WHERE a.status IN ('OPEN', 'TRIAGED', 'INVESTIGATING')
    ORDER BY 
      CASE a.severity 
        WHEN 'CRITICAL' THEN 1 
        WHEN 'HIGH' THEN 2 
        WHEN 'MEDIUM' THEN 3 
        WHEN 'LOW' THEN 4 
      END,
      a.created_at DESC
    LIMIT 10`
  )

  // Retrieve top recent open cases
  const [recentCases] = await execute(
    `SELECT 
      c.id,
      c.case_number,
      c.title,
      c.status,
      c.priority,
      c.alert_id,
      c.package_serial,
      c.created_at,
      u.name AS assignee_name,
      (SELECT COUNT(*) FROM investigation_evidence WHERE case_id = c.id) AS evidence_count
    FROM investigation_cases c
    LEFT JOIN users u ON c.assigned_officer_id = u.id
    WHERE c.status IN ('open', 'under_review')
    ORDER BY 
      CASE c.priority 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
      END,
      c.created_at DESC
    LIMIT 10`
  )

  // Retrieve discrepancy packages
  const [discrepantPackages] = await execute(
    `SELECT 
      p.serial,
      p.status,
      p.allocation_type,
      p.verify_count,
      p.current_shipment_ref,
      p.updated_at,
      prod.name AS product_name,
      b.batch_no,
      cust.name AS custodian_name
    FROM packages p
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    LEFT JOIN organizations cust ON p.custodian_org_id = cust.id
    WHERE p.status IN ('quarantined', 'missing', 'rejected')
    ORDER BY p.updated_at DESC
    LIMIT 10`
  )

  return {
    metrics: {
      openAlerts: Number(openAlertsRow[0].total_open || 0),
      highSeverityAlerts: Number(openAlertsRow[0].high_severity || 0),
      openInvestigations: Number(casesRow[0].open_cases || 0),
      totalInvestigations: Number(casesRow[0].total_cases || 0),
      publicReports: Number(reportsRow[0].total_reports || 0),
      pendingReports: Number(reportsRow[0].pending_reports || 0),
      trackedPackages: Number(packagesRow[0].total_packages || 0),
      quarantinedPackages: Number(packagesRow[0].quarantined_packages || 0),
      missingPackages: Number(packagesRow[0].missing_packages || 0),
      rejectedPackages: Number(packagesRow[0].rejected_packages || 0),
      verifiedPackages: Number(packagesRow[0].verified_packages || 0),
      totalBatches: Number(batchesRow[0].total_batches || 0),
      totalShipments: Number(shipmentsRow[0].total_shipments || 0)
    },
    recentAlerts,
    recentCases,
    discrepantPackages
  }
}

/**
 * Filtered activity feed for Investigator Dashboard
 */
export async function getDashboardActivity(filters = {}) {
  const {
    dateFrom,
    dateTo,
    orgId,
    productId,
    batchNo,
    serial,
    eventType,
    limit = 50,
    offset = 0
  } = filters

  const conditions = []
  const params = []

  if (dateFrom) {
    conditions.push('e.created_at >= ?')
    params.push(`${dateFrom} 00:00:00`)
  }
  if (dateTo) {
    conditions.push('e.created_at <= ?')
    params.push(`${dateTo} 23:59:59`)
  }
  if (orgId) {
    conditions.push('(e.actor_org_id = ? OR e.target_org_id = ? OR actor.name LIKE ? OR target.name LIKE ?)')
    params.push(orgId, orgId, `%${orgId}%`, `%${orgId}%`)
  }
  if (serial) {
    conditions.push('e.serial LIKE ?')
    params.push(`%${serial}%`)
  }
  if (eventType && eventType !== 'all') {
    conditions.push('e.event_type = ?')
    params.push(eventType)
  }
  if (batchNo) {
    conditions.push('b.batch_no LIKE ?')
    params.push(`%${batchNo}%`)
  }
  if (productId) {
    conditions.push('(b.product_id = ? OR prod.name LIKE ?)')
    params.push(productId, `%${productId}%`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const [rows] = await execute(
    `SELECT 
      e.id,
      e.serial,
      e.event_type,
      e.actor_org_id,
      e.target_org_id,
      e.shipment_ref,
      e.event_payload,
      e.created_at,
      actor.name AS actor_org_name,
      target.name AS target_org_name,
      p.status AS package_status,
      b.batch_no,
      prod.name AS product_name
    FROM traceability_events e
    JOIN packages p ON e.serial = p.serial
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    LEFT JOIN organizations actor ON e.actor_org_id = actor.id
    LEFT JOIN organizations target ON e.target_org_id = target.id
    ${whereClause}
    ORDER BY e.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  )

  const [countRow] = await execute(
    `SELECT COUNT(*) AS total
    FROM traceability_events e
    JOIN packages p ON e.serial = p.serial
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    LEFT JOIN organizations actor ON e.actor_org_id = actor.id
    LEFT JOIN organizations target ON e.target_org_id = target.id
    ${whereClause}`,
    params
  )

  return {
    events: rows.map(r => ({
      ...r,
      event_payload: typeof r.event_payload === 'string' ? JSON.parse(r.event_payload) : r.event_payload
    })),
    total: Number(countRow[0].total)
  }
}

/**
 * 2. Regulatory Alerts Engine & Management
 */
export async function listAlerts(filters = {}) {
  const {
    status = 'all',
    severity = 'all',
    alertType = 'all',
    packageSerial,
    suspectOrgId,
    search,
    limit = 50,
    offset = 0
  } = filters

  const conditions = []
  const params = []

  if (status && status !== 'all') {
    conditions.push('a.status = ?')
    params.push(status.toUpperCase())
  }
  if (severity && severity !== 'all') {
    conditions.push('a.severity = ?')
    params.push(severity.toUpperCase())
  }
  if (alertType && alertType !== 'all') {
    conditions.push('a.alert_type = ?')
    params.push(alertType)
  }
  if (packageSerial) {
    conditions.push('a.package_serial LIKE ?')
    params.push(`%${packageSerial}%`)
  }
  if (suspectOrgId) {
    conditions.push('a.suspect_org_id = ?')
    params.push(suspectOrgId)
  }
  if (search) {
    conditions.push('(a.summary LIKE ? OR a.details LIKE ? OR a.package_serial LIKE ? OR a.reported_store_name LIKE ?)')
    const s = `%${search}%`
    params.push(s, s, s, s)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const [alerts] = await execute(
    `SELECT 
      a.id,
      a.alert_type,
      a.severity,
      a.suspect_org_id,
      a.reported_store_name,
      a.reported_location,
      a.package_serial,
      a.anomaly_score,
      a.feature_attributions,
      a.summary,
      a.details,
      a.status,
      a.assigned_officer_id,
      a.created_at,
      a.updated_at,
      o.name AS suspect_org_name,
      u.name AS assigned_officer_name,
      p.status AS package_status,
      p.verify_count,
      p.current_shipment_ref,
      b.batch_no,
      prod.name AS product_name,
      prod.strength,
      (
        SELECT JSON_ARRAYAGG(JSON_OBJECT('id', c.id, 'case_number', c.case_number, 'title', c.title, 'status', c.status))
        FROM investigation_cases c
        WHERE c.alert_id = a.id
      ) AS linked_cases
    FROM investigation_alerts a
    LEFT JOIN organizations o ON a.suspect_org_id = o.id
    LEFT JOIN users u ON a.assigned_officer_id = u.id
    LEFT JOIN packages p ON a.package_serial = p.serial
    LEFT JOIN batches b ON p.batch_id = b.id
    LEFT JOIN products prod ON b.product_id = prod.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  )

  const [countRow] = await execute(
    `SELECT COUNT(*) AS total FROM investigation_alerts a ${whereClause}`,
    params
  )

  // Also fetch public reports
  const [reports] = await execute(
    `SELECT 
      r.id,
      r.report_number,
      r.report_type,
      r.package_serial,
      r.reported_store_name,
      r.reported_store_address,
      r.city_district,
      r.description,
      r.status,
      r.created_at,
      p.status AS package_status,
      prod.name AS product_name
    FROM public_reports r
    LEFT JOIN packages p ON r.package_serial = p.serial
    LEFT JOIN batches b ON p.batch_id = b.id
    LEFT JOIN products prod ON b.product_id = prod.id
    ORDER BY r.created_at DESC
    LIMIT 20`
  )

  return {
    alerts: alerts.map(a => ({
      ...a,
      feature_attributions: typeof a.feature_attributions === 'string'
        ? JSON.parse(a.feature_attributions)
        : a.feature_attributions,
      linked_cases: typeof a.linked_cases === 'string'
        ? JSON.parse(a.linked_cases)
        : (a.linked_cases || [])
    })),
    total: Number(countRow[0].total),
    reports
  }
}

export async function getAlertById(alertId) {
  const [rows] = await execute(
    `SELECT 
      a.id,
      a.alert_type,
      a.severity,
      a.suspect_org_id,
      a.reported_store_name,
      a.reported_location,
      a.package_serial,
      a.anomaly_score,
      a.feature_attributions,
      a.summary,
      a.details,
      a.status,
      a.assigned_officer_id,
      a.created_at,
      a.updated_at,
      o.name AS suspect_org_name,
      u.name AS assigned_officer_name,
      p.status AS package_status,
      p.allocation_type,
      p.verify_count,
      p.current_shipment_ref,
      cust.name AS custodian_name,
      b.id AS batch_id,
      b.batch_no,
      DATE_FORMAT(b.mfd, '%Y-%m-%d') AS mfd,
      DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
      b.release_status AS batch_release_status,
      prod.name AS product_name,
      prod.strength
    FROM investigation_alerts a
    LEFT JOIN organizations o ON a.suspect_org_id = o.id
    LEFT JOIN users u ON a.assigned_officer_id = u.id
    LEFT JOIN packages p ON a.package_serial = p.serial
    LEFT JOIN organizations cust ON p.custodian_org_id = cust.id
    LEFT JOIN batches b ON p.batch_id = b.id
    LEFT JOIN products prod ON b.product_id = prod.id
    WHERE a.id = ?`,
    [alertId]
  )

  if (rows.length === 0) return null

  const alert = rows[0]

  const [cases] = await execute(
    `SELECT id, case_number, title, status, priority, created_at
    FROM investigation_cases
    WHERE alert_id = ?
    ORDER BY created_at DESC`,
    [alertId]
  )

  return {
    ...alert,
    feature_attributions: typeof alert.feature_attributions === 'string'
      ? JSON.parse(alert.feature_attributions)
      : alert.feature_attributions,
    linked_cases: cases
  }
}

export async function updateAlertStatus(alertId, newStatus, officerUserId = null) {
  const validStatuses = ['OPEN', 'TRIAGED', 'INVESTIGATING', 'RESOLVED', 'DISMISSED']
  const upperStatus = String(newStatus || '').toUpperCase()
  if (!validStatuses.includes(upperStatus)) {
    throw new Error(`INVALID_ALERT_STATUS: Status must be one of ${validStatuses.join(', ')}`)
  }

  const [existing] = await execute('SELECT id, status, assigned_officer_id FROM investigation_alerts WHERE id = ?', [alertId])
  if (existing.length === 0) {
    throw new Error('ALERT_NOT_FOUND: The requested alert does not exist.')
  }

  const assignedOfficer = officerUserId || existing[0].assigned_officer_id

  await execute(
    'UPDATE investigation_alerts SET status = ?, assigned_officer_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [upperStatus, assignedOfficer, alertId]
  )

  return getAlertById(alertId)
}

/**
 * 3. Evidence-Based Regulatory Detection Rules Engine
 * Evaluates live MariaDB supply chain events and persists new alerts based on strict deterministic rules.
 */
export async function evaluateDetectionRules() {
  const pool = getPool()
  const generatedAlerts = []

  // RULE 1: Duplicate / Repeated Package Scans (CLONED_QR_SUSPECT / DUPLICATE_SCAN_ANOMALY)
  // Scans where verify_count > 1 on a single serialized pack
  const [duplicateScans] = await pool.execute(
    `SELECT 
      p.serial,
      p.verify_count,
      p.custodian_org_id,
      p.status AS package_status,
      b.batch_no,
      prod.name AS product_name
    FROM packages p
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    WHERE p.verify_count > 1`
  )

  for (const pkg of duplicateScans) {
    // Check if an open alert already exists for this serial and duplicate scan rule
    const [existing] = await pool.execute(
      `SELECT id FROM investigation_alerts 
      WHERE package_serial = ? AND alert_type IN ('CLONED_QR_SUSPECT', 'DUPLICATE_SCAN_ANOMALY') 
      AND status IN ('OPEN', 'TRIAGED', 'INVESTIGATING')`,
      [pkg.serial]
    )

    if (existing.length === 0) {
      const alertId = generateId('alt')
      const anomalyScore = Math.min(1.0, 0.7 + (pkg.verify_count * 0.05))
      const summary = `Screening indicator: Repeated verification scans (${pkg.verify_count} scans) on serial ${pkg.serial}`
      const details = `Package ${pkg.serial} (${pkg.product_name}, batch ${pkg.batch_no}) has recorded ${pkg.verify_count} public verification attempts. ` +
        `Repeated scans are operational screening indicators that warrant verification; they are not proof of counterfeiting. ` +
        `Multiple verification events or distinct IP addresses do not establish separate physical locations unless corroborated by verified location evidence.`

      await pool.execute(
        `INSERT INTO investigation_alerts (
          id, alert_type, severity, suspect_org_id, package_serial, anomaly_score, feature_attributions, summary, details, status
        ) VALUES (?, 'DUPLICATE_SCAN_ANOMALY', 'HIGH', ?, ?, ?, ?, ?, ?, 'OPEN')`,
        [
          alertId,
          pkg.custodian_org_id,
          pkg.serial,
          anomalyScore.toFixed(3),
          JSON.stringify({
            rule: 'DUPLICATE_SCAN_ANOMALY',
            screening_indicator: true,
            proof_of_counterfeit: false,
            verify_count: pkg.verify_count,
            package_status: pkg.package_status,
            triggering_evidence: {
              serial: pkg.serial,
              verify_count: pkg.verify_count,
              product: pkg.product_name,
              batch_no: pkg.batch_no
            },
            evaluation_method: 'Deterministic scan frequency threshold. Network/IP diversity does not prove disparate physical locations.'
          }),
          summary,
          details
        ]
      )
      generatedAlerts.push({ id: alertId, rule: 'DUPLICATE_SCAN_ANOMALY', serial: pkg.serial })
    }
  }

  // RULE 2: Shipment Quantity Discrepancy & Shrinkage (SHIPMENT_QUANTITY_DISCREPANCY / SHRINKAGE_SPIKE)
  // Shipments marked reconciliation_required or shipment_packages with missing/damaged/rejected disposition
  const [shipmentDiscrepancies] = await pool.execute(
    `SELECT 
      s.ref AS reference_number,
      s.from_org_id,
      s.to_org_id,
      s.status AS shipment_status,
      sp.package_serial,
      sp.disposition_status,
      sp.disposition_reason,
      from_org.name AS origin_name,
      to_org.name AS destination_name
    FROM shipment_packages sp
    JOIN shipments s ON sp.shipment_ref = s.ref
    JOIN organizations from_org ON s.from_org_id = from_org.id
    JOIN organizations to_org ON s.to_org_id = to_org.id
    WHERE sp.disposition_status IN ('missing', 'damaged', 'rejected')`
  )

  for (const disc of shipmentDiscrepancies) {
    const [existing] = await pool.execute(
      `SELECT id FROM investigation_alerts 
      WHERE package_serial = ? AND alert_type IN ('SHRINKAGE_SPIKE', 'SHIPMENT_QUANTITY_DISCREPANCY') 
      AND status IN ('OPEN', 'TRIAGED', 'INVESTIGATING')`,
      [disc.package_serial]
    )

    if (existing.length === 0) {
      const alertId = generateId('alt')
      const isMissing = disc.disposition_status === 'missing'
      const isDamaged = disc.disposition_status === 'damaged'
      
      let summary = ''
      let details = ''
      let dispositionCategory = ''
      
      if (isMissing) {
        dispositionCategory = 'numerical_shortage'
        summary = `Shipment quantity shortage: Package ${disc.package_serial} missing from shipment ${disc.reference_number}`
        details = `During intake reconciliation of shipment ${disc.reference_number} (${disc.origin_name} -> ${disc.destination_name}), ` +
          `package ${disc.package_serial} was not physically received, establishing a numerical quantity shortage. Discrepancy reason: ${disc.disposition_reason || 'Package unlocated during receiving reconciliation'}.`
      } else if (isDamaged) {
        dispositionCategory = 'physical_condition_damage'
        summary = `Shipment physical condition discrepancy: Package ${disc.package_serial} damaged in shipment ${disc.reference_number}`
        details = `During intake reconciliation of shipment ${disc.reference_number} (${disc.origin_name} -> ${disc.destination_name}), ` +
          `package ${disc.package_serial} was accounted for physically but recorded with packaging/seal damage. Condition finding: ${disc.disposition_reason || 'Tamper seal or packaging compromised'}. Note: This is a package condition finding, not a numerical quantity count mismatch.`
      } else {
        dispositionCategory = 'quality_rejection'
        summary = `Shipment intake rejection: Package ${disc.package_serial} rejected in shipment ${disc.reference_number}`
        details = `During intake reconciliation of shipment ${disc.reference_number} (${disc.origin_name} -> ${disc.destination_name}), ` +
          `package ${disc.package_serial} was accounted for physically but rejected on compliance/quality criteria. Reason: ${disc.disposition_reason || 'Intake criteria not satisfied'}. Note: This is an intake acceptance rejection, not a numerical quantity count mismatch.`
      }

      const severity = isMissing ? 'HIGH' : isDamaged ? 'HIGH' : 'MEDIUM'

      await pool.execute(
        `INSERT INTO investigation_alerts (
          id, alert_type, severity, suspect_org_id, package_serial, anomaly_score, feature_attributions, summary, details, status
        ) VALUES (?, 'SHIPMENT_QUANTITY_DISCREPANCY', ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
        [
          alertId,
          severity,
          disc.to_org_id,
          disc.package_serial,
          isMissing ? '0.850' : '0.650',
          JSON.stringify({
            rule: 'SHIPMENT_QUANTITY_DISCREPANCY',
            disposition_category: dispositionCategory,
            disposition_status: disc.disposition_status,
            shipment_ref: disc.reference_number,
            reason: disc.disposition_reason || null,
            is_numerical_quantity_mismatch: isMissing,
            triggering_evidence: {
              package_serial: disc.package_serial,
              shipment_ref: disc.reference_number,
              disposition_status: disc.disposition_status,
              disposition_reason: disc.disposition_reason || null,
              origin: disc.origin_name,
              destination: disc.destination_name
            },
            evaluation_method: 'Deterministic reconciliation record comparison. Numerical mismatch asserted only when quantity reconciliation establishes shortage.'
          }),
          summary,
          details
        ]
      )
      generatedAlerts.push({ id: alertId, rule: 'SHIPMENT_QUANTITY_DISCREPANCY', serial: disc.package_serial })
    }
  }

  // RULE 3: Government Medicine Diversion Indicators (GOVERNMENT_DIVERSION_INDICATOR)
  // Packages with allocation_type = 'government' that appear in custody of commercial entities or are flagged in public reports
  const [govtDiversions] = await pool.execute(
    `SELECT 
      p.serial,
      p.custodian_org_id,
      p.status AS package_status,
      cust.name AS custodian_name,
      cust.type AS custodian_type,
      b.batch_no,
      prod.name AS product_name
    FROM packages p
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    JOIN organizations cust ON p.custodian_org_id = cust.id
    WHERE p.allocation_type = 'government'
    AND cust.type NOT IN ('government_depot', 'manufacturer')`
  )

  for (const div of govtDiversions) {
    const [existing] = await pool.execute(
      `SELECT id FROM investigation_alerts 
      WHERE package_serial = ? AND alert_type IN ('GOVERNMENT_DIVERSION_ATTEMPT', 'GOVERNMENT_DIVERSION_INDICATOR') 
      AND status IN ('OPEN', 'TRIAGED', 'INVESTIGATING')`,
      [div.serial]
    )

    if (existing.length === 0) {
      const alertId = generateId('alt')
      const summary = `Government allocation diversion indicator: Government medicine in commercial custodian ${div.custodian_name}`
      const details = `Package ${div.serial} (${div.product_name}, batch ${div.batch_no}) is restricted to statutory Government allocation, ` +
        `but physical custody is held by commercial ${div.custodian_type} '${div.custodian_name}'. Suspected illegal diversion of subsidized medicine.`

      await pool.execute(
        `INSERT INTO investigation_alerts (
          id, alert_type, severity, suspect_org_id, package_serial, anomaly_score, feature_attributions, summary, details, status
        ) VALUES (?, 'GOVERNMENT_DIVERSION_INDICATOR', 'CRITICAL', ?, ?, '0.980', ?, ?, ?, 'OPEN')`,
        [
          alertId,
          div.custodian_org_id,
          div.serial,
          JSON.stringify({ rule: 'GOVERNMENT_DIVERSION_INDICATOR', allocation_type: 'government', custodian_type: div.custodian_type }),
          summary,
          details
        ]
      )
      generatedAlerts.push({ id: alertId, rule: 'GOVERNMENT_DIVERSION_INDICATOR', serial: div.serial })
    }
  }

  // Also check public reports for government medicine diversion
  const [publicGovtReports] = await pool.execute(
    `SELECT 
      r.id,
      r.report_number,
      r.package_serial,
      r.reported_store_name,
      r.reported_store_address,
      r.city_district,
      r.description
    FROM public_reports r
    WHERE r.report_type = 'GOVERNMENT_MEDICINE_DIVERSION'
    AND r.status IN ('PENDING', 'INVESTIGATING')`
  )

  for (const rep of publicGovtReports) {
    if (rep.package_serial) {
      const [existing] = await pool.execute(
        `SELECT id FROM investigation_alerts 
        WHERE package_serial = ? AND alert_type = 'GOVERNMENT_DIVERSION_INDICATOR' 
        AND status IN ('OPEN', 'TRIAGED', 'INVESTIGATING')`,
        [rep.package_serial]
      )
      if (existing.length === 0) {
        const alertId = generateId('alt')
        const summary = `Field public report of government medicine diversion at ${rep.reported_store_name}`
        const details = `Public report ${rep.report_number} states government medicine sold commercially at ${rep.reported_store_name} ` +
          `(${rep.reported_store_address}, ${rep.city_district}). Report details: ${rep.description}`

        await pool.execute(
          `INSERT INTO investigation_alerts (
            id, alert_type, severity, package_serial, reported_store_name, reported_location, anomaly_score, feature_attributions, summary, details, status
          ) VALUES (?, 'GOVERNMENT_DIVERSION_INDICATOR', 'CRITICAL', ?, ?, ?, '0.920', ?, ?, ?, 'OPEN')`,
          [
            alertId,
            rep.package_serial,
            rep.reported_store_name,
            `${rep.reported_store_address}, ${rep.city_district}`,
            JSON.stringify({ rule: 'PUBLIC_GOVERNMENT_REPORT', report_number: rep.report_number }),
            summary,
            details
          ]
        )
        generatedAlerts.push({ id: alertId, rule: 'GOVERNMENT_DIVERSION_INDICATOR', serial: rep.package_serial })
      }
    }
  }

  // RULE 4: Broken Custody Chains & Tier Invariants (BROKEN_CUSTODY_HISTORY / SHADOW_DIVERSION_RISK)
  // Packages where current custody is Wholesaler/Pharmacy without prerequisite hops
  const [packagesWithEvents] = await pool.execute(
    `SELECT 
      p.serial,
      p.custodian_org_id,
      p.status,
      cust.type AS custodian_type,
      cust.name AS custodian_name,
      (SELECT COUNT(*) FROM traceability_events WHERE serial = p.serial AND event_type = 'DISPATCHED') AS dispatch_count,
      (SELECT COUNT(*) FROM traceability_events WHERE serial = p.serial AND event_type = 'RECEIVED') AS receive_count
    FROM packages p
    JOIN organizations cust ON p.custodian_org_id = cust.id
    WHERE cust.type IN ('wholesaler', 'pharmacy')`
  )

  for (const pkg of packagesWithEvents) {
    if (pkg.dispatch_count === 0 && pkg.receive_count === 0) {
      const [existing] = await pool.execute(
        `SELECT id FROM investigation_alerts 
        WHERE package_serial = ? AND alert_type IN ('SHADOW_DIVERSION_RISK', 'BROKEN_CUSTODY_HISTORY') 
        AND status IN ('OPEN', 'TRIAGED', 'INVESTIGATING')`,
        [pkg.serial]
      )
      if (existing.length === 0) {
        const alertId = generateId('alt')
        const summary = `Broken custody history: Serial ${pkg.serial} held by ${pkg.custodian_name} without recorded dispatch events`
        const details = `Package ${pkg.serial} has active custody at ${pkg.custodian_type} '${pkg.custodian_name}', but possesses zero ` +
          `upstream DISPATCHED or RECEIVED traceability events. Indicates illegitimate supply chain insertion or shadow transfer.`

        await pool.execute(
          `INSERT INTO investigation_alerts (
            id, alert_type, severity, suspect_org_id, package_serial, anomaly_score, feature_attributions, summary, details, status
          ) VALUES (?, 'BROKEN_CUSTODY_HISTORY', 'HIGH', ?, ?, '0.900', ?, ?, ?, 'OPEN')`,
          [
            alertId,
            pkg.custodian_org_id,
            pkg.serial,
            JSON.stringify({ rule: 'BROKEN_CUSTODY_HISTORY', dispatch_count: pkg.dispatch_count, receive_count: pkg.receive_count }),
            summary,
            details
          ]
        )
        generatedAlerts.push({ id: alertId, rule: 'BROKEN_CUSTODY_HISTORY', serial: pkg.serial })
      }
    }
  }

  // RULE 5: Quarantined / Rejected Package Movement (UNAUTHORIZED_CUSTODY_ACTIVITY)
  const [quarantineAnomalies] = await pool.execute(
    `SELECT 
      p.serial,
      p.status,
      p.custodian_org_id,
      p.current_shipment_ref,
      cust.name AS custodian_name
    FROM packages p
    JOIN organizations cust ON p.custodian_org_id = cust.id
    WHERE p.status IN ('quarantined', 'rejected')
    AND p.current_shipment_ref IS NOT NULL`
  )

  for (const qa of quarantineAnomalies) {
    const [existing] = await pool.execute(
      `SELECT id FROM investigation_alerts 
      WHERE package_serial = ? AND alert_type IN ('UNAUTHORIZED_DISPENSE_ATTEMPT', 'UNAUTHORIZED_CUSTODY_ACTIVITY') 
      AND status IN ('OPEN', 'TRIAGED', 'INVESTIGATING')`,
      [qa.serial]
    )
    if (existing.length === 0) {
      const alertId = generateId('alt')
      const summary = `Unauthorized custody activity: Quarantined/rejected package ${qa.serial} assigned to shipment ${qa.current_shipment_ref}`
      const details = `Package ${qa.serial} holds status '${qa.status}' but is linked to active shipment ${qa.current_shipment_ref}. ` +
        `Quarantined and rejected medicines must remain locked in designated holding facilities.`

      await pool.execute(
        `INSERT INTO investigation_alerts (
          id, alert_type, severity, suspect_org_id, package_serial, anomaly_score, feature_attributions, summary, details, status
        ) VALUES (?, 'UNAUTHORIZED_CUSTODY_ACTIVITY', 'HIGH', ?, ?, '0.880', ?, ?, ?, 'OPEN')`,
        [
          alertId,
          qa.custodian_org_id,
          qa.serial,
          JSON.stringify({ rule: 'UNAUTHORIZED_CUSTODY_ACTIVITY', package_status: qa.status, shipment_ref: qa.current_shipment_ref }),
          summary,
          details
        ]
      )
      generatedAlerts.push({ id: alertId, rule: 'UNAUTHORIZED_CUSTODY_ACTIVITY', serial: qa.serial })
    }
  }

  logger.info('Regulatory anomaly detection rules evaluation complete', { generatedCount: generatedAlerts.length })
  return {
    evaluatedRulesCount: 5,
    newAlertsGenerated: generatedAlerts.length,
    alerts: generatedAlerts
  }
}

/**
 * 4. Traceability Search & Detailed Investigation
 */
export async function searchTraceability(rawQuery) {
  const query = String(rawQuery || '').trim()
  if (!query) {
    return { packages: [], batches: [], shipments: [] }
  }

  // Handle URL format: /verify?serial=... or plain serial
  let cleanQuery = query
  const urlMatch = query.match(/[?&]serial=([^&#\s]+)/i)
  if (urlMatch) {
    cleanQuery = decodeURIComponent(urlMatch[1])
  } else {
    // Strip GS1 AI prefixes like (01) or (21)
    const gs1Match = query.match(/\(21\)([A-Z0-9-]+)/i)
    if (gs1Match) {
      cleanQuery = gs1Match[1]
    }
  }

  const searchParam = `%${cleanQuery}%`

  // 1. Matching packages
  const [packages] = await execute(
    `SELECT 
      p.serial,
      p.status,
      p.allocation_type,
      p.verify_count,
      p.current_shipment_ref,
      p.custodian_org_id,
      p.created_at,
      cust.name AS custodian_name,
      cust.type AS custodian_type,
      b.id AS batch_id,
      b.batch_no,
      prod.id AS product_id,
      prod.name AS product_name,
      prod.strength,
      (
        SELECT COUNT(*) 
        FROM investigation_alerts 
        WHERE package_serial = p.serial AND status IN ('OPEN', 'TRIAGED', 'INVESTIGATING')
      ) AS active_alerts_count
    FROM packages p
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    LEFT JOIN organizations cust ON p.custodian_org_id = cust.id
    WHERE p.serial LIKE ? 
       OR b.batch_no LIKE ? 
       OR prod.name LIKE ? 
       OR prod.generic_name LIKE ?
       OR (p.current_shipment_ref IS NOT NULL AND p.current_shipment_ref LIKE ?)
    ORDER BY p.serial ASC
    LIMIT 50`,
    [searchParam, searchParam, searchParam, searchParam, searchParam]
  )

  // 2. Matching batches
  const [batches] = await execute(
    `SELECT 
      b.id,
      b.batch_no,
      DATE_FORMAT(b.mfd, '%Y-%m-%d') AS mfd,
      DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
      b.quantity,
      b.release_status,
      b.created_at,
      prod.name AS product_name,
      prod.strength,
      prod.generic_name,
      mfg.name AS manufacturer_name
    FROM batches b
    JOIN products prod ON b.product_id = prod.id
    JOIN organizations mfg ON b.manufacturer_id = mfg.id
    WHERE b.batch_no LIKE ? OR prod.name LIKE ? OR prod.generic_name LIKE ?
    ORDER BY b.batch_no ASC
    LIMIT 25`,
    [searchParam, searchParam, searchParam]
  )

  // 3. Matching shipments
  const [shipments] = await execute(
    `SELECT 
      s.ref,
      s.ref AS reference_number,
      s.package_count AS count,
      s.status,
      s.dispatched_at,
      s.received_at,
      from_org.name AS origin_name,
      to_org.name AS destination_name
    FROM shipments s
    JOIN organizations from_org ON s.from_org_id = from_org.id
    JOIN organizations to_org ON s.to_org_id = to_org.id
    WHERE s.ref LIKE ?
       OR from_org.name LIKE ?
       OR to_org.name LIKE ?
    ORDER BY s.dispatched_at DESC
    LIMIT 25`,
    [searchParam, searchParam, searchParam]
  )

  return { packages, batches, shipments }
}

/**
 * Retrieve comprehensive package history and custody transitions
 */
export async function getPackageDetails(rawSerial) {
  const serial = String(rawSerial || '').trim().toUpperCase()
  if (!serial) {
    throw new Error('SERIAL_REQUIRED: Package serial is required.')
  }

  const [rows] = await execute(
    `SELECT 
      p.serial,
      p.status,
      p.allocation_type,
      p.government_allocation_id,
      p.verify_count,
      p.current_shipment_ref,
      p.seizure_status,
      p.seizure_order_ref,
      p.seizure_date,
      p.created_at,
      p.updated_at,
      b.id AS batch_id,
      b.batch_no,
      DATE_FORMAT(b.mfd, '%Y-%m-%d') AS mfd,
      DATE_FORMAT(b.exp, '%Y-%m-%d') AS exp,
      b.release_status AS batch_release_status,
      prod.id AS product_id,
      prod.name AS product_name,
      prod.generic_name,
      prod.strength,
      prod.dosage_form,
      prod.pack_size,
      prod.gtin,
      mfg.id AS manufacturer_id,
      mfg.name AS manufacturer_name,
      mfg.license_number AS manufacturer_license,
      mfg.address AS manufacturer_address,
      cust.id AS custodian_id,
      cust.name AS custodian_name,
      cust.type AS custodian_type,
      cust.license_number AS custodian_license,
      cust.address AS custodian_address
    FROM packages p
    JOIN batches b ON p.batch_id = b.id
    JOIN products prod ON b.product_id = prod.id
    JOIN organizations mfg ON p.manufacturer_org_id = mfg.id
    LEFT JOIN organizations cust ON p.custodian_org_id = cust.id
    WHERE p.serial = ?`,
    [serial]
  )

  if (rows.length === 0) return null

  const pkg = rows[0]

  // Retrieve chronological traceability events
  const [events] = await execute(
    `SELECT 
      e.id,
      e.event_type,
      e.actor_org_id,
      e.target_org_id,
      e.shipment_ref,
      e.event_payload,
      e.created_at,
      actor.name AS actor_name,
      actor.type AS actor_type,
      target.name AS target_name,
      target.type AS target_type
    FROM traceability_events e
    LEFT JOIN organizations actor ON e.actor_org_id = actor.id
    LEFT JOIN organizations target ON e.target_org_id = target.id
    WHERE e.serial = ?
    ORDER BY e.created_at ASC`,
    [serial]
  )

  // Retrieve linked alerts
  const [alerts] = await execute(
    `SELECT id, alert_type, severity, summary, status, created_at
    FROM investigation_alerts
    WHERE package_serial = ?
    ORDER BY created_at DESC`,
    [serial]
  )

  // Retrieve linked public reports
  const [reports] = await execute(
    `SELECT id, report_number, report_type, reported_store_name, status, created_at
    FROM public_reports
    WHERE package_serial = ?
    ORDER BY created_at DESC`,
    [serial]
  )

  return {
    package: {
      serial: pkg.serial,
      status: pkg.status,
      allocationType: pkg.allocation_type,
      verifyCount: pkg.verify_count,
      currentShipmentRef: pkg.current_shipment_ref,
      seizureStatus: pkg.seizure_status,
      seizureOrderRef: pkg.seizure_order_ref,
      seizureDate: pkg.seizure_date,
      createdAt: pkg.created_at,
      updatedAt: pkg.updated_at
    },
    product: {
      id: pkg.product_id,
      name: pkg.product_name,
      genericName: pkg.generic_name,
      strength: pkg.strength,
      dosageForm: pkg.dosage_form,
      packSize: pkg.pack_size,
      gtin: pkg.gtin
    },
    batch: {
      id: pkg.batch_id,
      batchNo: pkg.batch_no,
      mfd: pkg.mfd,
      exp: pkg.exp,
      releaseStatus: pkg.batch_release_status
    },
    manufacturer: {
      id: pkg.manufacturer_id,
      name: pkg.manufacturer_name,
      license: pkg.manufacturer_license,
      address: pkg.manufacturer_address
    },
    custodian: pkg.custodian_id ? {
      id: pkg.custodian_id,
      name: pkg.custodian_name,
      type: pkg.custodian_type,
      license: pkg.custodian_license,
      address: pkg.custodian_address
    } : null,
    timeline: events.map(e => ({
      id: e.id,
      eventType: e.event_type,
      actorName: e.actor_name || e.actor_org_id,
      actorType: e.actor_type,
      targetName: e.target_name || e.target_org_id,
      targetType: e.target_type,
      shipmentRef: e.shipment_ref,
      timestamp: e.created_at,
      details: typeof e.event_payload === 'string' ? JSON.parse(e.event_payload) : e.event_payload
    })),
    alerts,
    reports
  }
}

/**
 * 5. Investigation Case Management
 */
export async function listCases(filters = {}) {
  const {
    status = 'all',
    priority = 'all',
    assigneeId,
    search,
    limit = 50,
    offset = 0
  } = filters

  const conditions = []
  const params = []

  if (status && status !== 'all') {
    conditions.push('c.status = ?')
    params.push(status.toLowerCase())
  }
  if (priority && priority !== 'all') {
    conditions.push('c.priority = ?')
    params.push(priority.toLowerCase())
  }
  if (assigneeId) {
    conditions.push('c.assigned_officer_id = ?')
    params.push(assigneeId)
  }
  if (search) {
    conditions.push('(c.case_number LIKE ? OR c.title LIKE ? OR c.findings LIKE ? OR c.package_serial LIKE ?)')
    const s = `%${search}%`
    params.push(s, s, s, s)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const [cases] = await execute(
    `SELECT 
      c.id,
      c.case_number,
      c.title,
      c.status,
      c.priority,
      c.alert_id,
      c.package_serial,
      c.batch_id,
      c.suspect_org_id,
      c.assigned_officer_id,
      c.findings,
      c.resolution,
      c.closed_at,
      c.created_at,
      c.updated_at,
      assignee.name AS assignee_name,
      creator.name AS creator_name,
      a.summary AS alert_summary,
      a.alert_type,
      b.batch_no,
      prod.name AS product_name,
      org.name AS suspect_org_name,
      (SELECT COUNT(*) FROM investigation_evidence WHERE case_id = c.id) AS evidence_count
    FROM investigation_cases c
    LEFT JOIN users assignee ON c.assigned_officer_id = assignee.id
    LEFT JOIN users creator ON c.created_by_user_id = creator.id
    LEFT JOIN investigation_alerts a ON c.alert_id = a.id
    LEFT JOIN batches b ON c.batch_id = b.id
    LEFT JOIN products prod ON b.product_id = prod.id
    LEFT JOIN organizations org ON c.suspect_org_id = org.id
    ${whereClause}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  )

  const [countRow] = await execute(
    `SELECT COUNT(*) AS total FROM investigation_cases c ${whereClause}`,
    params
  )

  return {
    cases,
    total: Number(countRow[0].total)
  }
}

export async function getCaseById(caseId) {
  const [rows] = await execute(
    `SELECT 
      c.id,
      c.case_number,
      c.title,
      c.status,
      c.priority,
      c.alert_id,
      c.package_serial,
      c.batch_id,
      c.suspect_org_id,
      c.assigned_officer_id,
      c.findings,
      c.resolution,
      c.closed_at,
      c.closed_by_user_id,
      c.created_by_user_id,
      c.created_at,
      c.updated_at,
      assignee.name AS assignee_name,
      assignee.email AS assignee_email,
      creator.name AS creator_name,
      closer.name AS closer_name,
      a.summary AS alert_summary,
      a.alert_type,
      a.severity AS alert_severity,
      b.batch_no,
      prod.name AS product_name,
      org.name AS suspect_org_name,
      p.status AS package_status,
      p.verify_count AS package_verify_count
    FROM investigation_cases c
    LEFT JOIN users assignee ON c.assigned_officer_id = assignee.id
    LEFT JOIN users creator ON c.created_by_user_id = creator.id
    LEFT JOIN users closer ON c.closed_by_user_id = closer.id
    LEFT JOIN investigation_alerts a ON c.alert_id = a.id
    LEFT JOIN packages p ON c.package_serial = p.serial
    LEFT JOIN batches b ON (c.batch_id = b.id OR p.batch_id = b.id)
    LEFT JOIN products prod ON b.product_id = prod.id
    LEFT JOIN organizations org ON c.suspect_org_id = org.id
    WHERE c.id = ?`,
    [caseId]
  )

  if (rows.length === 0) return null

  const caseData = rows[0]

  // Retrieve immutable evidence list
  const [evidence] = await execute(
    `SELECT 
      e.id,
      e.case_id,
      e.evidence_type,
      e.description,
      e.source_ref,
      e.source_entity_type,
      e.source_entity_id,
      e.recorded_by_user_id,
      e.recorded_at,
      u.name AS recorded_by_name
    FROM investigation_evidence e
    JOIN users u ON e.recorded_by_user_id = u.id
    WHERE e.case_id = ?
    ORDER BY e.recorded_at ASC, e.id ASC`,
    [caseId]
  )

  // Retrieve immutable audit log
  const [auditLog] = await execute(
    `SELECT 
      al.id,
      al.case_id,
      al.action,
      al.actor_user_id,
      al.previous_state,
      al.new_state,
      al.notes,
      al.timestamp,
      u.name AS actor_name
    FROM investigation_case_audit_log al
    JOIN users u ON al.actor_user_id = u.id
    WHERE al.case_id = ?
    ORDER BY al.timestamp ASC`,
    [caseId]
  )

  return {
    ...caseData,
    evidence,
    auditLog: auditLog.map(l => ({
      ...l,
      previous_state: typeof l.previous_state === 'string' ? JSON.parse(l.previous_state) : l.previous_state,
      new_state: typeof l.new_state === 'string' ? JSON.parse(l.new_state) : l.new_state
    }))
  }
}

export async function createCase(data, actorUserId) {
  const title = String(data.title || '').trim()
  if (!title) {
    throw new Error('TITLE_REQUIRED: Investigation case title is required.')
  }

  const pool = getPool()
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    const caseId = generateId('case')
    const caseNumber = await generateNextCaseNumber()
    const priority = ['low', 'medium', 'high', 'critical'].includes(data.priority) ? data.priority : 'medium'
    const status = 'open'
    const alertId = data.alertId || null
    let packageSerial = data.packageSerial || null
    let batchId = data.batchId || null
    let suspectOrgId = data.suspectOrgId || null
    const assignedOfficerId = data.assignedOfficerId || actorUserId
    const findings = data.findings ? String(data.findings).trim() : null
    let linkedAlertRecord = null

    // If alertId is provided, pull target package/batch/org from alert
    if (alertId) {
      const [alertRows] = await conn.execute(
        'SELECT id, alert_type, severity, summary, details, package_serial, suspect_org_id FROM investigation_alerts WHERE id = ?',
        [alertId]
      )
      if (alertRows.length > 0) {
        linkedAlertRecord = alertRows[0]
        if (!packageSerial && linkedAlertRecord.package_serial) {
          packageSerial = linkedAlertRecord.package_serial
        }
        if (!suspectOrgId && linkedAlertRecord.suspect_org_id) {
          suspectOrgId = linkedAlertRecord.suspect_org_id
        }
      }
      // Set alert status to INVESTIGATING
      await conn.execute(
        "UPDATE investigation_alerts SET status = 'INVESTIGATING', assigned_officer_id = COALESCE(assigned_officer_id, ?) WHERE id = ?",
        [actorUserId, alertId]
      )
    }

    // Resolve batchId if packageSerial is known and batchId is missing
    if (packageSerial && !batchId) {
      const [pkgRows] = await conn.execute('SELECT batch_id FROM packages WHERE serial = ?', [packageSerial])
      if (pkgRows.length > 0) {
        batchId = pkgRows[0].batch_id
      }
    }

    await conn.execute(
      `INSERT INTO investigation_cases (
        id, case_number, title, status, priority, alert_id, package_serial, batch_id, suspect_org_id, assigned_officer_id, findings, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        caseId,
        caseNumber,
        title,
        status,
        priority,
        alertId,
        packageSerial,
        batchId,
        suspectOrgId,
        assignedOfficerId,
        findings,
        actorUserId
      ]
    )

    // Record immutable audit log
    const auditId = generateId('caud')
    await conn.execute(
      `INSERT INTO investigation_case_audit_log (
        id, case_id, action, actor_user_id, previous_state, new_state, notes
      ) VALUES (?, ?, 'CASE_CREATED', ?, NULL, ?, ?)`,
      [
        auditId,
        caseId,
        actorUserId,
        JSON.stringify({ caseNumber, title, status, priority, alertId, packageSerial, assignedOfficerId }),
        'Initial investigation case opening.'
      ]
    )

    // Automatically record stable system-generated evidence when created from an alert
    if (linkedAlertRecord) {
      const alertEvId = generateId('ev')
      await conn.execute(
        `INSERT INTO investigation_evidence (
          id, case_id, evidence_type, description, source_ref, source_entity_type, source_entity_id, recorded_by_user_id
        ) VALUES (?, ?, 'system_event', ?, ?, 'investigation_alert', ?, ?)`,
        [
          alertEvId,
          caseId,
          linkedAlertRecord.details || linkedAlertRecord.summary,
          `Advisory Alert: ${linkedAlertRecord.alert_type}`,
          linkedAlertRecord.id,
          actorUserId
        ]
      )

      const alertEvAuditId = generateId('caud')
      await conn.execute(
        `INSERT INTO investigation_case_audit_log (
          id, case_id, action, actor_user_id, previous_state, new_state, notes
        ) VALUES (?, ?, 'EVIDENCE_ADDED', ?, NULL, ?, ?)`,
        [
          alertEvAuditId,
          caseId,
          actorUserId,
          JSON.stringify({
            evidenceId: alertEvId,
            evidenceType: 'system_event',
            sourceEntityType: 'investigation_alert',
            sourceEntityId: linkedAlertRecord.id
          }),
          `System evidence recorded from alert: ${linkedAlertRecord.id}`
        ]
      )
    }

    // If initial evidence items are passed, insert them
    if (Array.isArray(data.evidence) && data.evidence.length > 0) {
      for (const ev of data.evidence) {
        const evId = generateId('ev')
        const desc = typeof ev === 'string' ? ev : ev.description
        const evType = (typeof ev === 'object' && ev.evidenceType) ? ev.evidenceType : 'investigator_conclusion'
        const sourceRef = (typeof ev === 'object' && ev.sourceRef) ? ev.sourceRef : null
        const sourceEntityType = (typeof ev === 'object' && ev.sourceEntityType) ? ev.sourceEntityType : null
        const sourceEntityId = (typeof ev === 'object' && ev.sourceEntityId) ? ev.sourceEntityId : null

        await conn.execute(
          `INSERT INTO investigation_evidence (
            id, case_id, evidence_type, description, source_ref, source_entity_type, source_entity_id, recorded_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [evId, caseId, evType, desc, sourceRef, sourceEntityType, sourceEntityId, actorUserId]
        )

        const evAuditId = generateId('caud')
        await conn.execute(
          `INSERT INTO investigation_case_audit_log (
            id, case_id, action, actor_user_id, previous_state, new_state, notes
          ) VALUES (?, ?, 'EVIDENCE_ADDED', ?, NULL, ?, ?)`,
          [
            evAuditId,
            caseId,
            actorUserId,
            JSON.stringify({ evidenceId: evId, evidenceType: evType, description: desc, sourceEntityType, sourceEntityId }),
            `Initial evidence recorded: ${evType}`
          ]
        )
      }
    }

    await conn.commit()
    return getCaseById(caseId)
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function addCaseEvidence(caseId, evidenceData, actorUserId) {
  const { evidenceType, description, sourceRef, sourceEntityType, sourceEntityId } = evidenceData

  const validTypes = ['verified_fact', 'reported_allegation', 'investigator_conclusion', 'system_event', 'custody_record', 'document']
  if (!validTypes.includes(evidenceType)) {
    throw new Error(`INVALID_EVIDENCE_TYPE: evidenceType must be one of ${validTypes.join(', ')}`)
  }

  const cleanDesc = String(description || '').trim()
  if (!cleanDesc) {
    throw new Error('DESCRIPTION_REQUIRED: Evidence description is required.')
  }

  const pool = getPool()
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    const [caseRows] = await conn.execute(
      'SELECT id, status FROM investigation_cases WHERE id = ? FOR UPDATE',
      [caseId]
    )
    if (caseRows.length === 0) {
      throw new Error('CASE_NOT_FOUND: Investigation case does not exist.')
    }

    let validatedEntityType = sourceEntityType ? String(sourceEntityType).trim() : null
    let validatedEntityId = sourceEntityId ? String(sourceEntityId).trim() : null

    // For system-generated evidence linking internal database entities, verify reference integrity
    if (validatedEntityId) {
      if (validatedEntityType === 'traceability_event') {
        const [chk] = await conn.execute('SELECT id FROM traceability_events WHERE id = ?', [validatedEntityId])
        if (chk.length === 0) {
          throw new Error(`REFERENCED_EVENT_NOT_FOUND: Traceability event '${validatedEntityId}' does not exist.`)
        }
      } else if (validatedEntityType === 'package') {
        const [chk] = await conn.execute('SELECT serial FROM packages WHERE serial = ?', [validatedEntityId])
        if (chk.length === 0) {
          throw new Error(`REFERENCED_PACKAGE_NOT_FOUND: Package serial '${validatedEntityId}' does not exist.`)
        }
      } else if (validatedEntityType === 'shipment') {
        const [chk] = await conn.execute('SELECT ref FROM shipments WHERE ref = ?', [validatedEntityId])
        if (chk.length === 0) {
          throw new Error(`REFERENCED_SHIPMENT_NOT_FOUND: Shipment '${validatedEntityId}' does not exist.`)
        }
      } else if (validatedEntityType === 'investigation_alert') {
        const [chk] = await conn.execute('SELECT id FROM investigation_alerts WHERE id = ?', [validatedEntityId])
        if (chk.length === 0) {
          throw new Error(`REFERENCED_ALERT_NOT_FOUND: Investigation alert '${validatedEntityId}' does not exist.`)
        }
      }
    }

    // Physical inspection and external document evidence where no internal event ID exists
    // are preserved without requiring an internal database event.
    const evId = generateId('ev')
    await conn.execute(
      `INSERT INTO investigation_evidence (
        id, case_id, evidence_type, description, source_ref, source_entity_type, source_entity_id, recorded_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [evId, caseId, evidenceType, cleanDesc, sourceRef || null, validatedEntityType, validatedEntityId, actorUserId]
    )

    const auditId = generateId('caud')
    await conn.execute(
      `INSERT INTO investigation_case_audit_log (
        id, case_id, action, actor_user_id, previous_state, new_state, notes
      ) VALUES (?, ?, 'EVIDENCE_ADDED', ?, NULL, ?, ?)`,
      [
        auditId,
        caseId,
        actorUserId,
        JSON.stringify({
          evidenceId: evId,
          evidenceType,
          description: cleanDesc,
          sourceRef,
          sourceEntityType: validatedEntityType,
          sourceEntityId: validatedEntityId
        }),
        `Attached evidence of type: ${evidenceType}`
      ]
    )

    await conn.commit()

    const [evRows] = await execute(
      `SELECT e.id, e.case_id, e.evidence_type, e.description, e.source_ref, e.source_entity_type, e.source_entity_id, e.recorded_by_user_id, e.recorded_at, u.name AS recorded_by_name
      FROM investigation_evidence e
      JOIN users u ON e.recorded_by_user_id = u.id
      WHERE e.id = ?`,
      [evId]
    )
    return evRows[0]
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

export async function updateCase(caseId, updateData, actorUserId) {
  const pool = getPool()
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    const [existingRows] = await conn.execute(
      'SELECT * FROM investigation_cases WHERE id = ? FOR UPDATE',
      [caseId]
    )
    if (existingRows.length === 0) {
      throw new Error('CASE_NOT_FOUND: Investigation case does not exist.')
    }

    const cur = existingRows[0]
    const updates = []
    const params = []
    const actionsTaken = []

    if (updateData.title !== undefined && updateData.title.trim()) {
      updates.push('title = ?')
      params.push(updateData.title.trim())
      actionsTaken.push(`Title updated to "${updateData.title.trim()}"`)
    }

    if (updateData.priority !== undefined && ['low', 'medium', 'high', 'critical'].includes(updateData.priority)) {
      updates.push('priority = ?')
      params.push(updateData.priority)
      actionsTaken.push(`Priority changed to ${updateData.priority}`)
    }

    if (updateData.assignedOfficerId !== undefined) {
      updates.push('assigned_officer_id = ?')
      params.push(updateData.assignedOfficerId || null)
      actionsTaken.push(`Assignee changed to ${updateData.assignedOfficerId || 'Unassigned'}`)
    }

    if (updateData.findings !== undefined) {
      updates.push('findings = ?')
      params.push(updateData.findings.trim())
      actionsTaken.push('Investigation findings updated')
    }

    if (updateData.resolution !== undefined) {
      updates.push('resolution = ?')
      params.push(updateData.resolution ? updateData.resolution.trim() : null)
      actionsTaken.push('Case resolution notes recorded')
    }

    if (updateData.status !== undefined && ['open', 'under_review', 'resolved', 'closed'].includes(updateData.status)) {
      const nextStatus = updateData.status
      updates.push('status = ?')
      params.push(nextStatus)

      if (['resolved', 'closed'].includes(nextStatus)) {
        updates.push('closed_at = CURRENT_TIMESTAMP', 'closed_by_user_id = ?')
        params.push(actorUserId)
        actionsTaken.push(`Case transitioned to ${nextStatus}`)
      } else if (['resolved', 'closed'].includes(cur.status) && ['open', 'under_review'].includes(nextStatus)) {
        updates.push('closed_at = NULL', 'closed_by_user_id = NULL')
        actionsTaken.push(`Case reopened to ${nextStatus}`)
      }
    }

    if (updates.length === 0) {
      await conn.rollback()
      return getCaseById(caseId)
    }

    const sql = `UPDATE investigation_cases SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    params.push(caseId)
    await conn.execute(sql, params)

    // Record immutable audit log
    const auditId = generateId('caud')
    await conn.execute(
      `INSERT INTO investigation_case_audit_log (
        id, case_id, action, actor_user_id, previous_state, new_state, notes
      ) VALUES (?, ?, 'CASE_UPDATED', ?, ?, ?, ?)`,
      [
        auditId,
        caseId,
        actorUserId,
        JSON.stringify({
          title: cur.title,
          status: cur.status,
          priority: cur.priority,
          assignedOfficerId: cur.assigned_officer_id,
          findings: cur.findings,
          resolution: cur.resolution
        }),
        JSON.stringify(updateData),
        actionsTaken.join('; ')
      ]
    )

    await conn.commit()
    return getCaseById(caseId)
  } catch (err) {
    await conn.rollback()
    throw err
  } finally {
    conn.release()
  }
}

/**
 * 6. Officers Directory for Case Assignment
 */
export async function listOfficers() {
  const [rows] = await execute(
    `SELECT id, name, email, role, status
    FROM users
    WHERE role IN ('investigator', 'admin') AND status = 'active'
    ORDER BY name ASC`
  )
  return rows
}
