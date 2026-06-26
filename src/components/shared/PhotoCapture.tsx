'use client'

import * as React from 'react'
import { Box, Button, IconButton, Stack, Typography } from '@mui/material'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import CloseIcon from '@mui/icons-material/Close'
import { compressImage } from '@/lib/imageCompress'
import {
  storeLocalPhoto, getLocalPhoto, deleteLocalPhoto, uploadPhotoBlob, isLocalPhotoRef,
} from '@/lib/photoStore'
import { toPhotoSrc } from '@/lib/photo-security'

interface PhotoCaptureProps {
  /** Current photo references — a mix of real URLs and `localphoto:` keys. */
  value: string[]
  onChange: (refs: string[]) => void
  disabled?: boolean
  max?: number
  label?: string
}

/**
 * Camera capture + thumbnail strip. Each photo is compressed, then uploaded
 * immediately when online (the ref becomes a real URL) or stashed in IndexedDB
 * when offline (the ref becomes a `localphoto:` key that the offline queue
 * uploads on reconnect). Either way the parent only ever handles an array of
 * string refs and passes them straight into the request body.
 */
export function PhotoCapture({
  value, onChange, disabled, max = 5, label = 'Add photo',
}: PhotoCaptureProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  // Track object URLs we create so we can revoke them on unmount.
  const objectUrls = React.useRef<string[]>([])

  React.useEffect(() => {
    let cancelled = false
    value.forEach((ref) => {
      if (previews[ref]) return
      if (isLocalPhotoRef(ref)) {
        getLocalPhoto(ref).then((blob) => {
          if (cancelled || !blob) return
          const url = URL.createObjectURL(blob)
          objectUrls.current.push(url)
          setPreviews((p) => ({ ...p, [ref]: url }))
        })
      } else {
        // Uploaded ref → render through the auth-gated proxy (UR-005b).
        setPreviews((p) => ({ ...p, [ref]: toPhotoSrc(ref) }))
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  React.useEffect(() => () => {
    objectUrls.current.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      const added: string[] = []
      for (const file of Array.from(files)) {
        if (value.length + added.length >= max) break
        if (!file.type.startsWith('image/')) continue
        const blob = await compressImage(file)
        let ref: string
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            ref = await uploadPhotoBlob(blob)
          } catch {
            // Online but the upload failed — keep the photo locally so it isn't
            // lost; the queue will retry the upload on the next sync.
            ref = await storeLocalPhoto(blob)
          }
        } else {
          ref = await storeLocalPhoto(blob)
        }
        added.push(ref)
      }
      if (added.length) onChange([...value, ...added])
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove(ref: string) {
    if (isLocalPhotoRef(ref)) await deleteLocalPhoto(ref)
    const url = previews[ref]
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
      objectUrls.current = objectUrls.current.filter((u) => u !== url)
    }
    setPreviews((p) => {
      const next = { ...p }
      delete next[ref]
      return next
    })
    onChange(value.filter((r) => r !== ref))
  }

  const hasLocal = value.some(isLocalPhotoRef)

  return (
    <Box>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {value.map((ref) => (
          <Box
            key={ref}
            sx={{ position: 'relative', width: 64, height: 64, borderRadius: 1, overflow: 'hidden', bgcolor: 'grey.100' }}
          >
            {previews[ref] && (
              <Box component="img" src={previews[ref]} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
            <IconButton
              size="small"
              aria-label="Remove photo"
              onClick={() => remove(ref)}
              disabled={disabled}
              sx={{
                position: 'absolute', top: -2, right: -2, p: '2px',
                bgcolor: 'rgba(0,0,0,0.55)', color: '#fff',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
              }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
        ))}
        {value.length < max && (
          <Button
            variant="outlined"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            startIcon={<PhotoCameraIcon />}
            sx={{ width: 64, height: 64, minWidth: 64, flexDirection: 'column', gap: 0.25, fontSize: 10, p: 0.5, lineHeight: 1.1 }}
          >
            {busy ? '…' : label}
          </Button>
        )}
      </Stack>
      {hasLocal && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Saved on device — photos upload automatically when you reconnect.
        </Typography>
      )}
    </Box>
  )
}
