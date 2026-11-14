#!/usr/bin/env node
// PharmaTrace AI — Schema Migration CLI Runner
import { runMigrations, getMigrationStatus } from './migrator.js'
import { logger } from '../utils/logger.js'

async function main() {
  const args = process.argv.slice(2)
  const isStatus = args.includes('--status')

  try {
    if (isStatus) {
      const statusList = await getMigrationStatus()
      console.log('\n================================================================================')
      console.log('PharmaTrace AI — Database Migration Status')
      console.log('================================================================================')
      console.table(statusList.map(s => ({
        Version: s.version,
        Migration: s.filename,
        Status: s.status,
        ExecutedAt: s.executedAt ? new Date(s.executedAt).toISOString() : '—'
      })))
      console.log('================================================================================\n')
      process.exit(0)
    }

    logger.info('Starting PharmaTrace AI database migration...')
    const result = await runMigrations()

    console.log('\n================================================================================')
    console.log('PharmaTrace AI — Migration Execution Summary')
    console.log('================================================================================')
    console.log(`Total Available Migrations : ${result.totalAvailable}`)
    console.log(`Newly Applied Migrations   : ${result.applied.length}`)
    console.log(`Already Skipped Migrations : ${result.skipped.length}`)
    if (result.applied.length > 0) {
      console.log('\nNewly Applied:')
      result.applied.forEach(m => console.log(`  ✓ ${m.filename}`))
    }
    console.log('================================================================================\n')

    process.exit(0)
  } catch (err) {
    logger.error('Fatal migration failure:', { message: err.message })
    process.exit(1)
  }
}

main()
