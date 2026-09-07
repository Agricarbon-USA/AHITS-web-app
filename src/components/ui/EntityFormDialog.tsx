'use client'

import * as React from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Alert, Typography, Box,
  CircularProgress, useTheme, useMediaQuery,
} from '@mui/material'
import type { DialogProps } from '@mui/material'
import type { Breakpoint } from '@mui/material/styles'
import { useHistoryGuard } from '@/hooks/useHistoryGuard'
import { MutationButton } from '@/components/shared/ReadOnly'

// UXP-6 (6a): CC-23 primitive #4 — the ONE create/edit dialog grammar for every
// admin form (vehicle · item · stock moves · deployment · checklist · users), so
// the five hand-rolled dialogs stop drifting on validation UX, pinned buttons,
// busy state and data loss (plan §1.1 / §2). It is a thin wrapper over MUI
// Dialog with NO entity knowledge:
//
//  - The dialog Paper IS the <form> (`slotProps.paper = { component: 'form' }`),
//    so Cancel/Save are pinned in DialogActions AND Enter in any single-line
//    field submits (C7 for everyone, including the `<Box component="form">` wrappers).
//  - `title` is verb + noun in sentence case ("Add vehicle" / "Edit vehicle");
//    the deployment builder keeps the locked D11 verb "Start Deployment".
//  - `formError` renders ONE Alert above the fields; field errors stay on the
//    fields (`error` + `helperText`, which MUI turns into `aria-invalid`).
//  - Validation failure (caller returns `false` or throws `FieldValidationError`)
//    scrolls the first `[aria-invalid="true"]` into view and focuses it.
//  - `saving` → spinner-in-button, Cancel disabled, backdrop / Esc / hardware Back
//    all blocked, double-submit ignored.
//  - `dirty` (from `useDirtyState`) → any close attempt (backdrop, Esc, Cancel,
//    hardware Back via `useHistoryGuard`) asks "Discard changes?" first.
//    `historyGuard={false}` opts a dialog out of the Back guard (a caller that
//    already answers Back itself); the guard nests correctly under an open
//    DetailDrawer (the hook is nest-aware — Back closes the dialog first).
//  - `secondaryAction` sits between Cancel and Save ("Save & add another").
//    Make it `type="button"`: flip an intent ref in its onClick and call
//    `e.currentTarget.form?.requestSubmit()`, then read + reset the ref in
//    `onSubmit`. It must NOT be `type="submit"` — rendered before the primary it
//    would be the form's DEFAULT button, so Enter in any field (implicit
//    submission) would fire "Save & add another" instead of Save.
//  - `fullScreenXs` for forms taller than a phone (vehicle, item, deployment).
//
// Native constraint validation is OFF by default (`noValidate`) so the browser's
// bubble never pre-empts the inline grammar; pass `noValidate={false}` to keep it.

/**
 * Throw from `onSubmit` after setting your field errors to say "don't submit,
 * scroll to the first invalid field". A non-empty message is shown in the
 * form-level Alert (when the `formError` prop is not already set).
 */
export class FieldValidationError extends Error {
  constructor(message = '') {
    super(message)
    this.name = 'FieldValidationError'
  }
}

/** `false` = validation failed (scroll to the first invalid field); anything else = handled. */
export type SubmitResult = void | boolean

// MUI types the paper slot as a div; ours renders a real <form> (`noValidate` is a form attribute).
type PaperSlotProps = NonNullable<NonNullable<DialogProps['slotProps']>['paper']>

export interface EntityFormDialogProps {
  open: boolean
  /** Verb + noun, sentence case: "Add vehicle", "Edit checklist", "Move stock". */
  title: string
  /** Called when the dialog should close (after the discard confirm, if dirty). */
  onClose: () => void
  /**
   * The caller owns validation + the request. Return `false` (or throw a
   * `FieldValidationError`) after marking fields invalid to trigger the
   * scroll-to-first-invalid; anything else means "done" — close via `onClose`
   * yourself once the save lands. Other thrown errors propagate.
   */
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => SubmitResult | Promise<SubmitResult>
  /** Request in flight: spinner in the submit button, everything else locked. */
  saving?: boolean
  /** Default "Save". "Add", "Start Deployment", "Move", "Send invite"… */
  submitLabel?: string
  /** Label while `saving`. Default "Saving…". */
  savingLabel?: string
  /** Default "Cancel". */
  cancelLabel?: string
  /** Disable the submit button (e.g. a wizard step that is not ready). */
  submitDisabled?: boolean
  /** Icon for the submit button when not saving (the spinner replaces it). */
  submitIcon?: React.ReactNode
  /** From `useDirtyState`. When true a close attempt asks "Discard changes?". */
  dirty?: boolean
  /**
   * Arm `useHistoryGuard` while open so hardware/browser Back is a close attempt.
   * Default true. Pass false only when the caller answers Back itself.
   */
  historyGuard?: boolean
  /** One form-level message rendered as an Alert above the fields. */
  formError?: string | null
  /** Caption slot under the title — pass `<RequiredLegend />` when any field is required. */
  legend?: React.ReactNode
  /** Extra button(s) between Cancel and the submit button. */
  secondaryAction?: React.ReactNode
  /** Full-screen on xs phones (forms with more than ~8 fields). */
  fullScreenXs?: boolean
  /** MUI Dialog maxWidth. Default 'sm'. */
  maxWidth?: Breakpoint | false
  /** Turn native constraint validation back on. Default true (off). */
  noValidate?: boolean
  /** The fields. */
  children: React.ReactNode
}

