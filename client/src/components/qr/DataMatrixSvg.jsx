// PharmaTrace AI — GS1 DataMatrix SVG Component
import { useMemo } from 'react'
import bwipjs from 'bwip-js'

export default function DataMatrixSvg({
  gtin = '08940000000018',
  serial = '',
  exp = '',
  batchNo = '',
  size = 148,
  className = ''
}) {
  const { svg, error, hri } = useMemo(() => {
    if (!serial || !batchNo) {
      return { svg: '', error: 'Missing serial or batch', hri: '' }
    }

    try {
      // Format expiration date to YYMMDD
      let yymmdd = '991231'
      if (exp) {
        const cleanExp = exp.replace(/-/g, '')
        if (cleanExp.length === 8) {
          yymmdd = cleanExp.slice(2)
        } else if (cleanExp.length === 6) {
          yymmdd = cleanExp
        }
      }

      // Format GTIN-14 (pad with leading zeroes if needed)
      const cleanGtin = String(gtin || '08940000000018').replace(/\D/g, '').padStart(14, '0')
      const cleanSerial = String(serial).trim().toUpperCase()
      const cleanBatch = String(batchNo).trim().toUpperCase()

      const text = `(01)${cleanGtin}(21)${cleanSerial}(17)${yymmdd}(10)${cleanBatch}`
      const generatedSvg = bwipjs.toSVG({
        bcid: 'gs1datamatrix',
        text,
        scale: 2,
        includetext: false
      })

      return { svg: generatedSvg, error: '', hri: text }
    } catch (err) {
      return { svg: '', error: err.message || 'DataMatrix generation failed', hri: '' }
    }
  }, [gtin, serial, exp, batchNo])

  if (error) {
    return (
      <div
        role="alert"
        className={`flex items-center justify-center rounded border border-quarantine-line bg-quarantine-soft p-1 text-center text-[10px] text-quarantine ${className}`}
        style={{ width: size, height: size }}
      >
        {error}
      </div>
    )
  }

  if (!svg) {
    return (
      <div
        className={`animate-pulse rounded bg-slate-100 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      className={`inline-block shrink-0 overflow-hidden ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
      title={`GS1 DataMatrix: ${hri}`}
    />
  )
}
