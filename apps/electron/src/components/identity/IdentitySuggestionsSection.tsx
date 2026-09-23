import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation, Trans } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  ChevronDown,
  ChevronRight,
  Check,
  X,
  Sparkles,
  Users,
  Mail,
  Briefcase,
  CalendarDays,
  AlertTriangle,
  FileText,
  MoreVertical,
  UserSearch,
  Ban,
  ExternalLink,
  Network,
  ArrowLeftRight,
  Link2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toaster'
import { EntityMention } from '@/components/entity'
import { cn, formatDate } from '@/lib/utils'
import { cleanRole } from '@/lib/roleHygiene'
import {
  useIdentitySuggestions,
  type IdentitySuggestion,
  type MiniProfile,
  type MergeImpact
} from './useIdentitySuggestions'
import { parseEvidence, evidenceToPhrases, topicChips } from './evidenceToPhrases'
import { groupSuggestions, TIER_LABEL, type SuggestionTier } from './groupSuggestions'
import { computeCoMention, mentionKey, mentionStatus, type MentionResult } from './mentionEvidence'
import { computeSharedContext, type PersonContext, type SideContext } from './personContext'
import { MergeIntoDialog } from './MergeIntoDialog'
import { useAmbiguousBuckets } from './useAmbiguousBuckets'
import { ResolvePerMeetingCard } from './ResolvePerMeetingCard'

/** Confidence → badge styling. ≥80 emerald, 50–79 amber. */
function confidenceBadge(confidence: number | null, t: TFunction): { label: string; className: string } {
  const pct = Math.round((confidence ?? 0) * 100)
  const className =
    pct >= 80
      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
      : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  return { label: t('people:identitySuggestions.confidenceBadge', { pct }), className }
}

