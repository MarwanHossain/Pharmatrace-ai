#!/usr/bin/env node
// PharmaTrace AI — Interactive Administrator Credential Rotation CLI
// Conforms to Revision 3.2 §1.2 & §4.1 specifications
import readline from 'readline'
import { Writable } from 'stream'
import { getPool } from '../config/database.js'
import { validatePassword, hashPassword, comparePassword } from '../utils/passwords.js'
import { logger } from '../utils/logger.js'

function promptMasked(promptText) {
  return new Promise((resolve) => {
    let muted = false
    const mutableStdout = new Writable({
      write: function (chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding)
        }
        callback()
      }
    })

    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true
    })

    process.stdout.write(promptText)
    muted = true

    rl.question('', (answer) => {
      muted = false
      process.stdout.write('\n')
      rl.close()
      resolve(answer)
    })
  })
}

async function rotate() {
  const targetEmail = process.argv[2] || 'dgda_lead@pharmatrace.gov.bd'

  console.log('\n================================================================================')
  console.log('PharmaTrace AI — Secure Administrator Credential Rotation')
  console.log('================================================================================')
  console.log(`Target Administrator Account : ${targetEmail}`)
  console.log('Policy: Min 10 chars, upper, lower, digit, special symbol, max 72 bytes.')
  console.log('Input is masked and never echoed to the terminal or logs.\n')

  // Enforce secure masked input availability
  if (!process.stdin.isTTY) {
    console.error('SECURITY ENFORCEMENT: Non-interactive terminal (non-TTY) detected.')
    console.error('Masked password input cannot be guaranteed in this environment.')
    console.error('Credential rotation must be executed directly in an interactive user terminal:')
    console.error('  cd D:\\pharmatrace-ai\\server')
    console.error('  node src/scripts/rotateAdminPassword.js\n')
    process.exit(1)
  }

  const newPassword = await promptMasked('Enter new administrator password: ')
  const confirmPassword = await promptMasked('Confirm new administrator password: ')

  if (newPassword !== confirmPassword) {
    console.error('\nError: Password entries do not match.')
    process.exit(1)
  }

  const validation = validatePassword(newPassword)
  if (!validation.valid) {
    console.error(`\nError: Password policy violation: ${validation.error}`)
    process.exit(1)
  }

  console.log('\nHashing replacement password using Bcrypt (Cost 12)...')
  const newHash = await hashPassword(newPassword)

  console.log('Updating database record within an atomic transaction...')
  const pool = getPool()
  const connection = await pool.getConnection()

  try {
    await connection.beginTransaction()

    // 1. Verify target user exists
    const [users] = await connection.query(
      'SELECT id, email, role, status, token_version FROM users WHERE email = ? FOR UPDATE',
      [targetEmail]
    )

    if (users.length === 0) {
      throw new Error(`Administrator account ${targetEmail} not found.`)
    }

    const user = users[0]
    const previousTokenVersion = user.token_version || 1
    const nextTokenVersion = previousTokenVersion + 1

    // 2. Update password hash and increment token version
    await connection.query(
      `UPDATE users 
       SET password_hash = ?, 
           token_version = ?, 
           failed_login_attempts = 0, 
           locked_until = NULL, 
           updated_at = NOW() 
       WHERE id = ?`,
      [newHash, nextTokenVersion, user.id]
    )

    // 3. Verify that the new hash validates without exposing it
    const isValid = await comparePassword(newPassword, newHash)
    if (!isValid) {
      throw new Error('Immediate cryptographic self-verification failed.')
    }

    await connection.commit()

    logger.info('Administrator credentials rotated successfully', {
      userId: user.id,
      email: targetEmail,
      previousTokenVersion,
      newTokenVersion: nextTokenVersion
    })

    console.log('\n================================================================================')
    console.log('✓ Credential rotation completed successfully.')
    console.log(`✓ Active token version incremented from v${previousTokenVersion} to v${nextTokenVersion}.`)
    console.log('✓ All prior active sessions and JWT tokens have been invalidated.')
    console.log('✓ Account role, status, and profile associations preserved.')
    console.log('================================================================================\n')
  } catch (err) {
    await connection.rollback()
    console.error('\nTransaction rolled back. Rotation failed:', err.message)
    process.exit(1)
  } finally {
    connection.release()
  }

  process.exit(0)
}

rotate().catch(err => {
  console.error('Fatal rotation error:', err.message)
  process.exit(1)
})
