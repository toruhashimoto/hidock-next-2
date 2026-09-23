import type { Note } from '@/types/notes'
import i18n from '@/i18n'
import { formatTime } from '@/lib/utils'

/**
 * What the list shows for a note.
 *
 * Mirrors the main process's noteDisplayTitle deliberately: the list has to
 * name a note the instant it is created, before any save has come back and
 * before the AI has seen it, so it cannot wait for a stored title.
 *
 * Order: the title the person typed, then the note's own first line, then the
 * AI's suggestion, then "New note". The first line comes before the suggestion
 * because a note is usually identified by how it starts, and because the
 * suggestion arrives half a minute late.
 */
export function noteDisplayTitle(note: Pick<Note, 'title' | 'suggestedTitle' | 'content'>): string {
  const typed = note.title?.trim()
  if (typed) return typed

  const firstLine = note.content
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find(Boolean)
  if (firstLine) return firstLine.slice(0, 120)

  const suggested = note.suggestedTitle?.trim()
  if (suggested) return suggested

  // Resolved on every call, never once at module load: a `const` up top would
  // freeze whichever language happened to be active when this module was
  // imported, and the list would keep that word after a language switch.
  return i18n.t('notes:noteTitle.newNoteFallback')
}

/** The second line of a row: when it changed, and what it is about. */
export function noteSubtitle(note: Note, now = new Date()): string {
  const updated = new Date(note.updatedAt)
  const parts: string[] = [formatWhen(updated, now)]
  if (note.category) parts.push(note.category)
  if (note.linkSource === 'live') parts.push(i18n.t('notes:noteTitle.writtenDuringMeeting'))
  return parts.join(' · ')
}

/**
 * The BCP 47 tag to format the date half of a subtitle with. Derived from the
 * active UI language rather than the OS locale — the same rule (and the same
 * two tags) as lib/smartDate.ts's dateLocale(): someone who picked English in
 * Settings expects an English date even on a Japanese Windows, which the
 * previous `undefined` argument did not give them.
 *
 * lib/utils.ts's formatDate() is deliberately NOT used for this branch: it
 * renders the weekday as well ("Wed, Sep 23"), and a subtitle that already
 * says "Sep 23" must keep saying exactly that.
 */
function dateLocale(): string {
  return i18n.language === 'ja' ? 'ja-JP' : 'en-US'
}

function formatWhen(then: Date, now: Date): string {
  if (Number.isNaN(then.getTime())) return i18n.t('notes:noteTitle.unknownTime')
  const sameDay = then.toDateString() === now.toDateString()
  if (sameDay) {
    // The shared formatter, not a local toLocaleTimeString: English keeps its
    // "09:30 AM" and Japanese gets the 24-hour clock that locale reads as a
    // time of day.
    return formatTime(then)
  }
  return then.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' })
}
