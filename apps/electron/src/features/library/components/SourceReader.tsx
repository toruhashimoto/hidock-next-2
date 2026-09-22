/**
 * SourceReader Component
 *
 * The Library's center detail panel for a selected recording. The reader is a
 * vertically resizable workspace with independently controlled sections:
 *
 *  Context area:
 *    - Title (inline-editable) + transcription status
 *    - A curated meta strip (date · duration · location)
 *    - Primary CTAs (Play/Download, Transcribe/Re-transcribe ▾, Ask, overflow)
 *    - Player and metadata can be expanded, minimized, docked, hidden, or maximized
 *    - Participants (who actually spoke) chips — derived from the SAME resolved
 *      speaker map the transcript uses, so a renamed speaker updates here too
 *
 *  Reading area:
 *    - Summary and transcript have the same explicit layout states
 *    - A keyboard-accessible handle reallocates height between both areas
 */

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { TranscriptViewer, type StoredSegment, type TranscriptContentUpdate } from './TranscriptViewer'
import { TranscriptionStatusBadge } from './TranscriptionStatusBadge'
import { StatusIcon } from './StatusIcon'
import { WaveformPlayer, type TimelineEvent, type TimelineEventDetail, type TimelineEventPatch, type SentimentScorePoint, type WaveformPlayerMode } from './WaveformPlayer'
import { SpeakerAssignPopover, type AssignScope } from './SpeakerAssignPopover'
import { useReaderPeople, type ParticipantChip } from '../hooks/useReaderPeople'
import { deriveSpeakerRanges, type DerivedSpeakerRange } from '@/features/library/utils/speakerRanges'
import { getDisplayTitle } from '@/features/library/utils/getDisplayTitle'
import { getSourceType } from '@/features/library/utils/sourceType'
import { ArtifactReader } from './ArtifactReader'
import { RecordingSplitEditor } from './RecordingSplitEditor'
import { HiddenReaderSections, ReaderSectionControls } from './ReaderSectionControls'
import { useUIStore } from '@/store/useUIStore'
import { useLibraryStore, type ReaderSectionId, type ReaderSectionMode } from '@/store/useLibraryStore'
import { UnifiedRecording, hasLocalPath, isDeviceOnly, isRecordingBacked } from '@/types/unified-recording'
import type { DownloadStatus } from '@/store/useAppStore'
import { Transcript, Meeting, MeetingAttendee, parseJsonArray } from '@/types'
import { Calendar, CloudDownload, Download, Trash2, Wand2, RefreshCw, Play, Square, Pencil, Check, Edit2, Link, X, ExternalLink, FolderOpen, MoreHorizontal, Folder, Plus, EyeOff, Eye, Sparkles, ChevronDown, Cloud, Cpu, Users, Mail, UserCog, Scissors } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card'
import { PersonHoverCard } from '@/components/entity/EntityHoverCards'

/** Minimal project shape the assignment picker needs (id + name). */
type PickerProject = { id: string; name: string }
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '@/components/ui/select'
import { toast } from '@/components/ui/toaster'
import { RecordingLinkDialog } from '@/components/RecordingLinkDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
  LABEL_DELETE_FROM_DEVICE,
  LABEL_MOVE_TO_TRASH,
  LABEL_DELETE_PERMANENTLY,
  SCOPE_DEVICE_DELETE,
  SCOPE_DEVICE_DELETE_SYNCED,
  SCOPE_DEVICE_NOT_CONNECTED,
  SCOPE_TRASH,
  SCOPE_PERMANENT,
  ariaLabelWithScope
} from '@/features/library/utils/deletionCopy'
import { formatDateTime, formatDuration, formatBytes, cn } from '@/lib/utils'
import { formatSmartDate, formatRelativeDate } from '@/lib/smartDate'
import { useTranscriptionStore } from '@/store/features/useTranscriptionStore'

/** Reader width (px) below which the docked bar drops to the bare scrubber. */
const NARROW_WIDTH_BREAKPOINT = 420

/** Translated label for each reader section id — used by the "Hidden" restore chips. */
const SECTION_LABEL_KEYS: Record<ReaderSectionId, string> = {
  player: 'library:sourceReader.playerSectionLabel',
  metadata: 'library:sourceReader.metadataSectionLabel',
  summary: 'library:sourceReader.summarySectionLabel',
  transcript: 'library:sourceReader.transcriptSectionLabel'
}

const CATEGORY_OPTIONS = [
  { value: 'meeting', labelKey: 'library:sourceReader.categoryMeeting' },
  { value: 'interview', labelKey: 'library:sourceReader.categoryInterview' },
  { value: '1:1', labelKey: 'library:sourceReader.categoryOneOnOne' },
  { value: 'brainstorm', labelKey: 'library:sourceReader.categoryBrainstorm' },
  { value: 'note', labelKey: 'library:sourceReader.categoryNote' },
  { value: 'other', labelKey: 'library:sourceReader.categoryOther' },
] as const

/**
 * Shape returned by the sibling "timeline-data" agent's IPC. Typed here (and the
 * call is made via an optional cast) so this file type-checks and degrades
 * gracefully BEFORE that IPC lands — colored bars + seek still work without it.
 *   window.electronAPI.recordings.getTimelineAnalysis(recordingId) → this
 *   window.electronAPI.recordings.analyzeTimeline(recordingId)     → backfill
 */
interface TimelineAnalysisResult {
  sentimentSegments?: Array<{ startSec: number; endSec: number; score: number }>
  eventMarkers?: Array<{ id: string; kind: 'action' | 'decision'; atSec: number; label: string; refId?: string }>
  /**
   * PERSISTED per-component completion flags, already reconciled by the
   * service against the transcript's current content hash. `true` means that
   * component's analysis completed for THIS content — even when its result is
   * honestly empty — so it must not be re-billed on remount/restart.
   */
  analysisStatus?: { sentimentAnalyzed?: boolean; markersAnalyzed?: boolean }
  /** Structured failure info from the service (analyzeTimeline results only). */
  analysisError?: { kind?: unknown; retryAfterMs?: number; message?: string }
}

interface TimelineData {
  events: TimelineEvent[]
  sentiment: SentimentScorePoint[]
}

interface ReaderProcessingRun {
  id: string
  stage: 'metadata' | 'schedule-match' | 'vad' | 'diarization' | 'transcription' | 'summary' | 'title' | 'meeting-resolution' | 'speaker-identity' | 'voice-id' | 'persistence' | 'actionable-detection' | 'timeline-analysis' | 'org-reconciliation' | 'graph-sync' | 'wiki-export' | 'rag-indexing'
  provider: string
  tool: string | null
  model: string | null
  version: string | null
  execution: 'local' | 'cloud' | 'provider-managed' | null
  status: 'pending' | 'running' | 'completed' | 'degraded' | 'failed' | 'cancelled'
  started_at?: string
  completed_at?: string | null
  duration_ms?: number | null
  usage_json?: string | null
  quality_status: string | null
  quality_json: string | null
  estimated_cost_amount: number | null
  estimated_cost_currency: string | null
  cost_method: string | null
}

interface ReaderMeetingCandidate {
  meetingId: string
  subject: string
  confidenceScore: number
  matchReason: string | null
  isAiSelected: boolean
  isUserConfirmed: boolean
}

/** Map the IPC result into the WaveformPlayer's props (1-based marker numbers). */
function mapTimelineAnalysis(res: TimelineAnalysisResult): TimelineData {
  const events = (res.eventMarkers ?? [])
    .slice()
    .sort((a, b) => a.atSec - b.atSec)
    .map((m, i) => ({
      id: m.id,
      timeSec: m.atSec,
      index: i + 1,
      label: m.label,
      kind: m.kind,
      refId: m.refId
    }))
  const sentiment = (res.sentimentSegments ?? []).map((s) => ({
    startSec: s.startSec,
    endSec: s.endSec,
    score: s.score
  }))
  return { events, sentiment }
}

/**
 * Cheap deterministic content hash (djb2-xor) for the timeline backfill's
 * revision key. Content-derived on purpose: the persisted transcript id is
 * STABLE (`trans_<recordingId>` via INSERT OR REPLACE) and created_at has only
 * second precision, so neither reliably changes across a retranscription — the
 * timeline-relevant CONTENT does.
 */
