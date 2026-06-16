'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Box, Typography, IconButton,
  CircularProgress, Alert,
} from '@mui/material'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import CloseIcon from '@mui/icons-material/Close'
import { compressImage } from '@/lib/compress-image'

interface Props {
  title: string
  description?: string
  noteLabel?: string
  open: boolean
  loading: boolean
  onClose: () => void
  onConfirm: (note: string, photoUrls: string[]) => void
  confirmLabel?: string
  confirmColor?: 'error' | 'primary' | 'warning'
}

interface UploadingPhoto {
  id: string
  name: string
  uploading: boolean
  url: string | null
}

export function NotePhotoDialog({
  title,
  description,
  noteLabel = "What's happening? (required)",
  open,
  loading,
  onClose,
  onConfirm,
  confirmLabel = 'Confirm',
  confirmColor = 'primary',
}: Props) {
  const [note, setNote] = React.useState('')
  const [photos, setPhotos] = React.useState<UploadingPhoto[]>([])
  const [uploadError, setUploadError] = React.useState<string | null>(null)
  const stillUploading = photos.some((p) => p.uploading)
  const hasFailedUploads = photos.some((p) => !p.uploading && p.url === null)

  React.useEffect(() => {
    if (!open) {
      setNote('')
      setPhotos([])
      setUploadError(null)
    }
  }, [open])

  const handleFiles = async (files: FileList) => {
    setUploadError(null)
    // Assign stable IDs upfront so concurrent uploads don't clobber each other
    const entries = Array.from(files).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file: f,
    }))
    setPhotos((prev) => [
      ...prev,
      ...entries.map(({ id, file }) => ({ id, name: file.name, uploading: true, url: null })),
    ])

    const errors: string[] = []
    await Promise.all(
      entries.map(async ({ id, file }) => {
        const compressed = await compressImage(file)
        const form = new FormData()
        form.append('file', compressed)
        try {
          const res = await fetch('/api/uploads', { method: 'POST', body: form })
          const json = await res.json()
          const url: string | null = res.ok ? (json.url ?? null) : null
          if (!res.ok) errors.push(json.error ?? `Upload failed for ${file.name}`)
          setPhotos((prev) => prev.map((p) => p.id === id ? { ...p, uploading: false, url } : p))
        } catch {
          errors.push(`Network error uploading ${file.name}`)
          setPhotos((prev) => prev.map((p) => p.id === id ? { ...p, uploading: false, url: null } : p))
        }
      })
    )
    if (errors.length) setUploadError(errors.join('; '))
  }

  const removePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id))
  }

  const handleConfirm = () => {
    const urls = photos.filter((p) => p.url).map((p) => p.url as string)
    onConfirm(note, urls)
  }

  const canSubmit = note.trim().length >= 5 && !stillUploading && !hasFailedUploads && !loading

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} pt={0.5}>
          {description && (
            <Typography variant="body2" color="text.secondary">{description}</Typography>
          )}

          <TextField
            label={noteLabel}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            rows={3}
            required
            fullWidth
            autoFocus
          />

          {uploadError && (
            <Alert severity="error" onClose={() => setUploadError(null)}>
              {uploadError} — remove the failed photos (!) and try again.
            </Alert>
          )}

          <Box>
            {/* component="label" renders a <label> so the browser opens the file picker
                directly on click — programmatic .click() is blocked on iOS Safari */}
            <Button
              component="label"
              size="small"
              variant="outlined"
              startIcon={<CameraAltIcon />}
              disabled={loading || stillUploading}
            >
              Attach photos
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files) }}
              />
            </Button>

            {photos.length > 0 && (
              <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap">
                {photos.map((p) => (
                  <Box key={p.id} sx={{ position: 'relative', width: 48, height: 48 }}>
                    {p.uploading ? (
                      <Box sx={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                        <CircularProgress size={20} />
                      </Box>
                    ) : p.url ? (
                      <Box
                        component="img"
                        src={p.url}
                        alt={p.name}
                        sx={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}
                      />
                    ) : (
                      <Box sx={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid', borderColor: 'error.main', borderRadius: 1 }}>
                        <Typography variant="caption" color="error">!</Typography>
                      </Box>
                    )}
                    <IconButton
                      size="small"
                      onClick={() => removePhoto(p.id)}
                      sx={{ position: 'absolute', top: -8, right: -8, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', p: 0.25 }}
                    >
                      <CloseIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  </Box>
                ))}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          color={confirmColor}
          onClick={handleConfirm}
          disabled={!canSubmit}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {loading ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
