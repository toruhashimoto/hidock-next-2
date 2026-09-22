import {
  Filter,
  Cloud,
  HardDrive,
  Check,
  Search,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  AudioLines,
  Image,
  FileText,
  StickyNote,
  Clock,
  X,
  Shapes
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { ExclusiveLocationFilter } from '@/types/unified-recording'
import type { SortBy, SortOrder } from '@/store/useLibraryStore'
import type {
  LibraryArtifactTypeDescriptor,
  SourceTypeFilter
} from '@/features/library/utils/sourceType'
import { DURATION_PRESET_LABELS, type DurationPreset } from '@/features/library/utils/durationFilter'

export type TypeCounts = Record<string, number> & { all: number }

interface LibraryFiltersProps {
  stats: {
    total: number
    deviceOnly: number
    localOnly: number
    both: number
  }
  filterableCount: number
  typeCounts: TypeCounts
  artifactTypes: LibraryArtifactTypeDescriptor[]
  hasRatedQuality: boolean
  exclusiveFilter: ExclusiveLocationFilter
  categoryFilter: string
  qualityFilter: string
  statusFilter: string
  sourceTypeFilter: SourceTypeFilter
  durationPreset: DurationPreset
  searchQuery: string
  sortBy?: SortBy
  sortOrder?: SortOrder
  onExclusiveFilterChange: (filter: ExclusiveLocationFilter) => void
  onCategoryFilterChange: (filter: string) => void
  onQualityFilterChange: (filter: string) => void
  onStatusFilterChange: (filter: string) => void
  onSourceTypeFilterChange: (filter: SourceTypeFilter) => void
  onDurationPresetChange: (preset: DurationPreset) => void
  onSearchQueryChange: (query: string) => void
  onSortByChange?: (sortBy: SortBy) => void
  onSortOrderChange?: (order: SortOrder) => void
  onClearFilters: () => void
}

const CATEGORIES = ['all', 'meeting', 'interview', '1:1', 'brainstorm'] as const
const DURATION_PRESETS: DurationPreset[] = ['all', 'under10s', 'under1m', 'under5m', 'over5m']
// 'all' has no source-category counterpart (it means "any category" in this
// filter, not a recording category), so it gets its own key; the other four
// reuse the byte-identical category labels Task 11a already extracted onto
// SourceReader's CATEGORY_OPTIONS — same enum, same domain concept.
const CATEGORY_LABEL_KEYS: Record<(typeof CATEGORIES)[number], string> = {
  all: 'libraryFilters.categoryAny',
  meeting: 'sourceReader.categoryMeeting',
  interview: 'sourceReader.categoryInterview',
  '1:1': 'sourceReader.categoryOneOnOne',
  brainstorm: 'sourceReader.categoryBrainstorm'
}

function iconForType(type: string): LucideIcon {
  if (type === 'audio') return AudioLines
  if (type === 'image') return Image
  if (type === 'pdf') return FileText
  if (type === 'note') return StickyNote
  return Shapes
}

export function LibraryFilters({
  stats,
  filterableCount,
  typeCounts,
  artifactTypes,
  hasRatedQuality,
  exclusiveFilter,
  categoryFilter,
  qualityFilter,
  statusFilter,
  sourceTypeFilter,
  durationPreset,
  searchQuery,
  sortBy,
  sortOrder,
  onExclusiveFilterChange,
  onCategoryFilterChange,
  onQualityFilterChange,
  onStatusFilterChange,
  onSourceTypeFilterChange,
  onDurationPresetChange,
  onSearchQueryChange,
  onSortByChange,
  onSortOrderChange,
  onClearFilters
}: LibraryFiltersProps) {
  const { t } = useTranslation('library')
  const selectedType = artifactTypes.find((type) => type.id === sourceTypeFilter)
  const supportsDuration = selectedType?.capabilities.includes('timed') ?? false
  const supportsConversation = selectedType?.capabilities.includes('conversation') ?? false
  const supportsQuality = hasRatedQuality && (sourceTypeFilter === 'all' || selectedType?.capabilities.includes('rateable'))

  const populatedTypes = artifactTypes.filter((type) => (typeCounts[type.id] ?? 0) > 0 || type.id === sourceTypeFilter)
  const primaryTypes = populatedTypes.slice(0, 4)
  const overflowTypes = populatedTypes.slice(4)
  const exactStates = [stats.deviceOnly, stats.localOnly, stats.both].filter((count) => count > 0).length
  const showAvailability = exactStates > 1 || exclusiveFilter !== 'all'

  const advancedActiveCount = [
    exclusiveFilter !== 'all',
    supportsConversation && categoryFilter !== 'all',
    supportsQuality && qualityFilter !== 'all',
    statusFilter !== 'all',
    supportsDuration && durationPreset !== 'all'
  ].filter(Boolean).length
  const anyFilterActive = advancedActiveCount > 0 || sourceTypeFilter !== 'all' || searchQuery.length > 0

  const selectType = (type: SourceTypeFilter) => {
    const next = artifactTypes.find((item) => item.id === type)
    if (!next?.capabilities.includes('timed')) {
      onDurationPresetChange('all')
      if (sortBy === 'duration') onSortByChange?.('date')
    }
    if (!next?.capabilities.includes('conversation')) onCategoryFilterChange('all')
    if (type !== 'audio' && exclusiveFilter === 'source-only') onExclusiveFilterChange('all')
    onSourceTypeFilterChange(type)
  }

  const chips: Array<{ key: string; label: string; clear: () => void }> = []
  // "On device only" is represented by the pressed status control in the
  // Library header. Repeating it here created a second, orphaned control row.
  if (exclusiveFilter !== 'all' && exclusiveFilter !== 'source-only') {
    chips.push({
      key: 'availability',
      label: exclusiveFilter === 'local-only' ? t('libraryFilters.chipLocalOnly') : t('libraryFilters.chipSynced'),
      clear: () => onExclusiveFilterChange('all')
    })
  }
  if (supportsDuration && durationPreset !== 'all') {
    chips.push({ key: 'duration', label: DURATION_PRESET_LABELS[durationPreset], clear: () => onDurationPresetChange('all') })
  }
  if (supportsConversation && categoryFilter !== 'all') {
    chips.push({ key: 'category', label: categoryFilter, clear: () => onCategoryFilterChange('all') })
  }
  if (supportsQuality && qualityFilter !== 'all') {
    chips.push({ key: 'quality', label: qualityFilter, clear: () => onQualityFilterChange('all') })
  }
  if (statusFilter !== 'all') {
    chips.push({ key: 'status', label: statusFilter, clear: () => onStatusFilterChange('all') })
  }

  return (
    <div className="space-y-2 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex max-w-full shrink-0 overflow-x-auto rounded-lg border" role="group" aria-label={t('libraryFilters.filterByArtifactTypeAriaLabel')} data-testid="source-type-filter">
          <TypeButton type="all" label={t('libraryFilters.allTypesLabel')} count={typeCounts.all} Icon={LayoutGrid} active={sourceTypeFilter === 'all'} onClick={() => selectType('all')} />
          {primaryTypes.map((type) => (
            <TypeButton
              key={type.id}
              type={type.id}
              label={type.pluralLabel}
              count={typeCounts[type.id] ?? 0}
              Icon={iconForType(type.id)}
              active={sourceTypeFilter === type.id}
              onClick={() => selectType(type.id)}
            />
          ))}
          {overflowTypes.length > 0 && (
            <select
              value={overflowTypes.some((type) => type.id === sourceTypeFilter) ? sourceTypeFilter : ''}
              onChange={(event) => event.target.value && selectType(event.target.value)}
              className="border-l bg-background px-2 text-xs font-medium"
              aria-label={t('libraryFilters.moreArtifactTypesAriaLabel')}
            >
              <option value="">{t('libraryFilters.moreTypesOption')}</option>
              {overflowTypes.map((type) => <option key={type.id} value={type.id}>{type.pluralLabel} ({typeCounts[type.id] ?? 0})</option>)}
            </select>
          )}
        </div>

        <div className="relative min-w-[12rem] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder={t('libraryFilters.searchPlaceholder', { count: filterableCount })}
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            className="pl-9 pr-8 h-8"
            aria-label={t('libraryFilters.searchAriaLabel')}
          />
          {searchQuery && (
            <button onClick={() => onSearchQueryChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('libraryFilters.clearSearchAriaLabel')}>
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1.5 h-8 rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('libraryFilters.moreFiltersAriaLabel')}>
              <Filter className="h-3.5 w-3.5" aria-hidden="true" />
              {t('libraryFilters.filtersButton')}
              {advancedActiveCount > 0 && <span className="ml-0.5 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold tabular-nums">{advancedActiveCount}</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-2.5 border-b">
              <span className="text-sm font-semibold">{t('libraryFilters.filtersAndSortHeading')}</span>
              {anyFilterActive && <button onClick={onClearFilters} className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:underline">{t('libraryFilters.clearAllButton')}</button>}
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4 space-y-4">
              {onSortByChange && onSortOrderChange && (
                <section className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70"><ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" /> {t('libraryFilters.sortSectionLabel')}</div>
                  <div className="flex items-center gap-2">
                    <select value={sortBy ?? 'date'} onChange={(event) => onSortByChange(event.target.value as SortBy)} className="h-8 flex-1 rounded-md border border-input bg-background px-3 py-1 text-xs" aria-label={t('libraryFilters.sortByAriaLabel')}>
                      <option value="date">{t('libraryFilters.sortByDateOption')}</option>
                      <option value="name">{t('libraryFilters.sortByNameOption')}</option>
                      {supportsDuration && <option value="duration">{t('libraryFilters.sortByDurationOption')}</option>}
                      {supportsQuality && <option value="quality">{t('libraryFilters.sortByQualityOption')}</option>}
                    </select>
                    <button onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')} className="h-8 px-2 rounded-md border border-input bg-background text-xs font-medium hover:bg-muted transition-colors inline-flex items-center gap-1" aria-label={sortOrder === 'asc' ? t('libraryFilters.sortAscendingAriaLabel') : t('libraryFilters.sortDescendingAriaLabel')}>
                      {sortOrder === 'asc' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {sortOrder === 'asc' ? t('libraryFilters.sortAscLabel') : t('libraryFilters.sortDescLabel')}
                    </button>
                  </div>
                </section>
              )}

              {showAvailability && (
                <section className="space-y-1.5">
                  <div className="text-xs font-semibold text-foreground/70">{t('libraryFilters.availabilitySectionLabel')}</div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label={t('libraryFilters.availabilityFilterAriaLabel')} data-testid="location-filter">
                    <FacetButton active={exclusiveFilter === 'all'} onClick={() => onExclusiveFilterChange('all')} label={t('libraryFilters.facetAllLabel', { count: stats.total })} />
                    {(stats.deviceOnly > 0 || exclusiveFilter === 'source-only') && <FacetButton Icon={Cloud} active={exclusiveFilter === 'source-only'} onClick={() => onExclusiveFilterChange('source-only')} label={t('libraryFilters.facetDeviceOnlyLabel', { count: stats.deviceOnly })} />}
                    {(stats.localOnly > 0 || exclusiveFilter === 'local-only') && <FacetButton Icon={HardDrive} active={exclusiveFilter === 'local-only'} onClick={() => onExclusiveFilterChange('local-only')} label={t('libraryFilters.facetLocalOnlyLabel', { count: stats.localOnly })} />}
                    {(stats.both > 0 || exclusiveFilter === 'synced') && <FacetButton Icon={Check} active={exclusiveFilter === 'synced'} onClick={() => onExclusiveFilterChange('synced')} label={t('libraryFilters.facetSyncedLabel', { count: stats.both })} />}
                  </div>
                </section>
              )}

              {supportsDuration && (
                <section className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70"><Clock className="h-3.5 w-3.5" aria-hidden="true" /> {t('libraryFilters.durationSectionLabel')}</div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label={t('libraryFilters.filterByDurationAriaLabel')}>
                    {DURATION_PRESETS.map((preset) => <FacetButton key={preset} active={durationPreset === preset} onClick={() => onDurationPresetChange(preset)} label={DURATION_PRESET_LABELS[preset]} />)}
                  </div>
                </section>
              )}

              {supportsQuality && (
                <section className="space-y-1.5">
                  <div className="text-xs font-semibold text-foreground/70">{t('libraryFilters.qualitySectionLabel')}</div>
                  <select value={qualityFilter} onChange={(event) => onQualityFilterChange(event.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs" aria-label={t('libraryFilters.filterByQualityAriaLabel')}>
                    <option value="all">{t('libraryFilters.qualityOptionAll')}</option><option value="valuable">{t('libraryFilters.qualityOptionValuable')}</option><option value="archived">{t('libraryFilters.qualityOptionArchived')}</option><option value="low-value">{t('libraryFilters.qualityOptionLowValue')}</option><option value="garbage">{t('libraryFilters.qualityOptionGarbage')}</option><option value="unrated">{t('libraryFilters.qualityOptionUnrated')}</option>
                  </select>
                </section>
              )}

              <section className="space-y-1.5">
                <div className="text-xs font-semibold text-foreground/70">{t('libraryFilters.processingSectionLabel')}</div>
                <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} className="h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs" aria-label={t('libraryFilters.filterByStatusAriaLabel')}>
                  <option value="all">{t('libraryFilters.statusOptionAny')}</option><option value="processing">{t('libraryFilters.statusOptionProcessing')}</option><option value="ready">{t('libraryFilters.statusOptionReady')}</option><option value="enriched">{t('libraryFilters.statusOptionEnriched')}</option>
                </select>
              </section>

              {supportsConversation && (
                <section className="space-y-1.5">
                  <div className="text-xs font-semibold text-foreground/70">{t('libraryFilters.conversationTypeSectionLabel')}</div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label={t('libraryFilters.filterByConversationTypeAriaLabel')}>
                    {CATEGORIES.map((category) => <FacetButton key={category} active={categoryFilter === category} onClick={() => onCategoryFilterChange(category)} label={t(CATEGORY_LABEL_KEYS[category])} />)}
                  </div>
                </section>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label={t('libraryFilters.activeFiltersAriaLabel')}>
          {chips.map((chip) => (
            <button key={chip.key} onClick={chip.clear} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-1 text-xs text-foreground hover:bg-muted" aria-label={t('libraryFilters.removeFilterAriaLabel', { label: chip.label })}>
              {chip.label}<X className="h-3 w-3" aria-hidden="true" />
            </button>
          ))}
          {chips.length > 1 && <button onClick={onClearFilters} className="px-1 text-xs text-muted-foreground hover:text-foreground hover:underline">{t('libraryFilters.clearAllButton')}</button>}
        </div>
      )}
    </div>
  )
}

function TypeButton({ type, label, count, Icon, active, onClick }: { type: string; label: string; count: number; Icon: LucideIcon; active: boolean; onClick: () => void }) {
  const { t } = useTranslation('library')
  return (
    <button onClick={onClick} className={`shrink-0 px-2.5 py-1.5 text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${type !== 'all' ? 'border-l' : ''} ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`} aria-pressed={active} aria-label={t('libraryFilters.typeButtonAriaLabel', { label, count })} title={t('libraryFilters.typeButtonTitle', { label, count })}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="hidden @md:inline sm:inline">{label}</span>
      <span className={`tabular-nums ${active ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{count}</span>
    </button>
  )
}

function FacetButton({ active, onClick, label, Icon }: { active: boolean; onClick: () => void; label: string; Icon?: LucideIcon }) {
  return (
    <button onClick={onClick} className={`px-2 py-1 text-xs font-medium rounded border transition-colors inline-flex items-center gap-1 ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'}`} aria-pressed={active}>
      {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}{label}
    </button>
  )
}
