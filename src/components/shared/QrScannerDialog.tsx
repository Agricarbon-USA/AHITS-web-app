'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, IconButton, Button, TextField,
  Alert, Box, Stack, Typography, Divider, CircularProgress,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import FlashlightOnIcon from '@mui/icons-material/FlashlightOn'
import FlashlightOffIcon from '@mui/icons-material/FlashlightOff'
import { parseScannedCode } from '@/lib/qr'
import { createBarcodeDetector, decodeFromVideo, decodeFromImage } from '@/lib/qr-scan'

// CC-25: the one live-viewfinder QR scanner. Consumed by operator/scan and the
// two my-deployment kit scanners — no copy-pasted decode loop. The caller owns
// the lookup via `onResolve`; this dialog owns camera + decode + manual entry +
// the permission/no-camera photo-capture fallback + stream lifecycle.

export type QrResolveResult =
  | { status: 'ok' }                       // resolved → dialog closes, caller handles the rest
  | { status: 'not-found' }                // server said no → honest "not found"
  | { status: 'offline' }                  // network/offline → honest "can't verify right now"
  | { status: 'error'; message: string }   // e.g. found-but-wrong-unit → keep scanning, show message

interface QrScannerDialogProps {
  open: boolean
  onClose: () => void
  title?: string
  prompt?: string
  /** Resolve a decoded code. Do the lookup + side effects; return the outcome. */
  onResolve: (code: string) => Promise<QrResolveResult>
}

// Honest, distinguished failures (CC-25 item 4) — never "failed to process image".
const NOT_FOUND_MSG = 'Code not found — it isn’t registered to any unit or vehicle.'
const OFFLINE_MSG = 'Can’t verify right now — you appear to be offline. Try again when you reconnect.'
const JSQR_INTERVAL_MS = 125 // ≤ 8 jsQR decodes/sec (the detector path runs every frame)

