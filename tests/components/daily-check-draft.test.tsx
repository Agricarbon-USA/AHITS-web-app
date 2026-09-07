import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  DRAFT_PREFIX, draftKey, draftUserId, saveDraft, loadDraft, loadLatestDraft, clearDraft, purgeDraftsNotOn,
  purgeDraftsForUser,
  type DailyCheckDraftInput,
} from '@/lib/daily-check-draft'

// UXP-3 (3h): the daily-check draft store. Pure localStorage module; these pin the
// key scheme (operator-scoped on a shared phone), the same-day-only restore, the
// logout purge, and the non-negotiable "storage can never throw into the page".
//
// This file is .tsx on purpose: the node vitest config collects tests/**/*.test.ts,
// and these touch window.localStorage — only the jsdom config may pick them up.

const TODAY = '2026-09-03'
const YESTERDAY = '2026-09-02'

function draft(over: Partial<DailyCheckDraftInput> = {}): DailyCheckDraftInput {
  return {
    vehicleId: 'v1',
    date: TODAY,
    step: 1,
    odometer: '12345',
    site: 'North 40',
    siteTouched: true,
    issues: '',
    issuesPrefilled: false,
    rowsTouched: true,
    checklist: [
      { key: 'brakes', label: 'Brakes', value: 'no', note: 'Soft pedal' },
      { key: 'lights', label: 'Lights', value: 'yes', note: '' },
    ],
    elapsedMs: 42_000,
    ...over,
  }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('daily-check draft — keys', () => {
  it('falls back to "anon" with no cached identity, and uses the SessionUser userId when present', () => {
    expect(draftUserId()).toBe('anon')
    expect(draftKey('v1', TODAY)).toBe(`${DRAFT_PREFIX}anon:v1:${TODAY}`)

    window.localStorage.setItem('ahits_identity', JSON.stringify({ userId: 'op-7', role: 'OPERATOR', name: 'Sam', email: 's@x' }))
    expect(draftUserId()).toBe('op-7')
    expect(draftKey('v1', TODAY)).toBe(`${DRAFT_PREFIX}op-7:v1:${TODAY}`)
  })

  it('treats a corrupt identity cache as anonymous', () => {
    window.localStorage.setItem('ahits_identity', '{not json')
    expect(draftUserId()).toBe('anon')
  })
})

describe('daily-check draft — save / load / clear', () => {
  it('round-trips a draft with a version and a savedAt stamp', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 })
    saveDraft(draft())
    const loaded = loadDraft('v1', TODAY)
    expect(loaded).toMatchObject({ ...draft(), v: 1, savedAt: 1_700_000_000_000 })
  })

  it('returns null for a vehicle or date with no draft', () => {
    saveDraft(draft())
    expect(loadDraft('v2', TODAY)).toBeNull()
    expect(loadDraft('v1', YESTERDAY)).toBeNull()
  })

  it('clearDraft removes exactly that vehicle+date', () => {
    saveDraft(draft({ vehicleId: 'v1' }))
    saveDraft(draft({ vehicleId: 'v2' }))
    clearDraft('v1', TODAY)
    expect(loadDraft('v1', TODAY)).toBeNull()
    expect(loadDraft('v2', TODAY)).not.toBeNull()
  })

  it('is scoped to the signed-in operator — another user\'s draft is invisible', () => {
    window.localStorage.setItem('ahits_identity', JSON.stringify({ userId: 'op-1' }))
    saveDraft(draft())
    window.localStorage.setItem('ahits_identity', JSON.stringify({ userId: 'op-2' }))
    expect(loadDraft('v1', TODAY)).toBeNull()
    expect(loadLatestDraft(TODAY)).toBeNull()
    window.localStorage.setItem('ahits_identity', JSON.stringify({ userId: 'op-1' }))
    expect(loadDraft('v1', TODAY)?.vehicleId).toBe('v1')
  })

  it('rejects a draft of the wrong version or a mangled shape', () => {
    window.localStorage.setItem(draftKey('v1', TODAY), JSON.stringify({ ...draft(), v: 99, savedAt: 1 }))
    expect(loadDraft('v1', TODAY)).toBeNull()
    window.localStorage.setItem(draftKey('v1', TODAY), JSON.stringify({ ...draft(), v: 1, savedAt: 1, checklist: [{ key: 'x', label: 'X', value: 'maybe' }] }))
    expect(loadDraft('v1', TODAY)).toBeNull()
    window.localStorage.setItem(draftKey('v1', TODAY), 'garbage')
    expect(loadDraft('v1', TODAY)).toBeNull()
  })

  it('clamps a step outside the wizard and defaults missing optional fields', () => {
    window.localStorage.setItem(draftKey('v1', TODAY), JSON.stringify({
      v: 1, vehicleId: 'v1', date: TODAY, step: 9, savedAt: 1,
      checklist: [{ key: 'brakes', label: 'Brakes', value: 'yes' }],
    }))
    expect(loadDraft('v1', TODAY)).toMatchObject({
      step: 2, odometer: '', site: '', siteTouched: false, issues: '', rowsTouched: false, elapsedMs: 0,
      checklist: [{ key: 'brakes', label: 'Brakes', value: 'yes', note: '' }],
    })
  })
})

