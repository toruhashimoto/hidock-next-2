/**
 * Task 11d — proves the module-scope-constant reactivity fix actually works.
 *
 * Task 11c's review found that `deletionCopy.ts`, `sourceType.ts`,
 * `durationFilter.ts` and `valueReasons.ts` resolved their copy via
 * `i18n.t()` exactly once, at module-evaluation time, so a live language
 * switch in Settings ("Changes apply immediately.") left these 45 strings in
 * the old language until the app restarted. Task 11d fixed it (deletionCopy's
 * scalars became `export let` + a `languageChanged` re-resolve; the other
 * three files' Record/array shapes became `get` accessor properties). This
 * file exercises both mechanisms directly, plus the one documented gotcha
 * (a plain `{ ...builtin }` spread bakes a getter's value at spread time —
 * `normalizeArtifactTypeDescriptors`' builtin-fallback path now clones by
 * property descriptor instead, via `cloneArtifactTypeDescriptor`).
 *
 * `ja/library.json` is still `{}` (Task 14's job) — a plain `t()` call for
 * these keys would silently fall back to English via `fallbackLng: 'en'`,
 * proving nothing. So this file adds just the handful of Japanese strings it
 * needs directly to i18next's in-memory resources with `addResourceBundle`,
 * never to the catalogue file itself.
 */

import { describe, it, expect, afterEach } from 'vitest'
import i18n from '@/i18n'
import { LABEL_DELETE_FROM_DEVICE } from '../deletionCopy'
import { BUILTIN_ARTIFACT_TYPES, normalizeArtifactTypeDescriptors } from '../sourceType'
import { DURATION_PRESET_LABELS } from '../durationFilter'
import { VALUE_REASON_LABELS } from '../valueReasons'

// Mirrors the real catalogues' flat dotted-key shape (see en/library.json) —
// i18next resolves `library:deletionCopy.labelDeleteFromDevice` against this
// object's OWN `"deletionCopy.labelDeleteFromDevice"` property before ever
// trying to split on '.', so a flat key here is both correct and consistent
// with the rest of this codebase's catalogues.
i18n.addResourceBundle(
  'ja',
  'library',
  {
    'deletionCopy.labelDeleteFromDevice': '端末から削除',
    'sourceType.audioLabel': '音声',
    'durationFilter.presetAll': 'すべての長さ',
    'valueReasons.personalFamily': '個人・家族'
  },
  true,
  true
)

afterEach(async () => {
  // Never let a later test file in this run inherit Japanese.
  await i18n.changeLanguage('en')
})

describe('library copy is reactive to a live language switch (Task 11d)', () => {
  it('deletionCopy.ts: an `export let` scalar re-resolves on languageChanged', async () => {
    expect(LABEL_DELETE_FROM_DEVICE).toBe('Delete from device')

    await i18n.changeLanguage('ja')
    expect(LABEL_DELETE_FROM_DEVICE).toBe('端末から削除')

    await i18n.changeLanguage('en')
    expect(LABEL_DELETE_FROM_DEVICE).toBe('Delete from device')
  })

  it('durationFilter.ts: a getter-backed Record entry re-resolves on languageChanged', async () => {
    expect(DURATION_PRESET_LABELS.all).toBe('Any length')

    await i18n.changeLanguage('ja')
    expect(DURATION_PRESET_LABELS.all).toBe('すべての長さ')

    await i18n.changeLanguage('en')
    expect(DURATION_PRESET_LABELS.all).toBe('Any length')
  })

  it('valueReasons.ts: a getter-backed Record entry re-resolves on languageChanged (and direct property access still works, per valueReasons.test.ts)', async () => {
    expect(VALUE_REASON_LABELS.personal_family).toBe('Personal / family')

    await i18n.changeLanguage('ja')
    expect(VALUE_REASON_LABELS.personal_family).toBe('個人・家族')

    await i18n.changeLanguage('en')
    expect(VALUE_REASON_LABELS.personal_family).toBe('Personal / family')
  })

  it('sourceType.ts: a BUILTIN_ARTIFACT_TYPES getter re-resolves on languageChanged', async () => {
    const audio = BUILTIN_ARTIFACT_TYPES.find((type) => type.id === 'audio')
    expect(audio?.label).toBe('Audio')

    await i18n.changeLanguage('ja')
    // Same object reference re-read, not a fresh lookup — proves the getter
    // itself is live, not just that a new lookup would differ.
    expect(audio?.label).toBe('音声')

    await i18n.changeLanguage('en')
    expect(audio?.label).toBe('Audio')
  })

  it('sourceType.ts: normalizeArtifactTypeDescriptors\' builtin-fallback clone stays live (the documented spread gotcha)', async () => {
    // No override for 'audio' in the input, so 'audio' is filled in by the
    // builtin-fallback loop (`byId.set(builtin.id, cloneArtifactTypeDescriptor(builtin))`)
    // — the exact site the file-level i18n note in sourceType.ts calls out:
    // a plain `{ ...builtin }` here would have evaluated the getter and
    // baked its English value into the clone permanently.
    const normalized = normalizeArtifactTypeDescriptors([
      { id: 'pdf', label: 'PDF', pluralLabel: 'PDFs', extensions: ['pdf'], capabilities: ['rateable', 'previewable'] }
    ])
    const audio = normalized.find((type) => type.id === 'audio')
    expect(audio?.label).toBe('Audio')

    await i18n.changeLanguage('ja')
    expect(audio?.label).toBe('音声')

    await i18n.changeLanguage('en')
    expect(audio?.label).toBe('Audio')
  })
})
