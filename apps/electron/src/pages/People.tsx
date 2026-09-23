import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import {
  Users,
  Search,
  RefreshCw,
  Mail,
  Building,
  Briefcase,
  Clock,
  MessageSquare,
  Tag,
  ChevronRight,
  Filter,
  UserPlus,
  Trash2,
  GitMerge,
  ArrowLeftRight,
  Sparkles,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import { PersonHoverCard } from '@/components/entity'
import { AddPersonDialog } from '@/components/people/AddPersonDialog'
import {
  IdentitySuggestionsSection,
  type IdentitySuggestionsSectionHandle
} from '@/components/identity/IdentitySuggestionsSection'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import type { Person, PersonType } from '@/types/knowledge'
import { cn } from '@/lib/utils'
import { pageWide } from '@/lib/pageLayout'
import { toast } from '@/components/ui/toaster'

/** Above this many links on BOTH sides, a merge requires typing the loser's name. */
const MERGE_LINK_THRESHOLD = 10

const PAGE_SIZE = 40

type PeopleSort = 'name' | 'lastSeen' | 'interactions'

export function People() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<PersonType | 'all'>('all')
  const [totalCount, setTotalCount] = useState(0)

  // Delete confirmation state (replaces confirm())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [sortBy, setSortBy] = useState<PeopleSort>('name')

  // Quick-merge selection mode: pick exactly two contacts, then fold one into the other.
  const [mergeMode, setMergeMode] = useState(false)
  const [selectedForMerge, setSelectedForMerge] = useState<Person[]>([])
  const [keeperId, setKeeperId] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)
  // High-stakes gate: when BOTH sides are heavily linked, require typing the loser's name.
  const [mergeImpact, setMergeImpact] = useState<{ keeper: number; loser: number } | null>(null)
  const [mergeConfirmText, setMergeConfirmText] = useState('')

  // Discovery sweep: analyze contacts for possible duplicates → new suggestions.
  const [discovering, setDiscovering] = useState(false)
  const suggestionsRef = useRef<IdentitySuggestionsSectionHandle>(null)

  // Add Person dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const isFirstMount = useRef(true)
  const requestIdRef = useRef(0)
  const loadedCountRef = useRef(0)
  const loadedQueryRef = useRef<string | null>(null)
  const queryKey = JSON.stringify([searchQuery, typeFilter, sortBy])

  const loadPeople = useCallback(async (mode: 'reset' | 'append' = 'reset') => {
    const isAppend = mode === 'append'
    if (isAppend && loadedQueryRef.current !== queryKey) return

    const requestId = ++requestIdRef.current
    if (isAppend) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setLoadingMore(false)
    }

    try {
      const result = await window.electronAPI.contacts.getAll({
        search: searchQuery,
        type: typeFilter,
        sortBy,
        limit: PAGE_SIZE,
        offset: isAppend ? loadedCountRef.current : 0
      })
      if (requestId !== requestIdRef.current) return

      if (result.success) {
        const contacts: Person[] = result.data.contacts
        const nextCount = isAppend ? loadedCountRef.current + contacts.length : contacts.length
        setPeople((current) => (isAppend ? [...current, ...contacts] : contacts))
        loadedCountRef.current = nextCount
        loadedQueryRef.current = queryKey
        setTotalCount(result.data.total)
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      console.error('Failed to load people:', error)
      toast.error(t('people:peopleList.toast.loadFailedTitle'), error instanceof Error ? error.message : t('people:errors.unexpectedErrorFallback'))
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [queryKey, searchQuery, sortBy, typeFilter])

  useEffect(() => {
    requestIdRef.current += 1
    const delay = isFirstMount.current ? 0 : 300
    isFirstMount.current = false
    const timer = setTimeout(() => {
      void loadPeople('reset')
    }, delay)
    return () => clearTimeout(timer)
  }, [loadPeople])

  const hasMorePeople = loadedQueryRef.current === queryKey && people.length < totalCount

  const handleDeleteClick = useCallback((personId: string, personName: string, event: React.MouseEvent) => {
    event.stopPropagation()
    setDeleteTarget({ id: personId, name: personName })
    setDeleteDialogOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return

    try {
      const result = await window.electronAPI.contacts.delete(deleteTarget.id)
      if (result.success) {
        toast.success(t('people:sharedToast.contactDeletedTitle'), t('people:peopleList.toast.contactDeletedMessage', { name: deleteTarget.name }))
        await loadPeople('reset')
      } else {
        toast.error(t('common:contacts.deleteFailedFallback'), (result as any).error?.message || t('common:errors.unknown'))
      }
    } catch (error) {
      console.error('Failed to delete contact:', error)
      toast.error(t('common:contacts.deleteFailedFallback'), error instanceof Error ? error.message : t('people:errors.unexpectedErrorFallback'))
    }
    setDeleteDialogOpen(false)
    setDeleteTarget(null)
  }, [deleteTarget, loadPeople])

  // --- Quick merge ---

  const toggleMergeMode = useCallback(() => {
    setMergeMode((prev) => {
      if (prev) {
        // Leaving merge mode — clear any pending selection.
        setSelectedForMerge([])
        setKeeperId(null)
      }
      return !prev
    })
  }, [])

  const toggleSelectForMerge = useCallback((person: Person) => {
    setSelectedForMerge((prev) => {
      if (prev.some((p) => p.id === person.id)) {
        return prev.filter((p) => p.id !== person.id)
      }
      if (prev.length >= 2) return prev // cap at exactly two
      return [...prev, person]
    })
  }, [])

  // Default the keeper to the contact with more interactions whenever two are picked.
  useEffect(() => {
    if (selectedForMerge.length === 2) {
      const [a, b] = selectedForMerge
      setKeeperId(a.interactionCount >= b.interactionCount ? a.id : b.id)
    } else {
      setKeeperId(null)
    }
  }, [selectedForMerge])

  const swapKeeper = useCallback(() => {
    setKeeperId((current) => {
      if (selectedForMerge.length !== 2) return current
      const other = selectedForMerge.find((p) => p.id !== current)
      return other ? other.id : current
    })
  }, [selectedForMerge])

  const keeper = selectedForMerge.find((p) => p.id === keeperId) ?? null
  const loser = selectedForMerge.find((p) => p.id !== keeperId) ?? null

  // Fetch true link counts for the high-stakes gate whenever the pair changes.
  useEffect(() => {
    setMergeConfirmText('')
    if (!keeper || !loser) {
      setMergeImpact(null)
      return
    }
    let cancelled = false
    window.electronAPI.identity
      .getMergeImpact({ kind: 'contact', keeperId: keeper.id, loserId: loser.id })
      .then((res) => {
        if (!cancelled) setMergeImpact(res.success && res.data ? res.data : null)
      })
      .catch(() => {
        if (!cancelled) setMergeImpact(null)
      })
    return () => {
      cancelled = true
    }
    // Keyed on ids only: re-fetch when the *pair* changes, not when loadPeople
    // hands back fresh Person objects for the same two ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keeper?.id, loser?.id])

  // Both sides heavily linked → merging the wrong pair is expensive; make the user type the loser's name.
  const highStakesMerge = !!mergeImpact && mergeImpact.keeper > MERGE_LINK_THRESHOLD && mergeImpact.loser > MERGE_LINK_THRESHOLD
  const mergeConfirmed = !highStakesMerge || mergeConfirmText.trim() === (loser?.name ?? '').trim()

  const handleConfirmMerge = useCallback(async () => {
    if (!keeper || !loser) return
    setMerging(true)
    try {
      const result = await window.electronAPI.contacts.merge({ keeperId: keeper.id, loserId: loser.id })
      if (result.success) {
        toast.success(t('people:sharedToast.contactsMergedTitle'), t('people:sharedToast.contactsMergedMessage', { loserName: loser.name, keeperName: keeper.name }))
        setMergeMode(false)
        setSelectedForMerge([])
        setKeeperId(null)
        await loadPeople('reset')
      } else {
        toast.error(t('people:sharedToast.mergeFailedTitle'), (result as any).error?.message || t('common:errors.unknown'))
      }
    } catch (error) {
      console.error('Failed to merge contacts:', error)
      toast.error(t('people:sharedToast.mergeFailedTitle'), error instanceof Error ? error.message : t('people:errors.unexpectedErrorFallback'))
    } finally {
      setMerging(false)
    }
  }, [keeper, loser, loadPeople])

  const handleDiscover = useCallback(async () => {
    setDiscovering(true)
    try {
      const result = await window.electronAPI.identity.discoverContacts()
      if (result.success && result.data) {
        const { candidatePairs, suggestionsCreated, autoMergeable } = result.data
        toast.success(
          t('people:peopleList.toast.discoveryCompleteTitle'),
          t('people:peopleList.toast.discoveryCompleteMessage', {
            pairs: candidatePairs,
            count: suggestionsCreated,
            autoMergeable
          })
        )
        suggestionsRef.current?.reload()
      } else {
        toast.error(t('people:peopleList.toast.discoveryFailedTitle'), result.error || t('common:errors.unknown'))
      }
    } catch (error) {
      console.error('Failed to discover contacts:', error)
      toast.error(t('people:peopleList.toast.discoveryFailedTitle'), error instanceof Error ? error.message : t('people:errors.unexpectedErrorFallback'))
    } finally {
      setDiscovering(false)
    }
  }, [])

  /** Safely format a date string, returning fallback for invalid dates */
  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return t('people:peopleList.unknownDateFallback')
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return t('people:peopleList.unknownDateFallback')
    return date.toLocaleDateString()
  }

  /** Return "interaction" (singular) or "interactions" (plural) */
  const interactionLabel = (count: number): string => {
    return t('people:peopleList.interactionCount', { count })
  }

  const getTypeColor = (type: PersonType) => {
    switch (type) {
      case 'team': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
      case 'candidate': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
      case 'customer': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      case 'external': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
    }
  }

  /** Human phrase describing a person's type, for the colored-glyph tooltips. */
  const getTypeLabel = (type: PersonType): string => {
    switch (type) {
      case 'team': return t('people:personType.team')
      case 'candidate': return t('people:personType.candidate')
      case 'customer': return t('people:personType.customer')
      case 'external': return t('people:personType.external')
      default: return t('people:personType.unclassified')
    }
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t('people:peopleList.header.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('people:peopleList.header.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => loadPeople('reset')}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              {t('people:shared.refreshButton')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleDiscover}
              disabled={discovering}
              title={t('people:peopleList.header.discoverTitle')}
            >
              <Sparkles className={cn("h-4 w-4 mr-2", discovering && "animate-pulse")} />
              {discovering ? t('people:peopleList.header.discoveringButton') : t('people:peopleList.header.discoverButton')}
            </Button>
            <Button
              size="sm"
              variant={mergeMode ? 'default' : 'outline'}
              onClick={toggleMergeMode}
              title={t('people:peopleList.header.mergeToggleTitle')}
              aria-pressed={mergeMode}
            >
              <GitMerge className="h-4 w-4 mr-2" />
              {mergeMode ? t('people:peopleList.header.cancelMergeButton') : t('people:shared.mergeButton')}
            </Button>
            <Button
              size="sm"
              variant="default"
              title={t('people:peopleList.header.addPersonTitle')}
              onClick={() => setAddDialogOpen(true)}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              {t('people:peopleList.header.addPersonButton')}
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-4">
          <div className="relative flex-1 max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('people:peopleList.filters.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <div className="flex items-center gap-4 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex gap-1">
                {(['all', 'team', 'candidate', 'customer', 'external'] as const).map((ft) => (
                  <button
                    key={ft}
                    onClick={() => setTypeFilter(ft)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border transition-all whitespace-nowrap",
                      typeFilter === ft
                        ? "bg-primary border-primary text-primary-foreground"
                        : "bg-background border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {t(`people:personTypeOption.${ft}`)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 border-l pl-4">
              <span className="text-xs text-muted-foreground whitespace-nowrap">{t('people:peopleList.filters.sortByLabel')}</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'lastSeen' | 'interactions')}
                className="text-xs rounded-md border border-input bg-background px-2 py-1 ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                aria-label={t('people:peopleList.filters.sortAriaLabel')}
              >
                <option value="name">{t('people:peopleList.filters.sortName')}</option>
                <option value="lastSeen">{t('people:peopleList.filters.sortLastSeen')}</option>
                <option value="interactions">{t('people:peopleList.filters.sortInteractions')}</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className={pageWide}>
          {/* Identity suggestions review queue (self-hides when empty) */}
          {!mergeMode && <IdentitySuggestionsSection ref={suggestionsRef} />}

          {/* Merge-mode instruction banner */}
          {mergeMode && (
            <div className="mb-4 rounded-lg border border-primary/30 bg-primary/[0.04] px-4 py-3 text-sm">
              <span className="font-medium">{t('people:peopleList.mergeBanner.label')}</span> {t('people:peopleList.mergeBanner.instruction')}
              {' '}
              {selectedForMerge.length === 0
                ? t('people:peopleList.mergeBanner.selectFirst')
                : selectedForMerge.length === 1
                ? t('people:peopleList.mergeBanner.selectOneMore')
                : t('people:peopleList.mergeBanner.reviewDirection')}
            </div>
          )}

          {/* Result count indicator */}
          {!loading && totalCount > 0 && (
            <p className="text-xs text-muted-foreground mb-4">
              {t('people:peopleList.resultCount', { shown: people.length, count: totalCount })}
            </p>
          )}
          {loading && people.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : people.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-2">{t('people:peopleList.emptyTitle')}</h3>
                <p className="text-muted-foreground">
                  {searchQuery || typeFilter !== 'all'
                    ? t('people:peopleList.emptyMessageFiltered')
                    : t('people:peopleList.emptyMessageNoContacts')}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {people.map((person, index) => {
                const isSelected = selectedForMerge.some((p) => p.id === person.id)
                const typeLabel = getTypeLabel(person.type)
                const card = (
                <Card
                  className={cn(
                    "group animate-rise-in lift cursor-pointer overflow-hidden shadow-sm border-border/70 dark:border-white/[0.06]",
                    mergeMode ? "hover:border-primary/70" : "hover:border-primary/50",
                    isSelected && "ring-2 ring-primary border-primary"
                  )}
                  style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
                  onClick={() => (mergeMode ? toggleSelectForMerge(person) : navigate(`/person/${person.id}`))}
                  aria-pressed={mergeMode ? isSelected : undefined}
                >
                  <CardHeader className="pb-3 bg-muted/5 group-hover:bg-muted/10 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm border",
                            getTypeColor(person.type)
                          )}
                          title={typeLabel}
                        >
                          {person.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{person.name}</CardTitle>
                          <span
                            className={cn(
                              "inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mt-1",
                              getTypeColor(person.type)
                            )}
                            title={typeLabel}
                          >
                            {person.type}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {mergeMode ? (
                          <Checkbox
                            checked={isSelected}
                            tabIndex={-1}
                            aria-label={t('people:peopleList.card.selectToMergeAriaLabel', { name: person.name })}
                            className="pointer-events-none"
                          />
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => handleDeleteClick(person.id, person.name, e)}
                              title={t('people:peopleList.card.deleteTitle')}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                          </>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-3">
                    {person.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        <span className="truncate">{person.email}</span>
                      </div>
                    )}
                    {person.company && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Building className="h-3.5 w-3.5" />
                        <span className="truncate">{person.company}</span>
                      </div>
                    )}
                    {person.role && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Briefcase className="h-3.5 w-3.5" />
                        <span className="truncate">{person.role}</span>
                      </div>
                    )}

                    <div className="pt-2 flex items-center justify-between border-t border-border/50">
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        <MessageSquare className="h-3.5 w-3.5 text-primary" />
                        <span>{interactionLabel(person.interactionCount)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(person.lastSeenAt)}</span>
                      </div>
                    </div>

                    {(person.tags?.length ?? 0) > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(person.tags ?? []).slice(0, 3).map(tag => (
                          <div key={tag} className="flex items-center gap-1 text-[10px] bg-secondary px-2 py-0.5 rounded-full">
                            <Tag className="h-2.5 w-2.5" />
                            {tag}
                          </div>
                        ))}
                        {(person.tags?.length ?? 0) > 3 && (
                          <span className="text-[10px] text-muted-foreground">{t('people:peopleList.card.moreTagsLabel', { count: (person.tags?.length ?? 0) - 3 })}</span>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
                )

                // Merge mode turns cards into selection targets, so suppress the
                // hover card there (its "open person" intent would mislead). Outside
                // merge mode, hovering reveals the net-new detail the card omits —
                // recent meetings — fetched lazily only when the card opens.
                if (mergeMode) {
                  return <div key={person.id}>{card}</div>
                }
                return (
                  <HoverCard key={person.id} openDelay={220} closeDelay={120}>
                    <HoverCardTrigger asChild>{card}</HoverCardTrigger>
                    <HoverCardContent align="start" className="w-72">
                      <PersonHoverCard
                        id={person.id}
                        name={person.name}
                        visibleFields={['name', 'type', 'role', 'company', 'email', 'meetings', 'lastSeen']}
                      />
                    </HoverCardContent>
                  </HoverCard>
                )
              })}
            </div>

            {/* Load more */}
            {hasMorePeople && (
              <div className="flex items-center justify-center mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => loadPeople('append')}
                >
                  {loadingMore ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  {loadingMore ? t('people:peopleList.loadingMoreButton') : t('people:peopleList.loadMoreButton')}
                </Button>
              </div>
            )}
            </div>
          )}
        </div>
      </div>

      {/* Floating merge action bar — appears once exactly two people are selected */}
      {mergeMode && keeper && loser && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 w-[min(640px,calc(100%-2rem))]">
          <div className="flex flex-col gap-3 rounded-xl border bg-background/95 backdrop-blur shadow-lg px-4 py-3">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center gap-2 text-sm min-w-0 flex-1">
                <GitMerge className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-muted-foreground">{t('people:peopleList.mergeBar.keepLabel')}</span>
                <span className="font-semibold truncate max-w-[120px]" title={keeper.name}>{keeper.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 flex-shrink-0"
                  onClick={swapKeeper}
                  title={t('people:peopleList.mergeBar.swapTitle')}
                  aria-label={t('people:peopleList.mergeBar.swapTitle')}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </Button>
                <span className="text-muted-foreground">{t('people:peopleList.mergeBar.absorbLabel')}</span>
                <span className="font-semibold truncate max-w-[120px] line-through decoration-muted-foreground/50" title={loser.name}>
                  {loser.name}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button variant="outline" size="sm" onClick={toggleMergeMode} disabled={merging}>
                  <X className="h-4 w-4 mr-1" />
                  {t('people:shared.cancelButton')}
                </Button>
                <Button size="sm" onClick={handleConfirmMerge} disabled={merging || !mergeConfirmed}>
                  {merging ? (
                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <GitMerge className="h-4 w-4 mr-1" />
                  )}
                  {t('people:peopleList.mergeBar.confirmButton')}
                </Button>
              </div>
            </div>
            {highStakesMerge && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 text-xs">
                <p className="text-amber-700 dark:text-amber-400 font-medium">
                  <Trans
                    i18nKey="people:shared.highStakesMergeWarning"
                    values={{
                      keeperName: keeper.name,
                      keeperCount: mergeImpact!.keeper,
                      loserName: loser.name,
                      loserCount: mergeImpact!.loser
                    }}
                  >
                    High-stakes merge: {{ keeperName: keeper.name } as unknown as string} has {{ keeperCount: mergeImpact!.keeper } as unknown as string} links and {{ loserName: loser.name } as unknown as string} has {{ loserCount: mergeImpact!.loser } as unknown as string}. To confirm, type <span className="font-semibold">{{ loserName: loser.name } as unknown as string}</span>.
                  </Trans>
                </p>
                <Input
                  value={mergeConfirmText}
                  onChange={(e) => setMergeConfirmText(e.target.value)}
                  placeholder={loser.name}
                  aria-label={t('people:shared.typeToConfirmAriaLabel', { name: loser.name })}
                  className="mt-2 h-8"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Person dialog */}
      <AddPersonDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onCreated={(person) => {
          loadPeople('reset')
          navigate(`/person/${person.id}`)
        }}
        onOpenExisting={(existingId) => navigate(`/person/${existingId}`)}
      />

      {/* Delete Confirmation AlertDialog (replaces confirm()) */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('people:shared.deleteContactTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('people:shared.deleteContactDescription', { name: deleteTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('people:shared.cancelButton')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              {t('people:shared.deleteButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
export default People
