/**
 * Catalogue integrity — two properties catalogue-parity.test.ts does not
 * check, because that file only compares KEY SETS (missing/surplus keys and
 * plural-suffix shape):
 *
 *  1. Placeholder & <Trans> tag integrity — a key can exist on both sides
 *     with the right plural suffix and still be broken if the Japanese
 *     value drops a `{{placeholder}}` the English value interpolates (it
 *     renders literally, e.g. a stray "{{filename}}" left in the UI) or
 *     renumbers a `<Trans>` tag index (the wrong text/whitespace ends up
 *     wrapped, or react-i18next throws in dev). i18next's own
 *     missingKeyHandler does not catch either case — the KEY resolved fine;
 *     only its interpolation shape is wrong.
 *
 *  2. Composite key existence — pages/Library.tsx builds two families of
 *     i18next keys by string concatenation (device-copy count and
 *     impact-summary presence folded into the key name itself). Those key
 *     names are invisible to a static `t('literal.key')` scan AND to
 *     i18next's dev-only missingKeyHandler until the exact runtime
 *     combination is hit — which for the rarer branches (e.g. an odd
 *     device-copy count together with an unknown impact estimate) may not
 *     happen in manual testing at all.
 *
 * Both properties were verified clean by a one-off script during the final
 * whole-branch review of feat/i18n-ja (2026-09-22). This file makes that
 * verification permanent so a future catalogue edit that breaks either
 * property fails here instead of silently shipping broken interpolation or
 * a raw untranslated key string to a user.
 */

import { describe, it, expect } from 'vitest'

type Catalogue = Record<string, string>

/**
 * Catalogues are discovered from disk, not listed by hand. The explicit-import
 * version of this file had to be edited for every new namespace, and during
 * Phase 2 four landed in parallel — the list fell behind and these checks were
 * silently running over a subset. Globbing keeps the coverage automatic.
 */
const enModules = import.meta.glob<Catalogue>('../locales/en/*.json', { eager: true, import: 'default' })
const jaModules = import.meta.glob<Catalogue>('../locales/ja/*.json', { eager: true, import: 'default' })

/** `../locales/en/library.json` → `library` */
function namespaceOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, -'.json'.length)
}

const CATALOGUES: Record<string, { en: Catalogue; ja: Catalogue }> = Object.fromEntries(
  Object.entries(enModules).map(([path, en]) => {
    const ns = namespaceOf(path)
    const jaEntry = Object.entries(jaModules).find(([p]) => namespaceOf(p) === ns)
    return [ns, { en, ja: jaEntry?.[1] ?? {} }]
  })
)

/**
 * `<namespace>:<key>` entries where the two locales deliberately interpolate
 * DIFFERENT placeholders, so the "ja must use every placeholder en uses" rule
 * does not apply.
 *
 * Only the clock-hour labels qualify today. English renders a 12-hour clock
 * ("{{hour}} AM") and Japanese a 24-hour one ("{{hour24}}時"); Calendar.tsx
 * passes `{ hour: hour - 12, hour24: hour }` on every call, because no single
 * number can read as both "3 PM" and "15時". Both values are always supplied,
 * so neither locale can render an unfilled placeholder.
 *
 * Add to this list only when a caller demonstrably passes every placeholder
 * both locales use — otherwise you are hiding a real bug, not describing an
 * intentional divergence.
 */
const LOCALE_SPECIFIC_PLACEHOLDERS = new Set([
  'calendar:weekView.hourAm',
  'calendar:weekView.hourPm',
  'calendar:weekView.hourNoon'
])

/** The set of `{{name}}` interpolation placeholders used in an i18next value. */
function placeholderSet(value: string): Set<string> {
  const found = new Set<string>()
  const re = /\{\{\s*([a-zA-Z0-9_]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(value))) found.add(m[1])
  return found
}

/** The set of `<N>` / `</N>` / `<N/>` <Trans>-component tag indices used in a value. */
function tagIndexSet(value: string): Set<string> {
  const found = new Set<string>()
  const re = /<\/?(\d+)\/?>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(value))) found.add(m[1])
  return found
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((x) => b.has(x))
}

function describeSet(s: Set<string>): string {
  return s.size === 0 ? '(none)' : [...s].sort().join(', ')
}

