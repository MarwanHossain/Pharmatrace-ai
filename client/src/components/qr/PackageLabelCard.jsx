import QrCodeSvg from './QrCodeSvg'

export default function PackageLabelCard({ metadata, qrSize = 128, compact = false }) {
  if (!metadata?.serial) return null

  const titleLine = [metadata.productName, metadata.strength].filter(Boolean).join(' ')
  const formLine = [metadata.dosageForm, metadata.packSize].filter(Boolean).join(' · ')
  const dateLine = [
    metadata.mfd ? `MFD ${metadata.mfd}` : '',
    metadata.exp ? `EXP ${metadata.exp}` : ''
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <article
      className={`pt-label-card flex items-center gap-3 rounded-md border border-line bg-white ${
        compact ? 'p-2.5' : 'p-3.5'
      }`}
      data-label-serial={metadata.serial}
    >
      <div className="shrink-0 rounded border border-line bg-white p-0.5">
        <QrCodeSvg serial={metadata.serial} size={qrSize} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-clinical">
          PharmaTrace AI
        </div>
        {titleLine && (
          <div className="truncate text-sm font-bold text-navy">{titleLine}</div>
        )}
        {formLine && <div className="text-xs text-muted">{formLine}</div>}

        <dl className="mt-1.5 space-y-0.5 text-[11px] text-ink">
          {metadata.batchNo && (
            <div className="flex flex-wrap gap-x-1">
              <dt className="text-muted">Batch:</dt>
              <dd className="id-text font-semibold">{metadata.batchNo}</dd>
            </div>
          )}
          {dateLine && (
            <div className="id-text text-[11px] text-ink">{dateLine}</div>
          )}
          {metadata.manufacturerName && (
            <div className="truncate text-[11px] text-muted">
              Mfg: {metadata.manufacturerName}
            </div>
          )}
        </dl>

        <div className="mt-2 border-t border-line pt-1.5">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-muted">
            Serial Identifier
          </div>
          <div className="id-text break-all text-xs font-bold text-navy">
            {metadata.serial}
          </div>
        </div>

        <p className="mt-1.5 text-[10px] leading-tight text-muted">
          Scan QR to check recorded journey. QR alone does not prove authenticity.
        </p>
      </div>
    </article>
  )
}
