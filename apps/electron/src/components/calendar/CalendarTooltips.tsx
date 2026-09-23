/**
 * Tooltip content components for calendar recordings and meetings
 */

import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Mic, Cloud, HardDrive, Check, Link2Off } from 'lucide-react'
import { cn, formatTime } from '@/lib/utils'
import type { CalendarRecording, CalendarMeetingOverlay, CalendarMeeting } from '@/lib/calendar-utils'
import { formatDurationStr as formatDuration } from '@/lib/calendar-utils'
import { useMeetingParticipants, participantFirstName } from '@/lib/meeting-participants'

type RecordingLocation = 'device-only' | 'local-only' | 'both'

const TOOLTIP_PARTICIPANT_LIMIT = 4

/**
 * Compact "Participants:" line fed by the known contacts for a meeting. Fetches
 * lazily when the tooltip mounts (results cached module-side); renders nothing
 * when the meeting id is missing or has no known participants.
 */
const ParticipantsLine = memo(function ParticipantsLine({ meetingId }: { meetingId: string | undefined }) {
  const { t } = useTranslation()
  const { participants } = useMeetingParticipants(meetingId)
  if (!meetingId || participants.length === 0) return null
  const names = participants.slice(0, TOOLTIP_PARTICIPANT_LIMIT).map(participantFirstName)
  const extra = participants.length - names.length
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground">{t('calendar:tooltips.participantsLabel')}</span>
      <span className="truncate">
        {names.join(t('calendar:tooltips.listSeparator'))}
        {extra > 0 ? ` +${extra}` : ''}
      </span>
    </div>
  )
})

/**
 * Status icon for recording location
 */
export const StatusIcon = memo(function StatusIcon({ location }: { location: RecordingLocation }) {
  switch (location) {
    case 'device-only':
      return <Cloud className="h-3 w-3 text-orange-500" />
    case 'local-only':
      return <HardDrive className="h-3 w-3 text-blue-500" />
    case 'both':
      return <Check className="h-3 w-3 text-green-500" />
  }
})

/**
 * Recording-centric tooltip (RECORDING INFO FIRST, meeting as metadata)
 */
export const RecordingTooltipContent = memo(function RecordingTooltipContent({ recording }: { recording: CalendarRecording }) {
  const { t } = useTranslation()
  const title = recording.title?.trim()
  const summary = recording.summary?.trim()
  return (
    <div className="space-y-2 max-w-[280px]">
      {/* WHAT IT IS - lead with the transcript-derived identity when known */}
      {(title || summary) && (
        <div className="space-y-1 pb-1">
          {title && <div className="font-semibold text-foreground leading-snug">{title}</div>}
          {summary && <div className="text-xs text-muted-foreground line-clamp-2">{summary}</div>}
        </div>
      )}

      {/* RECORDING INFO */}
      <div className={cn('space-y-1', (title || summary) && 'border-t pt-2')}>
        <div className="font-semibold text-foreground flex items-center gap-2">
          <Mic className="h-4 w-4 text-emerald-500" />
          {t('calendar:tooltips.recordingHeading')}
        </div>
        <div className="text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('calendar:tooltips.fileLabel')}</span>
            <span className="font-mono text-[11px] truncate">{recording.filename}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('calendar:tooltips.recordedLabel')}</span>
            <span>
              {formatTime(recording.startTime.toISOString())} - {formatTime(recording.endTime.toISOString())}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('calendar:tooltips.durationLabel')}</span>
            <span className="font-medium">{formatDuration(recording.durationSeconds)}</span>
          </div>
          {/* Location status */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('calendar:tooltips.statusLabel')}</span>
            <span
              className={cn(
                'flex items-center gap-1',
                recording.location === 'device-only' && 'text-orange-500',
                recording.location === 'local-only' && 'text-blue-500',
                recording.location === 'both' && 'text-green-500'
              )}
            >
              <StatusIcon location={recording.location} />
              {recording.location === 'device-only' && t('calendar:tooltips.onDeviceOnly')}
              {recording.location === 'local-only' && t('calendar:tooltips.downloaded')}
              {recording.location === 'both' && t('calendar:tooltips.synced')}
            </span>
          </div>
          {/* Transcription status */}
          {recording.transcriptionStatus !== 'none' && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('calendar:tooltips.transcriptLabel')}</span>
              <span
                className={cn(
                  recording.transcriptionStatus === 'complete' && 'text-green-500',
                  recording.transcriptionStatus === 'processing' && 'text-yellow-500',
                  recording.transcriptionStatus === 'error' && 'text-red-500'
                )}
              >
                {recording.transcriptionStatus}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* MEETING INFO - SECONDARY/METADATA */}
      {recording.linkedMeeting && (
        <div className="pt-2 border-t border-dashed space-y-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{t('calendar:tooltips.linkedMeetingHeading')}</div>
          <div className="text-xs space-y-1">
            <div className="font-medium">{recording.linkedMeeting.subject}</div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>{t('calendar:tooltips.scheduledLabel')}</span>
              <span>
                {formatTime(recording.linkedMeeting.startTime.toISOString())} -{' '}
                {formatTime(recording.linkedMeeting.endTime.toISOString())}
              </span>
            </div>
            {recording.linkedMeeting.organizer && (
              <div className="text-muted-foreground truncate">{t('calendar:tooltips.byOrganizer', { organizer: recording.linkedMeeting.organizer })}</div>
            )}
            <ParticipantsLine meetingId={recording.linkedMeeting.id} />
          </div>
        </div>
      )}

      {!recording.linkedMeeting && (
        <div className="pt-2 border-t border-dashed">
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Link2Off className="h-3 w-3" aria-hidden="true" />
            {t('calendar:tooltips.unlinkedLabel')}
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground pt-1 border-t">
        {recording.linkedMeeting ? t('calendar:tooltips.clickToOpenMeeting') : t('calendar:tooltips.clickToReviewAssign')}
      </div>
    </div>
  )
})

