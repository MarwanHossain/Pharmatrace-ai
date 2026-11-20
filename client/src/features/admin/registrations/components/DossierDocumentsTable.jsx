// PharmaTrace AI — Dossier Documents Table Component
// Displays regulatory documents with verified metadata and triggers authenticated secure preview & downloads

import { useState } from 'react'
import { FileText, Download, Eye, AlertCircle, Loader2 } from 'lucide-react'
import {
  downloadRegistrationDocument,
  fetchRegistrationDocumentBlob
} from '../../../../services/adminRegistrationApi'
import { DocumentPreviewModal } from '../../../../components/ui'

const PREVIEWABLE_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png']

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatDocType(type) {
  if (!type) return 'Other Document'
  return String(type)
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, l => l.toUpperCase())
}

export default function DossierDocumentsTable({ registrationId, documents = [] }) {
  const [downloadingId, setDownloadingId] = useState(null)
  const [downloadError, setDownloadError] = useState('')
  const [previewDoc, setPreviewDoc] = useState(null)

  async function handleDownload(doc) {
    setDownloadError('')
    setDownloadingId(doc.id)
    try {
      await downloadRegistrationDocument(registrationId, doc.id, doc.originalFilename)
    } catch (err) {
      setDownloadError(`Failed to download ${doc.originalFilename}: ${err.message}`)
    } finally {
      setDownloadingId(null)
    }
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surface p-6 text-center text-xs text-muted">
        No documents uploaded for this application.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {downloadError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded border border-quarantine-line bg-quarantine-soft p-3 text-xs font-medium text-quarantine"
        >
          <AlertCircle size={15} className="shrink-0" />
          <span>{downloadError}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-line bg-surface font-semibold uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2.5">Document Type</th>
              <th className="px-4 py-2.5">Filename</th>
              <th className="px-4 py-2.5">Format</th>
              <th className="px-4 py-2.5">Size</th>
              <th className="px-4 py-2.5">Version</th>
              <th className="px-4 py-2.5">Upload Date</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {documents.map(doc => {
              const isDownloading = downloadingId === doc.id
              const canPreview = PREVIEWABLE_MIME_TYPES.includes(doc.mimeType)

              return (
                <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-navy">
                    <div className="flex items-center gap-2">
                      <FileText size={15} className="text-muted shrink-0" />
                      <span>{formatDocType(doc.documentType)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink font-medium">{doc.originalFilename}</td>
                  <td className="px-4 py-3 text-muted">
                    <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                      {doc.mimeType === 'application/pdf' ? 'PDF' : doc.mimeType?.includes('image') ? 'IMAGE' : doc.mimeType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{formatFileSize(doc.fileSizeBytes)}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                      v{doc.submissionVersion || 1}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      {canPreview ? (
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          aria-label={`Preview ${doc.originalFilename}`}
                          className="inline-flex items-center gap-1 rounded border border-line bg-white px-2.5 py-1 text-xs font-semibold text-navy transition hover:bg-slate-100 shadow-sm"
                        >
                          <Eye size={13} className="text-navy" />
                          <span>Preview</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-muted italic px-1">Download only</span>
                      )}

                      <button
                        type="button"
                        disabled={isDownloading}
                        onClick={() => handleDownload(doc)}
                        aria-label={`Download ${doc.originalFilename}`}
                        className="inline-flex items-center gap-1 rounded border border-line bg-white px-2.5 py-1 text-xs font-semibold text-navy transition hover:bg-slate-100 disabled:opacity-50 shadow-sm"
                      >
                        {isDownloading ? (
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
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Document Inline Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          open={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          title={previewDoc.originalFilename}
          documentType={previewDoc.documentType}
          mimeType={previewDoc.mimeType}
          fileSizeBytes={previewDoc.fileSizeBytes}
          onDownload={() => handleDownload(previewDoc)}
          fetchBlob={() => fetchRegistrationDocumentBlob(registrationId, previewDoc.id)}
        />
      )}
    </div>
  )
}
