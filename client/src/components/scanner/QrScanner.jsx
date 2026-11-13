import { useEffect, useId, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { Camera, CameraOff, Search } from 'lucide-react'
import { Button } from '../ui'
import { parseQrPayload } from '../../services/qrPayload'

const SCAN_DEBOUNCE_MS = 1500

function formatCameraError(err) {
  const msg = String(err?.message ?? err ?? '')
  if (err?.name === 'NotAllowedError' || /permission|notallowed/i.test(msg)) {
    return 'Camera permission denied. Allow camera access or enter the serial/verification URL manually below.'
  }
  if (err?.name === 'NotFoundError' || /not\s*found|no camera|device/i.test(msg)) {
    return 'No camera detected on this device. Use manual serial or verification URL entry below.'
  }
  return msg || 'Unable to start camera. Use manual serial entry below.'
}

export default function QrScanner({
  onScan,
  placeholder = 'Scan or enter serial / verification URL',
  label = 'Scan or enter serial'
}) {
  const rawId = useId()
  const readerId = `qr-reader-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`

  const [value, setValue] = useState('')
  const [cameraActive, setCameraActive] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const scannerRef = useRef(null)
  const mountedRef = useRef(true)
  const onScanRef = useRef(onScan)
  const lastScanRef = useRef({ text: '', time: 0 })

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  async function stopCamera() {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (scanner) {
      try {
        if (scanner.isScanning) {
          await scanner.stop()
        }
      } catch {
        // Ignore stop errors during teardown
      }
      try {
        scanner.clear()
      } catch {
        // Ignore clear errors during teardown
      }
    }
    if (mountedRef.current) {
      setCameraActive(false)
      setStarting(false)
    }
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopCamera()
    }
  }, [])

  function dispatchNormalizedScan(rawText, { clearInputOnSuccess = false } = {}) {
    const parsed = parseQrPayload(rawText)
    if (!parsed.ok) {
      setError(parsed.reason || 'Malformed or unsupported QR payload.')
      return false
    }
    setError('')
    if (clearInputOnSuccess) {
      setValue('')
    }
    onScanRef.current?.(parsed.serial, {
      raw: String(rawText ?? '').trim(),
      sourceType: parsed.sourceType
    })
    return true
  }

  async function startCamera() {
    if (starting || cameraActive) return
    setError('')
    setStarting(true)

    // Wait a frame so the reader container is visible with non-zero width
    await new Promise(resolve => requestAnimationFrame(resolve))
    if (!mountedRef.current) return

    try {
      const scanner = new Html5Qrcode(readerId)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        decodedText => {
          const trimmed = String(decodedText ?? '').trim()
          if (!trimmed) return
          const now = Date.now()
          if (
            trimmed === lastScanRef.current.text &&
            now - lastScanRef.current.time < SCAN_DEBOUNCE_MS
          ) {
            return
          }
          lastScanRef.current = { text: trimmed, time: now }
          dispatchNormalizedScan(trimmed, { clearInputOnSuccess: false })
        },
        () => {
          // Ignore per-frame decode misses
        }
      )

      if (!mountedRef.current) {
        await stopCamera()
        return
      }
      setCameraActive(true)
      setStarting(false)
    } catch (err) {
      await stopCamera()
      if (mountedRef.current) {
        setError(formatCameraError(err))
      }
    }
  }

  const handleSubmit = e => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    dispatchNormalizedScan(trimmed, { clearInputOnSuccess: true })
  }

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          QR Scanner
        </span>
        {cameraActive || starting ? (
          <Button
            type="button"
            variant="secondary"
            onClick={stopCamera}
            className="px-2.5 py-1 text-xs"
          >
            <CameraOff size={14} /> Stop Camera
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={startCamera}
            className="px-2.5 py-1 text-xs"
          >
            <Camera size={14} /> Start Camera
          </Button>
        )}
      </div>

      <div className="mb-3 overflow-hidden rounded-md border-2 border-dashed border-line bg-surface">
        <div
          id={readerId}
          className={cameraActive || starting ? 'w-full min-h-[160px]' : 'hidden'}
        />
        {!cameraActive && !starting && (
          <div className="flex h-32 items-center justify-center px-4 text-center text-sm text-muted">
            <div>
              <Camera size={28} className="mx-auto mb-1 text-muted" />
              Click Start Camera to scan QR, or enter serial / URL below
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-quarantine-line bg-quarantine-soft px-3 py-2 text-xs text-quarantine"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <label className="sr-only" htmlFor={`${readerId}-input`}>
          {label}
        </label>
        <input
          id={`${readerId}-input`}
          value={value}
          onChange={e => {
            setValue(e.target.value)
            if (error) setError('')
          }}
          placeholder={placeholder}
          className="id-text min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm"
        />
        <Button type="submit" variant="success" disabled={!value.trim()}>
          <Search size={14} /> Scan
        </Button>
      </form>
    </div>
  )
}
