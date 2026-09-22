/**
 * SourceDetailDrawer Component
 *
 * A slide-out drawer for viewing and interacting with a Source's details.
 * Shows transcript, summary, metadata, and provides actions.
 */

import { useEffect, useRef, useState } from 'react'
import { Play, Pause, FileText, Wand2, Calendar, Download, Trash2, ExternalLink, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AudioPlayer } from '@/components/AudioPlayer'
import { formatDateTime, formatDuration } from '@/lib/utils'
import { parseJsonArray } from '@/types'
import { UnifiedRecording, hasLocalPath, isDeviceOnly } from '@/types/unified-recording'
import { useLibraryStore } from '@/store/useLibraryStore'
import { getRecoveryAction } from '@/features/library/utils/errorHandling'
import { TranscriptionStatusBadge } from './TranscriptionStatusBadge'

interface Transcript {
  id: string
  recording_id: string
  full_text: string
  language: string
  summary: string | null
  action_items: string | null
  topics: string | null
  key_points: string | null
  sentiment: string | null
  speakers: string | null
  word_count: number | null
  transcription_provider: string | null
  transcription_model: string | null
  title_suggestion: string | null
  question_suggestions: string | null
  created_at: string
}

interface Meeting {
  id: string
  subject: string
  start_time: string
}

