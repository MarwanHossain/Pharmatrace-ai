// PharmaTrace AI — Password Security & Utilities Test Suite
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import bcrypt from 'bcrypt'
import {
  validatePassword,
  hashPassword,
  comparePassword,
  getDummyHash,
  compareConstantTime,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
  BCRYPT_SALT_ROUNDS
} from '../src/utils/passwords.js'

describe('Password Security Utilities (Revision 3.2 §1.2 & §4.1)', () => {
  test('Rejects passwords shorter than 10 characters', () => {
    const shortPasswords = ['', 'Ab1!', 'Short1!', 'P@ssw0r']
    for (const pwd of shortPasswords) {
      const res = validatePassword(pwd)
      assert.equal(res.valid, false)
      assert.match(res.error, /at least 10 characters/i)
    }
  })

  test('Accepts valid password with minimum 10 characters and full character diversity', () => {
    const valid = 'Valid10Pass!'
    assert.equal(valid.length, 12)
    const res = validatePassword(valid)
    assert.equal(res.valid, true)
    assert.equal(res.error, undefined)
  })

  test('Enforces character diversity: requires uppercase, lowercase, digit, and symbol', () => {
    assert.equal(validatePassword('nouppercase123!').valid, false)
    assert.equal(validatePassword('NOLOWERCASE123!').valid, false)
    assert.equal(validatePassword('NoDigitsHere!@#').valid, false)
    assert.equal(validatePassword('NoSymbols123456').valid, false)
  })

  test('Enforces maximum 72 UTF-8 bytes limit without silent truncation', () => {
    // 72 ASCII characters (72 bytes) -> valid if character diversity met
    const exactly72Bytes = 'A'.repeat(68) + 'a1!#'
    assert.equal(Buffer.byteLength(exactly72Bytes, 'utf8'), 72)
    assert.equal(validatePassword(exactly72Bytes).valid, true)

    // 73 ASCII characters (73 bytes) -> must be rejected
    const exceeds72Bytes = 'A'.repeat(69) + 'a1!#'
    assert.equal(Buffer.byteLength(exceeds72Bytes, 'utf8'), 73)
    const res = validatePassword(exceeds72Bytes)
    assert.equal(res.valid, false)
    assert.match(res.error, /maximum length of 72 UTF-8 bytes/i)

    // Multi-byte UTF-8 test (each Bengali character is 3 bytes)
    // 10 chars = 30 bytes -> valid length & byte count
    const multiByteValid = 'ঔ' + 'ValidPassword123!#'
    assert.equal(validatePassword(multiByteValid).valid, true)

    // Multi-byte string that exceeds 72 bytes even with fewer than 72 characters
    const multiByteExcess = 'ঔ'.repeat(24) + 'Valid1!#' // 24*3 = 72 + 8 = 80 bytes
    assert.ok(Buffer.byteLength(multiByteExcess, 'utf8') > 72)
    assert.equal(validatePassword(multiByteExcess).valid, false)
  })

  test('Hashes password with bcrypt cost factor 12', async () => {
    const password = 'SecurePassword2026!#'
    const hash = await hashPassword(password)

    assert.ok(hash.startsWith('$2b$12$') || hash.startsWith('$2a$12$'))
    const rounds = parseInt(hash.split('$')[2], 10)
    assert.equal(rounds, BCRYPT_SALT_ROUNDS)
    assert.equal(rounds, 12)

    // Verify comparison succeeds
    const isMatch = await comparePassword(password, hash)
    assert.equal(isMatch, true)

    // Verify incorrect password comparison fails
    const isWrong = await comparePassword('IncorrectPassword123!#', hash)
    assert.equal(isWrong, false)
  })

  test('Malformed or invalid hash strings return false without throwing or crashing', async () => {
    assert.equal(await comparePassword('Password123!#', 'not-a-hash'), false)
    assert.equal(await comparePassword('Password123!#', null), false)
    assert.equal(await comparePassword('Password123!#', undefined), false)
    assert.equal(await comparePassword('Password123!#', '$2b$12$corruptedhashdata'), false)
  })

  test('Dummy hash is generated dynamically at cost 12 from high-entropy random secret', async () => {
    const dummy = await getDummyHash()
    assert.ok(typeof dummy === 'string')
    assert.ok(dummy.startsWith('$2b$12$') || dummy.startsWith('$2a$12$'))

    // Repeated call returns cached instance
    const dummy2 = await getDummyHash()
    assert.equal(dummy, dummy2)

    // Constant time comparison against null/missing hash runs dummy comparison and returns false
    const match = await compareConstantTime('AnyPassword123!#', null)
    assert.equal(match, false)
  })
})
