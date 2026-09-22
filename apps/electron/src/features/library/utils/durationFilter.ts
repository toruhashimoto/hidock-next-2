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
 * i18n note (Task 11c): `LibraryFilters.tsx` (Part B, already committed)
 * imports this object and indexes it directly (`DURATION_PRESET_LABELS[preset]`)
 * as a plain string at render time, so this cannot become a function taking
 * `t`. It is resolved once via the shared `i18n` singleton at module-eval
 * time (task brief "approach 2", "value needed at module scope") — see the
 * file-level note in utils/deletionCopy.ts for the full reasoning and the
 * known non-reactive-to-live-language-switch limitation this shares with it.
 */
export const DURATION_PRESET_LABELS: Record<DurationPreset, string> = {
  all: i18n.t('library:durationFilter.presetAll'),
  under10s: i18n.t('library:durationFilter.presetUnder10s'),
  under1m: i18n.t('library:durationFilter.presetUnder1m'),
  under5m: i18n.t('library:durationFilter.presetUnder5m'),
  over5m: i18n.t('library:durationFilter.presetOver5m')
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