interface SourceDetailDrawerProps {
  source: UnifiedRecording | null
  transcript?: Transcript
  meeting?: Meeting
  isOpen: boolean
  isPlaying: boolean
  onClose: () => void
  onPlay: () => void
  onStop: () => void
  onTranscribe: () => void
  onDownload: () => void
  onDelete: () => void
  onNavigateToMeeting?: (meetingId: string) => void
  onAskAssistant?: () => void
  deviceConnected: boolean
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function SourceDetailDrawer({
  source,
  transcript,
  meeting,
  isOpen,
  isPlaying,
  onClose,
  onPlay,
  onStop,
  onTranscribe,
  onDownload,
  onDelete,
  onNavigateToMeeting,
  onAskAssistant,
  deviceConnected
}: SourceDetailDrawerProps) {
  const { t } = useTranslation()
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [errorDetailsExpanded, setErrorDetailsExpanded] = useState(false)

  const error = useLibraryStore((state) => (source ? state.recordingErrors.get(source.id) : undefined))
  const clearRecordingError = useLibraryStore((state) => state.clearRecordingError)

  const recoveryAction = error ? getRecoveryAction(error.type) : null

  // Focus management: store focus and restore on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus()
      previousFocusRef.current = null
    }
  }, [isOpen])

  if (!source) return null

  const canPlay = hasLocalPath(source)
  const needsDownload = isDeviceOnly(source)
  const needsTranscription =
    hasLocalPath(source) &&
    (source.transcriptionStatus === 'none' || source.transcriptionStatus === 'no_speech' || source.transcriptionStatus === 'error')

  const handleRetry = () => {
    if (!source) return
    clearRecordingError(source.id)
    if (recoveryAction?.action === 'retry') {
      if (error?.type.includes('transcription')) {
        onTranscribe()
      } else if (error?.type.includes('download')) {
        onDownload()
      }
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="w-full sm:max-w-md md:max-w-lg overflow-y-auto"
        aria-describedby="source-detail-description"
      >
        <SheetHeader className="space-y-1">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg font-semibold pr-8 truncate">
              {source.title || source.filename}
            </SheetTitle>
          </div>
          <SheetDescription id="source-detail-description">
            {formatDateTime(source.dateRecorded.toISOString())}
            {source.size && `${t('library:sourceDetailDrawer.metaSeparator')}${formatBytes(source.size)}`}
            {source.duration && `${t('library:sourceDetailDrawer.metaSeparator')}${formatDuration(source.duration)}`}
          </SheetDescription>
        </SheetHeader>

        {/* Status badges */}
        <div className="flex flex-wrap gap-2 mt-4">
          {/* Location badge */}
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              source.location === 'device-only'
                ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                : source.location === 'local-only'
                  ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                  : 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
            }`}
          >
            {source.location === 'device-only'
              ? t('library:sourceDetailDrawer.locationDeviceOnly')
              : source.location === 'local-only'
                ? t('library:sourceDetailDrawer.locationLocal')
                : t('library:sourceDetailDrawer.locationSynced')}
          </span>

          {/* Transcription status badge */}
          <TranscriptionStatusBadge status={source.transcriptionStatus} />

          {/* Quality badge */}
          {source.quality && (
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                source.quality === 'valuable'
                  ? 'bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
                  : source.quality === 'archived'
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                    : 'bg-secondary'
              }`}
            >
              {source.quality}
            </span>
          )}
        </div>

        {/* Location details - expanded */}
        <div className="space-y-2 mt-4 p-3 border rounded-lg bg-muted/30">
          <h4 className="text-sm font-medium">{t('library:sourceDetailDrawer.fileLocationHeading')}</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-muted-foreground">{t('library:sourceDetailDrawer.onDeviceLabel')}</span>
              <span className="ml-2 font-medium">
                {source.location === 'device-only' || source.location === 'both'
                  ? t('library:sourceDetailDrawer.checkYes')
                  : t('library:sourceDetailDrawer.crossNo')}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('library:sourceDetailDrawer.downloadedLabel')}</span>
              <span className="ml-2 font-medium">
                {source.location === 'local-only' || source.location === 'both'
                  ? t('library:sourceDetailDrawer.checkYes')
                  : t('library:sourceDetailDrawer.crossNo')}
              </span>
            </div>
          </div>
          {source.location === 'device-only' && 'deviceFilename' in source && (
            <p className="text-xs text-muted-foreground mt-2">
              <span className="font-medium">{t('library:sourceDetailDrawer.deviceFilenameLabel')}</span> {source.deviceFilename}
            </p>
          )}
          {('localPath' in source) && source.localPath && (
            <p className="text-xs text-muted-foreground break-all mt-2">
              <span className="font-medium">{t('library:sourceDetailDrawer.localPathLabel')}</span> {source.localPath}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mt-4 border-b pb-4">
          {/* Play/Stop */}
          <Button
            variant="outline"
            size="sm"
            onClick={isPlaying ? onStop : onPlay}
            disabled={!canPlay}
            className="gap-2"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isPlaying ? t('library:sourceDetailDrawer.stopButton') : t('library:sourceDetailDrawer.playButton')}
          </Button>

          {/* Download */}
          {needsDownload && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDownload}
              disabled={!deviceConnected}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {t('library:sourceDetailDrawer.downloadButton')}
            </Button>
          )}

          {/* Transcribe */}
          {needsTranscription && (
            <Button variant="outline" size="sm" onClick={onTranscribe} className="gap-2">
              <Wand2 className="h-4 w-4" />
              {t('library:sourceDetailDrawer.transcribeButton')}
            </Button>
          )}

          {/* Ask Assistant */}
          {onAskAssistant && (
            <Button variant="outline" size="sm" onClick={onAskAssistant} className="gap-2">
              <FileText className="h-4 w-4" />
              {t('library:sourceDetailDrawer.askAssistantButton')}
            </Button>
          )}

          {/* Delete */}
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={source.location === 'device-only' && !deviceConnected}
            className="gap-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            {t('library:sourceDetailDrawer.deleteButton')}
          </Button>
        </div>

        {/* Error message with retry */}
        {error && (
          <div className="mt-4 border-t pt-4">
            <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-900 dark:text-red-100">{error.message}</p>
                {error.details && <p className="text-xs text-red-700 dark:text-red-300 mt-1">{error.details}</p>}

                {/* Expandable error details */}
                <button
                  onClick={() => setErrorDetailsExpanded(!errorDetailsExpanded)}
                  className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 mt-2 hover:underline"
                >
                  {errorDetailsExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {errorDetailsExpanded
                    ? t('library:sourceDetailDrawer.hideDetails')
                    : t('library:sourceDetailDrawer.showDetails')}
                </button>

                {errorDetailsExpanded && (
                  <div className="mt-2 p-2 bg-red-100 dark:bg-red-900 rounded text-xs space-y-1">
                    <div><span className="font-medium">{t('library:sourceDetailDrawer.errorTypeLabel')}</span> {error.type}</div>
                    <div>
                      <span className="font-medium">{t('library:sourceDetailDrawer.recoverableLabel')}</span>{' '}
                      {error.recoverable ? t('library:sourceDetailDrawer.yes') : t('library:sourceDetailDrawer.no')}
                    </div>
                    <div>
                      <span className="font-medium">{t('library:sourceDetailDrawer.retryableLabel')}</span>{' '}
                      {error.retryable ? t('library:sourceDetailDrawer.yes') : t('library:sourceDetailDrawer.no')}
                    </div>
                    {error.sourceId && (
                      <div><span className="font-medium">{t('library:sourceDetailDrawer.sourceIdLabel')}</span> {error.sourceId}</div>
                    )}
                  </div>
                )}
              </div>
              {error.retryable && recoveryAction && (
                <Button variant="outline" size="sm" onClick={handleRetry} className="shrink-0">
                  {recoveryAction.label}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Audio Player (sticky when playing) */}
        {isPlaying && canPlay && (
          <div className="sticky top-0 bg-background z-10 py-4 border-b">
            <AudioPlayer recordingId={source.id} filename={source.filename} onClose={onStop} />
          </div>
        )}

        {/* Linked Meeting */}
        {meeting && onNavigateToMeeting && (
          <div
            className="flex items-center gap-2 p-3 mt-4 bg-muted rounded-lg cursor-pointer hover:bg-muted/80"
            onClick={() => onNavigateToMeeting(meeting.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onNavigateToMeeting(meeting.id)}
          >
            <Calendar className="h-4 w-4 text-primary" />
            <div className="flex-1">
              <p className="text-sm font-medium">{meeting.subject}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(meeting.start_time)}</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        {/* Content Tabs */}
        {transcript ? (
          <Tabs defaultValue="transcript" className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="transcript" className="flex-1">
                {t('library:sourceDetailDrawer.transcriptTab')}
              </TabsTrigger>
              <TabsTrigger value="summary" className="flex-1">
                {t('library:sourceDetailDrawer.summaryTab')}
              </TabsTrigger>
              <TabsTrigger value="details" className="flex-1">
                {t('library:sourceDetailDrawer.detailsTab')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transcript" className="mt-4 space-y-4">
              {/* Summary */}
              {transcript.summary && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('library:sourceDetailDrawer.summaryHeading')}</p>
                  <p className="text-sm">{transcript.summary}</p>
                </div>
              )}

              {/* Full transcript */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  {transcript.word_count
                    ? t('library:sourceDetailDrawer.fullTranscriptHeadingWithCount', { count: transcript.word_count })
                    : t('library:sourceDetailDrawer.fullTranscriptHeading')}
                </p>
                <div className="p-3 bg-muted rounded-lg max-h-96 overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">{transcript.full_text}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="summary" className="mt-4 space-y-4">
              {/* Action Items */}
              {transcript.action_items && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t('library:sourceDetailDrawer.actionItemsHeading')}</p>
                  <ul className="list-disc list-inside text-sm space-y-1 bg-muted p-3 rounded-lg">
                    {parseJsonArray<string>(transcript.action_items).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Key Points */}
              {transcript.key_points && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t('library:sourceDetailDrawer.keyPointsHeading')}</p>
                  <ul className="list-disc list-inside text-sm space-y-1 bg-muted p-3 rounded-lg">
                    {parseJsonArray<string>(transcript.key_points).map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Topics */}
              {transcript.topics && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">{t('library:sourceDetailDrawer.topicsHeading')}</p>
                  <div className="flex flex-wrap gap-1">
                    {parseJsonArray<string>(transcript.topics).map((topic, i) => (
                      <span key={i} className="px-2 py-0.5 bg-secondary text-xs rounded-full">
                        {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {!transcript.action_items && !transcript.key_points && !transcript.topics && (
                <p className="text-sm text-muted-foreground">{t('library:sourceDetailDrawer.noSummaryData')}</p>
              )}
            </TabsContent>

            <TabsContent value="details" className="mt-4">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{t('library:sourceDetailDrawer.filenameDetailLabel')}</dt>
                  <dd className="mt-1">{source.filename}</dd>
                </div>
                {source.duration && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">{t('library:sourceDetailDrawer.durationLabel')}</dt>
                    <dd className="mt-1">{formatDuration(source.duration)}</dd>
                  </div>
                )}
                {source.size && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">{t('library:sourceDetailDrawer.sizeDetailLabel')}</dt>
                    <dd className="mt-1">{formatBytes(source.size)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{t('library:sourceDetailDrawer.recordedLabel')}</dt>
                  <dd className="mt-1">{formatDateTime(source.dateRecorded.toISOString())}</dd>
                </div>
                {transcript.language && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">{t('library:sourceDetailDrawer.languageLabel')}</dt>
                    <dd className="mt-1">{transcript.language}</dd>
                  </div>
                )}
                {transcript.transcription_provider && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">{t('library:sourceDetailDrawer.transcriptionProviderLabel')}</dt>
                    <dd className="mt-1">
                      {transcript.transcription_provider}
                      {transcript.transcription_model && ` (${transcript.transcription_model})`}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">{t('library:sourceDetailDrawer.transcribedLabel')}</dt>
                  <dd className="mt-1">{formatDateTime(transcript.created_at)}</dd>
                </div>
              </dl>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="mt-4">
            {needsDownload ? (
              <div className="text-center py-8 text-muted-foreground">
                <Download className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">{t('library:sourceDetailDrawer.downloadPromptMessage')}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDownload}
                  disabled={!deviceConnected}
                  className="mt-4"
                >
                  {t('library:sourceDetailDrawer.downloadFromDeviceButton')}
                </Button>
              </div>
            ) : needsTranscription ? (
              <div className="text-center py-8 text-muted-foreground">
                <Wand2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">{t('library:sourceDetailDrawer.notTranscribedMessage')}</p>
                <Button variant="outline" size="sm" onClick={onTranscribe} className="mt-4">
                  {t('library:sourceDetailDrawer.startTranscriptionButton')}
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">{t('library:sourceDetailDrawer.noTranscriptAvailable')}</p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
