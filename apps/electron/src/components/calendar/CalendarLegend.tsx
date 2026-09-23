/**
 * CalendarLegend — click-to-open key for the calendar's visual language.
 *
 * Discoverable (a labeled trigger, not hover-only), mirroring the category legend
 * on Today and the StatusLegend on Library. Explains, in one place, everything the
 * eye has to decode on the timeline: the meeting-category colors, the "recorded"
 * badge, the location glyphs on that badge, the unmatched-recording block, and the
 * dashed "scheduled but not recorded" ghost state.
 */

import { useTranslation } from 'react-i18next'
import { Info, Mic, Cloud, HardDrive, Check, Link2Off } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { MEETING_CATEGORY_LABELS } from '@/lib/meeting-timing'
import { CATEGORY_DOT, CATEGORY_ORDER, CATEGORY_BLOCK, UNMATCHED_BLOCK } from '@/lib/meeting-category-colors'

export function CalendarLegend() {
  const { t } = useTranslation()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-normal text-foreground/45 transition-colors hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('calendar:legend.triggerAriaLabel')}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          {t('calendar:legend.triggerButton')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="space-y-3">
          {/* Meeting category colors — the block's fill tells you the type. */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-foreground/70">{t('calendar:legend.meetingTypeHeading')}</div>
            {CATEGORY_ORDER.map((c) => (
              <div key={c} className="flex items-center gap-2 text-xs">
                <span
                  className={cn('h-3 w-6 shrink-0 rounded', CATEGORY_BLOCK[c])}
                  aria-hidden="true"
                />
                <span className="inline-flex items-center gap-1.5 text-foreground/70">
                  <span className={cn('h-2 w-2 rounded-full', CATEGORY_DOT[c])} aria-hidden="true" />
                  {MEETING_CATEGORY_LABELS[c]}
                </span>
              </div>
            ))}
          </div>

          {/* Recording states — badge + exception blocks. */}
          <div className="space-y-1.5 border-t pt-2.5">
            <div className="text-xs font-semibold text-foreground/70">{t('calendar:legend.recordingHeading')}</div>
            <div className="flex items-center gap-2 text-xs">
              <span
                className="flex h-3.5 shrink-0 items-center gap-0.5 rounded bg-muted px-1"
                aria-hidden="true"
              >
                <Mic className="h-2.5 w-2.5" />
                <Check className="h-2.5 w-2.5 text-green-500" />
              </span>
              <span className="text-foreground/70">{t('calendar:legend.recordedBadgeLabel')}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span
                className={cn('flex h-3 w-6 shrink-0 items-center justify-center rounded', UNMATCHED_BLOCK)}
                aria-hidden="true"
              >
                <Link2Off className="h-2 w-2" />
              </span>
              <span className="text-foreground/70">{t('calendar:legend.unlinkedLabel')}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span
                className="h-3 w-6 shrink-0 rounded border-2 border-dashed border-slate-300 bg-slate-50/30 dark:border-slate-600 dark:bg-slate-800/20"
                aria-hidden="true"
              />
              <span className="text-foreground/70">{t('calendar:legend.scheduledNotRecordedLabel')}</span>
            </div>
          </div>

          {/* Location glyphs that appear on the recorded badge. */}
          <div className="space-y-1.5 border-t pt-2.5">
            <div className="text-xs font-semibold text-foreground/70">{t('calendar:legend.whereAudioLivesHeading')}</div>
            <div className="flex items-center gap-2 text-xs">
              <Cloud className="h-3.5 w-3.5 shrink-0 text-orange-500" aria-hidden="true" />
              <span className="text-foreground/70">{t('calendar:legend.onDeviceOnly')}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <HardDrive className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden="true" />
              <span className="text-foreground/70">{t('calendar:legend.downloadedToComputer')}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Check className="h-3.5 w-3.5 shrink-0 text-green-500" aria-hidden="true" />
              <span className="text-foreground/70">{t('calendar:legend.syncedDeviceComputer')}</span>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
