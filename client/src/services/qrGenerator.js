import QRCode from 'qrcode'
import { buildVerificationUrl } from './qrPayload.js'

export const QR_OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 4,
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  }
}

export function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function escapeHtml(value) {
  return escapeXml(value)
}

export function buildPackageLabelMetadata({ pkg, batch, product, manufacturerName }) {
  const serial = String(pkg?.serial ?? '').trim().toUpperCase()
  return {
    serial,
    verificationUrl: buildVerificationUrl(serial),
    productName: product?.name ? String(product.name).trim() : '',
    strength: product?.strength ? String(product.strength).trim() : '',
    dosageForm: product?.form ? String(product.form).trim() : '',
    packSize: product?.packSize ? String(product.packSize).trim() : '',
    batchNo: batch?.no ? String(batch.no).trim() : '',
    mfd: batch?.mfd ? String(batch.mfd).trim() : '',
    exp: batch?.exp ? String(batch.exp).trim() : '',
    manufacturerName: manufacturerName ? String(manufacturerName).trim() : ''
  }
}

export async function generateQrSvgString(payload, { width = 220 } = {}) {
  const text = String(payload ?? '').trim()
  if (!text) {
    throw new Error('QR payload cannot be empty.')
  }
  return QRCode.toString(text, {
    ...QR_OPTIONS,
    type: 'svg',
    width
  })
}

export async function generateQrPngDataUrl(payload, { width = 320 } = {}) {
  const text = String(payload ?? '').trim()
  if (!text) {
    throw new Error('QR payload cannot be empty.')
  }
  return QRCode.toDataURL(text, {
    ...QR_OPTIONS,
    type: 'image/png',
    width
  })
}

export async function generatePackageQrSvg(serial, { origin, width = 220 } = {}) {
  const verificationUrl = buildVerificationUrl(serial, origin)
  const svg = await generateQrSvgString(verificationUrl, { width })
  return { verificationUrl, svg }
}

export async function generatePackageQrPngDataUrl(serial, { origin, width = 320 } = {}) {
  const verificationUrl = buildVerificationUrl(serial, origin)
  const dataUrl = await generateQrPngDataUrl(verificationUrl, { width })
  return { verificationUrl, dataUrl }
}

export function dataUrlToUint8Array(dataUrl) {
  const commaIdx = String(dataUrl ?? '').indexOf(',')
  if (commaIdx < 0) {
    throw new Error('Invalid data URL.')
  }
  const base64 = dataUrl.slice(commaIdx + 1)
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'))
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function buildPackageLabelSvgString(metadata, { origin } = {}) {
  const serial = String(metadata?.serial ?? '').trim().toUpperCase()
  const verificationUrl = metadata?.verificationUrl || buildVerificationUrl(serial, origin)
  const rawQrSvg = await generateQrSvgString(verificationUrl, { width: 164 })

  const innerQr = rawQrSvg
    .replace(/^<\?xml[^>]*>\s*/i, '')
    .replace(/<svg\b([^>]*)>/, '<svg x="14" y="18" width="164" height="164"$1>')

  const titleLine = [metadata?.productName, metadata?.strength].filter(Boolean).join(' ')
  const formLine = [metadata?.dosageForm, metadata?.packSize].filter(Boolean).join(' · ')
  const batchLine = metadata?.batchNo ? `Batch: ${metadata.batchNo}` : ''
  const dateLine = [
    metadata?.mfd ? `MFD: ${metadata.mfd}` : '',
    metadata?.exp ? `EXP: ${metadata.exp}` : ''
  ]
    .filter(Boolean)
    .join('   ')
  const mfgLine = metadata?.manufacturerName ? `Mfg: ${metadata.manufacturerName}` : ''

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="220" viewBox="0 0 440 220" role="img" aria-label="Package label for ${escapeXml(serial)}">`,
    '  <rect x="0.5" y="0.5" width="439" height="219" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1"/>',
    `  ${innerQr}`,
    '  <g font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" fill="#0F2A4A">',
    '    <text x="192" y="34" font-size="10" font-weight="700" fill="#059669" letter-spacing="0.06em">PHARMATRACE AI</text>',
    titleLine
      ? `    <text x="192" y="54" font-size="15" font-weight="700">${escapeXml(titleLine)}</text>`
      : '',
    formLine
      ? `    <text x="192" y="72" font-size="11" fill="#475569">${escapeXml(formLine)}</text>`
      : '',
    batchLine
      ? `    <text x="192" y="96" font-size="11" font-weight="600" fill="#1E293B">${escapeXml(batchLine)}</text>`
      : '',
    dateLine
      ? `    <text x="192" y="114" font-size="11" fill="#1E293B">${escapeXml(dateLine)}</text>`
      : '',
    mfgLine
      ? `    <text x="192" y="132" font-size="10.5" fill="#475569">${escapeXml(mfgLine)}</text>`
      : '',
    '    <text x="192" y="156" font-size="10" fill="#64748B">SERIAL IDENTIFIER</text>',
    `    <text x="192" y="172" font-size="11.5" font-weight="700" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" fill="#0F2A4A">${escapeXml(serial)}</text>`,
    '    <text x="14" y="202" font-size="9" fill="#64748B">Scan QR to inspect verification record. QR alone does not prove authenticity.</text>',
    '  </g>',
    '</svg>'
  ]
    .filter(Boolean)
    .join('\n')
}

