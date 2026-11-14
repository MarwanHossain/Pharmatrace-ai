// PharmaTrace AI — Secure Initial Administrator Bootstrap CLI
// Conforms to Revision 3.2 Security Blueprint
import readline from 'readline'
import crypto from 'crypto'
import { getPool, closeDatabasePool } from '../config/database.js'
import { validatePassword, hashPassword } from '../utils/passwords.js'
import { logger } from '../utils/logger.js'

/**
 * Reads a password securely from stdin with character masking when running in a TTY.
 *
 * @param {string} promptText
 * @returns {Promise<string>}
 */
function promptPassword(promptText) {
  return new Promise((resolve, reject) => {
    process.stdout.write(promptText)
    const stdin = process.stdin

    if (!stdin.isTTY) {
      // Non-interactive / piped input
      const rl = readline.createInterface({ input: stdin, output: process.stdout, terminal: false })
      rl.once('line', line => {
        rl.close()
        resolve(line.trim())
      })
      rl.once('error', reject)
      return
    }

    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    let password = ''

    const onData = ch => {
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        stdin.setRawMode(false)
        stdin.pause()
        stdin.removeListener('data', onData)
        process.stdout.write('\n')
        resolve(password)
      } else if (ch === '\u0003') {
        // Ctrl+C
        stdin.setRawMode(false)
        stdin.pause()
        process.stdout.write('\nAborted.\n')
        process.exit(1)
      } else if (ch === '\b' || ch === '\x7f') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1)
          process.stdout.write('\b \b')
        }
      } else {
        password += ch
        process.stdout.write('*')
      }
    }

    stdin.on('data', onData)
  })
}

/**
 * Prompts for plaintext input.
 *
 * @param {string} query
 * @returns {Promise<string>}
 */
function promptText(query) {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
    rl.question(query, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

export async function bootstrapAdmin(options = {}) {
  // Reject insecure CLI password flags
  const rawArgs = process.argv.slice(2)
  for (const arg of rawArgs) {
    if (/^(--password|-p|--pwd)/i.test(arg)) {
      console.error(
        'SECURITY REJECTION: Passwords must NEVER be provided via command-line arguments.\n' +
        'Use the interactive masked prompt or inject BOOTSTRAP_ADMIN_PASSWORD securely via environment.'
      )
      process.exit(1)
    }
  }

  const pool = getPool()
  const connection = await pool.getConnection()

  try {
    // 1. Verify if an admin account already exists
    const [existingAdmins] = await connection.query(
      "SELECT id, email FROM users WHERE role = 'admin' LIMIT 1"
    )

    if (existingAdmins.length > 0) {
      console.log(`[BOOTSTRAP ABORTED] An administrator account already exists (${existingAdmins[0].email}).`)
      return { created: false, message: 'Administrator already exists' }
    }

    // 2. Determine target administrator email
    let email = options.email
    if (!email) {
      const emailArg = rawArgs.find(a => a.startsWith('--email='))
      if (emailArg) {
        email = emailArg.split('=')[1].trim()
      } else if (process.stdin.isTTY) {
        email = await promptText('Enter DGDA Administrator Email [admin@dgda.gov.bd]: ')
      }
    }
    if (!email) {
      email = 'admin@dgda.gov.bd'
    }

    // 3. Obtain password securely
    let password = options.password || process.env.BOOTSTRAP_ADMIN_PASSWORD
    if (!password) {
      if (!process.stdin.isTTY) {
        throw new Error(
          'Non-interactive environment detected. Provide BOOTSTRAP_ADMIN_PASSWORD environment variable.'
        )
      }

      password = await promptPassword('Enter Administrator Password: ')
      const confirm = await promptPassword('Confirm Administrator Password: ')

      if (password !== confirm) {
        throw new Error('Passwords do not match.')
      }
    }

    // 4. Validate password policy (Revision 3.2 §4.1: min 10 chars, max 72 bytes, upper/lower/digit/symbol)
    const validation = validatePassword(password)
    if (!validation.valid) {
      throw new Error(`Password policy violation: ${validation.error}`)
    }

    // 5. Global DGDA regulator does not bind to a supply-chain participant
    const orgId = null

    // 6. Hash password with bcrypt cost 12
    const passwordHash = await hashPassword(password)
    const adminId = `usr-admin-${crypto.randomBytes(8).toString('hex')}`

    // 7. Insert administrator in transaction
    await connection.beginTransaction()

    await connection.query(
      `INSERT INTO users (
        id, org_id, name, email, password_hash, role, status, token_version, failed_login_attempts
      ) VALUES (?, ?, ?, ?, ?, 'admin', 'active', 1, 0)`,
      [adminId, orgId, 'DGDA Lead Administrator', email.toLowerCase().trim(), passwordHash]
    )

    await connection.commit()

    console.log(`[BOOTSTRAP SUCCESS] Initial administrator account created successfully for '${email}'.`)
    return { created: true, id: adminId, email }
  } catch (err) {
    await connection.rollback()
    console.error(`[BOOTSTRAP FAILED] ${err.message}`)
    throw err
  } finally {
    connection.release()
  }
}

// Allow direct CLI execution
const isMain = process.argv[1] && process.argv[1].endsWith('bootstrapAdmin.js')
if (isMain) {
  bootstrapAdmin()
    .then(async () => {
      await closeDatabasePool()
      process.exit(0)
    })
    .catch(async () => {
      await closeDatabasePool()
      process.exit(1)
    })
}