describe('daily-check draft — latest / purge', () => {
  it('loadLatestDraft picks the most recently saved draft dated that day', () => {
    vi.useFakeTimers({ now: 1_000 })
    saveDraft(draft({ vehicleId: 'v1' }))
    vi.setSystemTime(3_000)
    saveDraft(draft({ vehicleId: 'v3' }))
    vi.setSystemTime(2_000)
    saveDraft(draft({ vehicleId: 'v2' }))
    expect(loadLatestDraft(TODAY)?.vehicleId).toBe('v3')
  })

  it('loadLatestDraft ignores other days', () => {
    saveDraft(draft({ vehicleId: 'v1', date: YESTERDAY }))
    expect(loadLatestDraft(TODAY)).toBeNull()
  })

  it('purgeDraftsNotOn drops every draft not dated today, for any user, and leaves today\'s', () => {
    window.localStorage.setItem('ahits_identity', JSON.stringify({ userId: 'op-1' }))
    saveDraft(draft({ vehicleId: 'v1', date: YESTERDAY }))
    saveDraft(draft({ vehicleId: 'v2', date: TODAY }))
    window.localStorage.setItem('ahits_identity', JSON.stringify({ userId: 'op-2' }))
    saveDraft(draft({ vehicleId: 'v1', date: YESTERDAY }))
    window.localStorage.setItem(`${DRAFT_PREFIX}op-9:vX:${TODAY}`, 'not a draft')
    window.localStorage.setItem('ahits_unrelated', 'keep me')

    purgeDraftsNotOn(TODAY)

    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(DRAFT_PREFIX))
    expect(keys).toEqual([`${DRAFT_PREFIX}op-1:v2:${TODAY}`])
    expect(window.localStorage.getItem('ahits_unrelated')).toBe('keep me')
  })

  // Privacy (antagonist review): a sign-out takes the operator's drafts with it, so the
  // next user of a shared phone never inherits them — every vehicle, every date, only
  // that user (the trailing ':' in the prefix keeps op-1 away from op-10's keys).
  it('purgeDraftsForUser drops exactly that user\'s drafts — any vehicle, any date — and nothing else', () => {
    window.localStorage.setItem('ahits_identity', JSON.stringify({ userId: 'op-1' }))
    saveDraft(draft({ vehicleId: 'v1', date: TODAY }))
    saveDraft(draft({ vehicleId: 'v2', date: YESTERDAY }))
    window.localStorage.setItem('ahits_identity', JSON.stringify({ userId: 'op-10' }))
    saveDraft(draft({ vehicleId: 'v1', date: TODAY }))
    window.localStorage.setItem('ahits_identity', JSON.stringify({ userId: 'op-2' }))
    saveDraft(draft({ vehicleId: 'v1', date: TODAY }))
    window.localStorage.setItem('ahits_identity', 'not the purged user any more') // corrupt / cleared — irrelevant to the purge
    window.localStorage.setItem('ahits_unrelated', 'keep me')

    purgeDraftsForUser('op-1')

    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(DRAFT_PREFIX)).sort()
    expect(keys).toEqual([`${DRAFT_PREFIX}op-10:v1:${TODAY}`, `${DRAFT_PREFIX}op-2:v1:${TODAY}`])
    expect(window.localStorage.getItem('ahits_unrelated')).toBe('keep me')
  })

  it('purgeDraftsForUser with an empty id is a no-op (never a wildcard)', () => {
    window.localStorage.setItem('ahits_identity', JSON.stringify({ userId: 'op-1' }))
    saveDraft(draft({ vehicleId: 'v1' }))
    purgeDraftsForUser('')
    expect(loadDraft('v1', TODAY)).not.toBeNull()
  })
})

describe('daily-check draft — storage that throws never throws into the page', () => {
  it('every call is a safe no-op when localStorage throws', () => {
    const boom = () => { throw new Error('QuotaExceededError') }
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(boom)
    vi.spyOn(Storage.prototype, 'key').mockImplementation(boom)

    expect(() => saveDraft(draft())).not.toThrow()
    expect(loadDraft('v1', TODAY)).toBeNull()
    expect(loadLatestDraft(TODAY)).toBeNull()
    expect(() => clearDraft('v1', TODAY)).not.toThrow()
    expect(() => purgeDraftsNotOn(TODAY)).not.toThrow()
    expect(() => purgeDraftsForUser('op-1')).not.toThrow()
    expect(draftUserId()).toBe('anon')
  })

  it('is a safe no-op when the Storage accessor itself throws (disabled storage)', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('SecurityError') } })
    try {
      expect(() => saveDraft(draft())).not.toThrow()
      expect(loadDraft('v1', TODAY)).toBeNull()
      expect(loadLatestDraft(TODAY)).toBeNull()
      expect(() => purgeDraftsNotOn(TODAY)).not.toThrow()
      expect(() => purgeDraftsForUser('op-1')).not.toThrow()
    } finally {
      // Restore the own descriptor, or drop the shadow so the prototype getter shows again.
      if (original) Object.defineProperty(window, 'localStorage', original)
      else delete (window as unknown as Record<string, unknown>).localStorage
      expect(window.localStorage).toBeDefined()
    }
  })
})