export async function exportPackageLabelPngBlob(metadata, { origin, qrOnly = false } = {}) {
  const serial = String(metadata?.serial ?? '').trim().toUpperCase()
  const verificationUrl = metadata?.verificationUrl || buildVerificationUrl(serial, origin)

  if (qrOnly || typeof document === 'undefined') {
    const { dataUrl } = await generatePackageQrPngDataUrl(serial, { origin, width: 360 })
    const bytes = dataUrlToUint8Array(dataUrl)
    return {
      verificationUrl,
      blob: new Blob([bytes], { type: 'image/png' }),
      dataUrl
    }
  }

  const width = 880
  const height = 440
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#CBD5E1'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, width - 2, height - 2)

  const qrCanvas = document.createElement('canvas')
  await QRCode.toCanvas(qrCanvas, verificationUrl, {
    ...QR_OPTIONS,
    width: 320
  })
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(qrCanvas, 28, 36, 320, 320)

  ctx.fillStyle = '#059669'
  ctx.font = '700 20px "Plus Jakarta Sans", system-ui, sans-serif'
  ctx.fillText('PHARMATRACE AI', 384, 68)

  const titleLine = [metadata?.productName, metadata?.strength].filter(Boolean).join(' ')
  if (titleLine) {
    ctx.fillStyle = '#0F2A4A'
    ctx.font = '700 30px "Plus Jakarta Sans", system-ui, sans-serif'
    ctx.fillText(titleLine, 384, 108, width - 410)
  }

  const formLine = [metadata?.dosageForm, metadata?.packSize].filter(Boolean).join(' · ')
  if (formLine) {
    ctx.fillStyle = '#475569'
    ctx.font = '500 22px "Plus Jakarta Sans", system-ui, sans-serif'
    ctx.fillText(formLine, 384, 144, width - 410)
  }

  ctx.fillStyle = '#1E293B'
  ctx.font = '600 22px "Plus Jakarta Sans", system-ui, sans-serif'
  if (metadata?.batchNo) {
    ctx.fillText(`Batch: ${metadata.batchNo}`, 384, 192, width - 410)
  }

  const dateLine = [
    metadata?.mfd ? `MFD: ${metadata.mfd}` : '',
    metadata?.exp ? `EXP: ${metadata.exp}` : ''
  ]
    .filter(Boolean)
    .join('   ')
  if (dateLine) {
    ctx.font = '500 21px "Plus Jakarta Sans", system-ui, sans-serif'
    ctx.fillText(dateLine, 384, 228, width - 410)
  }

  if (metadata?.manufacturerName) {
    ctx.fillStyle = '#475569'
    ctx.font = '500 20px "Plus Jakarta Sans", system-ui, sans-serif'
    ctx.fillText(`Mfg: ${metadata.manufacturerName}`, 384, 264, width - 410)
  }

  ctx.fillStyle = '#64748B'
  ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif'
  ctx.fillText('SERIAL IDENTIFIER', 384, 312)

  ctx.fillStyle = '#0F2A4A'
  ctx.font = '700 23px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(serial, 384, 344, width - 410)

  ctx.fillStyle = '#64748B'
  ctx.font = '500 17px "Plus Jakarta Sans", system-ui, sans-serif'
  ctx.fillText('Scan QR to verify package journey. QR alone does not prove authenticity.', 28, 404, width - 56)

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => {
      if (b) resolve(b)
      else reject(new Error('Failed to encode label PNG blob.'))
    }, 'image/png')
  })

  return { verificationUrl, blob }
}

