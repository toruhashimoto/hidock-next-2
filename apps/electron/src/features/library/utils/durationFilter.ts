/**
 * Duration filtering for the Knowledge Library.
 *
 * Duration controls apply to AUDIO recordings only. Non-audio sources (images,
 * PDFs, notes) have no duration and are excluded gracefully when a duration
 * filter is active — they are never falsely matched by a "< 1 min" preset.
 */

import type { UnifiedRecording } from '@/types/unified-recording'
import { getSourceType, sourceTypeHasDuration } from './sourceType'
import i18n from '@/i18n'

export type DurationPreset = 'all' | 'under10s' | 'under1m' | 'under5m' | 'over5m'

/** Upper bound (seconds, exclusive) for a preset, or null when unbounded/all. */
const PRESET_MAX: Record<DurationPreset, number | null> = {
  all: null,
  under10s: 10,
  under1m: 60,
  under5m: 300,
  over5m: null // handled specially (>= 300)
}

/**
 * i18n note (Task 11c; reactivity fixed in Task 11d): `LibraryFilters.tsx`
 * (Part B, already committed) imports this object and indexes it directly
 * (`DURATION_PRESET_LABELS[preset]`) as a plain string at render time, so
 * this cannot become a function taking `t`.
 *
 * Task 11d fix: every property below is a `get` accessor instead of a plain
 * data property. `DURATION_PRESET_LABELS[preset]` is syntactically identical
 * either way, so `LibraryFilters.tsx` needs no change — but a getter calls
 * `i18n.t()` fresh on every access instead of freezing the value from
 * module-evaluation time, so a live language switch is picked up on the
 * component's next render (it already calls `useTranslation()` for its own
 * strings, so it already re-renders on a switch).
 */
export const DURATION_PRESET_LABELS: Record<DurationPreset, string> = {
  get all() { return i18n.t('library:durationFilter.presetAll') },
  get under10s() { return i18n.t('library:durationFilter.presetUnder10s') },
  get under1m() { return i18n.t('library:durationFilter.presetUnder1m') },
  get under5m() { return i18n.t('library:durationFilter.presetUnder5m') },
  get over5m() { return i18n.t('library:durationFilter.presetOver5m') }
}

/**
 * Does a recording match the active duration preset?
 *
 * - `all` matches everything (no filtering).
 * - Any other preset only ever matches audio with a known (> 0) duration; every
 *   non-audio or unknown-duration row is excluded so junk-cleanup by length is
 *   precise.
 */
export function matchesDurationPreset(recording: UnifiedRecording, preset: DurationPreset): boolean {
  if (preset === 'all') return true

  const type = getSourceType(recording)
  if (!sourceTypeHasDuration(type)) return false

  const duration = recording.duration ?? 0
  if (duration <= 0) return false

  if (preset === 'over5m') return duration >= 300
  const max = PRESET_MAX[preset]
  if (max === null) return true
  return duration < max
}
