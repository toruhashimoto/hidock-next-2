/**
 * Catalogue parity — the ja catalogues must carry exactly the keys the en ones
 * do. A missing key silently renders English (fallbackLng), which is easy to
 * ship without noticing; a surplus key is dead weight or a typo.
 *
 * This test is expected to FAIL for every namespace until Task 14 writes the
 * Japanese translations. That is the point: it is the checklist.
 */

import { describe, it, expect } from 'vitest'
import { NAMESPACES } from '../index'

import enCommon from '../locales/en/common.json'
import jaCommon from '../locales/ja/common.json'
import enLayout from '../locales/en/layout.json'
import jaLayout from '../locales/ja/layout.json'
import enLibrary from '../locales/en/library.json'
import jaLibrary from '../locales/ja/library.json'
import enDevice from '../locales/en/device.json'
import jaDevice from '../locales/ja/device.json'
import enSettings from '../locales/en/settings.json'
import jaSettings from '../locales/ja/settings.json'
import enToday from '../locales/en/today.json'
import jaToday from '../locales/ja/today.json'
import enDomain from '../locales/en/domain.json'
import jaDomain from '../locales/ja/domain.json'
import enPeople from '../locales/en/people.json'
import jaPeople from '../locales/ja/people.json'

const CATALOGUES: Record<string, { en: object; ja: object }> = {
  common: { en: enCommon, ja: jaCommon },
  layout: { en: enLayout, ja: jaLayout },
  library: { en: enLibrary, ja: jaLibrary },
  device: { en: enDevice, ja: jaDevice },
  settings: { en: enSettings, ja: jaSettings },
  today: { en: enToday, ja: jaToday },
  domain: { en: enDomain, ja: jaDomain },
  people: { en: enPeople, ja: jaPeople }
}

/**
 * i18next appends a plural suffix to the key (`_one`, `_other`). English has two
 * forms, Japanese only `other`, so comparing raw keys would report a false
 * mismatch on every counted string. Compare the base keys instead.
 */
function baseKeys(catalogue: object): Set<string> {
  return new Set(Object.keys(catalogue).map((k) => k.replace(/_(one|other|zero|two|few|many)$/, '')))
}

describe('catalogue parity', () => {
  it('covers every declared namespace', () => {
    expect(Object.keys(CATALOGUES).sort()).toEqual([...NAMESPACES].sort())
  })

  for (const ns of Object.keys(CATALOGUES)) {
    it(`${ns}: ja has no missing keys`, () => {
      const en = baseKeys(CATALOGUES[ns].en)
      const ja = baseKeys(CATALOGUES[ns].ja)
      const missing = [...en].filter((k) => !ja.has(k)).sort()
      expect(missing).toEqual([])
    })

    it(`${ns}: ja has no surplus keys`, () => {
      const en = baseKeys(CATALOGUES[ns].en)
      const ja = baseKeys(CATALOGUES[ns].ja)
      const surplus = [...ja].filter((k) => !en.has(k)).sort()
      expect(surplus).toEqual([])
    })
  }

  it("every Japanese plural key uses only the 'other' form", () => {
    for (const ns of Object.keys(CATALOGUES)) {
      const badForms = Object.keys(CATALOGUES[ns].ja).filter((k) => /_(one|zero|two|few|many)$/.test(k))
      expect(badForms, `${ns} has non-'other' plural forms`).toEqual([])
    }
  })
})
