/**
 * Pure sort / group / filter helpers for the Actionables list.
 *
 * Kept free of React and IPC so they are trivially unit-testable and reusable.
 * All functions are non-mutating (they return new arrays).
 *
 * i18n note (Task 17-C): the option-label lists below used to be module-scope
 * constants, which freeze their (English) label text at import time and never
 * pick up a runtime language switch — the same trap `library/utils/durationFilter.ts`
 * documents (Task 11d). `SORT_OPTIONS`/`GROUP_OPTIONS`/`DATE_FILTER_OPTIONS` are
 * only ever indexed by `.map()` in `ActionablesControls.tsx` (never by a stored
 * property key the way `durationFilter.ts`'s getters are), so they became plain
 * functions instead — called fresh at render time, same effect as a getter.
 * `STATUS_LABELS` stays a Record (it's still keyed by id below), but its values
 * are resolved through `i18n.t()` at the point of use rather than frozen here.
 */

import type { Actionable, ActionableStatus } from '@/types/knowledge'
import { humanizeActionableType } from './templateInfo'
import i18n from '@/i18n'

export type ActionableSortKey = 'date' | 'confidence' | 'type'
export type SortDirection = 'asc' | 'desc'
export type ActionableGroupKey = 'none' | 'type' | 'status' | 'source'
export type DateFilterKey = 'all' | '7d' | '30d' | '90d'

export function getSortOptions(): { value: ActionableSortKey; label: string }[] {
  return [
    { value: 'date', label: i18n.t('projects:actionablesFilters.sortOption.date', { defaultValue: 'Date' }) },
    { value: 'confidence', label: i18n.t('projects:actionablesFilters.sortOption.confidence', { defaultValue: 'Confidence' }) },
    { value: 'type', label: i18n.t('projects:actionablesFilters.sortOption.type', { defaultValue: 'Type' }) }
  ]
}

export function getGroupOptions(): { value: ActionableGroupKey; label: string }[] {
  return [
    { value: 'none', label: i18n.t('projects:actionablesFilters.groupOption.none', { defaultValue: 'No grouping' }) },
    { value: 'type', label: i18n.t('projects:actionablesFilters.groupOption.type', { defaultValue: 'By type' }) },
    { value: 'status', label: i18n.t('projects:actionablesFilters.groupOption.status', { defaultValue: 'By status' }) },
    { value: 'source', label: i18n.t('projects:actionablesFilters.groupOption.source', { defaultValue: 'By source' }) }
  ]
}

export function getDateFilterOptions(): { value: DateFilterKey; label: string }[] {
  return [
    { value: 'all', label: i18n.t('projects:actionablesFilters.dateFilterOption.all', { defaultValue: 'All time' }) },
    { value: '7d', label: i18n.t('projects:actionablesFilters.dateFilterOption.7d', { defaultValue: 'Last 7 days' }) },
    { value: '30d', label: i18n.t('projects:actionablesFilters.dateFilterOption.30d', { defaultValue: 'Last 30 days' }) },
    { value: '90d', label: i18n.t('projects:actionablesFilters.dateFilterOption.90d', { defaultValue: 'Last 90 days' }) }
  ]
}

const DATE_FILTER_DAYS: Record<DateFilterKey, number | null> = {
  all: null,
  '7d': 7,
  '30d': 30,
  '90d': 90
}

/** Fixed, meaningful order for status groups (not alphabetical). */
const STATUS_ORDER: ActionableStatus[] = ['pending', 'in_progress', 'generated', 'shared', 'dismissed']

/** English fallback text, keyed by status id — the live label is resolved via i18n.t() at use. */
const STATUS_LABELS: Record<ActionableStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  generated: 'Generated',
  shared: 'Shared',
  dismissed: 'Dismissed'
}

function statusLabel(status: ActionableStatus): string {
  return i18n.t(`projects:actionablesFilters.status.${status}`, { defaultValue: STATUS_LABELS[status] })
}

function timeOf(value: string | null | undefined): number {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? 0 : t
}

/** Keep only actionables whose `type` matches, or all when `type === 'all'`. */
export function filterByType(items: Actionable[], type: string | 'all'): Actionable[] {
  if (type === 'all') return items
  return items.filter((a) => a.type === type)
}

/** Keep only actionables created within the selected window (based on createdAt). */
export function filterByDate(items: Actionable[], key: DateFilterKey, now: Date = new Date()): Actionable[] {
  const days = DATE_FILTER_DAYS[key]
  if (days == null) return items
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000
  return items.filter((a) => timeOf(a.createdAt) >= cutoff)
}

/** The distinct `type` values present, with human labels, for the type-filter dropdown. */
export function distinctTypes(items: Actionable[]): { value: string; label: string }[] {
  const seen = new Set<string>()
  for (const a of items) if (a.type) seen.add(a.type)
  return Array.from(seen)
    .map((value) => ({ value, label: humanizeActionableType(value) }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Return a new, sorted array. Stable-ish: ties fall back to newest-first by date. */
export function sortActionables(items: Actionable[], key: ActionableSortKey, dir: SortDirection): Actionable[] {
  const factor = dir === 'asc' ? 1 : -1
  const copy = [...items]
  copy.sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'date':
        cmp = timeOf(a.createdAt) - timeOf(b.createdAt)
        break
      case 'confidence':
        cmp = (a.confidence ?? -1) - (b.confidence ?? -1)
        break
      case 'type':
        cmp = humanizeActionableType(a.type).localeCompare(humanizeActionableType(b.type))
        break
    }
    if (cmp !== 0) return cmp * factor
    // Deterministic tie-breaker: newest created first, regardless of direction.
    return timeOf(b.createdAt) - timeOf(a.createdAt)
  })
  return copy
}

export interface ActionableGroup {
  key: string
  label: string
  items: Actionable[]
}

/**
 * Bucket the (already sorted) list into ordered groups. `none` returns a single
 * unlabelled group so callers can render uniformly. Group order is meaningful
 * for status, alphabetical by label otherwise.
 */
export function groupActionables(items: Actionable[], key: ActionableGroupKey): ActionableGroup[] {
  if (key === 'none') {
    return [{ key: 'all', label: '', items }]
  }

  const buckets = new Map<string, ActionableGroup>()
  for (const a of items) {
    let bucketKey: string
    let label: string
    if (key === 'status') {
      bucketKey = a.status
      label = statusLabel(a.status)
    } else if (key === 'type') {
      bucketKey = a.type || 'unknown'
      label = humanizeActionableType(a.type)
    } else {
      // source
      bucketKey = a.sourceKnowledgeId || 'unknown'
      label = a.sourceKnowledgeId
        ? i18n.t('projects:actionablesFilters.sourceGroupLabel', { id: a.sourceKnowledgeId.slice(0, 8), defaultValue: `Source ${a.sourceKnowledgeId.slice(0, 8)}` })
        : i18n.t('projects:actionablesFilters.unknownSourceLabel', { defaultValue: 'Unknown source' })
    }
    const existing = buckets.get(bucketKey)
    if (existing) existing.items.push(a)
    else buckets.set(bucketKey, { key: bucketKey, label, items: [a] })
  }

  const groups = Array.from(buckets.values())
  if (key === 'status') {
    groups.sort((a, b) => STATUS_ORDER.indexOf(a.key as ActionableStatus) - STATUS_ORDER.indexOf(b.key as ActionableStatus))
  } else {
    groups.sort((a, b) => a.label.localeCompare(b.label))
  }
  return groups
}
