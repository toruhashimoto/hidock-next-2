/**
 * Catalogue parity — the ja catalogues must carry exactly the keys the en ones
 * do. A missing key silently renders English (fallbackLng), which is easy to
 * ship without noticing; a surplus key is dead weight or a typo.
 *
 * The catalogues are discovered from disk rather than listed by hand. An
 * earlier version imported each one explicitly and kept a literal CATALOGUES
 * map, which meant every new namespace needed the same edit in three places
 * (index.ts, this file, catalogue-integrity.test.ts). During Phase 2 four
 * namespaces landed in parallel and one of them lost its registration in a
 * merge, so the suite was asserting over a stale list. Deriving the map from
 * the files removes that whole failure mode: a namespace cannot be half
 * registered here, and `covers every declared namespace` still catches the
 * case where a catalogue exists on disk but was never added to NAMESPACES (or
 * vice versa).
 */

import { describe, it, expect } from 'vitest'
import { NAMESPACES, resources, SUPPORTED_LANGUAGES } from '../index'

type Catalogue = Record<string, string>

/** Eagerly load every catalogue JSON so the map is available synchronously. */
const enModules = import.meta.glob<Catalogue>('../locales/en/*.json', { eager: true, import: 'default' })
const jaModules = import.meta.glob<Catalogue>('../locales/ja/*.json', { eager: true, import: 'default' })

/** `../locales/en/library.json` → `library` */
function namespaceOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, -'.json'.length)
}

function byNamespace(modules: Record<string, Catalogue>): Record<string, Catalogue> {
  return Object.fromEntries(Object.entries(modules).map(([path, cat]) => [namespaceOf(path), cat]))
}

const EN = byNamespace(enModules)
const JA = byNamespace(jaModules)

const CATALOGUE_NAMES = Object.keys(EN).sort()

/**
 * i18next appends a plural suffix to the key (`_one`, `_other`). English has two
 * forms, Japanese only `other`, so comparing raw keys would report a false
 * mismatch on every counted string. Compare the base keys instead.
 */
function baseKeys(catalogue: Catalogue): Set<string> {
  return new Set(Object.keys(catalogue).map((k) => k.replace(/_(one|other|zero|two|few|many)$/, '')))
}

describe('catalogue parity', () => {
  it('covers every declared namespace', () => {
    expect(CATALOGUE_NAMES).toEqual([...NAMESPACES].sort())
  })

  it('has a Japanese catalogue for every English one', () => {
    const missing = CATALOGUE_NAMES.filter((ns) => !JA[ns]).sort()
    expect(missing).toEqual([])
  })

  /**
   * NAMESPACES itself is protected above (derived-from-disk vs the declared
   * list). But i18n/index.ts's `resources` map — what initI18n actually hands
   * to i18next — is a SEPARATE hand-maintained object keyed the same way. A
   * merge can drop one namespace's entry from `resources.ja` (or `.en`)
   * without touching NAMESPACES or any *.json file: every catalogue test above
   * stays green, the English suite stays green (resources.en is untouched),
   * and the Japanese screen for that namespace silently renders raw keys —
   * exactly the failure mode this whole file exists to catch, just one layer
   * further down. Tests run in English (test/setup.ts), so nothing else in
   * the suite would ever notice.
   */
  it('registers every namespace in the resources map', () => {
    for (const lng of SUPPORTED_LANGUAGES) {
      expect(Object.keys(resources[lng]).sort(), `resources.${lng}`).toEqual([...NAMESPACES].sort())
    }
  })

  for (const ns of CATALOGUE_NAMES) {
    it(`${ns}: ja has no missing keys`, () => {
      const en = baseKeys(EN[ns])
      const ja = baseKeys(JA[ns] ?? {})
      const missing = [...en].filter((k) => !ja.has(k)).sort()
      expect(missing).toEqual([])
    })

    it(`${ns}: ja has no surplus keys`, () => {
      const en = baseKeys(EN[ns])
      const ja = baseKeys(JA[ns] ?? {})
      const surplus = [...ja].filter((k) => !en.has(k)).sort()
      expect(surplus).toEqual([])
    })
  }

  it("every Japanese plural key uses only the 'other' form", () => {
    for (const ns of CATALOGUE_NAMES) {
      const badForms = Object.keys(JA[ns] ?? {}).filter((k) => /_(one|zero|two|few|many)$/.test(k))
      expect(badForms, `${ns} has non-'other' plural forms`).toEqual([])
    }
  })
})
