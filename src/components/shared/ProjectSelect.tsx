'use client'

import * as React from 'react'
import { TextField, MenuItem, type SxProps, type Theme } from '@mui/material'

// UXP-3 (3d): the one optional Project picker for deployment builders (admin stepper
// and the operator Start-Deployment dialog), cloned from RequestComposer's field so the
// vocabulary can't drift ("Project (optional)" / "— None —"). Renders nothing when there
// are no projects — an empty select would only be a question with no answers.

export interface ProjectSelectOption {
  id: string
  name: string
}

export function ProjectSelect({
  projects,
  value,
  onChange,
  size,
  sx,
}: {
  projects: ProjectSelectOption[]
  value: string
  onChange: (projectId: string) => void
  size?: 'small' | 'medium'
  sx?: SxProps<Theme>
}) {
  if (projects.length === 0) return null
  return (
    <TextField
      select
      label="Project (optional)"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fullWidth
      size={size}
      sx={sx}
    >
      <MenuItem value="">— None —</MenuItem>
      {projects.map((p) => (
        <MenuItem key={p.id} value={p.id}>
          {p.name}
        </MenuItem>
      ))}
    </TextField>
  )
}