function contentHash(s: string | null | undefined): string {
  if (!s) return '0'
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/**
 * Structured failure kind, produced by the MAIN-PROCESS timeline-analysis
 * service (classifyAnalysisError) where the raw provider error is available.
 * The renderer NEVER pattern-matches message text — localized or wrapped
 * messages carry the same structured kind.
 */
type AnalysisErrorKind = 'auth' | 'quota' | 'rate-limit' | 'network' | 'invalid-input' | 'unknown'

const ANALYSIS_ERROR_KINDS: ReadonlySet<string> = new Set([
  'auth', 'quota', 'rate-limit', 'network', 'invalid-input', 'unknown'
])

/** Coerce an over-the-wire kind to a known value ('unknown' when absent/novel). */
function normalizeErrorKind(kind: unknown): AnalysisErrorKind {
  return typeof kind === 'string' && ANALYSIS_ERROR_KINDS.has(kind) ? (kind as AnalysisErrorKind) : 'unknown'
}

/** A recorded backfill failure for one transcript revision. */
interface AnalysisFailure {
  kind: AnalysisErrorKind
  at: number
  /** Auto-attempts made so far for this revision (bounds 'unknown'). */
  attempts: number
  retryAfterMs?: number
}

/** Backfill guard entry: succeeded (possibly empty) vs failed-with-policy. */
type BackfillState = 'done' | AnalysisFailure

/** Kinds that never auto-retry — re-attempting just re-bills the same rejection. */
const PERMANENT_ERROR_KINDS: ReadonlySet<AnalysisErrorKind> = new Set(['auth', 'quota', 'invalid-input'])

/** 'unknown' failures get this many auto-attempts, then require manual Retry. */
const UNKNOWN_MAX_AUTO_ATTEMPTS = 2

/**
 * Mirror of the service's RETRY_AFTER_MAX_MS (timeline-analysis.ts — the
 * renderer cannot import main-process modules). The service clamps parsed
 * retry-after hints to this cap; the renderer defensively re-clamps and treats
 * any hint AT the cap as needs-attention (manual Retry) rather than promising
 * an auto-retry that far out.
 */
const RETRY_AFTER_MAX_MS = 15 * 60 * 1000

/**
 * The retry policy per failure, evaluated on each reader (re)open. Deliberately
 * TIMER-FREE — nothing is scheduled; time alone never triggers a retry, only
 * reopening the recording does (the transient pill copy says exactly that):
 *  - auth / quota / invalid-input → permanent: manual Retry only.
 *  - network                      → transient: auto-retry on next reopen.
 *  - rate-limit                   → transient: auto-retry on next reopen, but
 *                                   honoring a provider retry-after hint when
 *                                   one was supplied (checked at reopen time).
 *                                   A hint at/over RETRY_AFTER_MAX_MS behaves
 *                                   as permanent-until-Retry.
 *  - unknown                      → conservative: bounded auto-attempts
 *                                   (UNKNOWN_MAX_AUTO_ATTEMPTS), then manual.
 */
function analysisFailurePolicy(f: AnalysisFailure): { canAutoRetry: boolean; display: 'permanent' | 'transient' } {
  if (PERMANENT_ERROR_KINDS.has(f.kind)) return { canAutoRetry: false, display: 'permanent' }
  if (f.kind === 'rate-limit') {
    if (f.retryAfterMs !== undefined && f.retryAfterMs >= RETRY_AFTER_MAX_MS) {
      return { canAutoRetry: false, display: 'permanent' }
    }
    const ready = !f.retryAfterMs || Date.now() - f.at >= f.retryAfterMs
    return { canAutoRetry: ready, display: 'transient' }
  }
  if (f.kind === 'network') return { canAutoRetry: true, display: 'transient' }
  // 'unknown' — conservative bounded auto-retries, then treated as needs-attention.
  return f.attempts >= UNKNOWN_MAX_AUTO_ATTEMPTS
    ? { canAutoRetry: false, display: 'permanent' }
    : { canAutoRetry: true, display: 'transient' }
}

interface SourceReaderProps {
  recording: UnifiedRecording | null
  transcript?: Transcript
  meeting?: Meeting
  isPlaying?: boolean
  currentTimeMs?: number
  onPlay?: () => void
  onStop?: () => void
  onSeek?: (startMs: number, endMs?: number) => void
  // Action button callbacks
  onDownload?: () => void
  onTranscribe?: () => void
  onReprocessVibeVoice?: () => void
  onDelete?: () => void
  onDeletePermanent?: () => void
  /** Synced ("both") rows only (spec-005/F17 §D3) — erases the device copy via the
   *  existing renderer device path, keeps the local copy. */
  onDeleteFromDevice?: () => void
  onMarkPersonal?: () => void
  // State for button enabling/disabling
  deviceConnected?: boolean
  isDownloading?: boolean
  downloadProgress?: number
  downloadStatus?: DownloadStatus
  isDeleting?: boolean
  // Navigation
  onNavigateToMeeting?: (meetingId: string) => void
  // Metadata editing callback
  onMetadataEdited?: () => void
  // Select the first child after a successful recording split.
  onSplitCompleted?: (firstChildId: string) => void
  // Opens the source-scoped AI assistant drawer/overlay for this recording.
  onAskAboutSource?: () => void
}

export function SourceReader({
  recording,
  transcript,
  meeting,
  isPlaying = false,
  currentTimeMs = 0,
  onPlay,
  onStop,
  onSeek,
  onDownload,
  onTranscribe,
  // onReprocessVibeVoice is intentionally not consumed: the raw "VibeVoice"
  // button was replaced by the "Transcribe ▾" method picker below. The prop
  // remains in the interface so existing callers (Library) still type-check.
  onDelete,
  onDeletePermanent,
  onDeleteFromDevice,
  onMarkPersonal,
  deviceConnected = false,
  isDownloading = false,
  downloadProgress,
  downloadStatus,
  isDeleting = false,
  onNavigateToMeeting,
  onMetadataEdited,
  onSplitCompleted,
  onAskAboutSource
}: SourceReaderProps) {
  const { t } = useTranslation()

  // Title editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editedTitle, setEditedTitle] = useState('')
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  const [metadataOpen, setMetadataOpen] = useState(false)

  // Default the metadata panel open for a device-only source, and re-decide ONLY
  // when a different source is selected. Expressed as React's documented
  // "adjust state when a prop changes" pattern rather than an effect: keying an
  // effect on `recording?.id` while reading `recording` trips
  // react-hooks/exhaustive-deps, and satisfying that rule by adding `recording`
  // would re-run on every mutation of the row (a status tick, a download
  // finishing) and clobber the panel the user just opened or closed. This runs
  // during render, so it also drops the extra commit the effect cost.
  const [metadataSourceId, setMetadataSourceId] = useState<string | undefined>(recording?.id)
  if (recording?.id !== metadataSourceId) {
    setMetadataSourceId(recording?.id)
    setMetadataOpen(recording ? isDeviceOnly(recording) : false)
  }

  // Split mode keeps a cut point independent from the playback head. Waveform
  // clicks and transcript timestamps both update this same value.
  const [splitMode, setSplitMode] = useState(false)
  const [splitPointSec, setSplitPointSec] = useState(0)
  const splitPlayerModeBeforeRef = useRef<ReaderSectionMode | null>(null)

  // Category saving state
  const [isSavingCategory, setIsSavingCategory] = useState(false)

  // Meeting link dialog state
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [showUnlinkConfirmation, setShowUnlinkConfirmation] = useState(false)

  // Explicit, persisted section layout. Scrolling never changes these modes.
  const readerSectionModes = useLibraryStore((s) => s.readerSectionModes)
  const setReaderSectionMode = useLibraryStore((s) => s.setReaderSectionMode)
  const readerVerticalSizes = useLibraryStore((s) => s.readerVerticalSizes)
  const setReaderVerticalSizes = useLibraryStore((s) => s.setReaderVerticalSizes)
  const maximizedSection = useLibraryStore((s) => s.readerMaximizedSection)
  const maximizeReaderSection = useLibraryStore((s) => s.maximizeReaderSection)
  const restoreMaximizedSection = useLibraryStore((s) => s.restoreReaderSection)

  useEffect(() => {
    setSplitMode(false)
    setSplitPointSec(0)
    return () => {
      if (splitPlayerModeBeforeRef.current !== null) {
        setReaderSectionMode('player', splitPlayerModeBeforeRef.current)
        splitPlayerModeBeforeRef.current = null
      }
    }
  }, [recording?.id, setReaderSectionMode])

  // Rich timeline analysis (event markers + sentiment) for full mode, fetched
  // from the sibling IPC when a recording opens. Null until (and if) it resolves.
  const [timeline, setTimeline] = useState<TimelineData | null>(null)
  // True while a one-time analyzeTimeline() backfill is computing sentiment +
  // markers for an already-transcribed recording (drives the subtle "Analyzing
  // timeline…" indicator). Preload does not expose the incremental
  // recordings:timelineProgress event, so the in-flight backfill promise is the
  // signal we have — shown until it resolves.
  const [analyzingTimeline, setAnalyzingTimeline] = useState(false)

  // B1 cross-highlight: clicking a numbered timeline marker (or its event-list
  // row) asks the transcript to scroll to + pulse the matching turn. The nonce
  // re-fires the pulse when the same marker is clicked twice. Reset per recording.
  const [transcriptHighlight, setTranscriptHighlight] = useState<{ atMs: number; nonce: number } | null>(null)
  const highlightNonceRef = useRef(0)

  // B3 backfill guard, keyed by CONTENT-derived transcript revision (see
  // transcriptRevisionKey below). 'done' = analysis succeeded (even if empty) —
  // never auto-repeated for that revision. A failure records the structured
  // {kind, at, attempts, retryAfterMs}; analysisFailurePolicy decides on each
  // REOPEN whether to auto-retry (timer-free by design). A ref (not module
  // state) so it scopes to the mounted reader session.
  const backfillStateRef = useRef<Map<string, BackfillState>>(new Map())
  // Surfaces the failed state + which pill to show ('permanent' needs the
  // user's attention; 'transient' will auto-retry on the next reopen).
  const [timelineAnalysisFailure, setTimelineAnalysisFailure] = useState<'permanent' | 'transient' | null>(null)
  // Bumped by the explicit Retry — re-runs the analysis effect for the same key.
  const [analysisRetryNonce, setAnalysisRetryNonce] = useState(0)

  // Transcription warning state. `pendingTranscribe` holds the exact action to
  // run once the user confirms past the "may overwrite your edits" dialog — this
  // lets the same warning guard both the primary Transcribe and the explicit
  // per-method (Gemini / Local) choices.
  const [metadataEdited, setMetadataEdited] = useState(false)
  const [showTranscribeWarning, setShowTranscribeWarning] = useState(false)
  const [pendingTranscribe, setPendingTranscribe] = useState<(() => void) | null>(null)

  // Re-diarize progress (mirrors re-transcribe: a transient "running" flag while
  // the new pass is queued/running).
  const [reDiarizing, setReDiarizing] = useState(false)

  // Sidebar transcription dock mirror — kept in sync when we queue via the
  // explicit-method picker (same as useOperations does for the default path).
  const addToQueue = useTranscriptionStore((s) => s.addToQueue)

  // Live duration: imported/watched files have no stored duration until the
  // waveform decode backfills it; show the freshly-decoded value meanwhile.
  const livePlaybackDuration = useUIStore((s) => s.playbackDuration)
  const waveformLoadedForId = useUIStore((s) => s.waveformLoadedForId)

  // H6: When a transcribed recording is opened via the sidebar Library nav, the
  // parent may not have enriched the `transcript` prop yet — which left the reader
  // showing "Transcript not available" and a colorless waveform. Fetch the
  // transcript directly as a fallback so the transcript + per-speaker colors render
  // on first paint, regardless of how the recording was selected.
  const [fallbackTranscript, setFallbackTranscript] = useState<Transcript | undefined>(undefined)
  // A manual correction must render immediately even when the Library parent is
  // still refreshing its transcript map. It stays scoped to this recording and
  // is cleared when another source is selected.
  const [editedTranscript, setEditedTranscript] = useState<Transcript | undefined>(undefined)
  const effectiveTranscript = editedTranscript ?? transcript ?? fallbackTranscript
  const [processingRuns, setProcessingRuns] = useState<ReaderProcessingRun[]>([])
  const [meetingCandidates, setMeetingCandidates] = useState<ReaderMeetingCandidate[]>([])
  const recordingId = recording?.id
  const recordingSourceType = recording ? getSourceType(recording) : null
  const localPath = recording && recordingSourceType === 'audio' && hasLocalPath(recording) ? recording.localPath : undefined

  // Reset all state when recording changes
  useEffect(() => {
    setIsEditingTitle(false)
    setEditedTitle('')
    setLinkDialogOpen(false)
    setShowUnlinkConfirmation(false)
    setMetadataEdited(false)
    setShowTranscribeWarning(false)
    setPendingTranscribe(null)
    setReDiarizing(false)
    setFallbackTranscript(undefined)
    setEditedTranscript(undefined)
    setProcessingRuns([])
    setMeetingCandidates([])
    setTranscriptHighlight(null)
  }, [recording?.id])

  // A completed re-transcription replaces the transcript row and therefore its
  // creation revision. Drop the local manual-edit mirror at that boundary so it
  // can never mask the newly generated transcript. Ordinary Library refreshes
  // keep the same revision and preserve the correction without a flicker.
  useEffect(() => {
    setEditedTranscript(undefined)
  }, [recording?.id, transcript?.created_at])

  const handleTranscriptUpdated = useCallback((update: TranscriptContentUpdate) => {
    setEditedTranscript((current) => {
      const base = current ?? transcript ?? fallbackTranscript
      if (!base) return current
      return {
        ...base,
        full_text: update.fullText,
        speakers: JSON.stringify(update.segments),
        word_count: update.wordCount
      }
    })
    // A re-transcription would replace the user's correction, so reuse the
    // existing overwrite warning that already protects user-edited metadata.
    setMetadataEdited(true)
    onMetadataEdited?.()
  }, [fallbackTranscript, onMetadataEdited, transcript])

  // H6: Fetch the transcript directly when the parent didn't supply one but the
  // recording is transcribed (e.g. selection arrived via the sidebar Library nav
  // before enrichment landed). No-op when a transcript prop is already present.
  useEffect(() => {
    if (transcript) return
    if (!recording || !hasLocalPath(recording)) return
    if (recording.transcriptionStatus !== 'complete') return
    let cancelled = false
    ;(async () => {
      try {
        // ADV13: owner-management detail viewer — use the owner accessor so the
        // owner can still read their OWN trashed/personal/value-excluded transcript.
        const fetched = await window.electronAPI?.transcripts?.getByRecordingIdOwner(recording.id)
        if (!cancelled && fetched) setFallbackTranscript(fetched as Transcript)
      } catch (err) {
        console.error('[SourceReader] Transcript fallback fetch failed:', err)
      }
    })()
    return () => { cancelled = true }
  }, [recording, transcript])

  useEffect(() => {
    if (!recordingId) return
    let cancelled = false
    ;(async () => {
      try {
        const result = await window.electronAPI?.transcripts?.getProcessingRuns?.({ recordingId })
        if (!cancelled) setProcessingRuns(result?.success ? result.data as ReaderProcessingRun[] : [])
      } catch {
        if (!cancelled) setProcessingRuns([])
      }
    })()
    return () => { cancelled = true }
  }, [recordingId, effectiveTranscript?.id])

  useEffect(() => {
    if (!recordingId) return
    let cancelled = false
    ;(async () => {
      try {
        const result = await window.electronAPI?.recordings?.getCandidates?.(recordingId)
        if (!cancelled) setMeetingCandidates(result?.success ? result.data as ReaderMeetingCandidate[] : [])
      } catch {
        if (!cancelled) setMeetingCandidates([])
      }
    })()
    return () => { cancelled = true }
  }, [recordingId, meeting?.id])

  // Preload the waveform as soon as a playable recording is opened, so the
  // reader shows the visualization immediately instead of "Press Play to load
  // the waveform". The same decode backfills+persists the real duration, which
  // is why an imported file's header stops reading "Unknown". No-op when the
  // waveform for this recording is already loaded or currently loading, and a
  // safe no-op in tests where window.__audioControls is undefined.
  useEffect(() => {
    if (!recordingId || !localPath) return
    const { waveformLoadedForId: loadedId, waveformLoadingId } = useUIStore.getState()
    if (loadedId === recordingId || waveformLoadingId === recordingId) return
    window.__audioControls?.loadWaveformOnly(recordingId, localPath)
  }, [recordingId, localPath])

  // Parse the stored speaker/timestamp segments (Gemini or local ASR write
  // `speakers` as a JSON array of {speaker, start, end, text}). When present,
  // the viewer renders structured turns instead of re-parsing the plain text.
  // MUST stay above the early return: it (and the people hook below) guard on
  // props, so they run unconditionally and keep hook order stable whether or not
  // a recording is selected — otherwise selecting one adds a hook and React
  // throws "Rendered more hooks than during the previous render."
  const transcriptSegments = useMemo<StoredSegment[] | undefined>(() => {
    if (!effectiveTranscript?.speakers) return undefined
    try {
      const parsed = JSON.parse(effectiveTranscript.speakers)
      return Array.isArray(parsed) && parsed.length > 0 ? (parsed as StoredSegment[]) : undefined
    } catch {
      return undefined
    }
  }, [effectiveTranscript?.speakers])

  const mentionedPeople = useMemo<Array<{ name: string; role?: string }>>(() => {
    if (!effectiveTranscript?.mentioned_people) return []
    try {
      const parsed = JSON.parse(effectiveTranscript.mentioned_people)
      return Array.isArray(parsed)
        ? parsed.filter((person): person is { name: string; role?: string } =>
            !!person && typeof person.name === 'string' && person.name.trim().length > 0)
        : []
    } catch {
      return []
    }
  }, [effectiveTranscript?.mentioned_people])

  // People (Participants + Invited), derived from the resolved speaker map so a
  // renamed speaker updates here immediately. Called unconditionally (no
  // useNavigate inside) to keep hook order stable across the null→selected
  // transition; the actual chip UIs (which DO navigate) mount conditionally.
  const people = useReaderPeople({
    meetingId: meeting?.id,
    attendees: meeting?.attendees,
    recordingId,
    segments: transcriptSegments,
  })

  // Timeline duration for the meeting timeline (stored duration, else the live
  // decoded value once the waveform loads). Kept as a hook (above the early
  // return) so the speaker-range memo below has a stable duration input.
  const timelineDurationSec = useMemo(() => {
    if (recording?.duration && recording.duration > 0) return recording.duration
    if (waveformLoadedForId === recording?.id && livePlaybackDuration > 0) return livePlaybackDuration
    return 0
  }, [recording?.duration, recording?.id, waveformLoadedForId, livePlaybackDuration])

  // Per-speaker colored bars + legend, derived CLIENT-SIDE from the transcript.
  // Each turn is resolved PER-TURN through `people.resolveRangeKey`, which
  // replays the same split/override/label-binding logic the Participants list
  // uses — so a split base label paints different colors on each side of the
  // boundary (matching its distinct chips), and a speaker who is ALSO a linked
  // meeting contact keys to that contact's `mc:` chip: chip swatch and bars
  // always share one color.
  const speakerTimeline = useMemo(
    () => deriveSpeakerRanges(transcriptSegments, timelineDurationSec, people.resolveRangeKey),
    [transcriptSegments, timelineDurationSec, people.resolveRangeKey]
  )

  // The recording's action items (parsed once) — the single home for these is the
  // timeline event-list below, NOT the transcript body (H3 de-duplication).
  // txEdits overlays user edits of transcript-derived items (persisted via
  // transcripts:updateExtractedItem) so every surface shows the corrected text.
  const [txEdits, setTxEdits] = useState<Record<string, string>>({})
  useEffect(() => { setTxEdits({}) }, [recordingId])
  const actionItems = useMemo(
    () => parseJsonArray<string>(effectiveTranscript?.action_items)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text, i) => txEdits[`txa_${i}`] ?? text),
    [effectiveTranscript?.action_items, txEdits]
  )
  // Transcript-JSON key points (decision markers' fallback full text).
  const keyPoints = useMemo(
    () => parseJsonArray<string>(effectiveTranscript?.key_points)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text, i) => txEdits[`txk_${i}`] ?? text),
    [effectiveTranscript?.key_points, txEdits]
  )

  // First-class action_items / decisions rows for the event list's detail surface
  // (full text + assignee/due/status/priority + editability). Fetched with the
  // timeline; joined by marker refId. Transcript-JSON items (refId `txa_`/`txk_`)
  // get editable details sourced from those transcript arrays.
  const [eventRowDetails, setEventRowDetails] = useState<Record<string, TimelineEventDetail>>({})
  useEffect(() => {
    let cancelled = false
    setEventRowDetails({})
    if (!recordingId) return
    const api = window.electronAPI?.actionItems as unknown as {
      getForRecording?: (id: string) => Promise<{
        success: boolean
        data?: {
          actionItems?: Array<{ id: string; content: string; assignee: string | null; due_date: string | null; priority: string; status: string }>
          decisions?: Array<{ id: string; content: string; context: string | null }>
        }
      }>
    } | undefined
    if (typeof api?.getForRecording !== 'function') return
    ;(async () => {
      try {
        const res = await api.getForRecording!(recordingId)
        if (cancelled || !res?.success || !res.data) return
        const map: Record<string, TimelineEventDetail> = {}
        for (const a of res.data.actionItems ?? []) {
          map[a.id] = {
            kind: 'action',
            fullText: a.content,
            editable: true,
            assignee: a.assignee,
            dueDate: a.due_date,
            priority: a.priority,
            status: a.status
          }
        }
        for (const d of res.data.decisions ?? []) {
          map[d.id] = { kind: 'decision', fullText: d.content, editable: true, context: d.context }
        }
        setEventRowDetails(map)
      } catch { /* non-fatal: labels still render */ }
    })()
    return () => { cancelled = true }
  }, [recordingId, effectiveTranscript?.action_items, effectiveTranscript?.key_points])

  // The details map the event list consumes: first-class rows plus entries for
  // transcript-JSON markers (full text from the transcript arrays — editable too,
  // persisted through transcripts:updateExtractedItem).
  const eventDetails = useMemo<Record<string, TimelineEventDetail>>(() => {
    const map: Record<string, TimelineEventDetail> = { ...eventRowDetails }
    actionItems.forEach((text, i) => {
      map[`txa_${i}`] ??= { kind: 'action', fullText: text, editable: true }
      map[`ai-${i}`] ??= { kind: 'action', fullText: text, editable: true }
    })
    keyPoints.forEach((text, i) => {
      map[`txk_${i}`] ??= { kind: 'decision', fullText: text, editable: true }
    })
    return map
  }, [eventRowDetails, actionItems, keyPoints])

  // Persist an event edit (content and/or status) through the first-class tables
  // (or the transcript's extracted arrays for transcript-derived items), then
  // reflect the result locally.
  const handleEventUpdate = useCallback(
    async (event: TimelineEvent, patch: TimelineEventPatch): Promise<boolean> => {
      const refId = event.refId
      if (!refId || !event.kind || event.kind === 'note') return false
      try {
        // Transcript-derived items: refId `txa_<i>` (action_items) / `txk_<i>`
        // (key_points) — index-addressed edit of the transcript's JSON arrays.
        const txMatch = /^tx([ak])_(\d+)$/.exec(refId)
        if (txMatch) {
          if (patch.content === undefined || !recordingId) return false
          const kind = txMatch[1] === 'a' ? 'action' : 'decision'
          const index = parseInt(txMatch[2], 10)
          const res = await window.electronAPI.transcripts.updateExtractedItem({
            recordingId,
            kind,
            index,
            content: patch.content
          })
          if (!res?.success) {
            toast.error(t('library:sourceReader.updateFailedTitle'))
            return false
          }
          setTxEdits((prev) => ({ ...prev, [refId]: patch.content! }))
          toast.success(kind === 'action' ? t('library:sourceReader.actionItemUpdatedTitle') : t('library:sourceReader.decisionUpdatedTitle'))
          return true
        }

        if (event.kind === 'action') {
          const res = await window.electronAPI.actionItems.update({
            actionItemId: refId,
            ...(patch.content !== undefined ? { content: patch.content } : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {})
          })
          if (!res?.success || !res.data) {
            toast.error(t('library:sourceReader.updateActionItemFailedTitle'))
            return false
          }
          const row = res.data as { content: string; status: string }
          setEventRowDetails((prev) =>
            prev[refId] ? { ...prev, [refId]: { ...prev[refId], fullText: row.content, status: row.status } } : prev
          )
          toast.success(t('library:sourceReader.actionItemUpdatedTitle'))
          return true
        }
        const res = await window.electronAPI.decisions.update({
          decisionId: refId,
          ...(patch.content !== undefined ? { content: patch.content } : {})
        })
        if (!res?.success || !res.data) {
          toast.error(t('library:sourceReader.updateDecisionFailedTitle'))
          return false
        }
        const row = res.data as { content: string }
        setEventRowDetails((prev) =>
          prev[refId] ? { ...prev, [refId]: { ...prev[refId], fullText: row.content } } : prev
        )
        toast.success(t('library:sourceReader.decisionUpdatedTitle'))
        return true
      } catch (err) {
        console.error('Failed to update event:', err)
        toast.error(t('library:sourceReader.updateFailedTitle'))
        return false
      }
    },
    [recordingId, t]
  )

  // H3: Timeline events for the full-mode event-list. Prefer the sibling agent's
  // analysis markers; when those are absent, synthesize numbered markers from the
  // action items so the event-list is ALWAYS the reliable single home for them
  // (and they can be removed from the transcript body without being lost).
  const timelineEvents = useMemo<TimelineEvent[]>(() => {
    if (timeline?.events && timeline.events.length > 0) return timeline.events
    if (actionItems.length === 0 || timelineDurationSec <= 0) return []
    const decisionHint = /\b(decide|decision|approv|agree|ship|conclu|sign off)\b/i
    return actionItems.map((label, i) => {
      const frac = actionItems.length === 1 ? 0.5 : 0.05 + (0.9 * i) / (actionItems.length - 1)
      return {
        id: `ai-${i}`,
        refId: `txa_${i}`,
        timeSec: Math.min(timelineDurationSec, Math.max(0, frac * timelineDurationSec)),
        index: i + 1,
        label,
        kind: decisionHint.test(label) ? 'decision' : 'action'
      } as TimelineEvent
    })
  }, [timeline?.events, actionItems, timelineDurationSec])

  // The transcript REVISION this reader is looking at, derived from the
  // timeline-relevant CONTENT: speakers (sentiment windows), action_items +
  // key_points (event markers) and the full text. NOT from id/created_at — the
  // persisted id is stable (`trans_<recordingId>`, INSERT OR REPLACE) and
  // created_at has second precision, so two retranscriptions could share both
  // while their content (and therefore the correct analysis) differs. A
  // retranscription changes the content → new key → the backfill guard below is
  // invalidated and the analysis re-runs.
  const transcriptRevisionKey = useMemo(() => {
    const t = effectiveTranscript
    return [
      recordingId ?? '',
      t?.full_text?.length ?? 0,
      contentHash(t?.full_text),
      contentHash(t?.speakers),
      contentHash(t?.action_items),
      contentHash(t?.key_points)
    ].join(':')
  }, [recordingId, effectiveTranscript])

  // Fetch the sibling agent's timeline analysis when a recording opens (and again
  // when its transcript revision changes — e.g. a retranscription completed).
  // Empty or absent → attempt a one-time backfill via analyzeTimeline, then
  // re-read. All optional-cast so this file type-checks and no-ops before that
  // IPC lands.
  useEffect(() => {
    let cancelled = false
    setTimeline(null)
    setAnalyzingTimeline(false)
    setTimelineAnalysisFailure(null)
    if (!recordingId) return
    const api = window.electronAPI?.recordings as unknown as {
      getTimelineAnalysis?: (id: string) => Promise<TimelineAnalysisResult>
      analyzeTimeline?: (id: string) => Promise<TimelineAnalysisResult>
    } | undefined
    if (typeof api?.getTimelineAnalysis !== 'function') return
    ;(async () => {
      try {
        let res = await api.getTimelineAnalysis!(recordingId)
        // PER-COMPONENT eligibility (not aggregate emptiness): a partially
        // persisted analysis — markers landed but the Gemini sentiment pass
        // failed, or vice versa — must still enter the backfill/retry branch,
        // otherwise a markers-yes/sentiment-no recording would NEVER retry and
        // would lose its failure/Retry affordance on remount (the recorded
        // analysisError is not persisted).
        //
        // A component counts as missing only when it is empty AND not marked
        // completed by the PERSISTED analysisStatus (which the service
        // reconciles against the transcript's current content hash). This is
        // what makes success-empty survive a full unmount/remount/restart with
        // ZERO re-billed analyzeTimeline calls, while a retranscription
        // (content change) reads back not-completed and re-analyzes. Older
        // mains without analysisStatus behave as before (session guard only).
        const missingComponent = (r?: TimelineAnalysisResult) =>
          !r ||
          ((r.sentimentSegments?.length ?? 0) === 0 && r.analysisStatus?.sentimentAnalyzed !== true) ||
          ((r.eventMarkers?.length ?? 0) === 0 && r.analysisStatus?.markersAnalyzed !== true)
        // Already-transcribed recordings return empty until analyzeTimeline runs
        // once. Backfill it (best-effort) and show the "Analyzing timeline…" hint
        // meanwhile; per-speaker colors + playhead already render without this.
        // Guarded PER TRANSCRIPT REVISION (content-derived key): success — even
        // an honestly-empty result — is never auto-repeated; failures follow
        // analysisFailurePolicy, keyed on the STRUCTURED errorKind the service
        // classified (never message text). Timer-free: retries fire on REOPEN.
        // A retranscription changes the key and always gets a fresh attempt.
        if (missingComponent(res) && typeof api.analyzeTimeline === 'function') {
          const prior = backfillStateRef.current.get(transcriptRevisionKey)
          const priorFailure = prior !== undefined && prior !== 'done' ? prior : null
          const canAttempt =
            prior === undefined || (priorFailure !== null && analysisFailurePolicy(priorFailure).canAutoRetry)
          if (canAttempt) {
            const attempts = (priorFailure?.attempts ?? 0) + 1
            // Provisional 'done' — replaced with the failure record on error.
            backfillStateRef.current.set(transcriptRevisionKey, 'done')
            if (!cancelled) setAnalyzingTimeline(true)
            try {
              // The IPC always resolves; a failed run carries a structured
              // analysisError. A transport-level rejection (no structure at
              // all) is conservatively 'unknown'.
              let analysisError: TimelineAnalysisResult['analysisError'] | null = null
              try {
                const out = await api.analyzeTimeline(recordingId)
                analysisError = out?.analysisError ?? null
              } catch {
                analysisError = { kind: 'unknown' }
              }
              if (analysisError) {
                // Trust only a validated, CLAMPED retry-after (the service
                // already clamps; re-clamp defensively for older mains).
                const rawRetryAfter = analysisError.retryAfterMs
                const retryAfterMs =
                  typeof rawRetryAfter === 'number' && Number.isFinite(rawRetryAfter) && rawRetryAfter > 0
                    ? Math.min(rawRetryAfter, RETRY_AFTER_MAX_MS)
                    : undefined
                const failure: AnalysisFailure = {
                  kind: normalizeErrorKind(analysisError.kind),
                  at: Date.now(),
                  attempts,
                  retryAfterMs
                }
                backfillStateRef.current.set(transcriptRevisionKey, failure)
                if (!cancelled) setTimelineAnalysisFailure(analysisFailurePolicy(failure).display)
              }
              // Re-read regardless: markers may have landed even when the
              // sentiment pass failed — show what exists.
              res = await api.getTimelineAnalysis!(recordingId)
            }
            finally { if (!cancelled) setAnalyzingTimeline(false) }
          } else if (priorFailure) {
            // Still under the failure policy — surface the right pill so the
            // explicit Retry stays reachable.
            if (!cancelled) setTimelineAnalysisFailure(analysisFailurePolicy(priorFailure).display)
          }
        }
        if (!cancelled && res) setTimeline(mapTimelineAnalysis(res))
      } catch { /* non-fatal: colors + seek still work without it */ }
      finally { if (!cancelled) setAnalyzingTimeline(false) }
    })()
    return () => { cancelled = true }
  }, [recordingId, transcriptRevisionKey, analysisRetryNonce])

  // B1: a timeline marker (or event-list row) was activated — ask the transcript
  // to scroll to + pulse the turn at this marker's time. A bumped nonce re-fires
  // the pulse for a repeat click on the same marker.
  const handleTimelineEventClick = useCallback((event: TimelineEvent) => {
    highlightNonceRef.current += 1
    setTranscriptHighlight({ atMs: Math.round(event.timeSec * 1000), nonce: highlightNonceRef.current })
  }, [])

  // Explicit user retry for a failed timeline analysis: clears the failure
  // record for THIS revision (the only escape for a permanent failure) and
  // re-runs the analysis effect.
  const retryTimelineAnalysis = useCallback(() => {
    backfillStateRef.current.delete(transcriptRevisionKey)
    setAnalysisRetryNonce((n) => n + 1)
  }, [transcriptRevisionKey])

  const handleSaveTitle = useCallback(async () => {
    if (!recording?.knowledgeCaptureId) return
    const trimmed = editedTitle.trim()
    if (!trimmed) {
      setEditedTitle(recording.userTitle || '')
      toast.error(t('library:sourceReader.titleCannotBeEmptyTitle'))
      return
    }
    if (trimmed === (recording.userTitle || '')) {
      setIsEditingTitle(false)
      return
    }
    setIsSavingTitle(true)
    try {
      const result = await window.electronAPI.knowledge.update(
        recording.knowledgeCaptureId,
        { userTitle: trimmed || null }
      )
      if (result.success) {
        setIsEditingTitle(false)
        setMetadataEdited(true)
        toast.success(trimmed ? t('library:sourceReader.contentTitleUpdatedTitle') : t('library:sourceReader.contentTitleClearedTitle'))
        onMetadataEdited?.()
      } else {
        toast.error(t('library:sourceReader.saveTitleFailedTitle'))
      }
    } catch (err) {
      console.error('Failed to save title:', err)
      toast.error(t('library:sourceReader.saveTitleFailedTitle'))
    } finally {
      setIsSavingTitle(false)
    }
  }, [editedTitle, recording, onMetadataEdited, t])

  const handleCancelTitle = useCallback(() => {
    setIsEditingTitle(false)
    setEditedTitle('')
  }, [])

  const handleCategoryChange = useCallback(async (newCategory: string) => {
    if (!recording?.knowledgeCaptureId) return
    if (newCategory === recording.category) return
    setIsSavingCategory(true)
    try {
      const result = await window.electronAPI.knowledge.update(
        recording.knowledgeCaptureId,
        { category: newCategory }
      )
      if (result.success) {
        setMetadataEdited(true)
        toast.success(t('library:sourceReader.categoryUpdatedTitle'))
        onMetadataEdited?.()
      } else {
        toast.error(t('library:sourceReader.saveCategoryFailedTitle'))
      }
    } catch (err) {
      console.error('Failed to save category:', err)
      toast.error(t('library:sourceReader.saveCategoryFailedTitle'))
    } finally {
      setIsSavingCategory(false)
    }
  }, [recording, onMetadataEdited, t])

  const handleRemoveMeetingLink = useCallback(async () => {
    if (!recording) return
    try {
      const result = await window.electronAPI.recordings.selectMeeting(recording.id, null)
      // The handler reports failure in-band ({ success: false }) — without
      // checking it the refresh ran anyway and the unlink looked like a no-op
      // (2026-07-24: "clicking the little x does nothing").
      if (result && result.success === false) {
        toast.error(t('library:sourceReader.removeMeetingLinkFailedTitle'), result.error ?? undefined)
        return
      }
      setMetadataEdited(true)
      onMetadataEdited?.()
    } catch (err) {
      console.error('Failed to remove meeting link:', err)
      toast.error(t('library:sourceReader.removeMeetingLinkFailedTitle'))
    }
  }, [recording, onMetadataEdited, t])

  // Run a transcription action, but first warn if the user edited metadata the
  // AI pass could overwrite. The chosen action is stashed and executed on
  // confirm (see the ConfirmDialog below), so the same guard covers both the
  // primary Transcribe and the explicit Gemini/Local method choices.
  const requestTranscribe = useCallback((action: () => void) => {
    if (metadataEdited) {
      setPendingTranscribe(() => action)
      setShowTranscribeWarning(true)
    } else {
      action()
    }
  }, [metadataEdited])

  // Queue a transcription with an explicit method — "Gemini" (cloud) or "Local"
  // (on-device) — reusing the existing recordings:reprocessWith IPC. This does
  // NOT touch the transcription service; it mirrors useOperations' toast + the
  // sidebar dock-queue update so the run is observable there too.
  const transcribeWith = useCallback(async (provider: 'gemini' | 'local-asr', label: string) => {
    if (!recording || !hasLocalPath(recording)) return
    try {
      const res = await window.electronAPI.recordings.reprocessWith(recording.id, provider)
      if (!res?.success) {
        toast.error(
          t('library:sourceReader.transcribeFailedTitle'),
          res?.error || t('library:sourceReader.couldNotStartTranscriptionFallback', { label })
        )
        return
      }
      if (res.queueItemId) addToQueue(res.queueItemId, recording.id, recording.filename)
      toast.success(t('library:sourceReader.transcribingWithTitle', { label }), recording.filename)
    } catch (err) {
      toast.error(t('library:sourceReader.transcribeFailedTitle'), err instanceof Error ? err.message : undefined)
    }
  }, [recording, addToQueue, t])

  // Re-run speaker diarization for this recording via a dedicated IPC (added by a
  // sibling change). Degrades gracefully when the IPC isn't present at runtime.
  const reDiarize = useCallback(async () => {
    if (!recording || !hasLocalPath(recording)) return
    const api = window.electronAPI?.recordings as
      | { reDiarize?: (id: string) => Promise<{ success: boolean; queueItemId?: string; error?: string }> }
      | undefined
    if (typeof api?.reDiarize !== 'function') {
      toast.error(t('library:sourceReader.reDiarizeUnavailableTitle'), t('library:sourceReader.reDiarizeUnavailableMessage'))
      return
    }
    setReDiarizing(true)
    try {
      const res = await api.reDiarize(recording.id)
      if (!res?.success) {
        toast.error(t('library:sourceReader.reDiarizeFailedTitle'), res?.error || t('library:sourceReader.reDiarizeFailedFallback'))
        setReDiarizing(false)
        return
      }
      if (res.queueItemId) addToQueue(res.queueItemId, recording.id, recording.filename)
      toast.success(t('library:sourceReader.reDiarizingSpeakersTitle'), recording.filename)
    } catch (err) {
      toast.error(t('library:sourceReader.reDiarizeFailedTitle'), err instanceof Error ? err.message : undefined)
      setReDiarizing(false)
    }
  }, [recording, addToQueue, t])

  // Memoized dialog prop: a fresh object per render would re-fire the dialog's
  // load effect on every background poll (the ~3s list→Loading→list flicker,
  // 2026-07-23). MUST stay above the early return below (hooks order).
  const linkDialogRecording = useMemo(() => recording ? {
    id: recording.id,
    filename: recording.filename,
    date_recorded: recording.dateRecorded instanceof Date
      ? recording.dateRecorded.toISOString()
      : String(recording.dateRecorded),
    duration_seconds: recording.duration ?? null
  } : null, [recording])

  const handleReaderSeek = useCallback((startMs: number, endMs?: number) => {
    if (splitMode) setSplitPointSec(startMs / 1000)
    onSeek?.(startMs, endMs)
  }, [onSeek, splitMode])

  const closeSplitMode = useCallback(() => {
    setSplitMode(false)
    if (splitPlayerModeBeforeRef.current !== null) {
      setReaderSectionMode('player', splitPlayerModeBeforeRef.current)
      splitPlayerModeBeforeRef.current = null
    }
  }, [setReaderSectionMode])

  const toggleSplitMode = useCallback(() => {
    if (splitMode) {
      closeSplitMode()
      return
    }
    window.__audioControls?.pause()
    const livePoint = currentTimeMs / 1000
    const initial = livePoint > 1 && livePoint < timelineDurationSec - 1 ? livePoint : timelineDurationSec / 2
    setSplitPointSec(initial)
    splitPlayerModeBeforeRef.current = readerSectionModes.player
    setReaderSectionMode('player', 'expanded')
    setSplitMode(true)
  }, [closeSplitMode, currentTimeMs, readerSectionModes.player, setReaderSectionMode, splitMode, timelineDurationSec])

  const toggleMaximizedSection = useCallback((section: ReaderSectionId) => {
    if (maximizedSection === section) {
      restoreMaximizedSection()
      return
    }
    maximizeReaderSection(section)
  }, [maximizeReaderSection, maximizedSection, restoreMaximizedSection])

  const changeSectionMode = useCallback((section: ReaderSectionId, mode: ReaderSectionMode) => {
    if (section === 'player' && splitMode && mode !== 'expanded') closeSplitMode()
    setReaderSectionMode(section, mode)
  }, [closeSplitMode, setReaderSectionMode, splitMode])

  if (!recording) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">{t('library:sourceReader.noSourceSelectedTitle')}</p>
          <p className="text-sm">{t('library:sourceReader.noSourceSelectedHint')}</p>
        </div>
      </div>
    )
  }

  const sourceType = recordingSourceType ?? 'unknown'
  const isAudioSource = sourceType === 'audio'
  const canPlay = isAudioSource && hasLocalPath(recording)

  // Same title resolver the list row uses, so clicking a row and the detail
  // header always agree (no raw filename leaking through here).
  const { primaryText: displayTitle } = getDisplayTitle(recording, meeting, effectiveTranscript)
  const displayedProcessingRuns: ReaderProcessingRun[] = processingRuns.length > 0
    ? processingRuns
    : effectiveTranscript?.transcription_provider
      ? [{
          id: `legacy-transcription-${effectiveTranscript.id}`,
          stage: 'transcription',
          provider: effectiveTranscript.transcription_provider,
          tool: effectiveTranscript.transcription_provider,
          model: effectiveTranscript.transcription_model,
          version: null,
          execution: effectiveTranscript.transcription_provider === 'gemini' ? 'cloud' : null,
          status: 'completed',
          quality_status: effectiveTranscript.diarization_quality_status ?? null,
          quality_json: effectiveTranscript.diarization_quality ?? null,
          estimated_cost_amount: null,
          estimated_cost_currency: null,
          cost_method: null
        }]
      : []
  const candidateMeetingLabel = meetingCandidates.length === 1
    ? t('library:sourceReader.candidateMeetingSingle', { subject: meetingCandidates[0].subject })
    : meetingCandidates.length > 1
      ? t('library:sourceReader.candidateMeetingMultiple', {
          subject: meetingCandidates[0].subject,
          count: meetingCandidates.length - 1
        })
      : t('library:sourceReader.candidateMeetingNotAssigned')

  // Prefer the stored duration; fall back to the live decoded value for the
  // recording whose waveform is currently loaded (computed as a hook above).
  const durationSeconds = timelineDurationSec

  // Transcription is "busy" while queued or running — the primary Transcribe
  // control and its ▾ trigger are disabled in that window.
  const isTranscribeBusy =
    recording.transcriptionStatus === 'pending' || recording.transcriptionStatus === 'processing'

  const isTranscribed = recording.transcriptionStatus === 'complete'

  // The transcription method menu offered by the ▾ trigger. Shared by both the
  // "Transcribe ▾" (fresh) and "Re-transcribe ▾" (already-done) forms. The
  // Re-diarize item only makes sense once a transcript with speakers exists.
  const transcribeMenuItems = (
    <>
      <DropdownMenuItem onClick={() => requestTranscribe(() => transcribeWith('gemini', t('library:sourceReader.geminiProviderLabel')))}>
        <Cloud className="h-4 w-4" aria-hidden="true" />
        {t('library:sourceReader.geminiCloudMenuItem')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => requestTranscribe(() => transcribeWith('local-asr', t('library:sourceReader.localProviderLabel')))}>
        <Cpu className="h-4 w-4" aria-hidden="true" />
        {t('library:sourceReader.localOnDeviceMenuItem')}
      </DropdownMenuItem>
      {isTranscribed && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={reDiarize} disabled={reDiarizing}>
            <UserCog className="h-4 w-4" aria-hidden="true" />
            {reDiarizing ? t('library:sourceReader.reDiarizingEllipsis') : t('library:sourceReader.reDiarizeThisRecordingMenuItem')}
          </DropdownMenuItem>
        </>
      )}
    </>
  )

  const sectionIsVisible = (section: ReaderSectionId) =>
    readerSectionModes[section] !== 'hidden' && (!maximizedSection || maximizedSection === section)
  const sectionIsOpen = (section: ReaderSectionId) => readerSectionModes[section] !== 'compact'
  const showUpperWorkspace = !maximizedSection || maximizedSection === 'player' || maximizedSection === 'metadata'
  const showLowerWorkspace = !maximizedSection || maximizedSection === 'summary' || maximizedSection === 'transcript'
  const hiddenReaderSections = (Object.entries(readerSectionModes) as Array<[ReaderSectionId, ReaderSectionMode]>)
    .filter(([, mode]) => mode === 'hidden')
    .map(([id]) => ({
      id,
      label: t(SECTION_LABEL_KEYS[id])
    }))

  return (
    <div className="@container flex flex-col h-full overflow-hidden">
      <HiddenReaderSections
        hidden={hiddenReaderSections}
        onRestore={(section) => changeSectionMode(section, 'expanded')}
      />
      <ResizablePanelGroup
        direction="vertical"
        className="min-h-0 flex-1"
        onLayout={maximizedSection ? undefined : setReaderVerticalSizes}
        data-testid="reader-vertical-layout"
      >
      {showUpperWorkspace && (
      <ResizablePanel
        defaultSize={maximizedSection ? 100 : readerVerticalSizes[0] ?? 64}
        minSize={maximizedSection ? 100 : 24}
        order={1}
      >
      {/* ===================================================================
          DOCKED HEADER — stays put while the body scrolls.
          Title + status + curated meta + primary CTAs + compact player +
          Participants chips.
          =================================================================== */}
      <div className="h-full overflow-y-auto bg-background" data-testid="reader-compact-header">
        {/* Authoritative source identity: official meeting subject once linked,
            otherwise the immutable filename. Content title is edited below. */}
        <div className="flex items-start gap-2 px-4 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold line-clamp-2 leading-tight" title={displayTitle}>
              {displayTitle}
            </h2>
          </div>
        </div>

        {/* Curated meta strip: date · duration · location · status */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            {formatSmartDate(recording.dateRecorded, { fallback: t('library:sourceReader.unknownFallback') })}
            {(() => {
              const rel = formatRelativeDate(recording.dateRecorded)
              return rel ? <span className="text-muted-foreground/70">· {rel}</span> : null
            })()}
          </span>
          {isAudioSource && (
            <>
              <span aria-hidden="true" className="text-muted-foreground/40">•</span>
              <span>{durationSeconds > 0 ? formatDuration(durationSeconds) : t('library:sourceReader.unknownDurationFallback')}</span>
            </>
          )}
          <span aria-hidden="true" className="text-muted-foreground/40">•</span>
          <span className="inline-flex items-center gap-1">
            <StatusIcon recording={recording} />
          </span>
          {isAudioSource ? (
            <TranscriptionStatusBadge status={recording.transcriptionStatus} />
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 font-medium capitalize text-foreground">{sourceType}</span>
          )}
        </div>

        {sectionIsVisible('metadata') && (
        <section
          className={cn(
            'px-4 pt-2',
            readerSectionModes.metadata === 'docked' && 'sticky top-0 z-20 border-b bg-background/95 shadow-sm'
          )}
          aria-label={t('library:sourceReader.sourceMetadataAriaLabel')}
        >
        <ReaderSectionControls
          section="metadata"
          label={t('library:sourceReader.metadataSectionLabel')}
          mode={readerSectionModes.metadata}
          onModeChange={(mode) => changeSectionMode('metadata', mode)}
          onMaximize={() => toggleMaximizedSection('metadata')}
          maximized={maximizedSection === 'metadata'}
        />
        {sectionIsOpen('metadata') && (
        <div id="reader-metadata-content">
        {/* Independent identity fields: source filename, calendar subject, and
            AI title suggestion are never aliases for the editable content title. */}
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 pt-2 text-xs @md:grid-cols-2" data-testid="source-identity-fields">
          {displayTitle !== recording.filename && (
            <div className="min-w-0">
              <dt className="font-medium text-muted-foreground">{t('library:sourceReader.filenameLabel')}</dt>
              <dd className="mt-0.5 truncate text-foreground" title={recording.filename}>{recording.filename}</dd>
            </div>
          )}
          {isAudioSource && !meeting && !recording.meetingSubject && meetingCandidates.length > 0 && (
            <div className="min-w-0">
              <dt className="font-medium text-muted-foreground">{t('library:sourceReader.possibleMeetingLabel')}</dt>
              <dd className="mt-0.5 truncate text-foreground" title={candidateMeetingLabel}>{candidateMeetingLabel}</dd>
            </div>
          )}
          <div className="min-w-0">
            <dt className="font-medium text-muted-foreground">{t('library:sourceReader.contentTitleLabel')}</dt>
            {isEditingTitle ? (
              <dd className="mt-0.5 flex min-w-0 items-center gap-1">
                <Input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveTitle()
                    if (e.key === 'Escape') handleCancelTitle()
                  }}
                  className="h-6 min-w-0 px-1.5 py-0 text-xs"
                  autoFocus
                  disabled={isSavingTitle}
                  aria-label={t('library:sourceReader.recordingTitleAriaLabel')}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleSaveTitle}
                  disabled={isSavingTitle}
                  aria-label={t('library:sourceReader.saveTitleAriaLabel')}
                  title={t('library:sourceReader.saveTitleShortcutTitle')}
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleCancelTitle}
                  disabled={isSavingTitle}
                  aria-label={t('library:sourceReader.cancelEditingAriaLabel')}
                  title={t('library:sourceReader.cancelEditingShortcutTitle')}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </dd>
            ) : (
              <dd className="group mt-0.5 flex min-w-0 items-center gap-1 text-foreground">
                <span className="truncate" title={recording.userTitle || effectiveTranscript?.title_suggestion || undefined}>
                  {recording.userTitle || effectiveTranscript?.title_suggestion || t('library:sourceReader.notGeneratedFallback')}
                </span>
                {recording.knowledgeCaptureId && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingTitle(true)
                      setEditedTitle(recording.userTitle || effectiveTranscript?.title_suggestion || '')
                    }}
                    className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-label={t('library:sourceReader.editTitleAriaLabel')}
                    title={t('library:sourceReader.editContentTitleTooltip')}
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </dd>
            )}
          </div>
          {isAudioSource && (meeting?.organizer_name || meeting?.organizer_email) && (
            <div className="min-w-0">
              <dt className="font-medium text-muted-foreground">{t('library:sourceReader.organizerLabel')}</dt>
              <dd className="mt-0.5 truncate text-foreground" title={meeting?.organizer_name || meeting?.organizer_email || undefined}>
                {meeting?.organizer_name || meeting?.organizer_email}
              </dd>
            </div>
          )}
        </dl>

        {isAudioSource && !meeting && !isDeviceOnly(recording) && (
          <button
            type="button"
            className="mt-2 flex max-w-full flex-wrap items-center gap-1.5 rounded-md border border-dashed px-2.5 py-1.5 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            onClick={() => setLinkDialogOpen(true)}
            aria-label={t('library:sourceReader.linkToMeetingAriaLabel')}
          >
            <Link className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            <span className="text-[11px] font-semibold text-primary">{t('library:sourceReader.linkMeetingLabel')}</span>
            {meetingCandidates.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {t('library:sourceReader.possibleMatches', { count: meetingCandidates.length })}
              </span>
            )}
            {meetingCandidates.slice(0, 4).map((candidate) => (
              <span
                key={candidate.meetingId}
                className="rounded-full border border-dashed px-2 py-0.5 text-[11px] hover:border-primary"
                title={candidate.matchReason || undefined}
              >
                {candidate.subject}{t('library:sourceReader.candidateConfidenceSeparator')}{Math.round(candidate.confidenceScore * 100)}%
              </span>
            ))}
          </button>
        )}

        {displayedProcessingRuns.length > 0 && <ProcessingRunChips runs={displayedProcessingRuns} />}
        </div>
        )}
        </section>
        )}

        {/* Primary CTAs */}
        <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-3">
          {/* Primary action: Play/Stop for local files, Download for device-only */}
          {canPlay && onPlay ? (
            isPlaying ? (
              <Button size="sm" onClick={onStop} className="gap-2" title={t('library:sourceReader.stopPlaybackTitle')}>
                <Square className="h-4 w-4" />
                {t('library:sourceReader.stopButton')}
              </Button>
            ) : (
              <Button size="sm" onClick={onPlay} className="gap-2" title={t('library:sourceReader.playRecordingTitle')}>
                <Play className="h-4 w-4" />
                {t('library:sourceReader.playButton')}
              </Button>
            )
          ) : isDeviceOnly(recording) && onDownload ? (
            <Button
              size="sm"
              onClick={onDownload}
              disabled={!deviceConnected || isDownloading}
              className="gap-2"
              title={!deviceConnected ? t('library:sourceReader.deviceNotConnectedTitle') : t('library:sourceReader.downloadFromDeviceTitle')}
            >
              {isDownloading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  {(downloadProgress ?? 0) > 0 ? `${downloadProgress}%` : t('library:sourceReader.startingEllipsis')}
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  {downloadStatus === 'pending' ? t('library:sourceReader.startDownloadButton') : t('library:sourceReader.downloadButton')}
                </>
              )}
            </Button>
          ) : null}

          {/* Transcription split button (Transcribe / Re-transcribe ▾). */}
          {isAudioSource && hasLocalPath(recording) && onTranscribe && (
            isTranscribed ? (
              <div className="inline-flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => requestTranscribe(() => onTranscribe?.())}
                  disabled={isTranscribeBusy}
                  className="gap-2 rounded-r-none border-r-0"
                  title={t('library:sourceReader.reTranscribeDefaultTitle')}
                >
                  <Wand2 className="h-4 w-4" />
                  {t('library:sourceReader.reTranscribeButton')}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isTranscribeBusy}
                      className="rounded-l-none px-2"
                      aria-label={t('library:sourceReader.chooseReTranscriptionMethodAriaLabel')}
                      title={t('library:sourceReader.chooseReTranscriptionOrReDiarizationTitle')}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">{transcribeMenuItems}</DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div className="inline-flex items-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => requestTranscribe(() => onTranscribe?.())}
                  disabled={isTranscribeBusy}
                  className="gap-2 rounded-r-none border-r-0"
                  title={
                    recording.transcriptionStatus === 'pending' ? t('library:sourceReader.transcriptionQueuedTitle') :
                    recording.transcriptionStatus === 'processing' ? t('library:sourceReader.transcriptionInProgressTitle') :
                    t('library:sourceReader.startAiTranscriptionTitle')
                  }
                >
                  {recording.transcriptionStatus === 'processing' ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      {t('library:sourceReader.inProgressLabel')}
                    </>
                  ) : recording.transcriptionStatus === 'pending' ? (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      {t('library:sourceReader.queuedLabel')}
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4" />
                      {t('library:sourceReader.transcribeButton')}
                    </>
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isTranscribeBusy}
                      className="rounded-l-none px-2"
                      aria-label={t('library:sourceReader.chooseTranscriptionMethodAriaLabel')}
                      title={t('library:sourceReader.chooseTranscriptionMethodAriaLabel')}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">{transcribeMenuItems}</DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          )}

          {/* Source-scoped assistant */}
          {onAskAboutSource && (
            <Button
              variant="outline"
              size="sm"
              onClick={onAskAboutSource}
              className="gap-2"
              title={t('library:sourceReader.askAboutSourceTitle')}
            >
              <Sparkles className="h-4 w-4" />
              {t('library:sourceReader.askAboutSourceButton')}
            </Button>
          )}

          {canPlay && durationSeconds > 2 && (
            <Button
              variant={splitMode ? 'secondary' : 'outline'}
              size="sm"
              onClick={toggleSplitMode}
              className="gap-2"
              aria-pressed={splitMode}
              title={splitMode ? t('library:sourceReader.closeSplitEditorTitle') : t('library:sourceReader.splitRecordingTitle')}
            >
              <Scissors className="h-4 w-4" />
              {splitMode ? t('library:sourceReader.splittingLabel') : t('library:sourceReader.splitLabel')}
            </Button>
          )}

          {/* Overflow: file operations + destructive delete (behind a separator) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label={t('library:sourceReader.moreActionsLabel')} title={t('library:sourceReader.moreActionsLabel')}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {hasLocalPath(recording) && (
                <>
                  <DropdownMenuItem onClick={() => window.electronAPI?.storage.openFile(recording.localPath)}>
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                    {t('library:sourceReader.openInDefaultAppMenuItem')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => window.electronAPI?.storage.revealInFolder(recording.localPath)}>
                    <FolderOpen className="h-4 w-4" aria-hidden="true" />
                    {t('library:sourceReader.revealInFolderMenuItem')}
                  </DropdownMenuItem>
                </>
              )}
              {!meeting && !isDeviceOnly(recording) && (
                <DropdownMenuItem onClick={() => setLinkDialogOpen(true)}>
                  <Link className="h-4 w-4" aria-hidden="true" />
                  {t('library:sourceReader.linkMeetingLabel')}
                </DropdownMenuItem>
              )}
              {onMarkPersonal && !isDeviceOnly(recording) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onMarkPersonal}>
                    {recording.personal
                      ? <><Eye className="h-4 w-4" aria-hidden="true" />{t('library:sourceReader.unmarkPersonalMenuItem')}</>
                      : <><EyeOff className="h-4 w-4" aria-hidden="true" />{t('library:sourceReader.markPersonalMenuItem')}</>}
                  </DropdownMenuItem>
                </>
              )}
              {/* spec-005/F17 T5 §D2/§D3/AR3-4 — mirrors SourceRow's delete block.
                  AR3-4 (binding): capture-only synthetic rows (no source recording)
                  render NONE of these — gated on isRecordingBacked. */}
              {isRecordingBacked(recording) && onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={onDelete}
                    disabled={(isDeviceOnly(recording) && !deviceConnected) || isDeleting}
                    className="items-start gap-2 text-destructive focus:text-destructive"
                    aria-label={ariaLabelWithScope(
                      isDeviceOnly(recording) ? LABEL_DELETE_FROM_DEVICE : LABEL_MOVE_TO_TRASH,
                      isDeviceOnly(recording)
                        ? (deviceConnected ? SCOPE_DEVICE_DELETE : SCOPE_DEVICE_NOT_CONNECTED)
                        : SCOPE_TRASH
                    )}
                  >
                    {isDeleting ? (
                      <RefreshCw className="h-4 w-4 mt-0.5 shrink-0 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="flex flex-col">
                      <span>{isDeviceOnly(recording) ? LABEL_DELETE_FROM_DEVICE : LABEL_MOVE_TO_TRASH}</span>
                      <span className="text-xs text-muted-foreground">
                        {isDeviceOnly(recording)
                          ? (deviceConnected ? SCOPE_DEVICE_DELETE : SCOPE_DEVICE_NOT_CONNECTED)
                          : SCOPE_TRASH}
                      </span>
                    </span>
                  </DropdownMenuItem>
                  {onDeleteFromDevice && recording.location === 'both' && (
                    <DropdownMenuItem
                      onClick={onDeleteFromDevice}
                      disabled={!deviceConnected || isDeleting}
                      className="items-start gap-2 text-destructive focus:text-destructive"
                      aria-label={ariaLabelWithScope(LABEL_DELETE_FROM_DEVICE, deviceConnected ? SCOPE_DEVICE_DELETE_SYNCED : SCOPE_DEVICE_NOT_CONNECTED)}
                    >
                      <Trash2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                      <span className="flex flex-col">
                        <span>{LABEL_DELETE_FROM_DEVICE}</span>
                        <span className="text-xs text-muted-foreground">
                          {deviceConnected ? SCOPE_DEVICE_DELETE_SYNCED : SCOPE_DEVICE_NOT_CONNECTED}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  )}
                  {onDeletePermanent && !isDeviceOnly(recording) && (
                    <DropdownMenuItem
                      onClick={onDeletePermanent}
                      disabled={isDeleting}
                      className="items-start gap-2 text-destructive focus:text-destructive"
                      aria-label={ariaLabelWithScope(LABEL_DELETE_PERMANENTLY, SCOPE_PERMANENT)}
                    >
                      <Trash2 className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                      <span className="flex flex-col">
                        <span>{LABEL_DELETE_PERMANENTLY}</span>
                        <span className="text-xs text-muted-foreground">{SCOPE_PERMANENT}</span>
                      </span>
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* One waveform, with an explicit state chosen by the user. Scrolling
            never changes its presentation. */}
        {canPlay && sectionIsVisible('player') && (
          <section
            className={cn(
              'px-4 pb-3 pt-2',
              readerSectionModes.player === 'docked' && 'sticky top-0 z-30 border-b bg-background/95 shadow-sm'
            )}
            aria-label={t('library:sourceReader.audioPlayerAriaLabel')}
          >
            <ReaderSectionControls
              section="player"
              label={t('library:sourceReader.playerSectionLabel')}
              mode={readerSectionModes.player}
              onModeChange={(mode) => changeSectionMode('player', mode)}
              onMaximize={() => toggleMaximizedSection('player')}
              maximized={maximizedSection === 'player'}
            />
            <div id="reader-player-content">
            <ReaderPlayer
              recordingId={recording.id}
              filePath={localPath}
              durationSec={durationSeconds}
              speakerRanges={speakerTimeline.ranges}
              events={timelineEvents}
              eventDetails={eventDetails}
              onEventUpdate={handleEventUpdate}
              sentiment={timeline?.sentiment}
              analyzing={analyzingTimeline}
              analysisFailure={timelineAnalysisFailure}
              onRetryAnalysis={retryTimelineAnalysis}
              presentation={readerSectionModes.player === 'expanded' ? 'expanded' : 'compact'}
              onSeek={(sec) => handleReaderSeek(Math.round(sec * 1000))}
              onEventClick={handleTimelineEventClick}
              splitPointSec={splitMode ? splitPointSec : undefined}
            />
            {splitMode && localPath && (
              <RecordingSplitEditor
                recordingId={recording.id}
                filePath={localPath}
                durationSec={durationSeconds}
                pointSec={splitPointSec}
                isPlaying={isPlaying}
                onPointChange={(timeSec) => {
                  setSplitPointSec(timeSec)
                  onSeek?.(Math.round(timeSec * 1000))
                }}
                onCancel={closeSplitMode}
                onSplitCompleted={(firstChildId) => {
                  closeSplitMode()
                  if (onSplitCompleted) onSplitCompleted(firstChildId)
                  else onMetadataEdited?.()
                }}
              />
            )}
            </div>
          </section>
        )}

        {sectionIsVisible('metadata') && sectionIsOpen('metadata') && (
        <div id="reader-metadata-context">
        {/* Linked Meeting — meeting context and its change/remove controls. */}
        {meeting && (
          <div className="px-4 pb-3" data-testid="linked-meeting-card">
            <div className="flex items-center gap-2 p-3 bg-muted/30 border rounded-lg">
              <div
                className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => onNavigateToMeeting?.(meeting.id)}
              >
                <Calendar className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{meeting.subject}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(meeting.start_time)}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={(e) => { e.stopPropagation(); setLinkDialogOpen(true) }}
                title={t('library:sourceReader.changeLinkedMeetingTitle')}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={(e) => { e.stopPropagation(); setShowUnlinkConfirmation(true) }}
                title={t('library:sourceReader.removeMeetingLinkTitle')}
                aria-label={t('library:sourceReader.removeMeetingLinkAriaLabel')}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Participants (who actually spoke) — docked, actionable chips. */}
        {people.participants.length > 0 && (
          <div className="px-4 pb-3" data-testid="participants-section">
            <ParticipantsChips
              participants={people.participants}
              contacts={people.allContacts}
              colorByKey={speakerTimeline.colorByKey}
              onOpenPicker={people.ensureAllContacts}
              onAssign={people.assignSpeaker}
              onUnassign={people.unassignSpeaker}
            />
          </div>
        )}

        {meeting && (
          <div className="px-4 pb-3" data-testid="invited-section">
            <InvitedChips
              invited={people.invited}
              resolveAttendee={people.resolveAttendee}
              spokeKey={people.attendeeSpoke}
            />
          </div>
        )}

        {mentionedPeople.length > 0 && (
          <div className="px-4 pb-3" data-testid="mentioned-people-section">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              {t('library:sourceReader.mentionedCount', { count: mentionedPeople.length })}
              <span className="font-normal">{t('library:sourceReader.notAttendanceNote')}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {mentionedPeople.map((person, index) => (
                <span key={`${person.name}-${index}`} className="rounded-full border px-2 py-0.5 text-xs" title={person.role}>
                  {person.name}{person.role ? `${t('library:sourceReader.personRoleSeparator')}${person.role}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Secondary metadata stays available without consuming transcript space. */}
        <details
          className="group border-t"
          data-testid="reader-more-metadata"
          open={metadataOpen}
          onToggle={(event) => setMetadataOpen(event.currentTarget.open)}
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            {t('library:sourceReader.moreMetadataSummary')}
          </summary>
          <div className="px-4 pb-3 space-y-3">
          <div className="grid grid-cols-2 @md:grid-cols-3 @xl:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-0.5">{t('library:sourceReader.sizeLabel')}</p>
              <p>{recording.size ? formatBytes(recording.size) : t('library:sourceReader.unknownFallback')}</p>
            </div>
            {recording.quality && recording.quality !== 'unrated' && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t('library:sourceReader.qualityLabel')}</p>
                <p className="capitalize">{recording.quality.replace('-', ' ')}</p>
              </div>
            )}
            {recording.knowledgeCaptureId ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t('library:sourceReader.categoryLabel')}</p>
                <Select
                  value={recording.category || ''}
                  onValueChange={handleCategoryChange}
                  disabled={isSavingCategory}
                >
                  <SelectTrigger className="h-7 text-sm w-[140px]">
                    <SelectValue placeholder={t('library:sourceReader.selectCategoryPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : recording.category ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-0.5">{t('library:sourceReader.categoryLabel')}</p>
                <p className="capitalize">{recording.category}</p>
              </div>
            ) : null}
          </div>

          {recording.knowledgeCaptureId && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">{t('library:sourceReader.projectsLabel')}</p>
              <ProjectAssignmentRow knowledgeCaptureId={recording.knowledgeCaptureId} />
            </div>
          )}
          </div>
        </details>
        </div>
        )}
      </div>
      </ResizablePanel>
      )}

      {/* ===================================================================
          READING AREA — Summary / Transcript, independently scrollable.
          =================================================================== */}
      {showUpperWorkspace && showLowerWorkspace && (
        <ResizableHandle
          withHandle
          className="z-30 h-2 bg-border/60 transition-colors hover:bg-primary/30 focus-visible:bg-primary/30"
          aria-label={t('library:sourceReader.resizeAreasAriaLabel')}
          data-testid="reader-vertical-resize-handle"
        />
      )}
      {showLowerWorkspace && (
      <ResizablePanel
        defaultSize={maximizedSection ? 100 : readerVerticalSizes[1] ?? 36}
        minSize={maximizedSection ? 100 : 24}
        order={2}
      >
      <div className="h-full min-h-0 overflow-y-auto" data-testid="reader-scroll-body">
        <div className="p-6 space-y-4">
          {/* Transcript / Artifact Content */}
          <div>
            {isDeviceOnly(recording) ? (
              <div className="flex items-start gap-3 rounded-lg bg-muted/35 px-4 py-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-300">
                  <CloudDownload className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-medium text-foreground">{t('library:sourceReader.storedOnHidockHeading')}</h3>
                  <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                    {t('library:sourceReader.downloadToPlayMessage')}
                  </p>
                  {!deviceConnected && (
                    <p className="mt-1 text-xs font-medium text-orange-600 dark:text-orange-300">
                      {t('library:sourceReader.connectHidockToStartMessage')}
                    </p>
                  )}
                </div>
              </div>
            ) : !isAudioSource ? (
              <ArtifactReader recording={recording} onAskAboutSource={onAskAboutSource} />
            ) : recording.transcriptionStatus === 'no_speech' ? (
              <div className="mx-auto max-w-xl rounded-lg border border-border/70 bg-muted/30 px-5 py-6 text-center">
                <p className="font-medium text-foreground">{t('library:sourceReader.noIntelligibleSpeechTitle')}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('library:sourceReader.noIntelligibleSpeechMessage')}
                </p>
              </div>
            ) : effectiveTranscript ? (
              <div className="space-y-3">
                {sectionIsVisible('summary') && (
                  <section
                    className={cn(
                      'border-b pb-3',
                      readerSectionModes.summary === 'docked' && 'sticky top-0 z-20 rounded-lg border bg-background px-3 pt-1 shadow-sm'
                    )}
                    aria-label={t('library:sourceReader.summarySectionLabel')}
                  >
                    <ReaderSectionControls
                      section="summary"
                      label={t('library:sourceReader.summarySectionLabel')}
                      mode={readerSectionModes.summary}
                      onModeChange={(mode) => changeSectionMode('summary', mode)}
                      onMaximize={() => toggleMaximizedSection('summary')}
                      maximized={maximizedSection === 'summary'}
                    />
                    {sectionIsOpen('summary') && (
                      <div id="reader-summary-content" className="max-w-[75ch] pt-1 text-sm leading-relaxed text-foreground">
                        {effectiveTranscript.summary
                          ? <p className="whitespace-pre-wrap">{effectiveTranscript.summary}</p>
                          : <p className="text-muted-foreground">{t('library:sourceReader.noSummaryGenerated')}</p>}
                      </div>
                    )}
                  </section>
                )}

                {sectionIsVisible('transcript') && (
                  <section
                    className={cn(
                      readerSectionModes.transcript === 'docked' && 'relative rounded-lg border bg-background px-3 shadow-sm'
                    )}
                    aria-label={t('library:sourceReader.fullTranscriptSectionLabel')}
                  >
                    <div className={cn(readerSectionModes.transcript === 'docked' && 'sticky top-0 z-20 bg-background')}>
                      <ReaderSectionControls
                        section="transcript"
                        label={t('library:sourceReader.fullTranscriptSectionLabel')}
                        mode={readerSectionModes.transcript}
                        onModeChange={(mode) => changeSectionMode('transcript', mode)}
                        onMaximize={() => toggleMaximizedSection('transcript')}
                        maximized={maximizedSection === 'transcript'}
                      />
                    </div>
                    {sectionIsOpen('transcript') && (
                      <div id="reader-transcript-content">
                        <TranscriptViewer
                          transcript={effectiveTranscript.full_text}
                          segments={transcriptSegments}
                          recordingId={recording.id}
                          currentTimeMs={currentTimeMs}
                          isPlaying={isPlaying}
                          highlightRequest={transcriptHighlight}
                          onSeek={handleReaderSeek}
                          showSummary={false}
                          showTranscriptHeader={false}
                          /* H3: action items live in ONE home — the timeline event-list above. */
                          showActionItems={false}
                          actionItems={actionItems}
                          onTranscriptUpdated={handleTranscriptUpdated}
                        />
                      </div>
                    )}
                  </section>
                )}
              </div>
            ) : recording.transcriptionStatus === 'complete' ? (
              <div className="text-center text-muted-foreground py-8">
                <p>{t('library:sourceReader.transcriptNotAvailable')}</p>
              </div>
            ) : recording.transcriptionStatus === 'pending' || recording.transcriptionStatus === 'processing' ? (
              <div className="text-center text-muted-foreground py-8">
                <p>{t('library:sourceReader.transcriptionInProgressDots')}</p>
              </div>
            ) : (
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{t('library:sourceReader.noTranscriptTitle')}</p>
                {canPlay && (
                  <p>
                    {t('library:sourceReader.useTranscribeAboveMessage')}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      </ResizablePanel>
      )}
      </ResizablePanelGroup>

      {/* Meeting link dialog */}
      <RecordingLinkDialog
        recording={linkDialogOpen ? linkDialogRecording : null}
        meeting={meeting}
        open={linkDialogOpen}
        onClose={() => setLinkDialogOpen(false)}
        onResolved={() => {
          // Note: RecordingLinkDialog calls both onResolved and onClose internally
          // Do NOT call setLinkDialogOpen(false) here to avoid double-close
          setMetadataEdited(true)
          onMetadataEdited?.()
        }}
      />

      <ConfirmDialog
        open={showUnlinkConfirmation}
        onOpenChange={setShowUnlinkConfirmation}
        title={t('library:sourceReader.removeMeetingLinkDialogTitle')}
        description={t('library:sourceReader.removeMeetingLinkDialogDescription', {
          subject: meeting?.subject ?? t('library:sourceReader.thisMeetingFallback')
        })}
        actionLabel={t('library:sourceReader.removeLinkActionLabel')}
        cancelLabel={t('library:sourceReader.keepLinkedActionLabel')}
        variant="destructive"
        onConfirm={() => {
          setShowUnlinkConfirmation(false)
          void handleRemoveMeetingLink()
        }}
      />

      {/* Transcription overwrite warning */}
      <ConfirmDialog
        open={showTranscribeWarning}
        onOpenChange={(open) => {
          setShowTranscribeWarning(open)
          if (!open) setPendingTranscribe(null)
        }}
        title={t('library:sourceReader.reprocessRecordingDialogTitle')}
        description={t('library:sourceReader.reprocessRecordingDialogDescription')}
        actionLabel={t('library:sourceReader.continueActionLabel')}
        cancelLabel={t('library:sourceReader.cancelActionLabel')}
        variant="default"
        onConfirm={() => {
          pendingTranscribe?.()
          setPendingTranscribe(null)
          setMetadataEdited(false)
          setShowTranscribeWarning(false)
        }}
      />
    </div>
  )
}

const VISIBLE_PROCESSING_STAGES = new Set<ReaderProcessingRun['stage']>([
  'transcription', 'diarization', 'summary', 'title', 'meeting-resolution', 'speaker-identity', 'voice-id',
  'persistence', 'actionable-detection', 'timeline-analysis', 'org-reconciliation', 'graph-sync',
  'wiki-export', 'rag-indexing'
])

function processingStageLabel(t: TFunction, stage: ReaderProcessingRun['stage']): string {
  switch (stage) {
    case 'meeting-resolution': return t('library:sourceReader.stageMeetingMatch')
    case 'speaker-identity': return t('library:sourceReader.stageSpeakerIdentity')
    case 'voice-id': return t('library:sourceReader.stageVoiceId')
    case 'actionable-detection': return t('library:sourceReader.stageActionables')
    case 'timeline-analysis': return t('library:sourceReader.stageTimeline')
    case 'org-reconciliation': return t('library:sourceReader.stageEntityLinking')
    case 'graph-sync': return t('library:sourceReader.stageKnowledgeGraph')
    case 'wiki-export': return t('library:sourceReader.stageWikiExport')
    case 'rag-indexing': return t('library:sourceReader.stageRagIndexing')
    case 'transcription': return t('library:sourceReader.stageTranscription')
    case 'diarization': return t('library:sourceReader.stageDiarization')
    case 'summary': return t('library:sourceReader.stageSummary')
    case 'title': return t('library:sourceReader.stageTitle')
    case 'persistence': return t('library:sourceReader.stagePersistence')
    // 'metadata' | 'schedule-match' | 'vad' are excluded from
    // VISIBLE_PROCESSING_STAGES and never reach this label — kept as a
    // defensive, untranslated fallback for any future/unlisted stage.
    default: return stage.charAt(0).toUpperCase() + stage.slice(1)
  }
}

function formatProcessingDuration(t: TFunction, durationMs: number | null | undefined): string | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return null
  if (durationMs < 1000) return t('library:sourceReader.durationMs', { value: Math.round(durationMs) })
  if (durationMs < 60_000) {
    return t('library:sourceReader.durationSeconds', { value: (durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0) })
  }
  const minutes = Math.floor(durationMs / 60_000)
  const seconds = Math.round((durationMs % 60_000) / 1000)
  return t('library:sourceReader.durationMinutesSeconds', { minutes, seconds })
}

function processingProviderLabel(t: TFunction, run: ReaderProcessingRun): string {
  if (run.stage === 'diarization' && run.tool && run.tool !== run.provider) return run.tool
  if ((run.stage === 'speaker-identity' || run.stage === 'voice-id') && run.tool) return run.tool
  if (run.provider === 'local-asr') return t('library:sourceReader.providerLocalAsr')
  if (run.provider === 'hidock-next') return t('library:sourceReader.providerHidockNext')
  return run.provider.charAt(0).toUpperCase() + run.provider.slice(1)
}

interface ProviderTimelineEvent {
  phase?: string
  status?: string
  elapsedMs?: number
  chunkIndex?: number
  chunkCount?: number
  audioStartSec?: number
  audioEndSec?: number
  detail?: string
}

function formatAudioOffset(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(wholeSeconds / 60)
  const remainder = wholeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function formatProviderTimeline(t: TFunction, usageJson: string | null | undefined): string[] {
  if (!usageJson) return []
  try {
    const parsed = JSON.parse(usageJson) as { providerTimeline?: ProviderTimelineEvent[] }
    const events = parsed.providerTimeline
    if (!Array.isArray(events) || events.length === 0) return []
    return events
      .filter((event) => event.status !== 'started')
      .map((event) => {
        const chunk = event.chunkIndex && event.chunkCount
          ? t('library:sourceReader.providerTimelineChunk', { index: event.chunkIndex, count: event.chunkCount })
          : t('library:sourceReader.providerTimelineProviderFallback')
        const bounds = Number.isFinite(event.audioStartSec) && Number.isFinite(event.audioEndSec)
          ? ` (${formatAudioOffset(event.audioStartSec!)}-${formatAudioOffset(event.audioEndSec!)})`
          : ''
        const phase = (event.phase || 'request').replaceAll('-', ' ')
        const duration = formatProcessingDuration(t, event.elapsedMs)
        const status = event.status === 'failed' ? t('library:sourceReader.providerTimelineFailedStatus') : duration
        return `${chunk}${bounds} ${phase}: ${status || t('library:sourceReader.providerTimelineDurationNotReported')}${event.detail ? ` - ${event.detail}` : ''}`
      })
  } catch {
    return [t('library:sourceReader.providerTimelineInvalidDiagnostics')]
  }
}

/** Compact, evidence-backed stage attribution. Every chip is backed by an
 * immutable processing_runs row; absent cost/version stays honestly unknown. */
function ProcessingRunChips({ runs }: { runs: ReaderProcessingRun[] }) {
  const { t } = useTranslation()
  const visible = runs.filter((run) => VISIBLE_PROCESSING_STAGES.has(run.stage))
  if (visible.length === 0) return null
  const notReported = t('library:sourceReader.notReported')
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-4 pt-2" data-testid="processing-provenance">
      <span className="mr-0.5 text-[11px] font-medium text-muted-foreground">{t('library:sourceReader.processingTimelineHeading')}</span>
      {visible.map((run) => {
        const provider = processingProviderLabel(t, run)
        const duration = formatProcessingDuration(t, run.duration_ms)
        const providerTimeline = run.stage === 'transcription' ? formatProviderTimeline(t, run.usage_json) : []
        const blocked = run.quality_status === 'blocked'
        const chipSep = t('library:sourceReader.processingChipSeparator')
        const blockedLabel = t('library:sourceReader.processingBlockedStatus')
        const statusSuffix = !blocked && (run.status === 'degraded' || run.status === 'failed')
          ? `${chipSep}${run.status}`
          : ''
        const detail = [
          t('library:sourceReader.processingStageStatusLine', {
            stage: processingStageLabel(t, run.stage),
            status: blocked ? blockedLabel : provider
          }),
          blocked ? t('library:sourceReader.processingAttemptedToolLabel', { value: provider }) : null,
          t('library:sourceReader.processingModelLabel', { value: run.model || notReported }),
          t('library:sourceReader.processingVersionLabel', { value: run.version || notReported }),
          t('library:sourceReader.processingExecutionLabel', { value: run.execution || notReported }),
          run.quality_status ? t('library:sourceReader.processingQualityLabel', { value: run.quality_status }) : null,
          t('library:sourceReader.processingDurationLabel', { value: duration || notReported }),
          run.started_at ? t('library:sourceReader.processingStartedLabel', { value: run.started_at }) : null,
          providerTimeline.length > 0
            ? `${t('library:sourceReader.processingProviderTimelineLabel')}\n${providerTimeline.join('\n')}`
            : null,
          run.estimated_cost_amount != null
            ? t('library:sourceReader.processingCostLabel', {
                value: `${run.estimated_cost_currency || ''} ${run.estimated_cost_amount}`
              })
            : t('library:sourceReader.processingCostNotReported')
        ].filter(Boolean).join('\n')
        return (
          <span
            key={run.id}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
              run.status === 'failed' && 'border-destructive/40 text-destructive',
              run.status === 'degraded' && 'border-amber-500/50 text-amber-600 dark:text-amber-400'
            )}
            title={detail}
            data-stage={run.stage}
            data-provider={run.provider}
          >
            {run.execution === 'local' ? <Cpu className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
            {processingStageLabel(t, run.stage)}{chipSep}{blocked ? blockedLabel : provider}{duration ? `${chipSep}${duration}` : ''}{statusSuffix}
          </span>
        )
      })}
    </div>
  )
}

/**
 * ReaderPlayer — the SINGLE waveform element for the reader.
 *
 * There is never a second copy. The explicit section mode selects a rich timeline
 * or a compact player; measured width reduces the compact player to a scrubber.
 *
 * The morph is animated (max-height + opacity), honoring prefers-reduced-motion
 * via Tailwind's `motion-safe:` variants (instant swap when reduced).
 */
interface ReaderPlayerProps {
  recordingId: string
  filePath?: string
  /** Real recording duration (seconds) — the rich-timeline time axis. */
  durationSec: number
  speakerRanges: DerivedSpeakerRange[]
  events?: TimelineEvent[]
  /** Rich per-event details (full text + metadata + editability) for the list. */
  eventDetails?: Record<string, TimelineEventDetail>
  /** Persist an edit for an editable event; resolves true when saved. */
  onEventUpdate?: (event: TimelineEvent, patch: TimelineEventPatch) => Promise<boolean>
  sentiment?: SentimentScorePoint[]
  analyzing: boolean
  /**
   * The timeline backfill failed. 'permanent' = needs the user's attention
   * (manual Retry only); 'transient' = will auto-retry when the recording is
   * next reopened (Retry now still offered).
   */
  analysisFailure?: 'permanent' | 'transient' | null
  /** Explicit user retry for a failed timeline analysis. */
  onRetryAnalysis?: () => void
  presentation: 'expanded' | 'compact'
  onSeek: (sec: number) => void
  /** User-selected cut position, rendered independently from the playhead. */
  splitPointSec?: number
  /** A numbered marker / event-list row was activated (B1 cross-highlight). */
  onEventClick?: (event: TimelineEvent) => void
}

function ReaderPlayer({
  recordingId,
  filePath,
  durationSec,
  speakerRanges,
  events,
  eventDetails,
  onEventUpdate,
  sentiment,
  analyzing,
  analysisFailure = null,
  onRetryAnalysis,
  presentation,
  onSeek,
  splitPointSec,
  onEventClick,
}: ReaderPlayerProps) {
  const { t } = useTranslation()
  const regionRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)

  const big = presentation === 'expanded'
  const narrow = width != null && width < NARROW_WIDTH_BREAKPOINT
  const mode: WaveformPlayerMode = big ? 'full' : narrow ? 'scrubber' : 'pill'

  // Track the reader pane width to choose the docked bar vs. the bare scrubber.
  useLayoutEffect(() => {
    const el = regionRef.current
    if (!el) return
    const measure = () => setWidth(el.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure)
      ro.observe(el)
      return () => ro.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Animate height between big and docked by measuring the live content height.
  // Only cap when we have a real measurement, so the player is never clipped to 0
  // (jsdom/SSR report scrollHeight 0 → leave it uncapped and fully visible).
  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const sync = () => {
      const h = el.scrollHeight
      if (h > 0) setMaxHeight(h)
    }
    sync()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(sync)
      ro.observe(el)
      return () => ro.disconnect()
    }
    return
  }, [mode, big, narrow])

  return (
    <div ref={regionRef} className="relative flex items-start gap-1" data-testid="reader-player-region">
      <div
        className="relative min-w-0 flex-1 overflow-hidden rounded-lg motion-safe:transition-[max-height] motion-safe:duration-300 motion-safe:ease-out"
        style={{ maxHeight }}
      >
        <div ref={innerRef} className="motion-safe:transition-opacity motion-safe:duration-200">
          <WaveformPlayer
            mode={mode}
            fluid
            recordingId={recordingId}
            filePath={filePath}
            durationSec={durationSec}
            speakerRanges={big ? speakerRanges : undefined}
            events={big ? events : undefined}
            eventDetails={big ? eventDetails : undefined}
            onEventUpdate={onEventUpdate}
            sentiment={big ? sentiment : undefined}
            onSeek={onSeek}
            splitPointSec={splitPointSec}
            onEventClick={onEventClick}
          />
        </div>

        {/* Subtle backfill indicator — sentiment + markers are still computing.
            Colored bars + playhead already render; this just explains the wait. */}
        {big && analyzing && (
          <div
            className="pointer-events-none absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full border bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur"
            data-testid="timeline-analyzing"
            role="status"
          >
            <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
            {t('library:readerPlayer.analyzingTimeline')}
          </div>
        )}

        {/* Failed backfill — honest, DIFFERENTIATED state. Permanent failures
            (auth/quota/invalid-input, or exhausted unknowns) need the user;
            transient ones say exactly when they'll retry (on reopen — the
            policy is timer-free). The explicit Retry works in both cases. */}
        {big && !analyzing && analysisFailure && (
          <div
            className="absolute left-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-full border bg-background/90 px-2 py-0.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur"
            data-testid="timeline-analysis-failed"
            data-failure={analysisFailure}
            role="status"
          >
            {analysisFailure === 'permanent'
              ? t('library:readerPlayer.needsAttentionMessage')
              : t('library:readerPlayer.willRetryMessage')}
            <button
              type="button"
              onClick={onRetryAnalysis}
              className="rounded font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              data-testid="timeline-analysis-retry"
            >
              {analysisFailure === 'permanent' ? t('library:readerPlayer.retryButton') : t('library:readerPlayer.retryNowButton')}
            </button>
          </div>
        )}
      </div>

    </div>
  )
}

/**
 * Projects assignment for a captured recording. Shows chips of assigned projects
 * (projects.getForKnowledge) and a popover picker of all projects with checkboxes
 * (knowledge.setProjects persists the change). Own component so its hooks stay
 * isolated from SourceReader's conditional early return.
 */
function ProjectAssignmentRow({ knowledgeCaptureId }: { knowledgeCaptureId: string }) {
  const { t } = useTranslation()
  const [assigned, setAssigned] = useState<PickerProject[]>([])
  const [allProjects, setAllProjects] = useState<PickerProject[]>([])
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadAssigned = useCallback(async () => {
    try {
      const res = await window.electronAPI.projects.getForKnowledge(knowledgeCaptureId)
      setAssigned(res.success ? res.data : [])
    } catch (err) {
      console.error('Failed to load assigned projects:', err)
      setAssigned([])
    }
  }, [knowledgeCaptureId])

  useEffect(() => {
    loadAssigned()
  }, [loadAssigned])

  const loadAll = useCallback(async () => {
    try {
      const res = await window.electronAPI.projects.getAll({ status: 'all' })
      if (res.success) setAllProjects(res.data.projects)
    } catch (err) {
      console.error('Failed to load projects:', err)
    }
  }, [])

  // Memoized so it doesn't rebuild every render (which would churn the
  // toggleProject callback's deps).
  const assignedIds = useMemo(() => new Set(assigned.map((p) => p.id)), [assigned])

  const toggleProject = useCallback(async (projectId: string) => {
    const nextIds = new Set(assignedIds)
    if (nextIds.has(projectId)) nextIds.delete(projectId)
    else nextIds.add(projectId)
    setSaving(true)
    try {
      const res = await window.electronAPI.knowledge.setProjects({
        knowledgeCaptureId,
        projectIds: Array.from(nextIds)
      })
      if (res.success) {
        setAssigned(allProjects.filter((p) => nextIds.has(p.id)))
      } else {
        toast.error(t('library:projectAssignmentRow.updateFailedTitle'))
      }
    } catch (err) {
      console.error('Failed to set projects:', err)
      toast.error(t('library:projectAssignmentRow.updateFailedTitle'))
    } finally {
      setSaving(false)
    }
  }, [assignedIds, allProjects, knowledgeCaptureId, t])

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {assigned.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs border border-primary/20"
        >
          <Folder className="h-3 w-3" />
          {p.name}
        </span>
      ))}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) loadAll()
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-6 gap-1 text-xs" title={t('library:projectAssignmentRow.assignToProjectsTitle')}>
            <Plus className="h-3 w-3" />
            {assigned.length === 0 ? t('library:projectAssignmentRow.assignProjectButton') : t('library:projectAssignmentRow.editButton')}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <p className="text-xs font-semibold text-muted-foreground px-2 py-1">{t('library:projectAssignmentRow.assignToProjectsTitle')}</p>
          <div className="max-h-64 overflow-auto">
            {allProjects.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-2">{t('library:projectAssignmentRow.noProjectsYet')}</p>
            ) : (
              allProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => toggleProject(p.id)}
                  disabled={saving}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <span className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border shrink-0",
                    assignedIds.has(p.id) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
                  )}>
                    {assignedIds.has(p.id) && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{p.name}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/**
 * Speaker chips — "who actually spoke" as actionable diarization chips.
 *
 * Each chip's affordance follows the recording's resolved speaker map:
 *  - Resolved to a contact  → the chip is the person's name, links to their page
 *    (/person/:id), and hovers into a PersonHoverCard.
 *  - Unresolved diarization label ("Speaker 3") → the chip opens the SAME
 *    SpeakerAssignPopover the transcript uses, so it can be named/reassigned in
 *    place. Because names come from the resolved map, a correction made here (or
 *    in the transcript) shows in both lists.
 *
 * Uses useNavigate, so it is only mounted when there are participants to show —
 * keeping the reader Router-independent for a bare recording.
 */
function ParticipantsChips({
  participants,
  contacts,
  colorByKey,
  onOpenPicker,
  onAssign,
  onUnassign,
}: {
  participants: ParticipantChip[]
  contacts: import('@/types/knowledge').Person[]
  /** speakerKey → color, so a chip shows the SAME swatch as its waveform bars. */
  colorByKey?: Map<string, string>
  onOpenPicker: () => void
  onAssign: (effectiveLabel: string, turnIndex: number, scope: AssignScope, payload: { contactId?: string; newName?: string }) => void
  onUnassign: (effectiveLabel: string, turnIndex: number) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        {t('library:participantsChips.speakersHeading', { count: participants.length })}
        <span className="font-normal text-muted-foreground/70">{t('library:participantsChips.fromTranscriptsLabel')}</span>
      </p>
      <div className="flex flex-wrap gap-1.5">
        {participants.map((p) => {
          const viewTitle =
            p.turnCount > 0
              ? t('library:participantsChips.viewPersonWithTurnsTitle', { name: p.name, count: p.turnCount })
              : t('library:participantsChips.viewPersonTitle', { name: p.name })
          const identifyTitle =
            p.turnCount > 0
              ? t('library:participantsChips.identifyPersonWithTurnsTitle', { name: p.name, count: p.turnCount })
              : t('library:participantsChips.identifyPersonTitle', { name: p.name })
          const swatch = colorByKey?.get(p.key)
          if (p.contactId) {
            // Resolved to a known person → link to their page, hover for details.
            return (
              <HoverCard key={p.key}>
                <HoverCardTrigger asChild>
                  <button
                    type="button"
                    onClick={() => navigate(`/person/${p.contactId}`)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    title={viewTitle}
                  >
                    {swatch && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: swatch }} aria-hidden="true" />}
                    {p.name}
                  </button>
                </HoverCardTrigger>
                <HoverCardContent align="start" className="w-64">
                  <PersonHoverCard id={p.contactId} name={p.name} />
                </HoverCardContent>
              </HoverCard>
            )
          }
          // Unresolved diarization label → assign/rename in place.
          return (
            <span
              key={p.key}
              className="inline-flex items-center gap-1 rounded-full bg-secondary/60 px-2 py-0.5 text-xs"
              title={identifyTitle}
            >
              {swatch && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: swatch }} aria-hidden="true" />}
              <SpeakerAssignPopover
                label={p.effectiveLabel}
                turnIndex={p.firstTurnIndex}
                assignedContactId={undefined}
                assignedName={undefined}
                assignmentScope={undefined}
                contacts={contacts}
                onOpen={onOpenPicker}
                onAssign={(scope, payload) => onAssign(p.effectiveLabel, p.firstTurnIndex, scope, payload)}
                onUnassign={() => onUnassign(p.effectiveLabel, p.firstTurnIndex)}
                canSplitHere={false}
                hasSplitHere={false}
                onSplit={() => {}}
                onMergeSplit={() => {}}
                mergeSuspected={p.mergeSuspected}
              />
            </span>
          )
        })}
      </div>
    </div>
  )
}

/**
 * InvitedChips — the calendar-invited attendees (meeting.attendees). This is who
 * was INVITED, which is DIFFERENT from who spoke; the two lists are shown
 * separately. Attendees resolve to a contact where possible (deep-linkable), and
 * a "spoke" tag marks the invited people we can map to a transcript speaker.
 */
function InvitedChips({
  invited,
  resolveAttendee,
  spokeKey,
}: {
  invited: MeetingAttendee[]
  resolveAttendee: (a: MeetingAttendee) => import('@/types').Contact | undefined
  spokeKey: (a: MeetingAttendee, contactId?: string) => boolean
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
        {t('library:invitedChips.invitedHeading', { count: invited.length })}
        <span className="font-normal text-muted-foreground/70">{t('library:invitedChips.fromCalendarLabel')}</span>
      </p>
      {invited.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {invited.map((a, i) => {
            const contact = resolveAttendee(a)
            const label = a.name || a.email || t('library:invitedChips.unknownFallback')
            const spoke = spokeKey(a, contact?.id)
            const spokeTag = spoke ? (
              <span className="ml-1 rounded bg-primary/15 px-1 text-[10px] font-medium text-primary" title={t('library:invitedChips.mappedToSpeakerTitle')}>
                {t('library:invitedChips.spokeTagLabel')}
              </span>
            ) : null
            return contact ? (
              <button
                key={`inv-${i}`}
                type="button"
                onClick={() => navigate(`/person/${contact.id}`)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                title={t('library:invitedChips.viewPersonTitle', { label })}
              >
                {label}
                {spokeTag}
              </button>
            ) : (
              <span
                key={`inv-${i}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground text-xs"
                title={label}
              >
                {label}
                {spokeTag}
              </span>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/70 italic">
          {t('library:invitedChips.noInviteListMessage')}
        </p>
      )}
    </div>
  )
}
