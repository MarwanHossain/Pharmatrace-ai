// PharmaTrace AI — Regulatory Investigation & Enforcement Controller
// Milestone M8 Implementation
import * as investigatorService from '../services/investigator.service.js'
import { logger } from '../utils/logger.js'

export async function getDashboard(req, res, next) {
  try {
    const summary = await investigatorService.getDashboardSummary()
    res.json({
      success: true,
      data: summary
    })
  } catch (err) {
    logger.error('Failed to retrieve investigator dashboard summary', { error: err.message, userId: req.user?.id })
    next(err)
  }
}

export async function getActivity(req, res, next) {
  try {
    const result = await investigatorService.getDashboardActivity(req.query)
    res.json({
      success: true,
      data: result
    })
  } catch (err) {
    logger.error('Failed to retrieve investigator activity feed', { error: err.message, query: req.query })
    next(err)
  }
}

export async function getAlerts(req, res, next) {
  try {
    const result = await investigatorService.listAlerts(req.query)
    res.json({
      success: true,
      data: result
    })
  } catch (err) {
    logger.error('Failed to list regulatory alerts', { error: err.message, query: req.query })
    next(err)
  }
}

export async function getAlert(req, res, next) {
  try {
    const alert = await investigatorService.getAlertById(req.params.id)
    if (!alert) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ALERT_NOT_FOUND',
          message: 'The requested alert does not exist.'
        }
      })
    }
    res.json({
      success: true,
      data: alert
    })
  } catch (err) {
    logger.error('Failed to get alert by id', { error: err.message, alertId: req.params.id })
    next(err)
  }
}

export async function updateAlertStatus(req, res, next) {
  try {
    const { status } = req.body
    const updated = await investigatorService.updateAlertStatus(req.params.id, status, req.user?.id)
    res.json({
      success: true,
      data: updated
    })
  } catch (err) {
    if (err.message?.startsWith('INVALID_ALERT_STATUS')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ALERT_STATUS', message: err.message }
      })
    }
    if (err.message?.startsWith('ALERT_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: { code: 'ALERT_NOT_FOUND', message: err.message }
      })
    }
    logger.error('Failed to update alert status', { error: err.message, alertId: req.params.id })
    next(err)
  }
}

export async function runAlertScan(req, res, next) {
  try {
    const result = await investigatorService.evaluateDetectionRules()
    res.json({
      success: true,
      data: result
    })
  } catch (err) {
    logger.error('Failed to run regulatory detection rules scan', { error: err.message })
    next(err)
  }
}

export async function searchTraceability(req, res, next) {
  try {
    const query = req.query.q || req.query.query || ''
    const results = await investigatorService.searchTraceability(query)
    res.json({
      success: true,
      data: results
    })
  } catch (err) {
    logger.error('Failed to execute traceability search', { error: err.message, query: req.query })
    next(err)
  }
}

export async function getPackageDetails(req, res, next) {
  try {
    const details = await investigatorService.getPackageDetails(req.params.serial)
    if (!details) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PACKAGE_NOT_FOUND',
          message: 'The specified serial could not be found in the supply chain registry.'
        }
      })
    }
    res.json({
      success: true,
      data: details
    })
  } catch (err) {
    if (err.message?.startsWith('SERIAL_REQUIRED')) {
      return res.status(400).json({
        success: false,
        error: { code: 'SERIAL_REQUIRED', message: err.message }
      })
    }
    logger.error('Failed to get package details', { error: err.message, serial: req.params.serial })
    next(err)
  }
}

export async function getCases(req, res, next) {
  try {
    const result = await investigatorService.listCases(req.query)
    res.json({
      success: true,
      data: result
    })
  } catch (err) {
    logger.error('Failed to list investigation cases', { error: err.message, query: req.query })
    next(err)
  }
}

export async function getCase(req, res, next) {
  try {
    const caseData = await investigatorService.getCaseById(req.params.id)
    if (!caseData) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CASE_NOT_FOUND',
          message: 'The requested investigation case does not exist.'
        }
      })
    }
    res.json({
      success: true,
      data: caseData
    })
  } catch (err) {
    logger.error('Failed to get investigation case', { error: err.message, caseId: req.params.id })
    next(err)
  }
}

export async function createCase(req, res, next) {
  try {
    const created = await investigatorService.createCase(req.body, req.user?.id)
    res.status(201).json({
      success: true,
      data: created
    })
  } catch (err) {
    if (err.message?.startsWith('TITLE_REQUIRED')) {
      return res.status(400).json({
        success: false,
        error: { code: 'TITLE_REQUIRED', message: err.message }
      })
    }
    logger.error('Failed to create investigation case', { error: err.message, body: req.body })
    next(err)
  }
}

export async function updateCase(req, res, next) {
  try {
    const updated = await investigatorService.updateCase(req.params.id, req.body, req.user?.id)
    res.json({
      success: true,
      data: updated
    })
  } catch (err) {
    if (err.message?.startsWith('CASE_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: { code: 'CASE_NOT_FOUND', message: err.message }
      })
    }
    logger.error('Failed to update investigation case', { error: err.message, caseId: req.params.id })
    next(err)
  }
}

export async function addCaseEvidence(req, res, next) {
  try {
    const evidence = await investigatorService.addCaseEvidence(req.params.id, req.body, req.user?.id)
    res.status(201).json({
      success: true,
      data: evidence
    })
  } catch (err) {
    if (
      err.message?.startsWith('INVALID_EVIDENCE_TYPE') ||
      err.message?.startsWith('DESCRIPTION_REQUIRED') ||
      err.message?.startsWith('REFERENCED_')
    ) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_EVIDENCE_INPUT', message: err.message }
      })
    }
    if (err.message?.startsWith('CASE_NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: { code: 'CASE_NOT_FOUND', message: err.message }
      })
    }
    logger.error('Failed to add case evidence', { error: err.message, caseId: req.params.id })
    next(err)
  }
}

export async function getOfficers(req, res, next) {
  try {
    const officers = await investigatorService.listOfficers()
    res.json({
      success: true,
      data: officers
    })
  } catch (err) {
    logger.error('Failed to list officers', { error: err.message })
    next(err)
  }
}
