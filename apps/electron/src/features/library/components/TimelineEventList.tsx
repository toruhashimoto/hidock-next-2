/**
 * TimelineEventList - the reader's actions, decisions and notes.
 *
 * Extracted from WaveformPlayer's full-mode timeline on 2026-09-22 so it can be
 * its own reader section. It used to live inside the graph, which meant it only
 * existed while the player was expanded, and a long list had to be capped at
 * `max-h-40` with its own inner scrollbar so it could not push the docked
 * essentials off-screen. As a section of the one scrolling column it has neither
 * problem: it scrolls with everything else and survives any player mode.
 *
 * The numbered markers stay on the graph. Cross-highlighting between a marker
 * and its row still works because SourceReader owns `activeEventId` and hands it
 * to both.
 *
 * This list does NOT filter by the recording duration. The graph's markers must
 * (they are positioned on a time axis, and a duration of 0 has no axis), but a
 * list of what was decided is readable before any duration is known.
 *
 * Spec: docs/superpowers/specs/2026-09-22-reader-sticky-sections-design.md
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Pencil, CircleCheck, CircleDashed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatTimestamp } from '@/utils/audioUtils'
import { cn } from '@/lib/utils'
import { EVENT_KIND_COLOR, EVENT_KIND_ICON } from '../utils/timelineEventKinds'
import type { TimelineEventKind } from '../utils/timelineEventKinds'
import type { TimelineEvent, TimelineEventDetail, TimelineEventPatch } from './WaveformPlayer'

/**
 * Raw enum values this list used to print straight through — the kind and the
 * priority dressed up by CSS `capitalize`, the status by that plus a JS
 * `.replace('_', ' ')`, none of which does anything for Japanese. Each one
 * resolves through the catalogue instead. The English values ARE what those
 * spots rendered before, character for character (`in progress` really did
 * reach the DOM lowercase, with `capitalize` doing the visible work), so the
 * English screen and the suite that runs against it are unchanged.
 *
 * These are KEYS, not resolved strings: `t()` runs at render time, so a
 * language switch reaches them. Resolving at module scope would freeze them in
 * whichever language happened to be active on import.
 */
const EVENT_KIND_LABEL_KEYS: Record<TimelineEventKind, string> = {
  action: 'waveformPlayer.eventKindAction',
  decision: 'waveformPlayer.eventKindDecision',
  note: 'waveformPlayer.eventKindNote'
}

/** `TimelineEventPatch['status']`. An unmapped value stays the identifier. */
const STATUS_LABEL_KEYS: Record<string, string> = {
  pending: 'waveformPlayer.statusPending',
  in_progress: 'waveformPlayer.statusInProgress',
  completed: 'waveformPlayer.statusCompleted',
  cancelled: 'waveformPlayer.statusCancelled'
}

/**
 * The same statuses again, for the hover tooltip.
 *
 * The tooltip prints the stored value as-is while the row below it prints the
 * value with its underscore swapped for a space, so in English one reads
 * `Status: in_progress` and the other `Status: in progress`. That difference is
 * upstream's and is left alone; what these keys add is that the tooltip has
 * Japanese too, instead of leaking `in_progress` into a translated UI. The
 * English values here are therefore the raw stored strings, character for
 * character.
 */
const TOOLTIP_STATUS_LABEL_KEYS: Record<string, string> = {
  pending: 'waveformPlayer.rawStatusPending',
  in_progress: 'waveformPlayer.rawStatusInProgress',
  completed: 'waveformPlayer.rawStatusCompleted',
  cancelled: 'waveformPlayer.rawStatusCancelled'
}

/** `ActionItemPriority`, with the same fallback rule as the statuses above. */
const PRIORITY_LABEL_KEYS: Record<string, string> = {
  low: 'waveformPlayer.priorityLow',
  medium: 'waveformPlayer.priorityMedium',
  high: 'waveformPlayer.priorityHigh',
  urgent: 'waveformPlayer.priorityUrgent'
}