/**
 * Scroll the first invalid control inside `root` into view and focus it.
 * Returns the element, or null when nothing is marked invalid. Safe in jsdom.
 */
export function scrollToFirstInvalid(root: ParentNode | null | undefined): HTMLElement | null {
  if (!root) return null
  const el = root.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (!el) return null
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.focus({ preventScroll: true })
  return el
}

/** The one required-field legend: matches MUI's asterisk (error-coloured "*"). */
export function RequiredLegend() {
  return (
    <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
      <Box component="span" sx={{ color: 'error.main', fontWeight: 700 }}>*</Box> required
    </Typography>
  )
}

export function EntityFormDialog({
  open,
  title,
  onClose,
  onSubmit,
  saving = false,
  submitLabel = 'Save',
  savingLabel = 'Saving…',
  cancelLabel = 'Cancel',
  submitDisabled = false,
  submitIcon,
  dirty = false,
  historyGuard = true,
  formError,
  legend,
  secondaryAction,
  fullScreenXs = false,
  maxWidth = 'sm',
  noValidate = true,
  children,
}: EntityFormDialogProps) {
  const theme = useTheme()
  const isXs = useMediaQuery(theme.breakpoints.down('sm'))

  const [confirmOpen, setConfirmOpen] = React.useState(false)
  // A `FieldValidationError` message, shown when the caller has no `formError` set.
  const [thrownError, setThrownError] = React.useState<string | null>(null)
  // Bumped after a failed validation; the effect below does the scroll once the
  // caller's `error` props have committed `aria-invalid` to the DOM.
  const [scrollTick, setScrollTick] = React.useState(0)
  const formElRef = React.useRef<HTMLFormElement | null>(null)

  // Reset per-open state on the open/close transition (React's documented
  // "information from previous renders" pattern — no effect, no ref-in-render).
  const [wasOpen, setWasOpen] = React.useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    setConfirmOpen(false)
    setThrownError(null)
  }

  React.useEffect(() => {
    if (scrollTick === 0) return
    scrollToFirstInvalid(formElRef.current)
  }, [scrollTick])

  // Every close path funnels through here: backdrop, Esc, Cancel, hardware Back.
  const requestClose = () => {
    if (saving) return
    if (confirmOpen) { setConfirmOpen(false); return } // Back while the confirm shows = keep editing
    if (dirty) { setConfirmOpen(true); return }
    onClose()
  }
  // UXP-1e: hardware/browser Back is a close attempt, not a page exit. Opened from
  // inside a DetailDrawer the guard nests above the drawer's, so Back closes this
  // dialog first and the drawer only on the next press.
  useHistoryGuard(open && historyGuard, requestClose)

  const discard = () => {
    setConfirmOpen(false)
    onClose()
  }

  // MUI types the paper slot as a div; the Paper renders a real <form> here.
  const handleSubmit = async (raw: React.FormEvent<HTMLElement>) => {
    const event = raw as unknown as React.FormEvent<HTMLFormElement>
    event.preventDefault()
    // The Paper is portaled, so a React submit would otherwise bubble to any
    // ancestor form in the React tree.
    event.stopPropagation()
    if (saving) return
    formElRef.current = event.currentTarget
    setThrownError(null)
    let result: SubmitResult
    try {
      result = await onSubmit(event)
    } catch (err) {
      if (err instanceof FieldValidationError) {
        if (err.message) setThrownError(err.message)
        setScrollTick((n) => n + 1)
        return
      }
      throw err
    }
    if (result === false) setScrollTick((n) => n + 1)
  }

  const alertText = formError || thrownError || null
  const paperSlotProps = { component: 'form', onSubmit: handleSubmit, noValidate } as PaperSlotProps

  return (
    <>
      <Dialog
        open={open}
        onClose={requestClose}
        disableEscapeKeyDown={saving}
        maxWidth={maxWidth}
        fullWidth
        fullScreen={fullScreenXs && isXs}
        slotProps={{ paper: paperSlotProps }}
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogContent>
          {alertText && <Alert severity="error" sx={{ mb: 2 }}>{alertText}</Alert>}
          {legend && <Box sx={{ mb: 1 }}>{legend}</Box>}
          {children}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={requestClose} disabled={saving}>{cancelLabel}</Button>
          {secondaryAction}
          {/* MutationButton: under org-wide read-only the submit is disabled with the
              "View only" tooltip instead of vanishing (the C7 MoveStock dialog already
              gated its submit this way — inventory/page.tsx:344). */}
          <MutationButton
            keepVisible
            type="submit"
            variant="contained"
            disabled={saving || submitDisabled}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : submitIcon}
          >
            {saving ? savingLabel : submitLabel}
          </MutationButton>
        </DialogActions>
      </Dialog>

      {/* Discard confirm. Local rather than the shared ConfirmDialog because its
          cancel label is fixed to "Cancel" — here the two answers must be
          "Keep editing" / "Discard" so neither reads as "cancel the save". */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Discard changes?</DialogTitle>
        <DialogContent>
          <Typography>This form has unsaved changes.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmOpen(false)} autoFocus>Keep editing</Button>
          <Button variant="contained" color="error" onClick={discard}>Discard</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
