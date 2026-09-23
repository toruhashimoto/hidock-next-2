import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  ArrowLeft,
  Mail,
  Briefcase,
  Clock,
  MessageSquare,
  Tag,
  Calendar,
  Edit,
  RefreshCw,
  ExternalLink,
  Bot,
  Check,
  X,
  Trash2,
  GitMerge,
  Undo2,
  History,
  AlertTriangle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import { MeetingHoverCard } from '@/components/entity'
import { formatDateTime } from '@/lib/utils'
import type { Person, PersonType } from '@/types/knowledge'
import type { Meeting } from '@/types'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toaster'
import { ResolvePerMeetingCard } from '@/components/identity/ResolvePerMeetingCard'
import type { AmbiguousBucketSummary, BucketResolution } from '@/components/identity/useAmbiguousBuckets'
import { Users } from 'lucide-react'

const PERSON_TYPES: PersonType[] = ['team', 'candidate', 'customer', 'external', 'unknown']

/** Above this many links on BOTH sides, a merge requires typing the loser's name. */
const MERGE_LINK_THRESHOLD = 10

/** A past merge folded into this contact (from identity:getMergeJournal). */
interface MergeHistoryEntry {
  id: string
  kind: 'contact' | 'project'
  keeperId: string
  loserId: string
  loserName: string
  createdAt: string
  undoneAt: string | null
  linkCount: number
}

/** A keeper link that appeared after a merge — surfaced by unmerge for manual review. */
interface OrphanLink {
  table: string
  key: string
  label: string
  date: string | null
}

/** An "also known as" alias folded onto this contact (from identity:getAliases). */
interface PersonAlias {
  alias: string
  source: 'merge' | 'speaker_assign' | 'manual' | 'inferred' | 'rejected' | null
  confidence: number | null
  created_at: string
}

/** Human phrase for where an alias came from, for the per-chip tooltip. */
function aliasSourceLabel(source: PersonAlias['source'], t: TFunction): string {
  switch (source) {
    case 'merge': return t('people:personDetail.aliasSource.merge')
    case 'speaker_assign': return t('people:personDetail.aliasSource.speakerAssign')
    case 'manual': return t('people:personDetail.aliasSource.manual')
    case 'inferred': return t('people:personDetail.aliasSource.inferred')
    default: return t('people:personDetail.aliasSource.fallback')
  }
}

