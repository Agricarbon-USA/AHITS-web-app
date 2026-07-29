// CC-24: one-tap note presets for deployment launch and kit-mutation dialogs.
// The note is optional (server + client both relaxed) — these chips fill it in
// one tap, and free text stays available. Keep this list short.
export const NOTE_PRESETS = ['Picked up from hub', 'End of day return'] as const

// CC-32 (2.3): the same one-tap pattern for the entire-rig transfer dialog, whose note
// went from required to optional. Shift-boundary wording — an entire-rig transfer is a
// shift boundary, not a stock movement. Keep this list short too.
// CC-33 (D22): 'covering handoff' → 'covering transfer' (no operator-facing "handoff").
export const HANDOFF_NOTE_PRESETS = ['End of shift', 'Heading home — covering transfer'] as const
