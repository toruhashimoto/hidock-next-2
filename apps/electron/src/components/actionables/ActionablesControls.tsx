/**
 * Toolbar for the Actionables list: sort, group, and filter (by type / date),
 * plus a "select all" checkbox for bulk actions. Purely presentational — all
 * state lives in the page and is passed in via props.
 */

import { useTranslation } from 'react-i18next'
import { ArrowDownWideNarrow, ArrowUpNarrowWide } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  getSortOptions,
  getGroupOptions,
  getDateFilterOptions,
  type ActionableSortKey,
  type ActionableGroupKey,
  type DateFilterKey,
  type SortDirection
} from './actionablesFilters'

export interface ActionablesControlsProps {
  sortKey: ActionableSortKey
  onSortKeyChange: (v: ActionableSortKey) => void
  sortDir: SortDirection
  onToggleSortDir: () => void
  groupKey: ActionableGroupKey
  onGroupKeyChange: (v: ActionableGroupKey) => void
  typeFilter: string
  onTypeFilterChange: (v: string) => void
  typeOptions: { value: string; label: string }[]
  dateFilter: DateFilterKey
  onDateFilterChange: (v: DateFilterKey) => void
  allSelected: boolean
  onToggleSelectAll: () => void
  visibleCount: number
}

export function ActionablesControls({
  sortKey,
  onSortKeyChange,
  sortDir,
  onToggleSortDir,
  groupKey,
  onGroupKeyChange,
  typeFilter,
  onTypeFilterChange,
  typeOptions,
  dateFilter,
  onDateFilterChange,
  allSelected,
  onToggleSelectAll,
  visibleCount
}: ActionablesControlsProps) {
  const { t } = useTranslation('projects')
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      {/* Select-all for bulk actions */}
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer select-none">
        <Checkbox
          checked={allSelected}
          onCheckedChange={onToggleSelectAll}
          aria-label={allSelected ? t('actionablesControls.clearSelectionAriaLabel') : t('actionablesControls.selectAllVisibleAriaLabel')}
          disabled={visibleCount === 0}
        />
        {t('actionablesControls.selectAllLabel')}
      </label>

      <div className="h-5 w-px bg-border" aria-hidden />

      {/* Sort */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('actionablesControls.sortLabel')}</span>
        <Select value={sortKey} onValueChange={(v) => onSortKeyChange(v as ActionableSortKey)}>
          <SelectTrigger className="h-8 w-[140px]" aria-label={t('actionablesControls.sortSelectAriaLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getSortOptions().map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={onToggleSortDir}
          aria-label={sortDir === 'asc' ? t('actionablesControls.sortAscAriaLabel') : t('actionablesControls.sortDescAriaLabel')}
          title={sortDir === 'asc' ? t('actionablesControls.ascendingTitle') : t('actionablesControls.descendingTitle')}
        >
          {sortDir === 'asc' ? <ArrowUpNarrowWide className="h-4 w-4" /> : <ArrowDownWideNarrow className="h-4 w-4" />}
        </Button>
      </div>

      {/* Group */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('actionablesControls.groupLabel')}</span>
        <Select value={groupKey} onValueChange={(v) => onGroupKeyChange(v as ActionableGroupKey)}>
          <SelectTrigger className="h-8 w-[140px]" aria-label={t('actionablesControls.groupSelectAriaLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getGroupOptions().map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('actionablesControls.typeLabel')}</span>
        <Select value={typeFilter} onValueChange={onTypeFilterChange}>
          <SelectTrigger className="h-8 w-[150px]" aria-label={t('actionablesControls.typeFilterAriaLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('actionablesControls.allTypesOption')}</SelectItem>
            {typeOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date filter */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t('actionablesControls.dateLabel')}</span>
        <Select value={dateFilter} onValueChange={(v) => onDateFilterChange(v as DateFilterKey)}>
          <SelectTrigger className="h-8 w-[140px]" aria-label={t('actionablesControls.dateFilterAriaLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {getDateFilterOptions().map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
