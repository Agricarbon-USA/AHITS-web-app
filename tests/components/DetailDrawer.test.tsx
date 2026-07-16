import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { DetailDrawer } from '@/components/ui/DetailDrawer'

describe('DetailDrawer', () => {
  it('renders its children when open', () => {
    render(
      <DetailDrawer open onClose={() => {}}>
        <div>drawer content</div>
      </DetailDrawer>,
    )
    expect(screen.getByText('drawer content')).toBeInTheDocument()
  })

  it('does not render children when closed', () => {
    render(
      <DetailDrawer open={false} onClose={() => {}}>
        <div>drawer content</div>
      </DetailDrawer>,
    )
    // MUI's temporary Drawer unmounts its content while closed (keepMounted=false).
    expect(screen.queryByText('drawer content')).not.toBeInTheDocument()
  })

  it('calls onClose when the backdrop is clicked', async () => {
    const onClose = vi.fn()
    render(
      <DetailDrawer open onClose={onClose}>
        <div>drawer content</div>
      </DetailDrawer>,
    )
    // The MUI Drawer renders a backdrop; clicking it triggers onClose.
    const backdrop = document.querySelector('.MuiBackdrop-root') as HTMLElement
    expect(backdrop).not.toBeNull()
    backdrop.click()
    expect(onClose).toHaveBeenCalled()
  })
})
