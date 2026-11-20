import QrCodeSvg from './QrCodeSvg'
import DataMatrixSvg from './DataMatrixSvg'

export default function PackageLabelCard({ metadata, qrSize = 100, compact = false }) {
  if (!metadata?.serial) return null

  const titleLine = [metadata.productName, metadata.strength].filter(Boolean).join(' ')
  const formLine = [metadata.dosageForm, metadata.packSize].filter(Boolean).join(' · ')
  const dateLine = [
    metadata.mfd ? `MFD ${metadata.mfd}` : '',
    metadata.exp ? `EXP ${metadata.exp}` : ''
  ]
    .filter(Boolean)
    .join(' · ')

  const codeSize = compact ? 88 : qrSize

  return (
    <article
      className={`pt-label-card flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-md border border-line bg-white ${
        compact ? 'p-2.5' : 'p-3.5'
      }`}
      data-label-serial={metadata.serial}
    >
      <div className="flex items-center gap-2 shrink-0 self-center sm:self-auto">
        <div className="rounded border border-line bg-white p-1 text-center">
          <DataMatrixSvg
            gtin={metadata.gtin}
            serial={metadata.serial}
            exp={metadata.exp}
            batchNo={metadata.batchNo}
            size={codeSize}
          />
          <div className="text-[8px] font-semibold uppercase tracking-wider text-muted mt-0.5">
            GS1 DataMatrix
          </div>
        </div>
        <div className="rounded border border-line bg-white p-1 text-center">
          <QrCodeSvg serial={metadata.serial} size={codeSize} />
          <div className="text-[8px] font-semibold uppercase tracking-wider text-muted mt-0.5">
            PharmaTrace QR
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-clinical">
          PharmaTrace AI · Serialization
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
          {metadata.gtin && (
            <div className="flex flex-wrap gap-x-1">
              <dt className="text-muted">GTIN-14:</dt>
              <dd className="id-text">{metadata.gtin}</dd>
            </div>
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
          Scan QR to check recorded supply-chain journey. A valid QR code or DataMatrix does not constitute proof of physical product authenticity.
        </p>
      </div>
    </article>
  )
}
