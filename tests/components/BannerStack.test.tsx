import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BannerStack, BANNER_PRIORITY, type BannerDescriptor } from '@/components/ui/BannerStack'

describe('BannerStack', () => {
  it('renders nothing when there are no banners', () => {
    const { container } = render(<BannerStack banners={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('collapses to the single highest-priority banner (lowest number wins)', () => {
    const banners: BannerDescriptor[] = [
      { id: 'info', priority: BANNER_PRIORITY.INFO, node: <div>info banner</div> },
      { id: 'critical', priority: BANNER_PRIORITY.CRITICAL, node: <div>critical banner</div> },
      { id: 'offline', priority: BANNER_PRIORITY.OFFLINE, node: <div>offline banner</div> },
    ]
    render(<BannerStack banners={banners} />)
    expect(screen.getByText('critical banner')).toBeInTheDocument()
    // The lower-priority banners are collapsed away — only one shows.
    expect(screen.queryByText('offline banner')).not.toBeInTheDocument()
    expect(screen.queryByText('info banner')).not.toBeInTheDocument()
  })

  it('resolves a same-priority tie to the earlier array entry', () => {
    const banners: BannerDescriptor[] = [
      { id: 'first', priority: BANNER_PRIORITY.CRITICAL, node: <div>first critical</div> },
      { id: 'second', priority: BANNER_PRIORITY.CRITICAL, node: <div>second critical</div> },
    ]
    render(<BannerStack banners={banners} />)
    expect(screen.getByText('first critical')).toBeInTheDocument()
    expect(screen.queryByText('second critical')).not.toBeInTheDocument()
  })
})
