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
 * Photo picker + thumbnail strip. Each photo is compressed, then uploaded
 * immediately when online (the ref becomes a real URL) or stashed in IndexedDB
 * when offline (the ref becomes a `localphoto:` key that the offline queue
 * uploads on reconnect). Either way the parent only ever handles an array of
 * string refs and passes them straight into the request body.
 *
 * UXP-3 (3g) / D36: the input deliberately carries NO `capture` attribute, so the
 * OS offers camera OR library (iOS: Take Photo / Photo Library; Android: Camera /
 * Files). A photo the operator already took is a first-class input — "texting the
 * photo" parity. Re-adding `capture="environment"` fails
 * tests/components/PhotoCapture.test.tsx loudly; re-open D36 before doing so.
 */
export function PhotoCapture({
  value, onChange, disabled, max = 5, label = 'Add photo',
}: PhotoCaptureProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [previews, setPreviews] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [photoError, setPhotoError] = React.useState<string | null>(null)
  // UXP-3 (3g, critic G-5): the max-N cap and non-image skips used to be SILENT
  // drops — the operator picked 7, saw 5, and never learned why. Surfaced here.
  const [notice, setNotice] = React.useState<string | null>(null)
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
    setPhotoError(null)
    setNotice(null)
    try {
      const picked = Array.from(files)
      const images = picked.filter((f) => f.type.startsWith('image/'))
      const room = Math.max(0, max - value.length)
      const toAdd = images.slice(0, room)
      const notices: string[] = []
      if (images.length > room) {
        notices.push(room === 0
          ? `Photo limit reached (${max}).`
          : `Only ${max} photos per report — the first ${room} were added.`)
      }
      if (images.length < picked.length) notices.push('Only image files can be attached.')
      if (notices.length) setNotice(notices.join(' '))

      const added: string[] = []
      for (const file of toAdd) {
        const blob = await compressImage(file)
        let ref: string
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          try {
            ref = await uploadPhotoBlob(blob)
          } catch {
            // Online but the upload failed — keep the photo locally so it isn't
            // lost; the queue will retry the upload on the next sync.
            try {
              ref = await storeLocalPhoto(blob)
            } catch {
              setPhotoError("Couldn't save photo — device storage may be full or unavailable.")
              continue
            }
          }
        } else {
          try {
            ref = await storeLocalPhoto(blob)
          } catch {
            setPhotoError("Couldn't save photo — device storage may be full or unavailable.")
            continue
          }
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
    setNotice(null)
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
      {/* D36: no `capture` attribute — camera OR library, the OS decides (see the
          component doc comment). `accept` + `multiple` stay. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
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
            {/* CC-23: 44px touch target, kept INSIDE the thumbnail bounds (was
                top/right:-2, poking outside with a ~20px tap area). The dark
                scrim is confined to the visible close glyph so it doesn't cover
                the whole thumbnail. */}
            <IconButton
              aria-label="Remove photo"
              onClick={() => remove(ref)}
              disabled={disabled}
              sx={{
                position: 'absolute', top: 0, right: 0, width: 44, height: 44,
                color: 'common.white',
                '& .MuiSvgIcon-root': {
                  bgcolor: 'rgba(0,0,0,0.55)', borderRadius: '50%', p: '2px', fontSize: 20,
                },
                '&:hover .MuiSvgIcon-root': { bgcolor: 'rgba(0,0,0,0.75)' },
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        ))}
        {value.length < max ? (
          <Button
            variant="outlined"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            startIcon={<PhotoCameraIcon />}
            sx={{ width: 64, height: 64, minWidth: 64, flexDirection: 'column', gap: 0.25, fontSize: 10, p: 0.5, lineHeight: 1.1 }}
          >
            {busy ? '…' : label}
          </Button>
        ) : (
          // 3g (G-5): the Add button used to just vanish at the cap; say why.
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            Maximum {max} photos
          </Typography>
        )}
      </Stack>
      {notice && (
        <Typography role="status" variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {notice}
        </Typography>
      )}
      {hasLocal && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Saved on device — photos upload automatically when you reconnect.
        </Typography>
      )}
      {photoError && (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
          {photoError}
        </Typography>
      )}
    </Box>
  )
}
