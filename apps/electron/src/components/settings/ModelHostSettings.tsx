/**
 * The machine with the GPU.
 *
 * This computer has an AMD card, so diarization runs on its CPU and a backlog
 * takes hours. The Model Host runs the same worker on the gamestation's RTX
 * card and hands the result back. Pairing is the only thing this panel does;
 * whether a recording actually goes there is decided per recording in the main
 * process, and a host that is off changes nothing.
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfigStore } from '@/store/domain/useConfigStore'
import { toast } from '@/components/ui/toaster'

type Health = NonNullable<
  Awaited<ReturnType<NonNullable<typeof window.electronAPI>['modelHost']['check']>>['health']
>

/**
 * The host's run state as a label. The wire values are an enum, not copy —
 * rendering one straight into the sentence left the state untranslatable.
 */
function stateLabel(t: TFunction, state: Health['state']): string {
  switch (state) {
    case 'stopped':
      return t('settings:modelHost.stateStopped')
    case 'ready':
      return t('settings:modelHost.stateReady')
    case 'paused':
      return t('settings:modelHost.statePaused')
    case 'busy':
      return t('settings:modelHost.stateBusy')
  }
}

export function ModelHostSettings(): React.ReactElement {
  const { t } = useTranslation()
  const { config } = useConfigStore()
  const savedUrl = config?.transcription?.modelHostUrl ?? ''
  const paired = Boolean(config?.transcription?.modelHostToken)

  const [url, setUrl] = useState(savedUrl)
  const [code, setCode] = useState('')
  const [health, setHealth] = useState<Health | null>(null)
  const [busy, setBusy] = useState(false)

  const check = async () => {
    setBusy(true)
    setHealth(null)
    try {
      const result = await window.electronAPI.modelHost.check({ url })
      if (!result.success || !result.health) {
        toast.error(t('settings:modelHost.noHostTitle'), result.error)
        return
      }
      setHealth(result.health)
    } finally {
      setBusy(false)
    }
  }

  const pair = async () => {
    setBusy(true)
    try {
      const result = await window.electronAPI.modelHost.pair({ url, code })
      if (!result.success) {
        toast.error(t('settings:modelHost.pairFailedTitle'), result.error)
        return
      }
      setCode('')
      toast.success(
        t('settings:modelHost.pairedTitle'),
        t('settings:modelHost.pairedDescription')
      )
    } finally {
      setBusy(false)
    }
  }

  const forget = async () => {
    setBusy(true)
    try {
      await window.electronAPI.modelHost.forget()
      setUrl('')
      setHealth(null)
      toast.success(
        t('settings:modelHost.forgottenTitle'),
        t('settings:modelHost.forgottenDescription')
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings:modelHost.title')}</CardTitle>
        <CardDescription>{t('settings:modelHost.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="model-host-url">
            {t('settings:modelHost.urlLabel')}
          </label>
          <div className="flex gap-2">
            <Input
              id="model-host-url"
              value={url}
              placeholder={t('settings:modelHost.urlPlaceholder')}
              disabled={busy}
              onChange={(event) => setUrl(event.target.value)}
            />
            <Button variant="outline" onClick={check} disabled={busy || !url.trim()}>
              {t('settings:modelHost.check')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('settings:modelHost.urlHint')}</p>
        </div>

        {health && (
          <div className="rounded-md border border-border p-3 text-sm">
            <p>
              {health.reason
                ? t('settings:modelHost.healthLineWithReason', {
                    version: health.version,
                    state: stateLabel(t, health.state),
                    reason: health.reason
                  })
                : t('settings:modelHost.healthLine', {
                    version: health.version,
                    state: stateLabel(t, health.state)
                  })}
            </p>
            <p className="text-muted-foreground">
              {health.gpu === undefined
                ? t('settings:modelHost.gpuUnknown')
                : health.gpu === null
                  ? t('settings:modelHost.gpuNone')
                  : t('settings:modelHost.gpuDetail', {
                      name: health.gpu.name,
                      driver: health.gpu.driver
                    })}
            </p>
            {health.capabilities.length === 0 && (
              <p className="text-muted-foreground">
                {t('settings:modelHost.setupIncomplete')}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2 border-t border-border pt-4">
          <label className="text-sm font-medium" htmlFor="model-host-code">
            {t('settings:modelHost.codeLabel')}
          </label>
          <div className="flex gap-2">
            <Input
              id="model-host-code"
              value={code}
              placeholder={t('settings:modelHost.codePlaceholder')}
              inputMode="numeric"
              disabled={busy}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 12))}
            />
            <Button onClick={pair} disabled={busy || !url.trim() || code.length < 4}>
              {t('settings:modelHost.pair')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('settings:modelHost.codeHint')}</p>
        </div>

        {paired && (
          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              {savedUrl
                ? t('settings:modelHost.pairedWith', { url: savedUrl })
                : t('settings:modelHost.pairedWithUnknownHost')}
            </p>
            <Button variant="outline" onClick={forget} disabled={busy}>
              {t('settings:modelHost.forget')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
