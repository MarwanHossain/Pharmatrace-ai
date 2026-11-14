// PharmaTrace AI — Document Upload Middleware & Storage Management
// Conforms to Revision 3.2 §1.2 & §4.1 specifications
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { logger } from '../utils/logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Storage directory outside web root
export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads/documents')

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

// Allowed MIME types and corresponding extensions
export const ALLOWED_MIME_TYPES = new Map([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png']
])

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB

/**
 * Custom disk storage with randomized UUID filenames
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ALLOWED_MIME_TYPES.get(file.mimetype) || ''
    const safeExt = ['.pdf', '.jpg', '.jpeg', '.png'].includes(ext)
      ? ext
      : ALLOWED_MIME_TYPES.get(file.mimetype) || '.bin'
    const uniqueName = `${crypto.randomUUID()}${safeExt}`
    cb(null, uniqueName)
  }
})

/**
 * Filter to reject unpermitted MIME types before saving to disk
 */
function fileFilter(_req, file, cb) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true)
  } else {
    const err = new Error(`Unsupported file type: ${file.mimetype}. Allowed types: application/pdf, image/jpeg, image/png.`)
    err.code = 'INVALID_MIME_TYPE'
    cb(err, false)
  }
}

export const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 10
  },
  fileFilter
})

/**
 * Express middleware wrapping multer upload.any() to handle errors cleanly.
 */
export function handleDocumentUpload(req, res, next) {
  upload.any()(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            error: {
              code: 'FILE_TOO_LARGE',
              message: `Uploaded file exceeds the maximum limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`
            }
          })
        }
        return res.status(400).json({
          success: false,
          error: {
            code: 'UPLOAD_ERROR',
            message: err.message
          }
        })
      }

      if (err.code === 'INVALID_MIME_TYPE') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: err.message
          }
        })
      }

      return res.status(400).json({
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: err.message || 'File upload failed.'
        }
      })
    }

    next()
  })
}

/**
 * Computes SHA-256 hash of a file on disk.
 *
 * @param {string} filePath
 * @returns {Promise<string>} Hexadecimal SHA-256 digest
 */
export async function computeFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = fs.createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * Atomically cleans up uploaded files if a transaction fails or validation rejects.
 *
 * @param {Array<{path: string}>} files
 */
export async function cleanupFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return
  for (const file of files) {
    if (file && file.path) {
      try {
        await fs.promises.unlink(file.path)
      } catch (err) {
        // File might not exist if upload failed midway, log only if not ENOENT
        if (err.code !== 'ENOENT') {
          logger.warn('Failed to delete uploaded file during cleanup', {
            path: file.path,
            error: err.message
          })
        }
      }
    }
  }
}
