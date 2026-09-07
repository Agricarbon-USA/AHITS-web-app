import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ProjectSelect } from '@/components/shared/ProjectSelect'

// UXP-3 (3d): the shared optional Project picker for the deployment builders.
// Vocabulary is cloned from RequestComposer ("Project (optional)" / "— None —").

const PROJECTS = [
  { id: 'p1', name: 'TX Soil' },
  { id: 'p2', name: 'OH Carbon' },
]

describe('ProjectSelect', () => {
  it('renders the "Project (optional)" select with a None option and every project', () => {
    render(<ProjectSelect projects={PROJECTS} value="" onChange={() => {}} />)
    const select = screen.getByLabelText('Project (optional)')
    fireEvent.mouseDown(select)
    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getByText('— None —')).toBeInTheDocument()
    expect(within(listbox).getByText('TX Soil')).toBeInTheDocument()
    expect(within(listbox).getByText('OH Carbon')).toBeInTheDocument()
  })

  it('calls onChange with the picked project id', () => {
    const onChange = vi.fn()
    render(<ProjectSelect projects={PROJECTS} value="" onChange={onChange} />)
    fireEvent.mouseDown(screen.getByLabelText('Project (optional)'))
    fireEvent.click(within(screen.getByRole('listbox')).getByText('TX Soil'))
    expect(onChange).toHaveBeenCalledWith('p1')
  })

  it('shows the current value and lets None clear it', () => {
    const onChange = vi.fn()
    render(<ProjectSelect projects={PROJECTS} value="p2" onChange={onChange} />)
    expect(screen.getByLabelText('Project (optional)')).toHaveTextContent('OH Carbon')
    fireEvent.mouseDown(screen.getByLabelText('Project (optional)'))
    fireEvent.click(within(screen.getByRole('listbox')).getByText('— None —'))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('renders nothing when there are no projects', () => {
    const { container } = render(<ProjectSelect projects={[]} value="" onChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByLabelText('Project (optional)')).toBeNull()
  })
})
