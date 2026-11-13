import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, FileCode2, FileImage, Printer } from 'lucide-react'
import { Button, Modal } from '../ui'
import PackageLabelCard from './PackageLabelCard'
import {
  buildBatchLabelSheetHtml,
  buildPackageLabelSvgString,
  exportPackageLabelPngBlob,
  generatePackageQrSvg,
  triggerBlobDownload
} from '../../services/qrGenerator'

function ensurePrintRoot() {
  if (typeof document === 'undefined') return null
  let root = document.getElementById('pt-print-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'pt-print-root'
    document.body.appendChild(root)
  }
  return root
}

const MAX_MODAL_PREVIEW = 60

export default function LabelSheetModal({ open, labels = [], title = 'Package Labels', onClose }) {
  const [busyAction, setBusyAction] = useState('')
  const [printItems, setPrintItems] = useState(null)
  const [err, setErr] = useState('')

  const printRoot = ensurePrintRoot()

  useEffect(() => {
    if (!open) {
      setPrintItems(null)
      setBusyAction('')
      setErr('')
    }
  }, [open])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    function handleAfterPrint() {
      setPrintItems(null)
    }
    window.addEventListener('afterprint', handleAfterPrint)
    return () => window.removeEventListener('afterprint', handleAfterPrint)
  }, [])

  const isSingle = labels.length === 1
  const singleMeta = isSingle ? labels[0] : null
  const previewLabels = labels.slice(0, MAX_MODAL_PREVIEW)

  async function handleDownloadSvg() {
    if (!singleMeta || busyAction) return
    setBusyAction('svg')
    setErr('')
    try {
      const svg = await buildPackageLabelSvgString(singleMeta)
      triggerBlobDownload(
        new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }),
        `PharmaTrace-Label-${singleMeta.serial}.svg`
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to export SVG label.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleDownloadPng() {
    if (!singleMeta || busyAction) return
    setBusyAction('png')
    setErr('')
    try {
      const { blob } = await exportPackageLabelPngBlob(singleMeta)
      triggerBlobDownload(blob, `PharmaTrace-Label-${singleMeta.serial}.png`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to export PNG label.')
    } finally {
      setBusyAction('')
    }
  }

  async function handleDownloadBatchHtml() {
    if (labels.length === 0 || busyAction) return
    setBusyAction('sheet')
    setErr('')
    try {
      const html = await buildBatchLabelSheetHtml(labels, { title })
      const safeSlug = (labels[0]?.batchNo || 'batch').replace(/[^A-Za-z0-9_-]/g, '')
      triggerBlobDownload(
        new Blob([html], { type: 'text/html;charset=utf-8' }),
        `PharmaTrace-Labels-${safeSlug}-${labels.length}.html`
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to generate batch label sheet.')
    } finally {
      setBusyAction('')
    }
  }

  async function handlePrint() {
    if (labels.length === 0 || busyAction) return
    setBusyAction('print')
    setErr('')
    try {
      const prepared = await Promise.all(
        labels.map(async item => {
          const { svg } = await generatePackageQrSvg(item.serial, { width: 120 })
          return { ...item, qrSvg: svg }
        })
      )
      setPrintItems(prepared)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (typeof window !== 'undefined' && typeof window.print === 'function') {
            window.print()
          }
          setBusyAction('')
        })
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to prepare print sheet.')
      setBusyAction('')
    }
  }

  const printPortal =
    printRoot && Array.isArray(printItems) && printItems.length > 0
      ? createPortal(
          <div className={printItems.length === 1 ? 'pt-print-single' : 'pt-print-grid'}>
            {printItems.map(item => {
              const titleLine = [item.productName, item.strength].filter(Boolean).join(' ')
              const formLine = [item.dosageForm, item.packSize].filter(Boolean).join(' · ')
              const dateLine = [
                item.mfd ? `MFD ${item.mfd}` : '',
                item.exp ? `EXP ${item.exp}` : ''
              ]
                .filter(Boolean)
                .join(' · ')

              return (
                <article
                  key={item.serial}
                  className="pt-label-card"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3mm',
                    border: '1px solid #CBD5E1',
                    borderRadius: '6px',
                    padding: '3mm',
                    minHeight: '40mm',
                    background: '#FFFFFF'
                  }}
                >
                  <div
                    className="pt-label-qr"
                    style={{
                      width: '25mm',
                      height: '25mm',
                      flex: '0 0 25mm',
                      background: '#FFFFFF'
                    }}
                    dangerouslySetInnerHTML={{ __html: item.qrSvg }}
                  />
                  <div style={{ minWidth: 0, flex: 1, fontSize: '9.5px', lineHeight: 1.3 }}>
                    <div style={{ fontSize: '8px', fontWeight: 700, color: '#059669', letterSpacing: '0.06em' }}>
                      PHARMATRACE AI
                    </div>
                    {titleLine && (
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F2A4A' }}>
                        {titleLine}
                      </div>
                    )}
                    {formLine && <div style={{ color: '#475569' }}>{formLine}</div>}
                    {item.batchNo && (
                      <div style={{ fontWeight: 600, color: '#1E293B', marginTop: '2px' }}>
                        Batch {item.batchNo}
                      </div>
                    )}
                    {dateLine && <div style={{ color: '#1E293B' }}>{dateLine}</div>}
                    {item.manufacturerName && (
                      <div style={{ color: '#475569' }}>{item.manufacturerName}</div>
                    )}
                    <div
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#0F2A4A',
                        marginTop: '3px',
                        wordBreak: 'break-all'
                      }}
                    >
                      {item.serial}
                    </div>
                    <div style={{ fontSize: '7.5px', color: '#64748B', marginTop: '2px' }}>
                      Scan QR to verify journey. QR alone does not prove authenticity.
                    </div>
                  </div>
                </article>
              )
            })}
          </div>,
          printRoot
        )
      : null

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={`${title} (${labels.length})`}
        actions={
          <>
            <Button variant="secondary" type="button" onClick={onClose}>
              Close
            </Button>
            {isSingle && (
              <>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={handleDownloadSvg}
                >
                  <FileCode2 size={14} aria-hidden="true" />
                  {busyAction === 'svg' ? 'Exporting...' : 'Download SVG'}
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={handleDownloadPng}
                >
                  <FileImage size={14} aria-hidden="true" />
                  {busyAction === 'png' ? 'Exporting...' : 'Download PNG'}
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              type="button"
              disabled={labels.length === 0 || Boolean(busyAction)}
              onClick={handleDownloadBatchHtml}
            >
              <Download size={14} aria-hidden="true" />
              {busyAction === 'sheet'
                ? 'Preparing...'
                : isSingle
                  ? 'Download Print Sheet'
                  : 'Download Batch Sheet'}
            </Button>
            <Button
              variant="success"
              type="button"
              disabled={labels.length === 0 || Boolean(busyAction)}
              onClick={handlePrint}
            >
              <Printer size={14} aria-hidden="true" />
              {busyAction === 'print' ? 'Preparing print...' : 'Print Labels'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-md border border-line bg-surface p-3 text-xs text-muted">
            Each QR code encodes only the public verification URL (<code className="id-text">/verify?serial=...</code>) with black modules on a white 4-module quiet zone (Error Correction M). Printing uses A4 auto-paginated layout and hides sidebar/dashboard navigation.
          </div>

          {labels.length > MAX_MODAL_PREVIEW && (
            <div className="rounded-md border border-amber-line bg-amber-soft px-3 py-2 text-xs font-medium text-amber-ink">
              Showing preview of first {MAX_MODAL_PREVIEW} labels. Print Labels and Download Batch Sheet include all {labels.length} selected packages.
            </div>
          )}

          {err && (
            <p role="alert" className="text-xs font-semibold text-quarantine">
              {err}
            </p>
          )}

          <div className={`grid gap-3 ${isSingle ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {previewLabels.map(meta => (
              <PackageLabelCard key={meta.serial} metadata={meta} compact={!isSingle} />
            ))}
          </div>
        </div>
      </Modal>
      {printPortal}
    </>
  )
}
