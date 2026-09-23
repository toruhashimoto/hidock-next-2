import { describe, it, expect, afterEach } from 'vitest'
import { getRelativeTime, formatDate, formatTime, formatDateTime, formatDuration, formatBytes, validateId } from '../utils'
import i18n from '@/i18n'

describe('getRelativeTime', () => {
  it('should return "Just now" for dates less than 1 minute ago', () => {
    const now = new Date()
    expect(getRelativeTime(now)).toBe('Just now')
    expect(getRelativeTime(new Date(now.getTime() - 30000))).toBe('Just now')
  })

  it('should return minutes ago for dates less than 1 hour ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60000)
    expect(getRelativeTime(fiveMinAgo)).toBe('5m ago')
  })

  it('should return hours ago for dates less than 1 day ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600000)
    expect(getRelativeTime(threeHoursAgo)).toBe('3h ago')
  })

  it('should return days ago for dates less than 1 week ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000)
    expect(getRelativeTime(twoDaysAgo)).toBe('2d ago')
  })

  it('should return formatted date for dates over 1 week ago', () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000)
    const result = getRelativeTime(twoWeeksAgo)
    // Should be a formatted date string, not relative
    expect(result).not.toContain('ago')
    expect(result).not.toBe('Just now')
  })

  it('should accept string dates', () => {
    const now = new Date().toISOString()
    expect(getRelativeTime(now)).toBe('Just now')
  })
})

describe('formatDateTime', () => {
  it('should format a date with day and time', () => {
    const date = new Date('2026-03-01T14:30:00')
    const result = formatDateTime(date)
    expect(result).toContain('at')
    expect(result).toContain('Mar')
  })

  it('should accept string dates', () => {
    const result = formatDateTime('2026-03-01T14:30:00')
    expect(result).toContain('Mar')
  })
})

describe('formatDuration', () => {
  it('should format seconds only', () => {
    expect(formatDuration(45)).toBe('45s')
  })

  it('should format minutes and seconds', () => {
    expect(formatDuration(125)).toBe('2m 5s')
  })

  it('should format hours and minutes', () => {
    expect(formatDuration(3661)).toBe('1h 1m')
  })
})

describe('formatBytes', () => {
  it('should return 0 B for zero', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('should format KB', () => {
    expect(formatBytes(1024)).toBe('1 KB')
  })

  it('should format MB', () => {
    expect(formatBytes(1048576)).toBe('1 MB')
  })
})

describe('validateId', () => {
  it('should accept valid string IDs', () => {
    expect(validateId('abc-123')).toBe(true)
    expect(validateId('uuid-v4-like-id')).toBe(true)
  })

  it('should reject non-string values', () => {
    expect(validateId(123)).toBe(false)
    expect(validateId(null)).toBe(false)
    expect(validateId(undefined)).toBe(false)
  })

  it('should reject empty strings', () => {
    expect(validateId('')).toBe(false)
  })

  it('should reject prototype pollution attempts', () => {
    expect(validateId('__proto__')).toBe(false)
    expect(validateId('constructor')).toBe(false)
  })
})

// Task 17-E — formatDate/formatTime/formatDateTime/formatDuration follow the
// active UI language (i18n.language), mirroring the lib/smartDate.ts pattern:
// the English branch below is the original, untouched code (reached whenever
// the language isn't 'ja'), and a separate Japanese path is measured against
// this repo's own Node/ICU — the same one vitest runs under — rather than
// guessed. i18n is a module-level singleton shared across the whole test
// run, so every test below that switches to 'ja' restores 'en' in its own
// afterEach, or the language leaks into unrelated test files that run after
// this one (see smartDate.test.ts).
//
// Dates are written as local-time ISO strings (`'2026-09-23T15:30:00'`, no
// 'Z'/offset), which `new Date(...)` parses in the machine's local timezone.
// This machine runs JST (UTC+9), so these are the same values the
// measurements below were taken against — no UTC/JST mismatch.

describe('formatDate — locale', () => {
  afterEach(() => {
    void i18n.changeLanguage('en')
  })

  it('keeps the English rendering unchanged (weekday + short month + day, no year)', () => {
    const date = new Date('2026-09-23T15:30:00') // Wednesday
    expect(formatDate(date)).toBe('Wed, Sep 23')
  })

  it('formats in Japanese when the UI language is ja', async () => {
    await i18n.changeLanguage('ja')
    // Measured with:
    //   node -e "console.log(new Date('2026-09-23T15:30:00').toLocaleDateString(
    //     'ja-JP', {year:'numeric',month:'short',day:'numeric',weekday:'short'}))"
    // → "2026年9月23日(水)"
    const date = new Date('2026-09-23T15:30:00')
    expect(formatDate(date)).toBe('2026年9月23日(水)')
  })
})

describe('formatTime — locale', () => {
  afterEach(() => {
    void i18n.changeLanguage('en')
  })

  it('keeps the English 12-hour rendering unchanged', () => {
    const date = new Date('2026-09-23T15:30:00')
    expect(formatTime(date)).toBe('03:30 PM')
  })

  it('formats as a 24-hour clock when the UI language is ja', async () => {
    await i18n.changeLanguage('ja')
    // Measured with:
    //   node -e "console.log(new Date('2026-09-23T15:30:00').toLocaleTimeString(
    //     'ja-JP', {hour:'2-digit',minute:'2-digit',hour12:false}))"
    // → "15:30" — 24-hour, no AM/PM (hour12 is an English-ism).
    const date = new Date('2026-09-23T15:30:00')
    expect(formatTime(date)).toBe('15:30')
  })

  it('zero-pads single-digit hours in Japanese the same way the English branch does', async () => {
    await i18n.changeLanguage('ja')
    // Measured the same way as above, at 03:05 → "03:05" (not "3:05"),
    // matching the English branch's own hour: '2-digit' zero-padding.
    const date = new Date('2026-09-23T03:05:00')
    expect(formatTime(date)).toBe('03:05')
  })
})

describe('formatDateTime — locale', () => {
  afterEach(() => {
    void i18n.changeLanguage('en')
  })

  it('joins date and time with " · " (no English preposition) when the UI language is ja', async () => {
    await i18n.changeLanguage('ja')
    const date = new Date('2026-09-23T15:30:00')
    expect(formatDateTime(date)).toBe('2026年9月23日(水) · 15:30')
  })
})

describe('formatDuration — locale', () => {
  afterEach(() => {
    void i18n.changeLanguage('en')
  })

  it('formats seconds only in Japanese', async () => {
    await i18n.changeLanguage('ja')
    expect(formatDuration(45)).toBe('45秒')
  })

  it('formats minutes and seconds in Japanese', async () => {
    await i18n.changeLanguage('ja')
    expect(formatDuration(320)).toBe('5分20秒')
  })

  it('formats hours and minutes in Japanese', async () => {
    await i18n.changeLanguage('ja')
    expect(formatDuration(5400)).toBe('1時間30分')
  })
})

describe('getRelativeTime — locale (long-tail falls through to formatDate)', () => {
  afterEach(() => {
    void i18n.changeLanguage('en')
  })

  it('renders the localized formatDate for dates over a week old when the UI language is ja', async () => {
    await i18n.changeLanguage('ja')
    // Pure epoch-millisecond arithmetic (not a parsed date-time string), so
    // this holds the same way in JST (this machine) as in any other timezone
    // — see smartDate.test.ts for the same reasoning applied there.
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000)
    const result = getRelativeTime(twoWeeksAgo)
    expect(result).toBe(formatDate(twoWeeksAgo))
    expect(result).not.toContain('ago')
    expect(result).toContain('年')
  })
})
