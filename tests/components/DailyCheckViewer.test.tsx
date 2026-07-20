import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Keep the test focused on the viewer's own rendering (not the gallery internals /
// photo-security URL signing).
vi.mock('@/components/shared/PhotoGallery', () => ({
  PhotoGallery: ({ photos }: { photos: unknown[] }) => <div data-testid="gallery">{photos.length} photos</div>,
}))

import { DailyCheckDetails, type ViewerCheck } from '@/components/admin/DailyCheckViewer'

const base: ViewerCheck = {
  id: 'c1',
  date: '2026-07-19',
  submittedAt: '2026-07-19T13:00:00Z',
  passFail: true,
  odometer: 48210,
  site: 'North field',
  issues: null,
  durationMs: 95000,
  checklistJson: [
    { key: 'tires', label: 'Tires OK', value: 'yes' },
    { key: 'lights', label: 'Lights working', value: 'no', note: 'left brake light out' },
    { key: 'hitch', label: 'Trailer hitch', value: 'na' },
  ],
  operator: { id: 'o1', name: 'Dana Ruiz' },
  vehicle: { id: 'v1', name: 'Truck-01', type: 'TRUCK' },
  photos: [],
}

describe('DailyCheckDetails (CC-26)', () => {
  it('renders the full contents — answers, odometer, site, and highlights a failed item', () => {
    render(<DailyCheckDetails check={base} />)
    expect(screen.getByText('Tires OK')).toBeInTheDocument()
    expect(screen.getByText('Lights working')).toBeInTheDocument()
    expect(screen.getByText('left brake light out')).toBeInTheDocument() // failed-item note surfaced
    expect(screen.getByText('48,210 mi')).toBeInTheDocument()
    expect(screen.getByText('North field')).toBeInTheDocument()
    expect(screen.getByText('Pass')).toBeInTheDocument()
    expect(screen.getByText('1m 35s')).toBeInTheDocument() // durationMs formatted
  })

  it('renders without photos and without GPS — clean absent-safe slots', () => {
    render(<DailyCheckDetails check={base} />)
    expect(screen.getByText('No photos.')).toBeInTheDocument()
    expect(screen.getByText('Not captured on this check.')).toBeInTheDocument()
    expect(screen.queryByTestId('gallery')).toBeNull()
  })

  it('renders photos via the gallery and notes photo-level GPS when present', () => {
    const withPhotos: ViewerCheck = {
      ...base,
      photos: [
        { id: 'p1', url: 'u1', thumbnailUrl: null, takenAt: '2026-07-19T13:01:00Z', context: 'DAILY_CHECK', gpsLat: 41.1, gpsLng: -95.9 },
        { id: 'p2', url: 'u2', thumbnailUrl: null, takenAt: '2026-07-19T13:02:00Z', context: 'DAILY_CHECK', gpsLat: null, gpsLng: null },
      ],
    }
    render(<DailyCheckDetails check={withPhotos} />)
    expect(screen.getByTestId('gallery')).toHaveTextContent('2 photos')
    expect(screen.getByText(/1 photo carr(y|ies) location/i)).toBeInTheDocument()
  })

  it('renders check-level GPS coordinates when the field is present (CC-15 forward-compat)', () => {
    const withGps: ViewerCheck = { ...base, gpsLat: 41.25664, gpsLng: -95.93117 }
    render(<DailyCheckDetails check={withGps} />)
    expect(screen.getByText('41.25664, -95.93117')).toBeInTheDocument()
  })
})