interface TimelineEventListProps {
  events: TimelineEvent[]
  eventDetails?: Record<string, TimelineEventDetail>
  onEventUpdate?: (event: TimelineEvent, patch: TimelineEventPatch) => Promise<boolean>
  /** Highlighted event id, owned by the reader and shared with the graph. */
  activeEventId?: string | null
  /** Seek to this event and highlight it in both places. */
  onActivate: (event: TimelineEvent) => void
  /** Resets the transient expand/edit state when the reader changes recording. */
  recordingId?: string
  className?: string
}

export function TimelineEventList({
  events,
  eventDetails,
  onEventUpdate,
  activeEventId = null,
  onActivate,
  recordingId,
  className
}: TimelineEventListProps) {
  const { t } = useTranslation('library')
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    setExpandedEventId(null)
    setEditingEventId(null)
  }, [recordingId])

  /** Resolve one raw enum value through a map above (see its comment). */
  const rawValueLabel = (keys: Record<string, string>, value: string): string => {
    const key = keys[value]
    return key ? t(key) : value
  }

  if (events.length === 0) {
    return (
      <p className="py-2 text-sm text-muted-foreground" data-testid="timeline-events-empty">
        {t('waveformPlayer.noEventsMessage')}
      </p>
    )
  }

  return (
    <div className={cn('min-w-0', className)}>
      <TooltipProvider delayDuration={300}>
        <ul className="space-y-0.5" data-testid="timeline-events">
          {events.map((m) => {
            const kind = m.kind ?? 'note'
            const Icon = EVENT_KIND_ICON[kind]
            const kindLabel = t(EVENT_KIND_LABEL_KEYS[kind])
            const isActive = activeEventId === m.id
            const detail = eventDetails?.[m.refId ?? m.id]
            const displayText =
              detail?.fullText ??
              (m.label || t('waveformPlayer.eventFallbackLabel', { kind: kindLabel, time: formatTimestamp(m.timeSec) }))
            const isExpanded = expandedEventId === m.id
            const isEditing = editingEventId === m.id
            const isCompleted = detail?.status === 'completed'
            const tooltipLines = [
              displayText,
              detail?.assignee ? t('waveformPlayer.tooltipAssignee', { value: detail.assignee }) : null,
              detail?.dueDate ? t('waveformPlayer.tooltipDue', { value: detail.dueDate }) : null,
              detail?.status
                ? t('waveformPlayer.tooltipStatus', {
                    value: rawValueLabel(TOOLTIP_STATUS_LABEL_KEYS, detail.status)
                  })
                : null
            ].filter(Boolean) as string[]
            return (
              <li key={m.id}>
                <div
                  className={cn(
                    'rounded transition-colors',
                    isActive ? 'bg-primary/10' : 'hover:bg-muted/60'
                  )}
                >
                  <div className="flex items-start gap-2 px-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => setExpandedEventId(isExpanded ? null : m.id)}
                      aria-expanded={isExpanded}
                      aria-label={
                        isExpanded
                          ? t('waveformPlayer.collapseDetailsAriaLabel', { index: m.index ?? '' })
                          : t('waveformPlayer.expandDetailsAriaLabel', { index: m.index ?? '' })
                      }
                      className="flex min-w-0 flex-1 items-start gap-2 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                    >
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                        style={{ backgroundColor: EVENT_KIND_COLOR[kind] }}
                      >
                        {m.index ?? ''}
                      </span>
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {isEditing ? (
                        <span className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
                          <Textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            rows={3}
                            className="text-xs"
                            aria-label={t('waveformPlayer.editItemTextAriaLabel', { index: m.index ?? '' })}
                          />
                          <span className="mt-1.5 flex items-center gap-2">
                            <Button
                              size="sm"
                              className="h-6 px-2 text-xs"
                              disabled={editSaving || !editDraft.trim()}
                              onClick={() => {
                                setEditSaving(true)
                                void onEventUpdate?.(m, { content: editDraft.trim() }).then((ok) => {
                                  setEditSaving(false)
                                  if (ok) setEditingEventId(null)
                                })
                              }}
                            >
                              {editSaving ? t('waveformPlayer.savingButton') : t('waveformPlayer.saveButton')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-xs"
                              disabled={editSaving}
                              onClick={() => setEditingEventId(null)}
                            >
                              {t('waveformPlayer.cancelButton')}
                            </Button>
                          </span>
                        </span>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                'min-w-0 flex-1 whitespace-normal break-words leading-snug',
                                isCompleted && 'line-through text-muted-foreground'
                              )}
                            >
                              {displayText}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" align="start" className="max-w-md">
                            {tooltipLines.map((line, i) => (
                              <p key={i} className={i === 0 ? 'whitespace-pre-wrap' : 'text-xs text-muted-foreground'}>
                                {line}
                              </p>
                            ))}
                            {!detail && <p className="text-xs text-muted-foreground">{t('waveformPlayer.clickToSeekUnavailableMessage')}</p>}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {!isEditing && (
                        <ChevronDown
                          className={cn('mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onActivate(m)}
                      aria-pressed={isActive}
                      title={t('waveformPlayer.seekToLabel', { time: formatTimestamp(m.timeSec) })}
                      className="shrink-0 rounded px-1 tabular-nums text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      {formatTimestamp(m.timeSec)}
                    </button>
                  </div>
                  {isExpanded && !isEditing && (
                    <div className="space-y-2 px-1.5 pb-2 pl-9 text-xs" data-testid={`event-detail-${m.id}`}>
                      {detail?.context && (
                        <p className="whitespace-pre-wrap text-muted-foreground">
                          <span className="font-medium text-foreground">{t('waveformPlayer.contextLabel')}</span>
                          {detail.context}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                        <span className="font-medium text-foreground capitalize">{kindLabel}</span>
                        {detail?.status && <span>{t('waveformPlayer.statusLabel')}<span className="capitalize">{rawValueLabel(STATUS_LABEL_KEYS, detail.status)}</span></span>}
                        {detail?.assignee && <span>{t('waveformPlayer.assigneeLabel')}{detail.assignee}</span>}
                        {detail?.dueDate && <span>{t('waveformPlayer.dueLabel')}{detail.dueDate}</span>}
                        {detail?.priority && <span>{t('waveformPlayer.priorityLabel')}<span className="capitalize">{rawValueLabel(PRIORITY_LABEL_KEYS, detail.priority)}</span></span>}
                        {!detail?.editable && <span className="italic">{t('waveformPlayer.readOnlyItemLabel')}</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          onClick={() => onActivate(m)}
                        >
                          {t('waveformPlayer.seekToLabel', { time: formatTimestamp(m.timeSec) })}
                        </Button>
                        {detail?.editable && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 gap-1 px-2 text-xs"
                            onClick={() => {
                              setEditDraft(displayText)
                              setEditingEventId(m.id)
                            }}
                          >
                            <Pencil className="h-3 w-3" aria-hidden="true" />
                            {t('waveformPlayer.editButton')}
                          </Button>
                        )}
                        {detail?.editable && kind === 'action' && detail?.status && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 gap-1 px-2 text-xs"
                            onClick={() => {
                              const next = isCompleted ? 'pending' : 'completed'
                              void onEventUpdate?.(m, { status: next })
                            }}
                          >
                            {isCompleted ? (
                              <><CircleDashed className="h-3 w-3" aria-hidden="true" /> {t('waveformPlayer.reopenButton')}</>
                            ) : (
                              <><CircleCheck className="h-3 w-3" aria-hidden="true" /> {t('waveformPlayer.markCompleteButton')}</>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </TooltipProvider>
    </div>
  )
}
