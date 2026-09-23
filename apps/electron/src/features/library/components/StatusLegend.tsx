import { Cloud, HardDrive, Check, Circle, Clock, Loader2, CheckCircle2, AlertCircle, MicOff, Info, TrendingDown, Ban, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

interface LegendItem {
  Icon: LucideIcon
  color: string
  labelKey: string
}

// Mirrors StatusIcon (location) — the leading glyph on every row. The first
// entry reuses StatusIcon's own key (byte-identical, documented mirror,
// see the comment above) — the other two are this component's own strings.
const LOCATION_ITEMS: LegendItem[] = [
  { Icon: Cloud, color: 'text-orange-600 dark:text-orange-400', labelKey: 'statusIcon.onDeviceOnlyLabel' },
  { Icon: HardDrive, color: 'text-blue-600 dark:text-blue-400', labelKey: 'statusLegend.downloadedToComputerLabel' },
  { Icon: Check, color: 'text-green-600 dark:text-green-400', labelKey: 'statusLegend.syncedBothLabel' }
]

// Mirrors TranscriptionStatusBadge (compact) — the second glyph on every row.
// Reuses transcriptionStatusBadge's own keys where the wording is
// byte-identical; "Transcribing" and "No intelligible speech" differ from
// that component's own wording ("In Progress" / "No speech"), so those two
// get their own keys instead of a forced (inaccurate) reuse.
const TRANSCRIPTION_ITEMS: LegendItem[] = [
  { Icon: Circle, color: 'text-muted-foreground/50', labelKey: 'transcriptionStatusBadge.statusNone' },
  { Icon: Clock, color: 'text-yellow-600 dark:text-yellow-400', labelKey: 'transcriptionStatusBadge.statusPending' },
  { Icon: Loader2, color: 'text-yellow-600 dark:text-yellow-400', labelKey: 'statusLegend.transcribingLabel' },
  { Icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', labelKey: 'transcriptionStatusBadge.statusComplete' },
  { Icon: MicOff, color: 'text-slate-500 dark:text-slate-400', labelKey: 'statusLegend.noIntelligibleSpeechLabel' },
  { Icon: AlertCircle, color: 'text-destructive', labelKey: 'transcriptionStatusBadge.statusError' }
]

// Mirrors SourceRow's ValueBadge (F16/spec-003) — the content-based value
// classification glyph, shown only for low-value/garbage captures. Reuses
// SourceRow's own ValueBadge keys (byte-identical, documented mirror).
const VALUE_ITEMS: LegendItem[] = [
  { Icon: TrendingDown, color: 'text-amber-600 dark:text-amber-400', labelKey: 'sourceRow.valueBadgeLowValueLabel' },
  { Icon: Ban, color: 'text-red-600 dark:text-red-400', labelKey: 'sourceRow.valueBadgeGarbageLabel' }
]

/**
 * StatusLegend — click-to-open key explaining the status glyphs that lead each
 * library row. Discoverable (a labeled trigger, not hover-only), mirroring the
 * category legend on the Today page. Answers "what do these colors/icons mean?".
 */
export function StatusLegend() {
  const { t } = useTranslation('library')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-normal text-foreground/45 transition-colors hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('statusLegend.triggerAriaLabel')}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          {t('statusLegend.triggerLabel')}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 p-3">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-foreground/70">{t('statusLegend.locationHeading')}</div>
            {LOCATION_ITEMS.map(({ Icon, color, labelKey }) => (
              <div key={labelKey} className="flex items-center gap-2 text-xs">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} aria-hidden="true" />
                <span className="text-foreground/70">{t(labelKey)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-foreground/70">{t('statusLegend.transcriptionHeading')}</div>
            {TRANSCRIPTION_ITEMS.map(({ Icon, color, labelKey }) => (
              <div key={labelKey} className="flex items-center gap-2 text-xs">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} aria-hidden="true" />
                <span className="text-foreground/70">{t(labelKey)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-foreground/70">{t('statusLegend.valueHeading')}</div>
            {VALUE_ITEMS.map(({ Icon, color, labelKey }) => (
              <div key={labelKey} className="flex items-center gap-2 text-xs">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} aria-hidden="true" />
                <span className="text-foreground/70">{t(labelKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
