/**
 * smartDate — honest rendering of the UNKNOWN_DATE (epoch) sentinel.
 *
 * Part of the #58 "months-apart bundling" fix: undated recordings carry the Unix
 * epoch sentinel, and every date surface must render it as "Unknown date" (never
 * "Jan 1, 1970" and never a fabricated today), with no misleading relative hint.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { formatSmartDate, formatRelativeDate, formatSmartDateWithRelative } from '../smartDate'
import i18n from '@/i18n'

describe('smartDate — epoch sentinel is treated as "no date"', () => {
  it('formatSmartDate renders the epoch as "Unknown date", not 1970', () => {
    expect(formatSmartDate(new Date(0))).toBe('Unknown date')
    expect(formatSmartDate(new Date(0), { time: true })).toBe('Unknown date')
    expect(formatSmartDate(0)).toBe('Unknown date')
  })

  it('formatSmartDate honors a custom fallback for the epoch', () => {
    expect(formatSmartDate(new Date(0), { fallback: '—' })).toBe('—')
  })

  it('formatRelativeDate returns null for the epoch (no "56 yr ago")', () => {
    expect(formatRelativeDate(new Date(0))).toBeNull()
  })

  it('formatSmartDateWithRelative collapses the epoch to "Unknown date"', () => {
    expect(formatSmartDateWithRelative(new Date(0))).toBe('Unknown date')
  })

  it('still renders real dates normally (regression guard)', () => {
    const real = new Date('2025-05-13T16:04:05')
    expect(formatSmartDate(real, { time: false })).toBe('May 13, 2025')
    expect(formatRelativeDate(real)).not.toBeNull()
  })
})

// Task 12 — dates and times follow the active UI language (i18n.language), not
// the OS locale. i18n is a module-level singleton shared across the whole test
// run, so every test below that switches to 'ja' must switch back, or the
// language leaks into unrelated test files that run after this one.
afterEach(() => {
  void i18n.changeLanguage('en')
})

describe('formatSmartDate — locale', () => {
  const when = new Date('2026-09-22T11:14:00')

  it('formats in US English by default', () => {
    expect(formatSmartDate(when, { time: false })).toBe('Sep 22, 2026')
  })

  it('formats in Japanese when the UI language is ja', async () => {
    await i18n.changeLanguage('ja')
    expect(formatSmartDate(when, { time: false })).toBe('2026年9月22日')
  })
})

describe('formatSmartDate — Japanese fallback catalogue', () => {
  it('renders the ja/common.json date.unknown fallback for the epoch sentinel', async () => {
    await i18n.changeLanguage('ja')
    expect(formatSmartDate(new Date(0))).toBe('日付不明')
  })
})

describe('formatRelativeDate — locale', () => {
  const now = new Date('2026-09-22T12:00:00')
  const threeDaysAgo = new Date('2026-09-19T12:00:00')

  it('renders English relative hints', () => {
    expect(formatRelativeDate(threeDaysAgo, now)).toBe('3 days ago')
  })

  it('renders Japanese relative hints', async () => {
    await i18n.changeLanguage('ja')
    // formatRelativeJa uses Intl.RelativeTimeFormat('ja-JP', { numeric: 'always',
    // style: 'narrow' }). The default style: 'long' inserts a half-width space
    // between the numeral and the unit in this ICU's ja-JP data ("3 日前"), which
    // reads as unnatural Japanese; 'narrow' drops it ("3日前"). Verified against
    // this repo's own Node/ICU:
    //   node -e "console.log(new Intl.RelativeTimeFormat('ja-JP',
    //     {numeric:'always',style:'narrow'}).format(-3,'day'))"  →  "3日前"
    expect(formatRelativeDate(threeDaysAgo, now)).toBe('3日前')
  })
})

/**
 * Every RELATIVE_UNITS bucket (see smartDate.ts), both directions (past and
 * future), asserting the exact strings Intl.RelativeTimeFormat('ja-JP',
 * { numeric: 'always', style: 'narrow' }) produces in this runtime (confirmed
 * with a standalone `node -e` run against the same Node/ICU that vitest itself
 * runs under, since jsdom tests execute in-process rather than in real
 * Electron/Chromium). style: 'narrow' is what smartDate.ts actually uses — the
 * default style: 'long' adds a half-width space between the numeral and the
 * unit ("3 日前") that reads as unnatural Japanese; 'narrow' drops it ("3日前")
 * without changing the unit words or numerals.
 *
 * There is no distinct "N seconds ago" in the design: anything under 45s
 * collapses to common:date.justNow ("たった今") for both languages (mirrors
 * the English branch, which also has no seconds granularity of its own). The
 * "< 45s" and "45-59s rounds into a minute" cases below stand in for the
 * "seconds" unit for that reason.
 *
 * Timezone note: every delta here is derived as `now.getTime() +/- <exact ms>`
 * — pure epoch-millisecond arithmetic — rather than from separately-authored
 * date-time strings. That sidesteps local-time parsing/day-boundary ambiguity
 * entirely, so these assertions hold the same way in JST (this machine) as in
 * any other timezone; only the absolute value of `now` itself is parsed as
 * local time; its offset cancels out of every delta below.
 */