/** Quoted transcript excerpts where a name literally occurs — the primary source. */
function SnippetList({
  mentions,
  onOpenRecording
}: {
  mentions?: MentionResult
  onOpenRecording: (recordingId: string) => void
}) {
  const { t } = useTranslation()
  const snippets = mentions?.snippets ?? []
  if (snippets.length === 0) return null
  return (
    <div className="space-y-1">
      {snippets.map((s) => (
        <button
          key={s.recordingId}
          type="button"
          onClick={() => onOpenRecording(s.recordingId)}
          className="block w-full text-left rounded-md border-l-2 border-muted-foreground/30 bg-muted/30 px-2 py-1 hover:bg-muted/60 transition-colors"
          aria-label={t('people:identitySuggestions.snippetOpenAriaLabel', { title: s.title })}
        >
          <span className="text-xs italic text-muted-foreground">{t('people:identitySuggestions.snippetQuote', { snippet: s.snippet })}</span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground/80 truncate">
            {s.title}
            {s.date ? ` · ${formatDate(s.date)}` : ''}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * The graph-neighborhood context row for one side (B7 symmetric context): the people
 * this side most co-attends with and its closest topics/projects. SHARED entries
 * (present on both sides — people matched exactly, topics matched SEMANTICALLY) are
 * primary-tinted as corroborating evidence that the two records are one person.
 */
function ContextChips({ context }: { context?: SideContext }) {
  const { t } = useTranslation()
  const chips = context ? [...context.people, ...context.topics] : []
  if (chips.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1" aria-label={t('people:identitySuggestions.contextChips.ariaLabel')}>
      {chips.map((c, i) => (
        <span
          key={`${c.label}-${i}`}
          className={cn(
            'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] leading-none',
            c.shared
              ? 'border-primary/40 bg-primary/10 text-primary font-medium'
              : 'border-border bg-muted/40 text-muted-foreground'
          )}
          title={c.shared ? t('people:identitySuggestions.contextChips.sharedTitle') : undefined}
        >
          {c.label}
        </span>
      ))}
    </div>
  )
}

/** Identity/meeting facts + transcript-evidence status shared by keeper and candidate blocks. */
function ProfileFacts({ profile, mentions }: { profile?: MiniProfile; mentions?: MentionResult }) {
  const { t } = useTranslation()
  const roleCompany = [cleanRole(profile?.role), profile?.company].filter(Boolean).join(' · ')
  const status = mentionStatus(mentions)
  return (
    <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
      {roleCompany && (
        <div className="flex items-center gap-1 truncate">
          <Briefcase className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{roleCompany}</span>
        </div>
      )}
      {profile?.email && (
        <div className="flex items-center gap-1 truncate">
          <Mail className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{profile.email}</span>
        </div>
      )}
      {typeof profile?.meetingCount === 'number' && (
        <div className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3 flex-shrink-0" />
          <span>
            {t('people:entityHoverCard.meetingsCount', { count: profile.meetingCount })}
          </span>
        </div>
      )}
      {profile?.description && <div className="truncate">{profile.description}</div>}
      <div
        className={cn(
          'flex items-center gap-1 pt-0.5',
          status.state === 'extracted' && 'italic text-muted-foreground/70',
          status.state === 'error' && 'text-amber-600 dark:text-amber-400'
        )}
      >
        <FileText className="h-3 w-3 flex-shrink-0" />
        <span>{status.text}</span>
      </div>
    </div>
  )
}

/**
 * The KEEPER profile block, rendered ONCE per group card (consolidation — every
 * candidate in the group folds into this same person, so its full profile, primary-
 * source excerpts, and graph context appear a single time above the candidate rows).
 * ALL transcript-evidence text flows through {@link mentionStatus} via ProfileFacts.
 */
function KeeperPanel({
  kind,
  id,
  name,
  profile,
  mentions,
  context,
  onOpenRecording
}: {
  kind: 'person' | 'project'
  id?: string
  name: string
  profile?: MiniProfile
  mentions?: MentionResult
  context?: SideContext
  onOpenRecording: (recordingId: string) => void
}) {
  const { t } = useTranslation()
  const displayName = profile?.name || name
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          {t('people:identitySuggestions.keeperPanel.keepsLabel')}
        </span>
      </div>
      <EntityMention type={kind} id={id} name={displayName} showIcon />
      <ProfileFacts profile={profile} mentions={mentions} />
      <div className="mt-1.5">
        <SnippetList mentions={mentions} onOpenRecording={onOpenRecording} />
      </div>
      <ContextChips context={context} />
    </div>
  )
}

/** Highest link count that still merges on one click; above it, type-to-confirm. */
const MERGE_LINK_THRESHOLD = 10

/** Human "blast radius" line for a merge, from link counts + moved recordings. */
function ImpactPreview({
  impact,
  movedRecordings,
  keeperName
}: {
  impact?: MergeImpact
  movedRecordings: number
  keeperName: string
}) {
  const { t } = useTranslation()
  if (!impact) return null
  const total = impact.keeper + impact.loser
  const highStakes = impact.keeper > MERGE_LINK_THRESHOLD || impact.loser > MERGE_LINK_THRESHOLD
  const parts: string[] = []
  if (movedRecordings > 0) parts.push(t('people:identitySuggestions.impactPreview.recordingsCount', { count: movedRecordings }))
  parts.push(t('people:identitySuggestions.impactPreview.linksCount', { count: impact.loser }))
  const items = parts.join(t('people:identitySuggestions.impactPreview.itemSeparator'))
  return (
    <p className="text-[11px] text-muted-foreground">
      <Trans
        i18nKey="people:identitySuggestions.impactPreview.sentence"
        values={{ items, keeperName, total }}
      >
        Merging moves {{ items } as unknown as string} onto <span className="font-medium">{{ keeperName } as unknown as string}</span> ({{ total } as unknown as string} total afterward).
      </Trans>
      {highStakes && (
        <span className="text-amber-600 dark:text-amber-400">
          {' '}
          {t('people:identitySuggestions.impactPreview.highStakesNote')}
        </span>
      )}
    </p>
  )
}

/**
 * One candidate row inside a group card: the candidate's own compact mini-profile
 * (name, confidence, role, its primary-source excerpts + graph context), the merge
 * framing, evidence, disproofs, impact, and its OWN accept/reject/swap controls. The
 * keeper is not repeated here — it lives once in the group's {@link KeeperPanel}.
 */
function CandidateRow({
  suggestion,
  keeperName,
  candidateProfile,
  candidateMentions,
  candidateContext,
  coMention,
  impact,
  onAccept,
  onReject,
  onSwapMerge,
  onMergeInto,
  onOpenRecording,
  onOpenProfile
}: {
  suggestion: IdentitySuggestion
  keeperName: string
  candidateProfile?: MiniProfile
  candidateMentions?: MentionResult
  candidateContext?: SideContext
  coMention: boolean
  impact?: MergeImpact
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onSwapMerge: (suggestionId: string, candidateId: string, targetId: string, candidateName: string) => void
  onMergeInto: (suggestionId: string, keeperId: string, loserId: string, keeperName: string) => void
  onOpenRecording: (recordingId: string) => void
  onOpenProfile: (id: string) => void
}) {
  const { t } = useTranslation()
  const ev = parseEvidence(suggestion.evidence)
  const loserName = suggestion.candidate_name
  const phrases = evidenceToPhrases(ev, loserName, keeperName)
  const topics = topicChips(ev)
  const badge = confidenceBadge(suggestion.confidence, t)
  // Co-presence is decisive negative evidence — never lead with a filled "merge".
  const strong = (suggestion.confidence ?? 0) >= 0.8 && !coMention
  const movedRecordings = candidateMentions?.recordingIds.length ?? 0
  const highStakes = !!impact && (impact.keeper > MERGE_LINK_THRESHOLD || impact.loser > MERGE_LINK_THRESHOLD)
  const isCommonName = ev.rarity === 'common'

  // The reviewed duplicate's own contact id — required to re-route or swap the merge.
  const loserId = ev.loserId
  const canReroute = suggestion.kind === 'person' && !!loserId

  const [pickerOpen, setPickerOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  // Direction swap (B7): flip which record survives before confirming.
  const [swapped, setSwapped] = useState(false)
  const confirmMatches = confirmText.trim() === loserName.trim()

  // Framing follows the swap: whoever "keeps" absorbs the other as an alias.
  const survivorName = swapped ? loserName : keeperName
  const absorbedName = swapped ? keeperName : loserName

  const openBothProfiles = () => {
    if (suggestion.kind !== 'person') return
    onOpenProfile(suggestion.target_id)
    if (loserId) {
      toast.info(
        t('people:identitySuggestions.candidateRow.openedToastTitle', { name: keeperName }),
        t('people:identitySuggestions.candidateRow.openedToastMessage', { name: loserName })
      )
    }
  }

  const handleAccept = () => {
    if (swapped && loserId) {
      onSwapMerge(suggestion.id, loserId, suggestion.target_id, loserName)
      return
    }
    if (highStakes && !confirming) {
      setConfirming(true)
      return
    }
    onAccept(suggestion.id)
  }

  return (
    <div className="space-y-2.5">
      <div className="rounded-lg border border-border bg-muted/30 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {suggestion.kind === 'person' ? t('people:identitySuggestions.candidateRow.duplicateLabel') : t('people:identitySuggestions.candidateRow.aliasLabel')}
              </span>
            </div>
            <EntityMention type={suggestion.kind} id={loserId} name={candidateProfile?.name || loserName} showIcon />
          </div>
          <span
            className={cn(
              'inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium',
              badge.className
            )}
          >
            {badge.label}
          </span>
        </div>
        <ProfileFacts profile={candidateProfile} mentions={candidateMentions} />
        <div className="mt-1.5">
          <SnippetList mentions={candidateMentions} onOpenRecording={onOpenRecording} />
        </div>
        <ContextChips context={candidateContext} />
      </div>

      {candidateContext && candidateContext.topics.some((c) => c.shared) && (
        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/[0.06] px-2.5 py-1.5 text-[11px] text-primary">
          <Link2 className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden />
          <span>{t('people:identitySuggestions.candidateRow.relatedTopicsNote')}</span>
        </div>
      )}

      {candidateContext && isDisjoint(candidateContext) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <Network className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden />
          <span>{t('people:identitySuggestions.candidateRow.differentCirclesNote')}</span>
        </div>
      )}

      {isCommonName && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden />
          <span>{t('people:identitySuggestions.candidateRow.commonNameNote')}</span>
        </div>
      )}

      {coMention && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-xs text-red-700 dark:text-red-300"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            <Trans i18nKey="people:identitySuggestions.candidateRow.coMentionAlert">
              Both names appear in the same conversation — <span className="font-semibold">likely different people</span>.
            </Trans>
          </span>
        </div>
      )}

      <p className="text-xs">
        <Trans
          i18nKey="people:identitySuggestions.candidateRow.survivorLine"
          values={{ survivorName, absorbedName }}
        >
          Keeps <span className="font-semibold">{{ survivorName } as unknown as string}</span> — <span className="font-medium">‘{{ absorbedName } as unknown as string}’</span> becomes an alias
        </Trans>
      </p>

      {phrases.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
          {phrases.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}

      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {topics.map((topic) => (
            <span
              key={topic}
              className="inline-flex items-center rounded-full border bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {topic}
            </span>
          ))}
        </div>
      )}

      {!swapped && <ImpactPreview impact={impact} movedRecordings={movedRecordings} keeperName={keeperName} />}

      {canReroute && (
        <button
          type="button"
          onClick={() => {
            setSwapped((v) => !v)
            setConfirming(false)
            setConfirmText('')
          }}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          aria-label={t('people:identitySuggestions.candidateRow.keepInsteadAriaLabel', { name: swapped ? keeperName : loserName })}
        >
          <ArrowLeftRight className="h-3 w-3" />
          {t('people:identitySuggestions.candidateRow.keepInsteadText', { name: swapped ? keeperName : loserName })}
        </button>
      )}

      {confirming && !swapped && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 space-y-1.5">
          <label className="block text-[11px] text-amber-700 dark:text-amber-300">
            <Trans
              i18nKey="people:identitySuggestions.candidateRow.confirmingLabel"
              values={{ loserName }}
            >
              High-impact merge. Type <span className="font-semibold">{{ loserName } as unknown as string}</span> to confirm.
            </Trans>
          </label>
          <input
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={loserName}
            aria-label={t('people:shared.typeToConfirmAriaLabel', { name: loserName })}
            className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1" />
        {confirming && !swapped && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => {
              setConfirming(false)
              setConfirmText('')
            }}
          >
            {t('people:shared.cancelButton')}
          </Button>
        )}
        <Button
          size="sm"
          variant={(strong || swapped) && !confirming ? 'default' : 'outline'}
          className="h-7"
          disabled={confirming && !swapped && !confirmMatches}
          onClick={handleAccept}
          aria-label={
            swapped
              ? t('people:identitySuggestions.candidateRow.acceptAriaLabelSwapped', { loserName, keeperName })
              : confirming
                ? t('people:identitySuggestions.candidateRow.acceptAriaLabelConfirming', { loserName, keeperName })
                : t('people:identitySuggestions.candidateRow.acceptAriaLabelDefault', { loserName, keeperName })
          }
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          {swapped
            ? t('people:identitySuggestions.candidateRow.acceptButtonSwapped', { loserName })
            : confirming
              ? t('people:identitySuggestions.candidateRow.acceptButtonConfirming')
              : t('people:identitySuggestions.candidateRow.acceptButtonDefault')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={cn('h-7', coMention && 'ring-2 ring-red-500/40')}
          onClick={() => onReject(suggestion.id)}
          aria-label={t('people:identitySuggestions.candidateRow.rejectAriaLabel', { loserName, keeperName })}
        >
          <X className="h-3.5 w-3.5 mr-1" />
          {t('people:identitySuggestions.candidateRow.rejectButton')}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={t('people:identitySuggestions.candidateRow.moreOptionsAriaLabel', { loserName })}>
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {canReroute && (
              <DropdownMenuItem onSelect={() => setPickerOpen(true)}>
                <UserSearch className="h-4 w-4 mr-2 text-muted-foreground" />
                {t('people:identitySuggestions.candidateRow.mergeIntoSomeoneElseItem')}
              </DropdownMenuItem>
            )}
            {suggestion.kind === 'person' && (
              <DropdownMenuItem onSelect={openBothProfiles}>
                <ExternalLink className="h-4 w-4 mr-2 text-muted-foreground" />
                {t('people:identitySuggestions.candidateRow.openBothProfilesItem')}
              </DropdownMenuItem>
            )}
            {(canReroute || suggestion.kind === 'person') && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => onReject(suggestion.id)}>
              <Ban className="h-4 w-4 mr-2 text-muted-foreground" />
              {t('people:identitySuggestions.candidateRow.rejectDontAskAgainItem')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {canReroute && loserId && (
        <MergeIntoDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          loserName={loserName}
          excludeIds={[suggestion.target_id, loserId]}
          onPick={(chosenId, chosenName) => onMergeInto(suggestion.id, chosenId, loserId, chosenName)}
        />
      )}
    </div>
  )
}

/** True when a context side has entries but none are shared — a "different circles" caution. */
function isDisjoint(side: SideContext): boolean {
  const all = [...side.people, ...side.topics]
  return all.length > 0 && !all.some((c) => c.shared)
}

/**
 * The group-canonical "All the same person…" chooser (item 3, the killer): an inline
 * radio list of every name in the group plus a free-text "the correct name is
 * different" input. Confirming folds ALL members into the chosen keeper and renames it
 * to the chosen/typed canonical name.
 */
function GroupCanonicalChooser({
  names,
  onConfirm,
  onCancel
}: {
  names: string[]
  onConfirm: (finalName: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<string>(names[0] ?? '')
  const [custom, setCustom] = useState('')
  const useCustom = selected === '__custom__'
  const finalName = useCustom ? custom.trim() : selected
  const canConfirm = finalName.length > 0

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/[0.04] p-3 space-y-2">
      <p className="text-xs font-medium">{t('people:identitySuggestions.canonicalChooser.prompt')}</p>
      <div className="space-y-1">
        {names.map((n) => (
          <label key={n} className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="radio"
              name="canonical-name"
              checked={selected === n}
              onChange={() => setSelected(n)}
              className="h-3.5 w-3.5"
            />
            <span>{n}</span>
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            name="canonical-name"
            checked={useCustom}
            onChange={() => setSelected('__custom__')}
            className="h-3.5 w-3.5"
          />
          <span className="text-muted-foreground">{t('people:identitySuggestions.canonicalChooser.differentNameLabel')}</span>
        </label>
        {useCustom && (
          <input
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={t('people:identitySuggestions.canonicalChooser.customPlaceholder')}
            aria-label={t('people:identitySuggestions.canonicalChooser.customAriaLabel')}
            className="ml-6 w-[calc(100%-1.5rem)] rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        )}
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" className="h-7" onClick={onCancel}>
          {t('people:shared.cancelButton')}
        </Button>
        <Button
          size="sm"
          className="h-7"
          disabled={!canConfirm}
          onClick={() => onConfirm(finalName)}
          aria-label={t('people:identitySuggestions.canonicalChooser.confirmAriaLabel')}
        >
          <Check className="h-3.5 w-3.5 mr-1" />
          {t('people:identitySuggestions.canonicalChooser.confirmButton', { name: finalName || '…' })}
        </Button>
      </div>
    </div>
  )
}

/** Union of several context sides' people/topics — the keeper panel highlights shared vs this. */
function unionContext(contexts: Array<PersonContext | undefined>): PersonContext {
  const people = new Set<string>()
  const topics = new Set<string>()
  for (const c of contexts) {
    for (const p of c?.people ?? []) people.add(p)
    for (const t of c?.topics ?? []) topics.add(t)
  }
  return { people: [...people], topics: [...topics] }
}

/** Imperative handle so a parent (e.g. a "Discover" button) can refetch the queue. */
export interface IdentitySuggestionsSectionHandle {
  reload: () => void
}

interface IdentitySuggestionsSectionProps {
  /** When set, only suggestions of this kind are shown (e.g. 'project' on the Projects page). */
  kind?: 'person' | 'project'
}

/**
 * Collapsible "Identity suggestions" review queue. Renders only when at least one
 * pending suggestion exists (optionally filtered to a single `kind`). Suggestions that
 * share a target are clustered into ONE consolidated group card: the keeper profile is
 * shown once, followed by a compact row per candidate (its own evidence + accept /
 * reject / swap). Multi-candidate person groups also offer a one-shot "All the same
 * person…" canonical action. Exposes a `reload` handle via ref.
 */
export const IdentitySuggestionsSection = forwardRef<
  IdentitySuggestionsSectionHandle,
  IdentitySuggestionsSectionProps
>(function IdentitySuggestionsSection({ kind }, ref) {
  const { t } = useTranslation()
  const {
    suggestions,
    loading,
    profiles,
    targetNames,
    mentions,
    impacts,
    contexts,
    reload,
    accept,
    reject,
    mergeInto,
    swapMerge,
    mergeGroup
  } = useIdentitySuggestions(kind)
  const [expanded, setExpanded] = useState(true)
  const navigate = useNavigate()

  // Ambiguous mention buckets are a person-only concept — skip them on the Projects page.
  const showBuckets = kind !== 'project'
  const {
    buckets,
    loading: bucketsLoading,
    fetchResolution,
    resolve: resolveMention,
    reload: reloadBuckets
  } = useAmbiguousBuckets(showBuckets)

  useImperativeHandle(
    ref,
    () => ({
      reload: () => {
        reload()
        reloadBuckets()
      }
    }),
    [reload, reloadBuckets]
  )

  const openRecording = (recordingId: string) => navigate('/library', { state: { selectedId: recordingId } })
  const openProfile = (id: string) => navigate(`/person/${id}`)

  const visible = kind ? suggestions.filter((s) => s.kind === kind) : suggestions

  // A merge card whose keeper is itself an ambiguous bucket would merge distinct real
  // people INTO the bucket — wrong. Those are handled by the "Resolve per meeting"
  // cards, so drop any (possibly stale) merge group targeting a bucket.
  const bucketIds = useMemo(() => new Set(buckets.map((b) => b.contactId)), [buckets])
  const groups = useMemo(
    () => groupSuggestions(visible).filter((g) => !bucketIds.has(g.targetId)),
    [visible, bucketIds]
  )

  const nameFor = (s: IdentitySuggestion): string => {
    const ev = parseEvidence(s.evidence)
    return (
      targetNames[s.target_id] ||
      ev.keeperName ||
      (s.kind === 'person'
        ? t('people:identitySuggestions.fallbackPersonName')
        : t('people:identitySuggestions.fallbackProjectName'))
    )
  }

  const hasBuckets = showBuckets && buckets.length > 0
  const hasMergeGroups = !loading && groups.length > 0
  if ((loading || groups.length === 0) && (bucketsLoading || !hasBuckets)) return null

  const totalCount = groups.length + (hasBuckets ? buckets.length : 0)

  let lastTier: SuggestionTier | null = null

  return (
    <section className="mb-6" aria-label={t('people:identitySuggestions.sectionAriaLabel')}>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Sparkles className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold">{t('people:identitySuggestions.header.title', { count: totalCount })}</span>
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {t('people:identitySuggestions.header.subtitle')}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3">
          {hasBuckets && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('people:identitySuggestions.bucketsHeading')}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              {buckets.map((bucket) => (
                <ResolvePerMeetingCard
                  key={bucket.contactId}
                  bucket={bucket}
                  fetchResolution={fetchResolution}
                  resolve={resolveMention}
                  onOpenRecording={openRecording}
                  onResolved={reloadBuckets}
                />
              ))}
            </div>
          )}

          {hasMergeGroups &&
            groups.map((group) => {
            const keeperName = nameFor(group.candidates[0])
            const keeperProfile = profiles[group.targetId]
            const keeperMentions = mentions[mentionKey(keeperName)]
            const isMulti = group.candidates.length > 1
            const canCanonical = group.kind === 'person' && isMulti
            const showTier = group.tier !== lastTier
            lastTier = group.tier

            const keeperContextRaw = contexts[group.targetId]
            const candidateContextsRaw = group.candidates.map(
              (c) => contexts[parseEvidence(c.evidence).loserId || c.candidate_name]
            )
            // Keeper panel highlights context shared with ANY candidate in the group.
            const keeperSide = computeSharedContext(
              keeperContextRaw ?? { people: [], topics: [] },
              unionContext(candidateContextsRaw)
            ).a

            const canonicalNames = Array.from(
              new Set([keeperName, ...group.candidates.map((c) => c.candidate_name)].filter(Boolean))
            )

            return (
              <GroupCard
                key={group.targetId}
                targetId={group.targetId}
                kind={group.kind}
                keeperName={keeperName}
                keeperProfile={keeperProfile}
                keeperMentions={keeperMentions}
                keeperSide={keeperSide}
                candidates={group.candidates}
                isMulti={isMulti}
                canCanonical={canCanonical}
                canonicalNames={canonicalNames}
                showTier={showTier}
                tierLabel={TIER_LABEL[group.tier]}
                profiles={profiles}
                mentions={mentions}
                contexts={contexts}
                impacts={impacts}
                keeperContextRaw={keeperContextRaw}
                onAccept={accept}
                onReject={reject}
                onSwapMerge={swapMerge}
                onMergeInto={mergeInto}
                onMergeGroup={mergeGroup}
                onOpenRecording={openRecording}
                onOpenProfile={openProfile}
              />
            )
          })}
        </div>
      )}
    </section>
  )
})

/** One consolidated group card: tier label, keeper panel (once), canonical action, candidate rows. */
function GroupCard({
  targetId,
  kind,
  keeperName,
  keeperProfile,
  keeperMentions,
  keeperSide,
  candidates,
  isMulti,
  canCanonical,
  canonicalNames,
  showTier,
  tierLabel,
  profiles,
  mentions,
  contexts,
  impacts,
  keeperContextRaw,
  onAccept,
  onReject,
  onSwapMerge,
  onMergeInto,
  onMergeGroup,
  onOpenRecording,
  onOpenProfile
}: {
  targetId: string
  kind: 'person' | 'project'
  keeperName: string
  keeperProfile?: MiniProfile
  keeperMentions?: MentionResult
  keeperSide: SideContext
  candidates: IdentitySuggestion[]
  isMulti: boolean
  canCanonical: boolean
  canonicalNames: string[]
  showTier: boolean
  tierLabel: string
  profiles: Record<string, MiniProfile>
  mentions: Record<string, MentionResult>
  contexts: Record<string, PersonContext>
  impacts: Record<string, MergeImpact>
  keeperContextRaw?: PersonContext
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onSwapMerge: (suggestionId: string, candidateId: string, targetId: string, candidateName: string) => void
  onMergeInto: (suggestionId: string, keeperId: string, loserId: string, keeperName: string) => void
  onMergeGroup: (opts: { keeperId: string; keeperName: string; suggestionIds: string[]; finalName?: string }) => void
  onOpenRecording: (recordingId: string) => void
  onOpenProfile: (id: string) => void
}) {
  const { t } = useTranslation()
  const [choosing, setChoosing] = useState(false)

  const candidateListText = candidates
    .map((c) =>
      t('people:identitySuggestions.groupIntro.candidateItem', {
        name: c.candidate_name,
        pct: Math.round((c.confidence ?? 0) * 100)
      })
    )
    .join(t('people:identitySuggestions.groupIntro.itemSeparator'))

  return (
    <div className="space-y-2">
      {showTier && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tierLabel}</span>
          <div className="h-px flex-1 bg-border" />
        </div>
      )}

      <Card className="border-amber-500/20 bg-amber-500/[0.03]">
        <CardContent className="p-4 space-y-3">
          {isMulti && (
            <div className="flex items-start gap-2">
              {kind === 'project' ? (
                <Sparkles className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
              ) : (
                <Users className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              )}
              <p className="text-sm leading-snug">
                <Trans
                  i18nKey="people:identitySuggestions.groupIntro.summary"
                  values={{ count: candidates.length, keeperName, candidateList: candidateListText }}
                >
                  {{ count: candidates.length } as unknown as string} names may be <span className="font-semibold">{{ keeperName } as unknown as string}</span>: <span className="text-muted-foreground">{{ candidateList: candidateListText } as unknown as string}</span>
                </Trans>
              </p>
            </div>
          )}

          <KeeperPanel
            kind={kind}
            id={targetId}
            name={keeperName}
            profile={keeperProfile}
            mentions={keeperMentions}
            context={keeperSide}
            onOpenRecording={onOpenRecording}
          />

          {canCanonical &&
            (choosing ? (
              <GroupCanonicalChooser
                names={canonicalNames}
                onCancel={() => setChoosing(false)}
                onConfirm={(finalName) => {
                  setChoosing(false)
                  onMergeGroup({
                    keeperId: targetId,
                    keeperName,
                    suggestionIds: candidates.map((c) => c.id),
                    finalName
                  })
                }}
              />
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => setChoosing(true)}
                aria-label={t('people:identitySuggestions.allSamePersonAriaLabel')}
              >
                <Users className="h-3.5 w-3.5 mr-1.5" />
                {t('people:identitySuggestions.allSamePersonButton')}
              </Button>
            ))}

          <div className={cn(isMulti && 'divide-y')}>
            {candidates.map((c) => {
              const ev = parseEvidence(c.evidence)
              const candidateMentions = mentions[mentionKey(c.candidate_name)]
              const { coMention } = computeCoMention(candidateMentions, keeperMentions)
              const candidateContextRaw = contexts[ev.loserId || c.candidate_name]
              const comparison =
                kind === 'person'
                  ? computeSharedContext(
                      keeperContextRaw ?? { people: [], topics: [] },
                      candidateContextRaw ?? { people: [], topics: [] }
                    )
                  : undefined
              return (
                <div key={c.id} className={cn(isMulti && 'py-3 first:pt-0 last:pb-0')}>
                  <CandidateRow
                    suggestion={c}
                    keeperName={keeperName}
                    candidateProfile={ev.loserId ? profiles[ev.loserId] : undefined}
                    candidateMentions={candidateMentions}
                    candidateContext={comparison?.b}
                    coMention={coMention}
                    impact={impacts[c.id]}
                    onAccept={onAccept}
                    onReject={onReject}
                    onSwapMerge={onSwapMerge}
                    onMergeInto={onMergeInto}
                    onOpenRecording={onOpenRecording}
                    onOpenProfile={onOpenProfile}
                  />
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default IdentitySuggestionsSection