/**
 * Meeting overlay tooltip (for meetings without recordings - dashed display)
 */
export const MeetingOverlayTooltipContent = memo(function MeetingOverlayTooltipContent({ meeting }: { meeting: CalendarMeetingOverlay }) {
  const { t } = useTranslation()
  const duration = (meeting.endTime.getTime() - meeting.startTime.getTime()) / 1000
  return (
    <div className="space-y-2 max-w-[280px]">
      {/* Names the dashed ghost state up front (mirrors the legend entry). */}
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <span className="h-2 w-2 rounded-full border border-dashed border-slate-400" aria-hidden="true" />
        {t('calendar:tooltips.scheduledNotRecorded')}
      </div>
      <div className="font-semibold text-foreground">{meeting.subject}</div>
      <div className="text-xs space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('calendar:tooltips.scheduledLabel')}</span>
          <span>
            {formatTime(meeting.startTime.toISOString())} - {formatTime(meeting.endTime.toISOString())}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('calendar:tooltips.durationLabel')}</span>
          <span>{formatDuration(duration)}</span>
        </div>
        {meeting.organizer && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('calendar:tooltips.organizerLabel')}</span>
            <span className="truncate">{meeting.organizer}</span>
          </div>
        )}
        <ParticipantsLine meetingId={meeting.id} />
      </div>
    </div>
  )
})

/**
 * Legacy meeting tooltip (for backwards compatibility)
 */
export const MeetingTooltipContent = memo(function MeetingTooltipContent({ meeting }: { meeting: CalendarMeeting }) {
  const { t } = useTranslation()
  const startTime = new Date(meeting.start_time)
  const endTime = new Date(meeting.end_time)
  const meetingDurationSeconds = (endTime.getTime() - startTime.getTime()) / 1000

  return (
    <div className="space-y-2 max-w-[280px]">
      <div className="font-semibold text-foreground">{meeting.subject}</div>
      <div className="text-xs space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('calendar:tooltips.timeLabel')}</span>
          <span>
            {formatTime(meeting.start_time)} - {formatTime(meeting.end_time)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{t('calendar:tooltips.scheduledLabel')}</span>
          <span>{formatDuration(meetingDurationSeconds)}</span>
        </div>
        {meeting.hasRecording && meeting.recordingDurationSeconds && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('calendar:tooltips.recordedLabel')}</span>
            <span>{formatDuration(meeting.recordingDurationSeconds)}</span>
          </div>
        )}
        {meeting.organizer_name && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('calendar:tooltips.organizerLabel')}</span>
            <span className="truncate">{meeting.organizer_name}</span>
          </div>
        )}
        {meeting.location && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('calendar:tooltips.locationLabel')}</span>
            <span className="truncate">{meeting.location}</span>
          </div>
        )}
        {meeting.hasRecording && (
          <div className="flex items-center gap-2 text-green-500">
            <Mic className="h-3 w-3" />
            <span>{t('calendar:tooltips.recordingAvailable')}</span>
          </div>
        )}
        {!meeting.hasRecording && !meeting.isPlaceholder && (
          <div className="text-amber-500 italic">{t('calendar:tooltips.noRecordingCaptured')}</div>
        )}
      </div>
      <div className="text-xs text-muted-foreground pt-1 border-t">{t('calendar:tooltips.clickForDetails')}</div>
    </div>
  )
})
