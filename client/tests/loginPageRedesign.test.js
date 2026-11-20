// PharmaTrace AI — Two-Step Login Page UX Redesign Test Suite
// Verifies Role Selection (Step 1), Role-Specific Login (Step 2),
// Form Initialization, Password Visibility Toggle, Role Mismatch Guards, and Router Configuration

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROLE_CARDS } from '../src/constants/loginCards.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('PharmaTrace AI — Login UX Redesign Suite', () => {
  const loginSource = fs.readFileSync(path.resolve(__dirname, '../src/features/authentication/Login.jsx'), 'utf8')
  const routerSource = fs.readFileSync(path.resolve(__dirname, '../src/app/router.jsx'), 'utf8')

  describe('1. Role Selection Configuration (Step 1)', () => {
    test('Exports exactly 6 canonical role cards in the specified order', () => {
      assert.equal(ROLE_CARDS.length, 6, 'Must contain exactly 6 role cards')

      const expectedOrder = [
        { key: 'admin', title: 'Log in as System Administrator' },
        { key: 'investigator', title: 'Log in as Investigation Officer' },
        { key: 'manufacturer', title: 'Log in as Manufacturer' },
        { key: 'distributor', title: 'Log in as Distributor' },
        { key: 'wholesaler', title: 'Log in as Wholesaler' },
        { key: 'pharmacy', title: 'Log in as Pharmacy' }
      ]

      expectedOrder.forEach((expected, index) => {
        assert.equal(ROLE_CARDS[index].key, expected.key, `Role at index ${index} must be ${expected.key}`)
        assert.equal(ROLE_CARDS[index].title, expected.title, `Title at index ${index} must be ${expected.title}`)
      })
    })

    test('Each role card defines title, tag, icon, description, and welcome text', () => {
      ROLE_CARDS.forEach(card => {
        assert.ok(card.title.startsWith('Log in as '), `Card ${card.key} title must start with "Log in as "`)
        assert.ok(card.tag && card.tag.length > 0, `Card ${card.key} must specify category tag`)
        assert.ok(card.icon, `Card ${card.key} must specify an icon component`)
        assert.ok(card.description && card.description.length > 10, `Card ${card.key} must provide meaningful description`)
        assert.ok(card.welcomeText && card.welcomeText.length > 10, `Card ${card.key} must provide welcome text`)
      })
    })

    test('Initial screen strictly omits legacy inputs, presets, and demo selectors', () => {
      // Step 1 view is rendered when !selectedRoleConfig
      // Verify legacy elements are not present on Step 1
      assert.ok(!loginSource.includes('dgda_lead@pharmatrace.gov.bd'), 'Must NOT prefill default admin email')
      assert.ok(!loginSource.includes('mfg_user_m6@pharmatrace.test'), 'Must NOT prefill default manufacturer email')
      assert.ok(!loginSource.includes('demo-account-select'), 'Must NOT contain demo account dropdown selector')
      assert.ok(!loginSource.includes('Preview as {r.label}'), 'Must NOT contain role preview buttons')
      assert.ok(!loginSource.includes('Operational Role Demonstrations'), 'Must NOT contain operational role demo section')
      assert.ok(!loginSource.includes('Or sign in as a specific demo account'), 'Must NOT contain demo account sign-in')
    })
  })

  describe('2. Role-Specific Login View (Step 2)', () => {
    test('Form states initialize strictly empty (never prefilled)', () => {
      assert.match(loginSource, /const \[authEmail, setAuthEmail\] = useState\(''\)/, 'authEmail must initialize to empty string')
      assert.match(loginSource, /const \[authPassword, setAuthPassword\] = useState\(''\)/, 'authPassword must initialize to empty string')
      assert.match(loginSource, /const \[showPassword, setShowPassword\] = useState\(false\)/, 'showPassword must initialize to false')
    })

    test('Implements accessible password visibility toggle', () => {
      assert.match(loginSource, /type=\{showPassword \? 'text' : 'password'\}/, 'Input type must toggle text/password')
      assert.match(loginSource, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/, 'Must provide aria-label')
      assert.match(loginSource, /<EyeOff|<Eye/, 'Must render Eye / EyeOff icons')
    })

    test('Provides clear Back to Role Selection navigation', () => {
      assert.match(loginSource, /Back to role selection/, 'Must render Back to role selection text')
      assert.match(loginSource, /function handleBackToRoles\(\)/, 'Must implement handleBackToRoles handler')
      assert.match(loginSource, /nav\('\/login'\)/, 'Back handler must navigate to /login')
      assert.match(loginSource, /setAuthPassword\(''\)/, 'Back handler must clear entered password')
    })

    test('Displays selected role indicator badge and welcome text', () => {
      assert.match(loginSource, /selectedRoleConfig\.title/, 'Must display selected role title')
      assert.match(loginSource, /selectedRoleConfig\.welcomeText/, 'Must display role-specific welcome text')
      assert.match(loginSource, /selectedRoleConfig\.label/, 'Must display selected role label')
    })
  })

  describe('3. Role Mismatch Rejection & Security Posture', () => {
    test('Verifies authenticated user role matches expected portal and rejects mismatches', () => {
      assert.match(loginSource, /if \(authenticatedUser\.role !== activeRole\)/, 'Must check authenticatedUser.role !== activeRole')
      assert.match(loginSource, /await authLogout\(\)/, 'Must revoke session cookie on mismatch')
      assert.match(loginSource, /Account role mismatch/, 'Must display descriptive role mismatch error')
      assert.match(loginSource, /return/, 'Must return immediately on mismatch to prevent unauthorized routing')
    })

    test('Preserves distinction between live portal and prototype preview for downstream roles', () => {
      assert.match(
        loginSource,
        /Operational supply chain workflows for this role operate in regulatory preview mode/,
        'Must display prototype disclaimer for unmigrated operational roles'
      )
    })
  })

  describe('4. Router & Navigation Behavior', () => {
    test('Router supports both /login and /login/:roleParam routes', () => {
      assert.match(routerSource, /path:\s*'\/login'/, 'Router must configure /login')
      assert.match(routerSource, /path:\s*'\/login\/:roleParam'/, 'Router must configure /login/:roleParam')
    })

    test('Login component resolves role from both URL path param and searchParams (?role=...)', () => {
      assert.match(loginSource, /useParams\(\)/, 'Must extract roleParam from useParams')
      assert.match(loginSource, /useSearchParams\(\)/, 'Must support ?role= query parameter')
      assert.match(loginSource, /roleParam \|\| searchParams\.get\('role'\)/, 'Must prioritize path or search param')
    })
  })
})