describe('formatRelativeDate — Japanese, every unit, both directions', () => {
  const now = new Date('2026-09-22T12:00:00')
  const SEC = 1000
  const MIN = 60 * SEC
  const HOUR = 60 * MIN
  const DAY = 24 * HOUR
  const WEEK = 7 * DAY
  // formatRelativeJa buckets "month" at a flat 30 days and "year" at a flat
  // 365 days (RELATIVE_UNITS in smartDate.ts) — not calendar months/years —
  // so these deltas mirror the implementation's own flat constants.
  const MONTH = 30 * DAY
  const YEAR = 365 * DAY

  beforeEach(async () => {
    await i18n.changeLanguage('ja')
  })

  it('seconds (< 45s) — past and future both read "just now"', () => {
    expect(formatRelativeDate(new Date(now.getTime() - 30 * SEC), now)).toBe('たった今')
    expect(formatRelativeDate(new Date(now.getTime() + 30 * SEC), now)).toBe('たった今')
  })

  it('seconds (45-59s) — rounds up into the minute bucket, not "0 minutes"', () => {
    expect(formatRelativeDate(new Date(now.getTime() - 50 * SEC), now)).toBe('1分前')
    expect(formatRelativeDate(new Date(now.getTime() + 50 * SEC), now)).toBe('1分後')
  })

  it('minutes', () => {
    expect(formatRelativeDate(new Date(now.getTime() - 5 * MIN), now)).toBe('5分前')
    expect(formatRelativeDate(new Date(now.getTime() + 5 * MIN), now)).toBe('5分後')
  })

  it('hours', () => {
    expect(formatRelativeDate(new Date(now.getTime() - 3 * HOUR), now)).toBe('3時間前')
    expect(formatRelativeDate(new Date(now.getTime() + 3 * HOUR), now)).toBe('3時間後')
  })

  it('days', () => {
    expect(formatRelativeDate(new Date(now.getTime() - 3 * DAY), now)).toBe('3日前')
    expect(formatRelativeDate(new Date(now.getTime() + 3 * DAY), now)).toBe('3日後')
  })

  it('weeks', () => {
    expect(formatRelativeDate(new Date(now.getTime() - 2 * WEEK), now)).toBe('2週間前')
    expect(formatRelativeDate(new Date(now.getTime() + 2 * WEEK), now)).toBe('2週間後')
  })

  it('months', () => {
    expect(formatRelativeDate(new Date(now.getTime() - 5 * MONTH), now)).toBe('5か月前')
    expect(formatRelativeDate(new Date(now.getTime() + 5 * MONTH), now)).toBe('5か月後')
  })

  it('years', () => {
    expect(formatRelativeDate(new Date(now.getTime() - 2 * YEAR), now)).toBe('2年前')
    expect(formatRelativeDate(new Date(now.getTime() + 2 * YEAR), now)).toBe('2年後')
  })
})
