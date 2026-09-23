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
 * i18n note (Task 11c; reactivity fixed in Task 11d): `SourceRow.tsx`'s
 * `ValueBadge` does NOT read this object directly — it only imports and
 * calls `formatValueReasons()` below. The direct property reader is this
 * file's own test (`valueReasons.test.ts`), which asserts
 * `VALUE_REASON_LABELS.personal_family` etc. directly — so this cannot
 * become a function.
 *
 * Task 11d fix: every property below is a `get` accessor instead of a plain
 * data property. `VALUE_REASON_LABELS.personal_family` (or the `[r]` index
 * access inside `formatValueReasons`) is syntactically identical either way
 * — including for `Object.prototype.hasOwnProperty` in `isKnownValueReason`
 * below, and for the direct-property-access test — but a getter calls
 * `i18n.t()` fresh on every access instead of freezing the value from
 * module-evaluation time. `formatValueReasons()` is called from
 * `SourceRow.tsx`'s `ValueBadge` right next to a reactive `t()` call for the
 * tooltip's first line, so before this fix a language switch could leave
 * that tooltip's two lines visibly in different languages; now both read
 * the same live language.
 */
export const VALUE_REASON_LABELS: Record<KnownValueReason, string> = {
  get personal_family() { return i18n.t('library:valueReasons.personalFamily') },
  get greeting_only_no_show() { return i18n.t('library:valueReasons.greetingOnlyNoShow') },
  get background_ambient() { return i18n.t('library:valueReasons.backgroundAmbient') },
  get no_substance() { return i18n.t('library:valueReasons.noSubstance') },
  get off_topic_chatter() { return i18n.t('library:valueReasons.offTopicChatter') }
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
