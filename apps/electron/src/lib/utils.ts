import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import i18n from '@/i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Japanese rendering for formatDate: kanji year/month/day plus the short
 * weekday in parentheses, e.g. "2026年9月23日(水)" — this ICU's own ja-JP
 * pattern for { year: 'numeric', month: 'short', day: 'numeric', weekday:
 * 'short' } (verified with a standalone `node -e` run against this repo's
 * own Node/ICU, the same one vitest runs under; see utils.test.ts). Only
 * reached when the UI language is ja, so the English branch below keeps
 * producing its established "Wed, Sep 23" form (no year) byte-for-byte.
 */
function formatDateJa(d: Date): string {
  return d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short'
  })
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (i18n.language === 'ja') return formatDateJa(d)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

/**
 * Japanese rendering for formatTime: 24-hour clock ("15:30"), never the
 * English 12-hour + AM/PM convention — hour12 is an English-ism. hour:
 * '2-digit' zero-pads single-digit hours the same way the English branch's
 * '2-digit' does ("03:05", not "3:05").
 */
function formatTimeJa(d: Date): string {
  return d.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (i18n.language === 'ja') return formatTimeJa(d)
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  })
}

/**
 * The date/time joiner lives in the catalogue for both languages, never as a
 * bare literal: English resolves to " at " (byte-identical to the old
 * hardcoded template literal), and Japanese resolves to " · " — no
 * preposition reads naturally there, and · matches the same date/time join
 * smartDate.ts already uses for formatSmartDate.
 */
export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return `${formatDate(d)}${i18n.t('common:date.dateTimeJoiner')}${formatTime(d)}`
}

/**
 * Japanese rendering for formatDuration: "1時間30分" / "5分20秒" / "45秒".
 * Mirrors the English three-way branch (hours>0 / minutes>0 / else) exactly
 * — only the unit words change, via the common catalogue.
 */
function formatDurationJa(hours: number, minutes: number, secs: number): string {
  if (hours > 0) return i18n.t('common:duration.hoursMinutes', { hours, minutes })
  if (minutes > 0) return i18n.t('common:duration.minutesSeconds', { minutes, seconds: secs })
  return i18n.t('common:duration.seconds', { seconds: secs })
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)

  if (i18n.language === 'ja') return formatDurationJa(hours, minutes, secs)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`
  }
  return `${secs}s`
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/**
 * Type guard to check if a value is a valid Date object
 * @param date Value to check
 * @returns true if date is a Date instance with a valid timestamp
 */
export function isValidDate(date: unknown): date is Date {
  return date instanceof Date && !isNaN(date.getTime())
}

export function getWeekDates(date: Date): Date[] {
  const start = new Date(date)
  const day = start.getDay()
  const diff = start.getDate() - day + (day === 0 ? -6 : 1) // Adjust for Monday start
  start.setDate(diff)
  start.setHours(0, 0, 0, 0)

  const dates: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    dates.push(d)
  }

  return dates
}

export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

export function getRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return i18n.t('common:relativeTime.justNow')
  if (diffMins < 60) return i18n.t('common:relativeTime.minutesAgo', { n: diffMins })
  if (diffHours < 24) return i18n.t('common:relativeTime.hoursAgo', { n: diffHours })
  if (diffDays < 7) return i18n.t('common:relativeTime.daysAgo', { n: diffDays })
  return formatDate(d)
}

/**
 * Validates that an ID is a safe string for use in Set operations
 * Prevents prototype pollution and malformed IDs
 */
export function validateId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length < 100 &&
    !id.includes('__proto__') &&
    !id.includes('constructor') &&
    !id.includes('prototype')
  )
}
