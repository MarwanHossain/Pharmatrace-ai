// PharmaTrace AI — Health Check & Express Reliability Integration Tests
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { app } from '../src/app.js'
import { closeDatabasePool } from '../src/config/database.js'

let server = null
let baseUrl = ''

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl)
    const reqOptions = {
      method: options.method || 'GET',
      headers: options.headers || {}
    }

    const req = http.request(url, reqOptions, res => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', chunk => {
        body += chunk
      })
      res.on('end', () => {
        let json = null
        try {
          json = JSON.parse(body)
        } catch {
          // Keep raw body
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          json
        })
      })
    })

    req.on('error', reject)

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body))
    }
    req.end()
  })
}

describe('Health Check & Express Reliability Endpoints', () => {
  before(async () => {
    // Bind to port 0 to allocate an ephemeral free port
    server = http.createServer(app)
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    baseUrl = `http://127.0.0.1:${port}`
  })

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve))
    }
    await closeDatabasePool()
  })

  test('GET /api/health returns 200 with service health status and uptime', async () => {
    const res = await request('/api/health')

    assert.equal(res.status, 200)
    assert.equal(res.json.status, 'healthy')
    assert.equal(res.json.service, 'pharmatrace-api')
    assert.equal(typeof res.json.uptimeSeconds, 'number')
    assert.ok(res.json.timestamp, 'timestamp must be present')
  })

  test('GET /api/health/db returns structured status for MariaDB connection', async () => {
    const res = await request('/api/health/db')

    // Response must be either 200 (if MariaDB is active) or 503 (if unreachable)
    assert.ok(res.status === 200 || res.status === 503, `Unexpected status code: ${res.status}`)

    if (res.status === 200) {
      assert.equal(res.json.status, 'healthy')
      assert.equal(res.json.database.connected, true)
      assert.equal(res.json.database.status, 'ready')
    } else {
      assert.equal(res.json.status, 'unhealthy')
      assert.equal(res.json.database.connected, false)
      assert.equal(res.json.database.status, 'disconnected')
      assert.equal(res.json.message, 'Database service is unavailable')
    }

    // Security check: response MUST NOT leak credentials, passwords, or internal DB host
    const responseString = JSON.stringify(res.json)
    assert.equal(responseString.includes('password'), false, 'Response must not contain password')
    assert.equal(responseString.includes('DB_PASSWORD'), false, 'Response must not contain DB_PASSWORD')
    assert.equal(responseString.includes('127.0.0.1'), false, 'Response must not expose database host')
  })

  test('GET /api/nonexistent-route returns 404 Not Found in JSON format', async () => {
    const res = await request('/api/nonexistent-route')

    assert.equal(res.status, 404)
    assert.equal(res.json.error, 'NOT_FOUND')
    assert.ok(res.json.message.includes('Cannot GET /api/nonexistent-route'))
  })

  test('POST with malformed JSON body returns 400 Bad Request cleanly without crashing', async () => {
    const res = await request('/api/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ malformed json: not valid '
    })

    assert.equal(res.status, 400)
    assert.equal(res.json.error, 'BAD_REQUEST')
    assert.equal(res.json.message, 'Malformed JSON payload in request body.')
  })
})
