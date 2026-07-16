import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusChip } from '@/components/shared/StatusChip'
import { equipmentStatusMeta } from '@/lib/status'
import { density } from '@/theme/tokens'

describe('StatusChip v2', () => {
  it('renders a free-label badge (badge mode)', () => {
    render(<StatusChip label="Rental" color="warning" variant="outlined" />)
    expect(screen.getByText('Rental')).toBeInTheDocument()
  })

  it('maps a status to its vocabulary label (semantic mode)', () => {
    render(<StatusChip status="AVAILABLE" />)
    // Semantic mode looks the label up from the shared status vocabulary.
    expect(screen.getByText(equipmentStatusMeta('AVAILABLE').label)).toBeInTheDocument()
  })

  it('falls back to the raw status when the vocabulary has no entry', () => {
    render(<StatusChip status="NOT_A_REAL_STATUS" />)
    expect(screen.getByText('NOT_A_REAL_STATUS')).toBeInTheDocument()
  })

  it('applies the dense dimensions from tokens', () => {
    const { container } = render(<StatusChip label="Dense" />)
    const root = container.querySelector('.MuiChip-root') as HTMLElement
    expect(root).not.toBeNull()
    // Dense height is single-sourced from tokens.density.chipDense.
    expect(root).toHaveStyle({ height: `${density.chipDense.height}px` })
  })
})
