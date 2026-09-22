/**
 * Human-readable labels for the fixed value-classification reason tags
 * (F16/spec-001 VALUE_REASON_TAGS, electron/main/services/value-classification.ts).
 *
 * Deliberately does NOT share a type with the main process (which has no
 * exported reason-tag type of its own, only the VALUE_REASON_TAGS runtime
 * array) — this is a renderer-only util, and the reasons arriving over IPC
 * are already plain
 * `string[]` (JSON round-tripped, see mapToKnowledgeCapture's safeParseReasons).
 * The local union below mirrors the fixed vocabulary for exhaustive labeling,
 * while `formatValueReasons` stays defensive against any unrecognized tag (a
 * stale reason from a future/older build) by falling back to the raw string
 * rather than dropping it silently.
 */

import i18n from '@/i18n'

export type KnownValueReason =
  | 'personal_family'
  | 'greeting_only_no_show'
  | 'background_ambient'
  | 'no_substance'
  | 'off_topic_chatter'

/**
 * i18n note (Task 11c): `SourceRow.tsx`'s `ValueBadge` (Part B, already
 * committed) reads `VALUE_REASON_LABELS.personal_family` etc. as plain
 * strings, and this object's own test (`valueReasons.test.ts`) asserts
 * `VALUE_REASON_LABELS.personal_family` directly — so this cannot become a
 * function. It is resolved once via the shared `i18n` singleton at
 * module-eval time (task brief "approach 2", "value needed at module
 * scope"); see the file-level note in utils/deletionCopy.ts for the full
 * reasoning and the known non-reactive-to-live-language-switch limitation.
 */
export const VALUE_REASON_LABELS: Record<KnownValueReason, string> = {
  personal_family: i18n.t('library:valueReasons.personalFamily'),
  greeting_only_no_show: i18n.t('library:valueReasons.greetingOnlyNoShow'),
  background_ambient: i18n.t('library:valueReasons.backgroundAmbient'),
  no_substance: i18n.t('library:valueReasons.noSubstance'),
  off_topic_chatter: i18n.t('library:valueReasons.offTopicChatter')
}

function isKnownValueReason(reason: string): reason is KnownValueReason {
  return Object.prototype.hasOwnProperty.call(VALUE_REASON_LABELS, reason)
}

/**
 * Render a capture's fixed reason tags as a short, comma-separated,
 * human-readable string for the badge tooltip (e.g. "Personal / family,
 * Background / ambient"). Unknown tags fall back to the raw string rather
 * than being dropped, so a badge never silently loses information. Returns
 * an empty string for a missing/empty list — callers should fall back to the
 * "AI-assessed" / "Set by you" line in that case (see SourceRow's ValueBadge).
 */
export function formatValueReasons(reasons: string[] | null | undefined): string {
  if (!reasons || reasons.length === 0) return ''
  return reasons.map((r) => (isKnownValueReason(r) ? VALUE_REASON_LABELS[r] : r)).join(', ')
}
