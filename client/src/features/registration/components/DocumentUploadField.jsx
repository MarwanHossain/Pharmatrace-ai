// PharmaTrace AI — Document Upload Field Component
// Enforces PDF/JPEG/PNG formats, 10MB size limit, max 10 files, and document type tagging
import { useState, useRef } from 'react'
import { UploadCloud, FileText, Image as ImageIcon, X, AlertCircle } from 'lucide-react'
import {
  DOCUMENT_TYPES,
  ALLOWED_MIME_TYPES,
  ALLOWED_FILE_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_SUBMISSION
} from '../../../services/registrationApi'

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getDefaultDocTypeForCategory(category, classification) {
  if (category === 'manufacturer') return 'MANUFACTURING_LICENSE'
  if (category === 'pharmacy') {
    return classification === 'GOVERNMENT' ? 'DGHS_FACILITY_GAZETTE' : 'DRUG_LICENSE'
  }
  if (category === 'wholesaler') return 'WHOLESALE_LICENSE'
  if (category === 'distributor') return 'DRUG_LICENSE'
  return 'OTHER'
}

export default function DocumentUploadField({
  files = [],
  onChange,
  category = 'manufacturer',
  classification = 'NOT_APPLICABLE',
  required = true,
  disabled = false,
  error = null
}) {
  const [dragActive, setDragActive] = useState(false)
  const [localError, setLocalError] = useState(null)
  const fileInputRef = useRef(null)

  function validateAndAddFiles(incomingFileList) {
    setLocalError(null)
    const newItems = []
    const existingCount = files.length
    const incomingArray = Array.from(incomingFileList || [])

    if (existingCount + incomingArray.length > MAX_FILES_PER_SUBMISSION) {
      setLocalError(`You can upload a maximum of ${MAX_FILES_PER_SUBMISSION} documents in total.`)
      return
    }

    const defaultDocType = getDefaultDocTypeForCategory(category, classification)

    for (const file of incomingArray) {
      // Validate MIME type
      const ext = `.${file.name.split('.').pop().toLowerCase()}`
      const isValidMime = ALLOWED_MIME_TYPES.includes(file.type)
      const isValidExt = ALLOWED_FILE_EXTENSIONS.includes(ext)

      if (!isValidMime && !isValidExt) {
        setLocalError(`"${file.name}" has an unsupported format. Only PDF, JPEG, and PNG files are accepted.`)
        return
      }

      // Validate file size (10MB limit)
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setLocalError(`"${file.name}" exceeds the 10 MB maximum file size limit (${formatFileSize(file.size)}).`)
        return
      }

      // Check duplicates
      const isDuplicate = files.some(
        f => f.file.name === file.name && f.file.size === file.size
      )
      if (isDuplicate) {
        setLocalError(`"${file.name}" is already selected.`)
        continue
      }

      newItems.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        documentType: defaultDocType
      })
    }

    if (newItems.length > 0) {
      onChange([...files, ...newItems])
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (disabled) return
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files)
    }
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setDragActive(true)
  }

  function handleDragLeave(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
  }

  function handleFileSelect(e) {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files)
      e.target.value = '' // Reset input
    }
  }

  function handleRemoveFile(idToRemove) {
    onChange(files.filter(item => item.id !== idToRemove))
    setLocalError(null)
  }

  function handleDocTypeChange(id, newType) {
    onChange(
      files.map(item => (item.id === id ? { ...item, documentType: newType } : item))
    )
  }

  const activeError = localError || error

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-semibold text-navy">
          Supporting Verification Documents
          {required && <span className="ml-1 text-quarantine">*</span>}
        </label>
        <span className="text-xs text-muted">
          {files.length} / {MAX_FILES_PER_SUBMISSION} uploaded
        </span>
      </div>

      <p className="text-xs text-muted">
        Upload regulatory licenses, certificates, or gazettes. PDF, JPEG, or PNG up to 10 MB each.
      </p>

      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-label="Upload verification documents"
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-navy focus:ring-offset-1 ${
          dragActive
            ? 'border-navy bg-blue-50/50'
            : 'border-line hover:border-navy/60 hover:bg-surface/50'
        } ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-50' : 'bg-white'}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled}
        />
        <UploadCloud className="h-8 w-8 text-muted mb-2" />
        <div className="text-sm font-medium text-navy">
          Drag and drop files here, or <span className="text-clinical underline">browse</span>
        </div>
        <div className="mt-1 text-xs text-muted">
          PDF, JPEG, or PNG (max 10 MB per file, up to 10 files)
        </div>
      </div>

      {/* Error alert */}
      {activeError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-quarantine-line bg-quarantine-soft p-3 text-xs text-quarantine"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{activeError}</span>
        </div>
      )}

      {/* Selected files list */}
      {files.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-white shadow-sm" aria-label="Selected documents">
          {files.map((item) => {
            const isPdf = item.file.type === 'application/pdf' || item.file.name.toLowerCase().endsWith('.pdf')
            return (
              <li
                key={item.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 text-sm hover:bg-slate-50/50 transition"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isPdf ? (
                    <FileText className="h-5 w-5 text-quarantine flex-shrink-0" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-clinical flex-shrink-0" />
                  )}
                  <div className="min-w-0 truncate">
                    <div className="font-medium text-ink truncate" title={item.file.name}>
                      {item.file.name}
                    </div>
                    <div className="text-xs text-muted">
                      {formatFileSize(item.file.size)} • {isPdf ? 'PDF' : 'Image'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <label htmlFor={`doctype-${item.id}`} className="sr-only">
                    Document Type for {item.file.name}
                  </label>
                  <select
                    id={`doctype-${item.id}`}
                    value={item.documentType}
                    onChange={(e) => handleDocTypeChange(item.id, e.target.value)}
                    disabled={disabled}
                    className="rounded border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink focus:border-navy focus:outline-none focus:ring-1 focus:ring-navy"
                  >
                    {DOCUMENT_TYPES.map(dt => (
                      <option key={dt.value} value={dt.value}>
                        {dt.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => handleRemoveFile(item.id)}
                    disabled={disabled}
                    aria-label={`Remove ${item.file.name}`}
                    className="rounded p-1 text-muted hover:bg-slate-100 hover:text-quarantine transition disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
