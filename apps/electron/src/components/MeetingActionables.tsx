import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Circle, AlertCircle, Clock } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import type { Actionable } from '@/types'

interface MeetingActionablesProps {
  actionables: Actionable[]
}

const STATUS_ICONS = {
  pending: Circle,
  in_progress: Clock,
  generated: CheckCircle2,
  shared: CheckCircle2,
  dismissed: AlertCircle
} as const

const STATUS_COLORS = {
  pending: 'text-gray-500',
  in_progress: 'text-blue-500',
  generated: 'text-green-500',
  shared: 'text-green-500',
  dismissed: 'text-red-500'
} as const

const PRIORITY_COLORS = {
  low: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
  medium: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
  high: 'bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300',
  urgent: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
} as const

export function MeetingActionables({ actionables }: MeetingActionablesProps) {
  const { t } = useTranslation()
  // Group by status for better organization
  const groupedActionables = useMemo(() => {
    return {
      pending: actionables.filter(a => a.status === 'pending'),
      inProgress: actionables.filter(a => a.status === 'in_progress'),
      generated: actionables.filter(a => a.status === 'generated'),
      shared: actionables.filter(a => a.status === 'shared')
    }
  }, [actionables])

  const completedCount = groupedActionables.generated.length + groupedActionables.shared.length

  if (actionables.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('layout:sidebar.actionables')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            {t('calendar:actionables.emptyState')}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('layout:sidebar.actionables')}</CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t('calendar:actionables.totalCount', { count: actionables.length })}</span>
            {completedCount > 0 && (
              <span>{t('calendar:actionables.completedCount', { count: completedCount })}</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {actionables.map((actionable) => {
          const StatusIcon = STATUS_ICONS[actionable.status] || Circle
          const statusColor = STATUS_COLORS[actionable.status] || 'text-gray-500'
          const priorityColor = PRIORITY_COLORS.medium

          return (
            <div
              key={actionable.id}
              className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
            >
              <StatusIcon className={`h-5 w-5 mt-0.5 shrink-0 ${statusColor}`} />

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm leading-tight">{actionable.title}</p>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor}`}>
                    {actionable.type}
                  </span>
                </div>

                {actionable.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {actionable.description}
                  </p>
                )}

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="capitalize">{actionable.status.replace('_', ' ')}</span>
                  <span>•</span>
                  <span>{t('calendar:actionables.createdOn', { date: formatDateTime(actionable.createdAt) })}</span>
                  {actionable.generatedAt && (
                    <>
                      <span>•</span>
                      <span>{t('calendar:actionables.generatedOn', { date: formatDateTime(actionable.generatedAt) })}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
