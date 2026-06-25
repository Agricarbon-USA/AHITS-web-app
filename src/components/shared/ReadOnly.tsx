'use client'

import * as React from 'react'
import { Button, IconButton, Tooltip } from '@mui/material'
import type { ButtonProps, IconButtonProps } from '@mui/material'

// ─────────────────────────────────────────────────────────────────────────
// Capability gating for shared admin/operator surfaces (workplan §6).
//
// One source of truth for "can the current viewer mutate this page?". The same
// page components render for admins (canEdit = true) and, under org-wide
// read-only visibility, for operators (canEdit = false). Mutating controls are
// funneled through <MutationButton>/<MutationIconButton>/<EditGuard> so the
// hide-or-disable behavior is applied CENTRALLY and cannot drift page-to-page.
//
// This is presentation only. It is NOT a security boundary — every write route
// is independently guarded by requireAdmin server-side (see the write-auth
// audit in AHITS_SESSION11_READONLY_AND_AUDIT.md). UI hiding + API guard are
// defense-in-depth; never rely on this alone.
// ─────────────────────────────────────────────────────────────────────────

const ReadOnlyContext = React.createContext<{ canEdit: boolean }>({ canEdit: true })

/**
 * Wrap a surface to declare whether the viewer may mutate it. Admin layouts pass
 * canEdit; operator (read-only) renders pass canEdit={false}. Defaults to true so
 * any page not yet wrapped keeps full admin behavior (safe under the admin layout,
 * which only admits admins anyway).
 */
export function ReadOnlyProvider({ canEdit, children }: { canEdit: boolean; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ canEdit }), [canEdit])
  return <ReadOnlyContext.Provider value={value}>{children}</ReadOnlyContext.Provider>
}

/** True when the current viewer may mutate the surrounding surface. */
export function useCanEdit(): boolean {
  return React.useContext(ReadOnlyContext).canEdit
}

const VIEW_ONLY_TITLE = 'View only — you don’t have permission to change this'

/**
 * Render children only when the viewer can edit. Use to drop entire mutating
 * sections (forms, action toolbars) for read-only viewers.
 */
export function EditGuard({ children, fallback = null }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <>{useCanEdit() ? children : fallback}</>
}

/**
 * A Button that mutates. For read-only viewers it is hidden by default, or
 * disabled-with-tooltip when `keepVisible` is set (use when the control's absence
 * would make the layout confusing).
 */
export function MutationButton({ keepVisible = false, ...props }: ButtonProps & { keepVisible?: boolean }) {
  const canEdit = useCanEdit()
  if (canEdit) return <Button {...props} />
  if (!keepVisible) return null
  return (
    <Tooltip title={VIEW_ONLY_TITLE}>
      <span>
        <Button {...props} disabled />
      </span>
    </Tooltip>
  )
}

/** An IconButton that mutates — same hide-or-disable rule as MutationButton. */
export function MutationIconButton({
  keepVisible = false,
  tooltip,
  ...props
}: IconButtonProps & { keepVisible?: boolean; tooltip?: string }) {
  const canEdit = useCanEdit()
  if (canEdit) {
    return tooltip ? (
      <Tooltip title={tooltip}><IconButton {...props} /></Tooltip>
    ) : (
      <IconButton {...props} />
    )
  }
  if (!keepVisible) return null
  return (
    <Tooltip title={VIEW_ONLY_TITLE}>
      <span><IconButton {...props} disabled /></span>
    </Tooltip>
  )
}
