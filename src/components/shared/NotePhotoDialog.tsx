'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, Box, Typography, IconButton,
  CircularProgress,
} from '@mui/material'
import CameraAltIcon from '@mui/icons-material/CameraAlt'
import CloseIcon from '@mui/icons-material/Close'
import { createClient } from '@/lib/supabase/client'

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
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (!open) {
      setNote('')
      setPhotos([])
    }
  }, [open])

  const handleFiles = async (files: FileList) => {
    const supabase = createClient()
    const newPhotos: UploadingPhoto[] = Array.from(files).map((f) => ({
      name: f.name,
      uploading: true,
      url: null,
    }))
    setPhotos((prev) => [...prev, ...newPhotos])

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = `rig-events/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
      const { data, error } = await supabase.storage.from('photos').upload(path, file, { upsert: false })
      const url = error || !data
        ? null
        : supabase.storage.from('photos').getPublicUrl(data.path).data.publicUrl

      setPhotos((prev) =>
        prev.map((p, idx) =>
          idx === prev.length - files.length + i
            ? { ...p, uploading: false, url }
            : p
        )
      )
    }
  }

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleConfirm = () => {
    const urls = photos.filter((p) => p.url).map((p) => p.url as string)
    onConfirm(note, urls)
  }

  const stillUploading = photos.some((p) => p.uploading)
  const canSubmit = note.trim().length >= 5 && !stillUploading && !loading

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

          <Box>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files) }}
            />
            <Button
              size="small"
              variant="outlined"
              startIcon={<CameraAltIcon />}
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
            >
              Attach photos
            </Button>

            {photos.length > 0 && (
              <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap">
                {photos.map((p, i) => (
                  <Box key={i} sx={{ position: 'relative', width: 48, height: 48 }}>
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
                      onClick={() => removePhoto(i)}
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