export async function buildBatchLabelSheetHtml(labelItems = [], { origin, title = 'PharmaTrace Package Labels' } = {}) {
  const renderedCards = await Promise.all(
    labelItems.map(async item => {
      const serial = String(item?.serial ?? '').trim().toUpperCase()
      const verificationUrl = item?.verificationUrl || buildVerificationUrl(serial, origin)
      const qrSvg = await generateQrSvgString(verificationUrl, { width: 120 })
      const titleLine = [item?.productName, item?.strength].filter(Boolean).join(' ')
      const formLine = [item?.dosageForm, item?.packSize].filter(Boolean).join(' · ')
      const batchText = item?.batchNo ? `Batch ${escapeHtml(item.batchNo)}` : ''
      const dateText = [
        item?.mfd ? `MFD ${escapeHtml(item.mfd)}` : '',
        item?.exp ? `EXP ${escapeHtml(item.exp)}` : ''
      ]
        .filter(Boolean)
        .join(' · ')
      const mfgText = item?.manufacturerName ? escapeHtml(item.manufacturerName) : ''

      return `
      <article class="pt-label-card">
        <div class="pt-label-qr">${qrSvg}</div>
        <div class="pt-label-meta">
          <div class="pt-label-brand">PHARMATRACE AI</div>
          ${titleLine ? `<div class="pt-label-title">${escapeHtml(titleLine)}</div>` : ''}
          ${formLine ? `<div class="pt-label-sub">${escapeHtml(formLine)}</div>` : ''}
          ${batchText ? `<div class="pt-label-line"><strong>${batchText}</strong></div>` : ''}
          ${dateText ? `<div class="pt-label-line">${dateText}</div>` : ''}
          ${mfgText ? `<div class="pt-label-sub">${mfgText}</div>` : ''}
          <div class="pt-label-serial">${escapeHtml(serial)}</div>
          <div class="pt-label-note">Scan to check recorded journey. QR alone does not prove authenticity.</div>
        </div>
      </article>`
    })
  )

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1E293B; background: #FFFFFF; }
    .pt-sheet-header { padding: 8px 12px; border-bottom: 1px solid #E2E8F0; display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #475569; }
    .pt-print-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm; padding: 4mm 0; }
    .pt-label-card { border: 1px solid #CBD5E1; border-radius: 6px; padding: 3mm; display: flex; align-items: center; gap: 3mm; min-height: 41mm; break-inside: avoid; page-break-inside: avoid; background: #FFFFFF; }
    .pt-label-qr { flex: 0 0 26mm; width: 26mm; height: 26mm; display: flex; align-items: center; justify-content: center; background: #FFFFFF; }
    .pt-label-qr svg { width: 100%; height: 100%; display: block; }
    .pt-label-meta { min-width: 0; flex: 1; font-size: 9.5px; line-height: 1.3; }
    .pt-label-brand { font-size: 8px; font-weight: 700; letter-spacing: 0.06em; color: #059669; }
    .pt-label-title { font-size: 12px; font-weight: 700; color: #0F2A4A; margin-top: 1px; }
    .pt-label-sub { color: #475569; margin-top: 1px; }
    .pt-label-line { color: #1E293B; margin-top: 2px; }
    .pt-label-serial { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; font-weight: 700; color: #0F2A4A; margin-top: 3px; word-break: break-all; }
    .pt-label-note { font-size: 7.5px; color: #64748B; margin-top: 3px; }
    @media print { .no-print { display: none !important; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="pt-sheet-header no-print">
    <span>${escapeHtml(title)} (${labelItems.length} label${labelItems.length === 1 ? '' : 's'})</span>
    <button type="button" onclick="window.print()">Print Sheet</button>
  </div>
  <main class="pt-print-grid">${renderedCards.join('\n')}
  </main>
</body>
</html>`
}

export function triggerBlobDownload(blob, filename) {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
