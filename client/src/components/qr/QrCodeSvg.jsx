import { useEffect, useState } from 'react'
import { generatePackageQrSvg } from '../../services/qrGenerator'

export default function QrCodeSvg({ serial, size = 148, className = '' }) {
  const [state, setState] = useState({ svg: '', url: '', error: '' })

  useEffect(() => {
    let cancelled = false
    if (!serial) {
      setState({ svg: '', url: '', error: 'Missing serial' })
      return () => {
        cancelled = true
      }
    }

    generatePackageQrSvg(serial, { width: size })
      .then(({ svg, verificationUrl }) => {
        if (!cancelled) {
          setState({ svg, url: verificationUrl, error: '' })
        }
      })
      .catch(err => {
        if (!cancelled) {
          setState({
            svg: '',
            url: '',
            error: err instanceof Error ? err.message : 'QR generation failed.'
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [serial, size])

  if (state.error) {
    return (
      <div
        role="alert"
        className={`flex items-center justify-center rounded border border-quarantine-line bg-quarantine-soft p-2 text-center text-[11px] text-quarantine ${className}`}
        style={{ width: size, height: size }}
      >
        {state.error}
      </div>
    )
  }

  if (!state.svg) {
    return (
      <div
        aria-hidden="true"
        className={`animate-pulse rounded border border-line bg-surface ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div
      role="img"
      aria-label={`QR code for package ${serial}${state.url ? ` (${state.url})` : ''}`}
      data-qr-serial={serial}
      data-qr-url={state.url}
      className={`pt-label-qr inline-flex shrink-0 items-center justify-center bg-white ${className}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  )
}
