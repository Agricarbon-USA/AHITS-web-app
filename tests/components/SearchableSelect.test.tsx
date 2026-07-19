import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SearchableSelect } from '@/components/shared/SearchableSelect'

// CC-14: the shared searchable single-select replacing flat roster/item dropdowns.
const OPTIONS = [
  { value: 'o1', label: 'Dana Ruiz' },
  { value: 'o2', label: 'Sam Patel' },
  { value: 'o3', label: 'Alex Kim' },
]

describe('SearchableSelect (CC-14)', () => {
  it('shows the selected option label', () => {
    render(<SearchableSelect label="Operator" value="o2" onChange={vi.fn()} options={OPTIONS} />)
    expect(screen.getByRole('combobox')).toHaveValue('Sam Patel')
  })

  it('fires onChange with the option value when one is picked', () => {
    const onChange = vi.fn()
    render(<SearchableSelect label="Operator" value="" onChange={onChange} options={OPTIONS} />)
    fireEvent.mouseDown(screen.getByRole('combobox'))
    const listbox = screen.getByRole('listbox')
    fireEvent.click(within(listbox).getByText('Alex Kim'))
    expect(onChange).toHaveBeenCalledWith('o3')
  })

  it('renders every option in the open listbox (type-to-filter is MUI Autocomplete\'s own behavior)', () => {
    render(<SearchableSelect label="Operator" value="" onChange={vi.fn()} options={OPTIONS} />)
    fireEvent.mouseDown(screen.getByRole('combobox'))
    const listbox = screen.getByRole('listbox')
    expect(within(listbox).getAllByRole('option')).toHaveLength(OPTIONS.length)
  })

  it('emits empty string when cleared', () => {
    const onChange = vi.fn()
    render(<SearchableSelect label="Operator" value="o1" onChange={onChange} options={OPTIONS} />)
    fireEvent.click(screen.getByLabelText('Clear'))
    expect(onChange).toHaveBeenCalledWith('')
  })
})