describe('catalogue placeholder & <Trans> tag integrity', () => {
  for (const ns of Object.keys(CATALOGUES)) {
    const { en, ja } = CATALOGUES[ns]

    // Only keys present on both sides are compared here — a missing/surplus
    // key is catalogue-parity.test.ts's job to report, not this file's. ja
    // never carries a `_one` key (Japanese has only the CLDR 'other'
    // plural category), so matching by the literal key string already
    // compares e.g. ja's `foo_other` against en's `foo_other`, with nothing
    // left to collapse.
    const sharedKeys = Object.keys(ja).filter((k) => k in en)

    // Asymmetric on purpose. Dropping a placeholder the English value uses is
    // normally a bug: the interpolated value simply vanishes from the Japanese
    // string. Using one English does NOT use is legitimate — a caller may pass
    // several and let each locale pick whichever it needs.
    //
    // An extra placeholder the caller never passes would render literally, so
    // that IS worth catching — but deciding it needs the call site, which this
    // file cannot see. So the rule here is the one-sided one, with named
    // exceptions for the keys where the divergence is the whole point.
    it(`${ns}: no ja value drops a {{placeholder}} its en counterpart uses`, () => {
      const dropped = sharedKeys
        .filter((k) => !LOCALE_SPECIFIC_PLACEHOLDERS.has(`${ns}:${k}`))
        .filter((k) => {
          const enPh = placeholderSet(en[k])
          const jaPh = placeholderSet(ja[k])
          return [...enPh].some((p) => !jaPh.has(p))
        })
        .map((k) => `${k}: en={${describeSet(placeholderSet(en[k]))}} ja={${describeSet(placeholderSet(ja[k]))}}`)
      expect(dropped).toEqual([])
    })

    it(`${ns}: every ja value's <Trans> tag indices match its en counterpart`, () => {
      const mismatches = sharedKeys
        .filter((k) => !setsEqual(tagIndexSet(en[k]), tagIndexSet(ja[k])))
        .map((k) => `${k}: en={${describeSet(tagIndexSet(en[k]))}} ja={${describeSet(tagIndexSet(ja[k]))}}`)
      expect(mismatches).toEqual([])
    })
  }
})

describe('Library.tsx composite key existence', () => {
  // pages/Library.tsx's executeDeletePermanent (~line 1407-1416, the bulk
  // permanent-delete confirmation) and its completion toast (~line 1373-1379)
  // each build an i18next key by template-literal concatenation instead of a
  // literal `t('...')` call:
  //
  //   t(`confirm.deletePermanentDialogDescription${impactSummary ? 'WithImpact' : 'NoImpact'}DeviceCopy${deviceCopyCount === 1 ? 'Singular' : 'Plural'}`,
  //     { count: selectedRecordings.length, impact: impactSummary, devCount: deviceCopyCount })
  //
  //   t(`toast.itemsPermanentlyDeletedMessageWithDeviceNote${deviceDeleted === 1 ? 'Singular' : 'Plural'}`,
  //     { removed, count: selectedRecordings.length, issuesText, deviceCount: deviceDeleted })
  //
  // Both calls pass a `count` option, so i18next additionally requires the
  // `_one` / `_other` plural suffix on each generated name. That gives
  // 2 (WithImpact/NoImpact) x 2 (Singular/Plural) x 2 (_one/_other) = 8 keys
  // for the first call, and 2 (Singular/Plural) x 2 (_one/_other) = 4 keys
  // for the second — 12 in total. These names are derived here directly from
  // the current Library.tsx source, not assumed from the review notes.
  //
  // Checked against en/library.json only: ja never defines a `_one` variant
  // by design (see the note above), so a ja-side check of this same list
  // would fail on all 6 `_one` entries for a reason that isn't a bug.
  const COMPOSITE_KEYS = [
    'confirm.deletePermanentDialogDescriptionWithImpactDeviceCopySingular_one',
    'confirm.deletePermanentDialogDescriptionWithImpactDeviceCopySingular_other',
    'confirm.deletePermanentDialogDescriptionWithImpactDeviceCopyPlural_one',
    'confirm.deletePermanentDialogDescriptionWithImpactDeviceCopyPlural_other',
    'confirm.deletePermanentDialogDescriptionNoImpactDeviceCopySingular_one',
    'confirm.deletePermanentDialogDescriptionNoImpactDeviceCopySingular_other',
    'confirm.deletePermanentDialogDescriptionNoImpactDeviceCopyPlural_one',
    'confirm.deletePermanentDialogDescriptionNoImpactDeviceCopyPlural_other',
    'toast.itemsPermanentlyDeletedMessageWithDeviceNoteSingular_one',
    'toast.itemsPermanentlyDeletedMessageWithDeviceNoteSingular_other',
    'toast.itemsPermanentlyDeletedMessageWithDeviceNotePlural_one',
    'toast.itemsPermanentlyDeletedMessageWithDeviceNotePlural_other'
  ]

  it('all 12 keys Library.tsx can construct at runtime exist in en/library.json', () => {
    const enLibrary = CATALOGUES.library?.en ?? {}
    const missing = COMPOSITE_KEYS.filter((k) => !(k in enLibrary))
    expect(missing).toEqual([])
  })
})
