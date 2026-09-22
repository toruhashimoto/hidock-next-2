/**
 * Shared, human date formatting used across Library, the reader, Actionables,
 * and meeting views. Every surface must show the YEAR (a year-old recording must
 * not read like this week's) and, where useful, a relative "x days ago" hint.
 */

import i18n from '@/i18n'

/**
 * The BCP 47 tag to format dates with. Derived from the active UI language
 * rather than the OS locale: a user who picked English in Settings expects
 * English dates even on a Japanese Windows.
 */
function dateLocale(): string {
  return i18n.language === 'ja' ? 'ja-JP' : 'en-US'
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) return null
  const d = value instanceof Date ? value : new Date(value)
  const ms = d.getTime()
  // Treat NaN AND the Unix epoch (or earlier) as "no real date". A timestamp at or
  // before 1970 is never a genuine capture/meeting date in this app — it's the
  // UNKNOWN_DATE sentinel used for undated recordings (see useUnifiedRecordings).
  // Rendering it as "Unknown date" (rather than "Jan 1, 1970" or a fake today) keeps
  // undated items honest and prevents months-apart bundling (#58).
  return Number.isNaN(ms) || ms <= 0 ? null : d
}

/**
 * Absolute date with the year, e.g. "Aug 21, 2025 · 11:14 AM".
 * Returns `fallback` (default "Unknown date") for missing/invalid input.
 */
export function formatSmartDate(
  value: Date | string | number | null | undefined,
  opts: { time?: boolean; fallback?: string } = {}
): string {
  const d = toDate(value)
  if (!d) return opts.fallback ?? i18n.t('common:date.unknown')
  const locale = dateLocale()
  const date = d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })
  if (opts.time === false) return date
  const time = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  return `${date} · ${time}`
}

/** Thresholds in seconds, largest first, with the Intl unit to report them in. */
const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60]
]

/**
 * Japanese relative hint via Intl. Only reached when the UI language is ja, so
 * the English branch below keeps producing its established short forms
 * ("5 min ago", "2 wks ago") byte-for-byte.
 */
function formatRelativeJa(d: Date, now: Date): string {
  const deltaSeconds = (d.getTime() - now.getTime()) / 1000
  const abs = Math.abs(deltaSeconds)
  if (abs < 45) return i18n.t('common:date.justNow')

  // style: 'narrow' — the default 'long' inserts a half-width space between the
  // numeral and the unit in this ICU's ja-JP data (e.g. "3 日前"), which reads
  // as unnatural Japanese. 'narrow' drops the space ("3日前") without changing
  // the unit words or numerals themselves.
  const rtf = new Intl.RelativeTimeFormat('ja-JP', { numeric: 'always', style: 'narrow' })
  for (const [unit, seconds] of RELATIVE_UNITS) {
    if (abs >= seconds) return rtf.format(Math.round(deltaSeconds / seconds), unit)
  }
  return rtf.format(Math.round(deltaSeconds / 60), 'minute')
}

/**
 * Relative hint: "just now", "5 min ago", "3 h ago", "2 days ago", "3 wks ago",
 * "5 mo ago", "2 yr ago". Returns null for missing/invalid input.
 */
export function formatRelativeDate(
  value: Date | string | number | null | undefined,
  now: Date = new Date()
): string | null {
  const d = toDate(value)
  if (!d) return null

  // Japanese takes the Intl path; English keeps its own short forms unchanged.
  if (i18n.language === 'ja') return formatRelativeJa(d, now)

  const diffMs = now.getTime() - d.getTime()
  const future = diffMs < 0
  const abs = Math.abs(diffMs)
  const sec = Math.round(abs / 1000)
  const min = Math.round(sec / 60)
  const hr = Math.round(min / 60)
  const day = Math.round(hr / 24)
  const wk = Math.round(day / 7)
  const mo = Math.round(day / 30)
  const yr = Math.round(day / 365)

  let core: string
  if (sec < 45) core = 'just now'
  else if (min < 60) core = `${min} min`
  else if (hr < 24) core = `${hr} h`
  else if (day < 7) core = `${day} day${day === 1 ? '' : 's'}`
  else if (day < 30) core = `${wk} wk${wk === 1 ? '' : 's'}`
  else if (day < 365) core = `${mo} mo`
  else core = `${yr} yr`

  if (core === 'just now') return core
  return future ? `in ${core}` : `${core} ago`
}

/** Absolute date + relative hint together, e.g. "Aug 21, 2025 · 11:14 AM (2 days ago)". */
export function formatSmartDateWithRelative(
  value: Date | string | number | null | undefined,
  opts: { time?: boolean; fallback?: string } = {}
): string {
  const absolute = formatSmartDate(value, opts)
  const rel = formatRelativeDate(value)
  return rel && absolute !== (opts.fallback ?? 'Unknown date') ? `${absolute} (${rel})` : absolute
}
