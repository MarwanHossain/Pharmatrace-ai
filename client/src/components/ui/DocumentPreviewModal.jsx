// PharmaTrace AI — Secure Regulatory Document Inline Preview Modal
// Supports authenticated inline rendering of PDF, JPEG, and PNG documents with sandbox isolation

import { useState, useEffect } from 'react'
import { X, Download, FileText, Loader2, AlertCircle, EyeOff } from 'lucide-react'
import { Button } from './index'

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDocType(type) {
  if (!type) return 'Regulatory Document'
  return String(type)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, l => l.toUpperCase())
}

const PREVIEWABLE_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

export default function DocumentPreviewModal({
  open,
  isOpen,
  onClose,
  title = 'Document',
  documentTitle,
  documentType = '',
  mimeType = '',
  fileSizeBytes = 0,
  onDownload,
  fetchBlob,
  onFetchBlob
}) {
  const isModalOpen = Boolean(open ?? isOpen)
  const displayTitle = title !== 'Document' ? title : (documentTitle || title)
  const resolveFetchBlob = fetchBlob ?? onFetchBlob

  const [blobUrl, setBlobUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  const isPreviewable = PREVIEWABLE_TYPES.includes(mimeType)

  useEffect(() => {
    let currentBlobUrl = null
    let active = true

    if (isModalOpen && isPreviewable && typeof resolveFetchBlob === 'function') {
      setLoading(true)
      setError('')
      setBlobUrl(null)

      resolveFetchBlob()
        .then(blob => {
          if (!active) return
          if (!blob) throw new Error('Received empty document content from server.')
          const url = URL.createObjectURL(blob)
          currentBlobUrl = url
          setBlobUrl(url)
        })
        .catch(err => {
          if (!active) return
          setError(err.message || 'Failed to load document preview.')
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }

    return () => {
      active = false
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl)
      }
    }
  }, [isModalOpen, isPreviewable, resolveFetchBlob])

  if (!isModalOpen) return null

  async function handleDownloadClick() {
    if (!onDownload || downloading) return
    setDownloading(true)
    try {
      await onDownload()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-preview-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 backdrop-blur-sm p-4 sm:p-6"
    >
      <div className="flex flex-col w-full max-w-4xl max-h-[90vh] bg-white rounded-xl shadow-2xl border border-line overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-surface">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-white border border-line text-navy shrink-0">
              <FileText size={18} />
            </div>
            <div className="min-w-0">
              <h3 id="document-preview-title" className="text-sm font-bold text-navy truncate">
                {displayTitle}
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-muted">
                <span>{formatDocType(documentType)}</span>
                <span>•</span>
                <span>{formatFileSize(fileSizeBytes)}</span>
                <span>•</span>
                <span className="font-mono">{mimeType}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onDownload && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadClick}
                disabled={downloading}
                className="gap-1.5 text-xs font-semibold text-navy"
              >
                {downloading ? (
                  <>
                    <Loader2 size={13} className="animate-spin text-navy" />
                    <span>Downloading...</span>
                  </>
                ) : (
                  <>
                    <Download size={13} className="text-navy" />
                    <span>Download</span>
                  </>
                )}
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="p-1.5 rounded-md text-muted hover:text-navy hover:bg-slate-100 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-5 overflow-auto min-h-[360px] flex items-center justify-center bg-slate-50/50">
          {!isPreviewable ? (
            <div className="text-center max-w-md p-6 bg-white rounded-lg border border-line shadow-sm space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-soft border border-amber-line flex items-center justify-center text-amber-ink">
                <EyeOff size={22} />
              </div>
              <h4 className="text-sm font-bold text-navy">Inline Preview Not Supported</h4>
              <p className="text-xs text-muted leading-relaxed">
                Inline document rendering is permitted for PDF and standard image files (JPEG, PNG).
                This file format (<span className="font-mono text-ink font-semibold">{mimeType || 'unknown'}</span>) can be reviewed by downloading it to your local device.
              </p>
              {onDownload && (
                <Button onClick={handleDownloadClick} disabled={downloading} className="gap-1.5 text-xs font-semibold">
                  <Download size={13} />
                  <span>Download Document</span>
                </Button>
              )}
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-muted">
              <Loader2 size={28} className="animate-spin text-navy" />
              <span className="text-xs font-medium">Decrypting and streaming document preview...</span>
            </div>
          ) : error ? (
            <div className="text-center max-w-md p-6 bg-white rounded-lg border border-quarantine-line shadow-sm space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-quarantine-soft border border-quarantine-line flex items-center justify-center text-quarantine">
                <AlertCircle size={22} />
              </div>
              <h4 className="text-sm font-bold text-quarantine">Preview Unavailable</h4>
              <p className="text-xs text-slate-700 leading-relaxed">{error}</p>
              {onDownload && (
                <Button variant="outline" onClick={handleDownloadClick} className="gap-1.5 text-xs font-semibold">
                  <Download size={13} />
                  <span>Attempt Direct Download</span>
                </Button>
              )}
            </div>
          ) : blobUrl && mimeType === 'application/pdf' ? (
            <iframe
              src={blobUrl}
              title={title}
              className="w-full h-[68vh] rounded-lg border border-line bg-white shadow-sm"
            />
          ) : blobUrl && (mimeType === 'image/jpeg' || mimeType === 'image/png') ? (
            <div className="flex items-center justify-center w-full max-h-[68vh] overflow-auto rounded-lg border border-line bg-white p-2 shadow-sm">
              <img
                src={blobUrl}
                alt={title}
                className="max-h-[64vh] max-w-full object-contain rounded"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