export function PersonDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [person, setPerson] = useState<Person | null>(null)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'timeline' | 'knowledge'>('timeline')
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<{
    name: string
    email: string
    role: string
    company: string
    notes: string
    type: PersonType
    tags: string[]
  }>({
    name: '', email: '', role: '', company: '', notes: '', type: 'unknown', tags: []
  })
  const [tagInput, setTagInput] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // Merge dialog state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [mergeCandidates, setMergeCandidates] = useState<Person[]>([])
  const [mergeSearch, setMergeSearch] = useState('')
  const [mergeTarget, setMergeTarget] = useState<Person | null>(null)
  const [merging, setMerging] = useState(false)
  // High-stakes gate: when BOTH sides are heavily linked, require typing the loser's name.
  const [mergeImpact, setMergeImpact] = useState<{ keeper: number; loser: number } | null>(null)
  const [mergeConfirmText, setMergeConfirmText] = useState('')

  // "Also known as" aliases (read-only chip row)
  const [aliases, setAliases] = useState<PersonAlias[]>([])

  // Merge history / unmerge
  const [mergeJournal, setMergeJournal] = useState<MergeHistoryEntry[]>([])
  const [unmergeTarget, setUnmergeTarget] = useState<MergeHistoryEntry | null>(null)
  const [unmerging, setUnmerging] = useState(false)
  const [orphanReview, setOrphanReview] = useState<{ loserName: string; orphans: OrphanLink[] } | null>(null)

  // Ambiguous-bucket state: when this contact is a bare first name denoting several
  // real people, offer per-recording resolution instead of pretending it's one person.
  const [bucket, setBucket] = useState<BucketResolution | null>(null)
  const [showResolve, setShowResolve] = useState(false)

  // B-PPL-002: Wrapped in useCallback to satisfy dependency arrays
  const loadDetails = useCallback(async () => {
    if (!id) return
    setLoading(true)
    // B-PPL-002: Disable editing while loading
    setIsEditing(false)
    try {
      const result = await window.electronAPI.contacts.getById(id)
      if (result.success && result.data.contact) {
        const c = result.data.contact as any
        const personData: Person = {
          ...c,
          type: c.type || 'unknown',
          tags: c.tags ? (typeof c.tags === 'string' ? JSON.parse(c.tags) : c.tags) : [],
          firstSeenAt: c.first_seen_at || c.firstSeenAt,
          lastSeenAt: c.last_seen_at || c.lastSeenAt,
          interactionCount: c.meeting_count || c.interactionCount || 0,
          createdAt: c.created_at || c.createdAt || new Date().toISOString()
        }
        setPerson(personData)
        // B-PPL-002: Initialize form from loaded person data
        setEditForm({
          name: personData.name || '',
          email: personData.email || '',
          role: personData.role || '',
          company: personData.company || '',
          notes: personData.notes || '',
          type: personData.type || 'unknown',
          tags: personData.tags || []
        })
        if (result.data.meetings) {
          setMeetings(result.data.meetings)
        }
      }
    } catch (error) {
      console.error('Failed to load person details:', error)
    } finally {
      setLoading(false)
    }
  }, [id])

  // Load this contact's "also known as" aliases (read-only chip row).
  const loadAliases = useCallback(async () => {
    if (!id) return
    try {
      const result = await window.electronAPI.identity.getAliases(id)
      setAliases(result.success && result.data ? (result.data as PersonAlias[]) : [])
    } catch (error) {
      console.error('Failed to load aliases:', error)
      setAliases([])
    }
  }, [id])

  // Load this contact's merge history (open, undoable merges folded into it).
  const loadMergeJournal = useCallback(async () => {
    if (!id) return
    try {
      const result = await window.electronAPI.identity.getMergeJournal({ kind: 'contact', keeperId: id })
      setMergeJournal(result.success && result.data ? (result.data as MergeHistoryEntry[]) : [])
    } catch (error) {
      console.error('Failed to load merge history:', error)
      setMergeJournal([])
    }
  }, [id])

  // B-PPL-003: Save including name and email fields
  // C-PPL: Added form validation
  const handleSaveEdit = async () => {
    if (!person || !id) return

    // Validate name (required, non-empty)
    const trimmedName = editForm.name.trim()
    if (!trimmedName) {
      toast.error(t('people:personDetail.toast.validationErrorTitle'), t('people:personDetail.toast.nameRequiredMessage'))
      return
    }
    if (trimmedName.length < 2) {
      toast.error(t('people:personDetail.toast.validationErrorTitle'), t('people:personDetail.toast.nameTooShortMessage'))
      return
    }

    // Validate email format if provided
    const trimmedEmail = editForm.email.trim()
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error(t('people:personDetail.toast.validationErrorTitle'), t('people:shared.invalidEmailError'))
      return
    }

    try {
      const updatePayload: Record<string, unknown> = {
        id,
        notes: editForm.notes || undefined,
        role: editForm.role || undefined,
        company: editForm.company || undefined
      }

      // B-PPL-003: Include name and email in updates
      if (trimmedName !== person.name) {
        updatePayload.name = trimmedName
      }
      if (trimmedEmail !== (person.email || '')) {
        updatePayload.email = trimmedEmail || undefined
      }
      // R1b: person type + tags are now editable
      if (editForm.type !== person.type) {
        updatePayload.type = editForm.type
      }
      const currentTags = person.tags || []
      const nextTags = editForm.tags
      const tagsChanged =
        nextTags.length !== currentTags.length || nextTags.some((tagValue, i) => tagValue !== currentTags[i])
      if (tagsChanged) {
        updatePayload.tags = nextTags
      }

      await window.electronAPI.contacts.update(updatePayload as any)
      toast.success(t('people:personDetail.toast.contactUpdatedTitle'), t('people:personDetail.toast.contactUpdatedMessage'))
      setIsEditing(false)
      await loadDetails()
    } catch (error) {
      console.error('Failed to update person:', error)
      toast.error(t('common:contacts.updateFailedFallback'), error instanceof Error ? error.message : t('common:errors.unknown'))
    }
  }

  const handleCancelEdit = () => {
    if (person) {
      setEditForm({
        name: person.name || '',
        email: person.email || '',
        role: person.role || '',
        company: person.company || '',
        notes: person.notes || '',
        type: person.type || 'unknown',
        tags: person.tags || []
      })
    }
    setTagInput('')
    setIsEditing(false)
  }

  // B-PPL-004: Delete contact
  const handleDeleteContact = async () => {
    if (!id || !person) return
    try {
      const result = await window.electronAPI.contacts.delete(id)
      if (result.success) {
        toast.success(t('people:sharedToast.contactDeletedTitle'), t('people:personDetail.toast.contactDeletedMessage', { name: person.name }))
        navigate('/people')
      } else {
        toast.error(t('common:contacts.deleteFailedFallback'), (result as any).error?.message || t('common:errors.unknown'))
      }
    } catch (error) {
      console.error('Failed to delete contact:', error)
      toast.error(t('common:contacts.deleteFailedFallback'), error instanceof Error ? error.message : t('common:errors.unknown'))
    }
    setDeleteDialogOpen(false)
  }

  // R1b: tag editing (edit mode)
  const addTag = () => {
    const t = tagInput.trim()
    if (!t) return
    if (editForm.tags.some((existing) => existing.toLowerCase() === t.toLowerCase())) {
      setTagInput('')
      return
    }
    setEditForm((prev) => ({ ...prev, tags: [...prev.tags, t] }))
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    setEditForm((prev) => ({ ...prev, tags: prev.tags.filter((existingTag) => existingTag !== tag) }))
  }

  // R1b: merge — fold another contact into this one (canonical entity dedupe)
  const openMergeDialog = async () => {
    setMergeDialogOpen(true)
    setMergeSearch('')
    setMergeTarget(null)
    setMergeImpact(null)
    setMergeConfirmText('')
    try {
      const result = await window.electronAPI.contacts.getAll()
      if (result.success) {
        setMergeCandidates(result.data.contacts.filter((c) => c.id !== id))
      }
    } catch (error) {
      console.error('Failed to load merge candidates:', error)
      toast.error(t('common:contacts.loadFailedFallback'))
    }
  }

  // Fetch true link counts for the high-stakes gate once a target is picked.
  useEffect(() => {
    setMergeConfirmText('')
    if (!id || !mergeTarget) {
      setMergeImpact(null)
      return
    }
    let cancelled = false
    window.electronAPI.identity
      .getMergeImpact({ kind: 'contact', keeperId: id, loserId: mergeTarget.id })
      .then((res) => {
        if (!cancelled) setMergeImpact(res.success && res.data ? res.data : null)
      })
      .catch(() => {
        if (!cancelled) setMergeImpact(null)
      })
    return () => {
      cancelled = true
    }
    // Keyed on the target id only — the mergeTarget object is otherwise stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mergeTarget?.id])

  // Detect whether this contact is an ambiguous bucket (bare first name → several people).
  const loadBucket = useCallback(async () => {
    if (!id) return
    try {
      const res = await window.electronAPI.identity.getBucketResolution?.(id)
      setBucket(res?.success ? ((res.data as BucketResolution | null) ?? null) : null)
    } catch {
      setBucket(null)
    }
  }, [id])

  useEffect(() => {
    loadBucket()
  }, [loadBucket])

  // Feed the reused ResolvePerMeetingCard: it wants a summary + fetch/resolve closures.
  const bucketSummary: AmbiguousBucketSummary | null = useMemo(() => {
    if (!bucket) return null
    const resolvedCount = bucket.recordings.filter((r) => r.resolved).length
    return {
      contactId: bucket.contactId,
      name: bucket.name,
      candidates: bucket.candidates,
      recordingCount: bucket.recordings.length,
      resolvedCount,
      pendingCount: bucket.recordings.length - resolvedCount
    }
  }, [bucket])

  const fetchBucketResolution = useCallback(async (): Promise<BucketResolution | null> => {
    if (!id) return null
    const res = await window.electronAPI.identity.getBucketResolution?.(id)
    return res?.success ? ((res.data as BucketResolution | null) ?? null) : null
  }, [id])

  const resolveBucketMention = useCallback(
    async (recordingId: string, sourceName: string, contactId: string | null, method = 'manual'): Promise<boolean> => {
      const res = await window.electronAPI.identity.resolveMention?.({ recordingId, sourceName, contactId, method })
      return !!res?.success
    },
    []
  )

  // Both sides heavily linked → require typing the loser's name before merging.
  const highStakesMerge =
    !!mergeImpact && mergeImpact.keeper > MERGE_LINK_THRESHOLD && mergeImpact.loser > MERGE_LINK_THRESHOLD
  const mergeConfirmed = !highStakesMerge || mergeConfirmText.trim() === (mergeTarget?.name ?? '').trim()

  const handleMerge = async () => {
    if (!id || !person || !mergeTarget || !mergeConfirmed) return
    setMerging(true)
    try {
      const result = await window.electronAPI.contacts.merge({ keeperId: id, loserId: mergeTarget.id })
      if (result.success) {
        toast.success(t('people:sharedToast.contactsMergedTitle'), t('people:sharedToast.contactsMergedMessage', { loserName: mergeTarget.name, keeperName: person.name }))
        setMergeDialogOpen(false)
        setMergeTarget(null)
        setMergeImpact(null)
        setMergeConfirmText('')
        await loadDetails()
        await loadMergeJournal()
      } else {
        toast.error(t('people:sharedToast.mergeFailedTitle'), (result as any).error?.message || t('common:errors.unknown'))
      }
    } catch (error) {
      console.error('Failed to merge contacts:', error)
      toast.error(t('people:sharedToast.mergeFailedTitle'), error instanceof Error ? error.message : t('common:errors.unknown'))
    } finally {
      setMerging(false)
    }
  }

  // Undo a previously recorded merge: recreate the split contact, repoint the
  // journaled links back, and surface any links added since the merge for review.
  const handleUnmerge = async () => {
    if (!unmergeTarget) return
    setUnmerging(true)
    try {
      const result = await window.electronAPI.contacts.unmerge(unmergeTarget.id)
      if (result.success && result.data) {
        const { restored, orphanedSinceMerge, loserName } = result.data
        const undoneMessage = restored.skipped
          ? t('people:personDetail.toast.mergeUndoneMessageWithSkipped', {
              name: loserName,
              meetings: restored.meetingLinks,
              speakerLinks: restored.speakerLinks,
              skipped: restored.skipped
            })
          : t('people:personDetail.toast.mergeUndoneMessage', {
              name: loserName,
              meetings: restored.meetingLinks,
              speakerLinks: restored.speakerLinks
            })
        toast.success(t('people:personDetail.toast.mergeUndoneTitle'), undoneMessage)
        setUnmergeTarget(null)
        if (orphanedSinceMerge.length > 0) {
          setOrphanReview({ loserName, orphans: orphanedSinceMerge as OrphanLink[] })
        }
        await loadDetails()
        await loadMergeJournal()
      } else {
        toast.error(t('people:personDetail.toast.undoMergeFailedTitle'), (result as any).error?.message || t('common:errors.unknown'))
      }
    } catch (error) {
      console.error('Failed to undo merge:', error)
      toast.error(t('people:personDetail.toast.undoMergeFailedTitle'), error instanceof Error ? error.message : t('common:errors.unknown'))
    } finally {
      setUnmerging(false)
    }
  }

  const filteredMergeCandidates = useMemo(() => {
    const q = mergeSearch.trim().toLowerCase()
    const list = q
      ? mergeCandidates.filter(
          (c) => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q)
        )
      : mergeCandidates
    return list.slice(0, 50)
  }, [mergeCandidates, mergeSearch])

  useEffect(() => {
    loadDetails()
    loadMergeJournal()
    loadAliases()
  }, [loadDetails, loadMergeJournal, loadAliases])

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

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!person) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4">
        <p className="text-muted-foreground">{t('people:personDetail.notFound.message')}</p>
        <Button onClick={() => navigate('/people')}>{t('people:personDetail.notFound.backButton')}</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Sticky Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/people')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold shadow-sm border",
                  getTypeColor(person.type)
                )}
                title={getTypeLabel(person.type)}
              >
                {person.name.charAt(0)}
              </div>
              <div>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="text-xl font-bold leading-tight border rounded px-2 py-1 bg-background w-full"
                    placeholder={t('people:personDetail.header.namePlaceholder')}
                  />
                ) : (
                  <h1 className="text-xl font-bold leading-tight">{person.name}</h1>
                )}
                <div className="flex items-center gap-2 mt-1">
                  {isEditing ? (
                    <Select
                      value={editForm.type}
                      onValueChange={(value) => setEditForm((prev) => ({ ...prev, type: value as PersonType }))}
                    >
                      <SelectTrigger className="h-7 w-[130px] text-xs" aria-label={t('people:shared.personTypeAriaLabel')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PERSON_TYPES.map((pt) => (
                          <SelectItem key={pt} value={pt}>
                            {t(`people:personTypeOption.${pt}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        getTypeColor(person.type)
                      )}
                      title={getTypeLabel(person.type)}
                    >
                      {person.type}
                    </span>
                  )}
                  {person.company && (
                    <span className="text-xs text-muted-foreground">- {person.company}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => loadDetails()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              {t('people:shared.refreshButton')}
            </Button>
            {isEditing ? (
              <>
                <Button size="sm" variant="default" onClick={handleSaveEdit} disabled={loading}>
                  <Check className="h-4 w-4 mr-2" />
                  {t('people:personDetail.header.saveButton')}
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit}>
                  <X className="h-4 w-4 mr-2" />
                  {t('people:shared.cancelButton')}
                </Button>
              </>
            ) : (
              <>
                {/* B-PPL-002: Disable edit button while loading */}
                <Button size="sm" variant="default" onClick={() => setIsEditing(true)} disabled={loading}>
                  <Edit className="h-4 w-4 mr-2" />
                  {t('people:personDetail.header.editButton')}
                </Button>
                {/* R1b: Merge another contact into this one */}
                <Button size="sm" variant="outline" onClick={openMergeDialog} disabled={loading}>
                  <GitMerge className="h-4 w-4 mr-2" />
                  {t('people:personDetail.header.mergeButton')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={loading}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          {bucketSummary && bucketSummary.recordingCount > 0 && (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 rounded-lg border border-blue-500/30 bg-blue-500/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-2">
                  <Users className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
                  <p className="text-sm">
                    <Trans
                      i18nKey="people:personDetail.bucketBanner.summary"
                      values={{ resolved: bucketSummary.resolvedCount, pending: bucketSummary.pendingCount }}
                    >
                      This may be several people — <span className="font-medium">{{ resolved: bucketSummary.resolvedCount } as unknown as string} resolved</span>, <span className="font-medium">{{ pending: bucketSummary.pendingCount } as unknown as string} pending</span>.
                    </Trans>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-blue-500/40 text-blue-600 hover:bg-blue-500/10 dark:text-blue-300"
                  onClick={() => setShowResolve((v) => !v)}
                  aria-expanded={showResolve}
                >
                  {showResolve ? t('people:personDetail.bucketBanner.hideButton') : t('people:personDetail.bucketBanner.resolveButton')}
                </Button>
              </div>
              {showResolve && (
                <ResolvePerMeetingCard
                  bucket={bucketSummary}
                  fetchResolution={fetchBucketResolution}
                  resolve={resolveBucketMention}
                  onOpenRecording={(recordingId) => navigate('/library', { state: { selectedId: recordingId } })}
                  onResolved={loadBucket}
                />
              )}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left Column: Info Card */}
            <div className="space-y-6 animate-rise-in">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t('people:personDetail.info.title')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* B-PPL-003: Email is now editable */}
                  {(person.email || isEditing) && (
                    <div className="flex items-start gap-3">
                      <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground mb-0.5">{t('people:shared.emailLabel')}</p>
                        {isEditing ? (
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                            className="text-sm font-medium w-full border rounded px-2 py-1 bg-background"
                            placeholder={t('people:personDetail.info.emailPlaceholder')}
                          />
                        ) : (
                          <p className="text-sm font-medium truncate">{person.email}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {(person.role || isEditing) && (
                    <div className="flex items-start gap-3">
                      <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground mb-0.5">{t('people:shared.roleLabel')}</p>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.role}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, role: e.target.value }))}
                            className="text-sm font-medium w-full border rounded px-2 py-1 bg-background"
                            placeholder={t('people:personDetail.info.rolePlaceholder')}
                          />
                        ) : (
                          <p className="text-sm font-medium truncate">{person.role}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {(person.company || isEditing) && (
                    <div className="flex items-start gap-3">
                      <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground mb-0.5">{t('people:personDetail.info.companyLabel')}</p>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editForm.company}
                            onChange={(e) => setEditForm((prev) => ({ ...prev, company: e.target.value }))}
                            className="text-sm font-medium w-full border rounded px-2 py-1 bg-background"
                            placeholder={t('people:personDetail.info.companyPlaceholder')}
                          />
                        ) : (
                          <p className="text-sm font-medium truncate">{person.company}</p>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground mb-0.5">{t('people:personDetail.info.lastInteractionLabel')}</p>
                      <p className="text-sm font-medium">{formatDateTime(person.lastSeenAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 border-t pt-4">
                    <MessageSquare className="h-4 w-4 text-primary mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground mb-0.5">{t('people:personDetail.info.totalInteractionsLabel')}</p>
                      <p className="text-sm font-bold">{person.interactionCount}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {(person.tags.length > 0 || isEditing) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t('people:personDetail.tags.title')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {editForm.tags.map(tag => (
                            <div key={tag} className="flex items-center gap-1.5 text-xs bg-secondary px-3 py-1 rounded-full border border-border/50">
                              <Tag className="h-3 w-3" />
                              {tag}
                              <button
                                type="button"
                                onClick={() => removeTag(tag)}
                                className="ml-0.5 text-muted-foreground hover:text-destructive"
                                aria-label={t('people:personDetail.tags.removeAriaLabel', { tag })}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          {editForm.tags.length === 0 && (
                            <span className="text-xs text-muted-foreground">{t('people:personDetail.tags.noneYet')}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                addTag()
                              }
                            }}
                            className="flex-1 text-sm border rounded px-2 py-1 bg-background"
                            placeholder={t('people:personDetail.tags.addPlaceholder')}
                            aria-label={t('people:personDetail.tags.addAriaLabel')}
                          />
                          <Button size="sm" variant="outline" onClick={addTag} disabled={!tagInput.trim()}>
                            {t('people:personDetail.tags.addButton')}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {person.tags.map(tag => (
                          <div key={tag} className="flex items-center gap-1.5 text-xs bg-secondary px-3 py-1 rounded-full border border-border/50">
                            <Tag className="h-3 w-3" />
                            {tag}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* "Also known as" — read-only aliases folded onto this contact */}
              {aliases.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('people:personDetail.aliases.title')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TooltipProvider delayDuration={200}>
                      <div className="flex flex-wrap gap-2">
                        {aliases.map((a) => (
                          <Tooltip key={`${a.alias}:${a.created_at}`}>
                            <TooltipTrigger asChild>
                              <span className="text-xs bg-muted/60 text-muted-foreground px-2.5 py-1 rounded-full border border-border/40 cursor-default">
                                {a.alias}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {t('people:personDetail.aliases.tooltip', { source: aliasSourceLabel(a.source, t), date: formatDateTime(a.created_at) })}
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    </TooltipProvider>
                  </CardContent>
                </Card>
              )}

              {/* v30: Merge history — undoable merges folded into this contact */}
              {mergeJournal.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <History className="h-4 w-4" />
                      {t('people:personDetail.mergeHistory.title')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {mergeJournal.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between gap-2 p-2 border rounded-lg text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate" title={entry.loserName}>
                            {entry.loserName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t('people:personDetail.mergeHistory.linkCount', { count: entry.linkCount, date: formatDateTime(entry.createdAt) })}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-shrink-0"
                          onClick={() => setUnmergeTarget(entry)}
                          title={t('people:personDetail.mergeHistory.undoAriaLabel', { name: entry.loserName })}
                        >
                          <Undo2 className="h-3.5 w-3.5 mr-1" />
                          {t('people:personDetail.mergeHistory.undoButton')}
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column: Timeline & Knowledge */}
            <div className="md:col-span-2 space-y-6 animate-rise-in" style={{ animationDelay: '60ms' }}>
              <div className="w-full">
                <div className="grid w-full grid-cols-2 bg-muted/50 p-1 rounded-lg">
                  <button
                    onClick={() => setActiveTab('timeline')}
                    className={cn(
                      "flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all",
                      activeTab === 'timeline' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Calendar className="h-4 w-4" />
                    {t('people:personDetail.tabs.timeline')}
                  </button>
                  <button
                    onClick={() => setActiveTab('knowledge')}
                    className={cn(
                      "flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-all",
                      activeTab === 'knowledge' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Bot className="h-4 w-4" />
                    {t('people:personDetail.tabs.knowledgeMap')}
                  </button>
                </div>

                {activeTab === 'timeline' && (
                  <div className="mt-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    {meetings.length === 0 ? (
                      <div className="text-center py-12 border rounded-xl bg-muted/5">
                        <Calendar className="h-10 w-10 mx-auto text-muted-foreground opacity-20 mb-3" />
                        <p className="text-sm text-muted-foreground">{t('people:personDetail.timeline.empty')}</p>
                      </div>
                    ) : (
                      meetings.map((meeting) => (
                        <HoverCard key={meeting.id}>
                          <HoverCardTrigger asChild>
                            <Card
                              className="group lift cursor-pointer overflow-hidden shadow-sm border-border/70 dark:border-white/[0.06] hover:border-primary/40"
                              onClick={() => navigate(`/meeting/${meeting.id}`)}
                            >
                              <div className="p-4">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <h3 className="text-sm font-semibold group-hover:text-primary transition-colors truncate">{meeting.subject}</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      {formatDateTime(meeting.start_time)}
                                    </p>
                                  </div>
                                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </div>
                            </Card>
                          </HoverCardTrigger>
                          <HoverCardContent>
                            <MeetingHoverCard id={meeting.id} name={meeting.subject} visibleFields={['title', 'time']} />
                          </HoverCardContent>
                        </HoverCard>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'knowledge' && (
                  <div className="mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    <Card>
                      <CardContent className="py-12 text-center">
                        <Bot className="h-12 w-12 mx-auto text-primary opacity-20 mb-4" />
                        <h3 className="text-lg font-medium mb-2">{t('people:personDetail.tabs.knowledgeMap')}</h3>
                        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                          {t('people:personDetail.knowledge.description', { name: person.name })}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>

              {(person.notes || isEditing) && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t('people:personDetail.notes.title')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {isEditing ? (
                      <textarea
                        value={editForm.notes}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))}
                        className="text-sm w-full border rounded px-2 py-1 bg-background min-h-[80px] leading-relaxed"
                        placeholder={t('people:personDetail.notes.placeholder')}
                      />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{person.notes}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* B-PPL-004: Delete Confirmation AlertDialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('people:shared.deleteContactTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('people:shared.deleteContactDescription', { name: person.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('people:shared.cancelButton')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteContact}
            >
              {t('people:shared.deleteButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* R1b: Merge Contacts Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('people:personDetail.mergeDialog.title', { name: person.name })}</DialogTitle>
            <DialogDescription>
              {mergeTarget
                ? t('people:personDetail.mergeDialog.descriptionWithTarget', { targetName: mergeTarget.name, name: person.name })
                : t('people:personDetail.mergeDialog.descriptionPickTarget', { name: person.name })}
            </DialogDescription>
          </DialogHeader>

          {!mergeTarget && (
            <>
              <input
                type="text"
                value={mergeSearch}
                onChange={(e) => setMergeSearch(e.target.value)}
                placeholder={t('people:personDetail.mergeDialog.searchPlaceholder')}
                aria-label={t('people:personDetail.mergeDialog.searchAriaLabel')}
                className="w-full text-sm border rounded px-2 py-1.5 bg-background"
              />
              <div className="max-h-64 overflow-auto space-y-1 mt-1">
                {filteredMergeCandidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">{t('people:personDetail.mergeDialog.noOtherContacts')}</p>
                ) : (
                  filteredMergeCandidates.map((c) => (
                    <button
                      key={c.id}
                      className="w-full text-left p-2 border rounded-lg hover:bg-muted transition-colors"
                      onClick={() => setMergeTarget(c)}
                    >
                      <p className="font-medium text-sm">{c.name}</p>
                      {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {mergeTarget && highStakesMerge && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2 text-xs">
              <p className="text-amber-700 dark:text-amber-400 font-medium">
                <Trans
                  i18nKey="people:shared.highStakesMergeWarning"
                  values={{
                    keeperName: person.name,
                    keeperCount: mergeImpact!.keeper,
                    loserName: mergeTarget.name,
                    loserCount: mergeImpact!.loser
                  }}
                >
                  High-stakes merge: {{ keeperName: person.name } as unknown as string} has {{ keeperCount: mergeImpact!.keeper } as unknown as string} links and {{ loserName: mergeTarget.name } as unknown as string} has {{ loserCount: mergeImpact!.loser } as unknown as string}. To confirm, type <span className="font-semibold">{{ loserName: mergeTarget.name } as unknown as string}</span>.
                </Trans>
              </p>
              <input
                type="text"
                value={mergeConfirmText}
                onChange={(e) => setMergeConfirmText(e.target.value)}
                placeholder={mergeTarget.name}
                aria-label={t('people:shared.typeToConfirmAriaLabel', { name: mergeTarget.name })}
                className="w-full text-sm border rounded px-2 py-1.5 bg-background mt-2"
              />
            </div>
          )}

          <DialogFooter>
            {mergeTarget ? (
              <>
                <Button variant="outline" onClick={() => setMergeTarget(null)} disabled={merging}>
                  {t('people:personDetail.mergeDialog.backButton')}
                </Button>
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={handleMerge}
                  disabled={merging || !mergeConfirmed}
                >
                  {merging ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <GitMerge className="h-4 w-4 mr-2" />}
                  {t('people:shared.mergeButton')}
                </Button>
              </>
            ) : (
              <DialogClose asChild>
                <Button variant="outline">{t('people:shared.cancelButton')}</Button>
              </DialogClose>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v30: Unmerge confirmation */}
      <AlertDialog open={!!unmergeTarget} onOpenChange={(open) => !open && setUnmergeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('people:personDetail.unmergeDialog.title', { name: unmergeTarget?.loserName })}</AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                i18nKey="people:personDetail.unmergeDialog.description"
                values={{ loserName: unmergeTarget?.loserName, count: unmergeTarget?.linkCount ?? 0, name: person.name }}
              >
                This recreates {{ loserName: unmergeTarget?.loserName } as unknown as string} as a separate contact and moves the {{ count: unmergeTarget?.linkCount ?? 0 } as unknown as string} link(s) recorded at merge time back to it. Links added to {{ name: person.name } as unknown as string} <em>after</em> the merge stay put and are listed for you to reassign by hand.
              </Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unmerging}>{t('people:shared.cancelButton')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnmerge} disabled={unmerging}>
              {unmerging ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Undo2 className="h-4 w-4 mr-2" />}
              {t('people:personDetail.unmergeDialog.confirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* v30: Manual-review list of links that appeared after the merge */}
      <Dialog open={!!orphanReview} onOpenChange={(open) => !open && setOrphanReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t('people:personDetail.orphanReview.title')}
            </DialogTitle>
            <DialogDescription>
              {t('people:personDetail.orphanReview.description', {
                count: orphanReview?.orphans.length ?? 0,
                name: person.name,
                loserName: orphanReview?.loserName
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 overflow-auto space-y-1">
            {orphanReview?.orphans.map((o) => (
              <div key={`${o.table}:${o.key}`} className="p-2 border rounded-lg text-sm">
                <p className="font-medium">{o.label}</p>
                <p className="text-xs text-muted-foreground">
                  {o.table === 'transcript_speakers' ? t('people:personDetail.orphanReview.speakerBindingLabel') : t('people:personDetail.orphanReview.meetingLinkLabel')}
                  {o.date ? ` · ${formatDateTime(o.date)}` : ''}
                </p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t('people:personDetail.orphanReview.doneButton')}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
export default PersonDetail
