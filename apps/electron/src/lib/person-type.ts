/**
 * Badge label for a person's type.
 *
 * Four surfaces (People, PersonDetail, SpeakerAssignPopover, Explore) render a
 * small pill next to a person's name. Upstream each of them printed the raw
 * `PersonType` enum value and relied on `text-transform: uppercase` to make it
 * look like a label — readable by accident in English ("team" -> TEAM), but an
 * untranslated English token in any other language, sitting right beside the
 * already-translated filter tab that selects it.
 *
 * `personTypeBadge.*` exists for exactly this pill. Its English values are the
 * enum spellings the upstream code printed, so the English DOM is byte-for-byte
 * what it was; only the Japanese side gains real words.
 *
 * The two neighbouring families are deliberately NOT reused. `personType.*` is
 * the longer tooltip form ("Team member"), which would overflow the pill.
 * `personTypeOption.*` is the filter-tab label ("Team"); borrowing it would put
 * the same visible English text on the badge and on the tab in the same view —
 * ambiguous to read, and ambiguous to query in a test.
 */

import type { TFunction } from 'i18next'
import type { PersonType } from '@/types/knowledge'

export function personTypeBadgeLabel(t: TFunction, type: PersonType | string | null | undefined): string {
  switch (type) {
    case 'team':
      return t('people:personTypeBadge.team')
    case 'candidate':
      return t('people:personTypeBadge.candidate')
    case 'customer':
      return t('people:personTypeBadge.customer')
    case 'external':
      return t('people:personTypeBadge.external')
    default:
      return t('people:personTypeBadge.unknown')
  }
}
