'use client'

import * as React from 'react'
import { formatDateTime } from '@/lib/utils'
import { Box, Stack, Dialog, IconButton, Chip, Typography } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { toPhotoSrc } from '@/lib/photo-security'

export interface GalleryPhoto {
  id?: string
  url: string
  thumbnailUrl?: string | null
  takenAt?: string | null
  context?: string | null
  /** Force the damage badge regardless of context (e.g. damage-report photos). */
  damage?: boolean
}

const isDamage = (p: GalleryPhoto) => p.damage === true || p.context === 'DAMAGE'

/**
 * M5 item 28: the single photo-viewing surface. Renders a thumbnail row and a
 * click-to-open lightbox (full image, prev/next, keyboard arrows, caption +
 * damage badge). Replaces the ad-hoc `<img>` thumbnail blocks scattered across
 * the admin pages so every photo surface looks and behaves the same.
 */
export function PhotoGallery({ photos, size = 80 }: { photos: GalleryPhoto[]; size?: number }) {
  const [openIdx, setOpenIdx] = React.useState<number | null>(null)
  const open = openIdx !== null
  const current = open ? photos[openIdx] : null

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setOpenIdx((i) => (i === null ? i : (i - 1 + photos.length) % photos.length))
      else if (e.key === 'ArrowRight') setOpenIdx((i) => (i === null ? i : (i + 1) % photos.length))
      else if (e.key === 'Escape') setOpenIdx(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, photos.length])

  if (!photos.length) return null

  const step = (dir: -1 | 1) => setOpenIdx((i) => (i === null ? i : (i + dir + photos.length) % photos.length))

  return (
    <>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {photos.map((p, i) => (
          <Box
            key={p.id ?? i}
            onClick={() => setOpenIdx(i)}
            sx={{ position: 'relative', cursor: 'pointer', lineHeight: 0 }}
          >
            <Box
              component="img"
              src={toPhotoSrc(p.thumbnailUrl || p.url)}
              alt={isDamage(p) ? 'damage photo' : 'photo'}
              sx={{ width: size, height: size, objectFit: 'cover', borderRadius: 1, border: '1px solid', borderColor: 'divider', display: 'block' }}
            />
            {isDamage(p) && (
              <Chip
                icon={<WarningAmberIcon sx={{ fontSize: 13 }} />}
                label="Damage"
                size="small"
                color="error"
                sx={{ position: 'absolute', bottom: 4, left: 4, height: 18, '& .MuiChip-label': { px: 0.5, fontSize: 10 } }}
              />
            )}
          </Box>
        ))}
      </Stack>

      <Dialog open={open} onClose={() => setOpenIdx(null)} maxWidth="lg">
        {current && (
          <Box sx={{ position: 'relative', bgcolor: 'common.black' }}>
            <IconButton onClick={() => setOpenIdx(null)} aria-label="Close" sx={{ position: 'absolute', top: 8, right: 8, color: 'common.white', zIndex: 2 }}>
              <CloseIcon />
            </IconButton>
            {photos.length > 1 && (
              <>
                <IconButton onClick={() => step(-1)} aria-label="Previous" sx={{ position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)', color: 'common.white', zIndex: 2 }}>
                  <ChevronLeftIcon />
                </IconButton>
                <IconButton onClick={() => step(1)} aria-label="Next" sx={{ position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)', color: 'common.white', zIndex: 2 }}>
                  <ChevronRightIcon />
                </IconButton>
              </>
            )}
            <Box component="img" src={toPhotoSrc(current.url)} alt="" sx={{ maxWidth: '92vw', maxHeight: '82vh', objectFit: 'contain', display: 'block' }} />
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ p: 1, color: 'common.white' }}>
              <Typography variant="caption">{photos.length > 1 ? `${(openIdx ?? 0) + 1} / ${photos.length}` : ''}</Typography>
              {isDamage(current) && <Chip icon={<WarningAmberIcon sx={{ fontSize: 14 }} />} label="Damage" size="small" color="error" />}
              <Typography variant="caption">{current.takenAt ? formatDateTime(current.takenAt) : ''}</Typography>
            </Stack>
          </Box>
        )}
      </Dialog>
    </>
  )
}