export function QrScannerDialog({ open, onClose, title = 'Scan QR', prompt, onResolve }: QrScannerDialogProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null) // scratch, never shown
  const streamRef = React.useRef<MediaStream | null>(null)       // mirror for the torch toggle

  const [cameraError, setCameraError] = React.useState(false) // permission-denied / no camera
  const [torchable, setTorchable] = React.useState(false)
  const [torchOn, setTorchOn] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [manual, setManual] = React.useState('')
  const [resolving, setResolving] = React.useState(false)

  // Resolve a decoded/typed code. Held in a ref so the rAF loop (below) always
  // calls the latest version without re-subscribing. `busyRef` pauses the loop
  // while a resolve is in flight.
  const busyRef = React.useRef(false)
  const handleCodeRef = React.useRef<(raw: string) => Promise<void>>(async () => {})
  const cameraErrorRef = React.useRef(cameraError)

  const handleCode = React.useCallback(async (raw: string) => {
    if (busyRef.current) return
    const code = parseScannedCode(raw)
    if (!code) return
    busyRef.current = true
    setResolving(true)
    setMessage('')
    try {
      const result = await onResolve(code)
      if (result.status === 'ok') { onClose(); return }
      setMessage(
        result.status === 'not-found' ? NOT_FOUND_MSG
        : result.status === 'offline' ? OFFLINE_MSG
        : result.message,
      )
    } finally {
      busyRef.current = false
      setResolving(false)
    }
  }, [onResolve, onClose])

  // Keep the loop's view of handleCode / cameraError current without making the
  // camera effect re-subscribe (post-commit ref sync, not during render).
  React.useEffect(() => {
    handleCodeRef.current = handleCode
    cameraErrorRef.current = cameraError
  })

  // Camera + decode lifecycle, all inside one effect keyed on `open` so every
  // stream/rAF/listener it creates is torn down together. Local functions (not
  // useCallbacks) avoid stale-closure and ref-during-render pitfalls; `tick` is a
  // hoisted function declaration so it can schedule itself.
  React.useEffect(() => {
    if (!open) return
    let stream: MediaStream | null = null
    let detector: ReturnType<typeof createBarcodeDetector> = null
    let raf = 0
    let cancelled = false
    let decoding = false
    let lastJsqr = 0

    function tick() {
      raf = requestAnimationFrame(tick)
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) return
      if (decoding || busyRef.current) return
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
      if (!detector && now - lastJsqr < JSQR_INTERVAL_MS) return // rate-cap the jsQR path
      lastJsqr = now
      decoding = true
      decodeFromVideo(video, canvas, detector)
        .then((code) => {
          decoding = false
          if (code && !cancelled && !busyRef.current) void handleCodeRef.current(code)
        })
        .catch(() => { decoding = false })
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      // Reset the in-flight guard: if we hid mid-decode, a resume must not find
      // `decoding` stuck true (which would leave the resumed viewfinder dead).
      decoding = false
      stream?.getTracks().forEach((t) => t.stop())
      stream = null
      streamRef.current = null
      setTorchable(false)
      setTorchOn(false)
    }

    async function start() {
      setCameraError(false)
      setMessage('')
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError(true)
        return
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        // Async-close race: if the dialog closed (or the tab hid) while awaiting,
        // stop immediately — never leave a stream running in the background.
        if (cancelled || document.hidden) { s.getTracks().forEach((t) => t.stop()); return }
        stream = s
        streamRef.current = s
        detector = createBarcodeDetector()
        const track = s.getVideoTracks()[0]
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean }
        setTorchable(!!caps.torch)
        const video = videoRef.current
        if (video) {
          video.srcObject = s
          video.muted = true
          await video.play().catch(() => {})
        }
        raf = requestAnimationFrame(tick)
      } catch {
        // NotAllowedError (denied) / NotFoundError (no camera) → honest fallback.
        setCameraError(true)
      }
    }

    // Tab-hidden → stop the camera; visible-again → re-acquire it (an operator
    // switching apps mid-scan must not return to a dead viewfinder).
    function onVis() {
      if (document.hidden) stop()
      else if (!stream && !cameraErrorRef.current) void start()
    }

    void start()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      stop()
    }
  }, [open])

  // Reset transient UI when the dialog closes.
  React.useEffect(() => {
    if (!open) { setMessage(''); setManual(''); setCameraError(false) }
  }, [open])

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints)
      setTorchOn(next)
    } catch {
      // Torch unsupported (e.g. iOS Safari) — leave it off.
    }
  }

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setResolving(true)
    setMessage('')
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = canvasRef.current ?? document.createElement('canvas')
      const code = await decodeFromImage(bitmap, canvas)
      if (!code) {
        setMessage('No QR detected in that photo — try again or type the code.')
        return
      }
      await handleCode(code)
    } catch {
      setMessage('Could not read that photo — type the code instead.')
    } finally {
      setResolving(false)
    }
  }

  const submitManual = () => {
    if (manual.trim()) void handleCode(manual)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        {title}
        <IconButton aria-label="Close" onClick={onClose}><CloseIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {prompt && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{prompt}</Typography>}

        {!cameraError ? (
          <Box sx={{ position: 'relative', width: '100%', aspectRatio: '3 / 4', bgcolor: 'black', borderRadius: 1, overflow: 'hidden' }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {torchable && (
              <IconButton
                aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
                onClick={toggleTorch}
                sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(0,0,0,0.5)', color: 'common.white', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' } }}
              >
                {torchOn ? <FlashlightOnIcon /> : <FlashlightOffIcon />}
              </IconButton>
            )}
            {resolving && (
              <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'rgba(0,0,0,0.4)' }}>
                <CircularProgress sx={{ color: 'common.white' }} />
              </Box>
            )}
          </Box>
        ) : (
          <Stack spacing={1.5}>
            <Alert severity="info">
              Camera unavailable — enter the code below, or take a photo of the label instead.
            </Alert>
            <Button component="label" variant="outlined" startIcon={<PhotoCameraIcon />} disabled={resolving}>
              Take a photo of the label
              <input type="file" accept="image/*" capture="environment" hidden onChange={onPhoto} />
            </Button>
          </Stack>
        )}

        {/* Scratch canvas for the jsQR / still-image path — never displayed. */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {message && <Alert severity="error" sx={{ mt: 2 }} onClose={() => setMessage('')}>{message}</Alert>}

        <Divider sx={{ my: 2 }}>or enter the code</Divider>
        <Stack direction="row" spacing={1}>
          <TextField
            fullWidth size="small"
            label="Type / USB-scan the code"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitManual() }}
            disabled={resolving}
          />
          <Button variant="contained" onClick={submitManual} disabled={resolving || !manual.trim()}>Look up</Button>
        </Stack>
      </DialogContent>
    </Dialog>
  )
}
