// PharmaTrace AI — Regulatory Investigation & Enforcement API Client
// Connects investigator dashboard, alerts, search, and cases to live MariaDB backend
import { apiRequest } from './api.js'

function buildQueryString(params = {}) {
  const query = new URLSearchParams()
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '' && val !== 'all') {
      query.set(key, String(val))
    }
  }
  const str = query.toString()
  return str ? `?${str}` : ''
}

export async function getDashboard() {
  const res = await apiRequest('/v1/investigator/dashboard')
  return res.data || res
}

export async function getActivity(params = {}) {
  const qs = buildQueryString(params)
  const res = await apiRequest(`/v1/investigator/activity${qs}`)
  return res.data || res
}

export async function getAlerts(params = {}) {
  const qs = buildQueryString(params)
  const res = await apiRequest(`/v1/investigator/alerts${qs}`)
  return res.data || res
}

export async function getAlert(id) {
  const res = await apiRequest(`/v1/investigator/alerts/${encodeURIComponent(id)}`)
  return res.data || res
}

export async function updateAlertStatus(id, status) {
  const res = await apiRequest(`/v1/investigator/alerts/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  })
  return res.data || res
}

export async function runAlertScan() {
  const res = await apiRequest('/v1/investigator/alerts/scan', {
    method: 'POST'
  })
  return res.data || res
}

export async function searchTraceability(query) {
  const q = encodeURIComponent(query || '')
  const res = await apiRequest(`/v1/investigator/search?q=${q}`)
  return res.data || res
}

export async function getPackageDetails(serial) {
  const s = encodeURIComponent(serial || '')
  const res = await apiRequest(`/v1/investigator/packages/${s}`)
  return res.data || res
}

export async function getCases(params = {}) {
  const qs = buildQueryString(params)
  const res = await apiRequest(`/v1/investigator/cases${qs}`)
  return res.data || res
}

export async function getCase(id) {
  const res = await apiRequest(`/v1/investigator/cases/${encodeURIComponent(id)}`)
  return res.data || res
}

export async function createCase(data) {
  const res = await apiRequest('/v1/investigator/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return res.data || res
}

export async function updateCase(id, data) {
  const res = await apiRequest(`/v1/investigator/cases/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return res.data || res
}

export async function addCaseEvidence(id, data) {
  const res = await apiRequest(`/v1/investigator/cases/${encodeURIComponent(id)}/evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return res.data || res
}

export async function getOfficers() {
  const res = await apiRequest('/v1/investigator/officers')
  return res.data || res
}
