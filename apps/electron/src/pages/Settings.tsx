import { useEffect, useState, useCallback, useMemo, useRef, type KeyboardEvent } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  Save,
  FolderOpen,
  RefreshCw,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
  MessageSquare,
  PanelRight,
  PanelLeft,
  PanelRightOpen,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  TriangleAlert
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { useAppStore, useCalendarSyncing, useCalendarManualSyncing } from '@/store/useAppStore'
import { useConfigStore } from '@/store/domain/useConfigStore'
import { useUIStore } from '@/store/ui/useUIStore'
import { formatBytes, cn } from '@/lib/utils'
import { HealthCheck } from '@/components/HealthCheck'
import { ConnectorsSettings } from '@/components/settings/ConnectorsSettings'
import { AIBrainsSettings } from '@/components/settings/AIBrainsSettings'
import { FeaturesSettings } from '@/components/settings/FeaturesSettings'
import { toast } from '@/components/ui/toaster'
import { LEGACY_GRAPH_DISCLOSURE } from '@/features/library/utils/deletionCopy'
import { useLanguage } from '@/hooks/useLanguage'
import type { LanguagePreference } from '@/lib/language'
import type { StorageInfo, AppConfig } from '@/types'

// RAG configuration constants — MAX_CONTEXT_CHUNKS must match config.ts default (10)
const RAG_DEFAULTS = {
  MAX_CONTEXT_CHUNKS: 10,
  MIN_CONTEXT_CHUNKS: 1,
  MAX_CONTEXT_CHUNKS_LIMIT: 20
} as const

type StorageFolder = 'recordings' | 'transcripts' | 'data'

const STORAGE_CONFIG_KEYS: Record<StorageFolder, 'recordingsPath' | 'transcriptsPath' | 'dataPath'> = {
  recordings: 'recordingsPath',
  transcripts: 'transcriptsPath',
  data: 'dataPath'
}

function storageFolderLabel(t: TFunction, folder: StorageFolder): string {
  switch (folder) {
    case 'recordings':
      return t('settings:storage.recordings')
    case 'transcripts':
      return t('settings:storage.transcripts')
    case 'data':
      return t('settings:storage.data')
  }
}

type SpeakerModelAccess = {
  status: 'granted' | 'token-missing' | 'invalid-token' | 'terms-pending' | 'unavailable'
  model: string
  fallbackModel: string
  account?: string
  message: string
}

/**
 * Display-language picker. Uses the same segmented-button shape as the
 * Assistant card's placement/position controls so the Settings page has one
 * interaction idiom rather than two.
 */
export function LanguageSettingsCard(): React.ReactElement {
  const { t } = useTranslation()
  const { language, setLanguage } = useLanguage()

  /** The three display-language choices, in the order they appear. */
  const LANGUAGE_OPTIONS: ReadonlyArray<{ value: LanguagePreference; label: string }> = [
    { value: 'system', label: t('settings:language.system') },
    { value: 'en', label: t('settings:language.english') },
    // A language's own name is conventionally written in that language, so this
    // label is intentionally exempt from translation — it stays 日本語 in every
    // locale. Do not move it into the settings catalogue.
    { value: 'ja', label: '日本語' }
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings:appearance.title')}</CardTitle>
        <CardDescription>{t('settings:appearance.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <span className="text-sm font-medium">{t('settings:language.label')}</span>
          <div
            role="group"
            aria-label={t('settings:language.label')}
            className="inline-flex rounded-lg border border-input bg-muted/40 p-0.5"
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={language === option.value}
                onClick={() => setLanguage(option.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  language === option.value
                    ? 'bg-background font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('settings:language.hint')}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

export function Settings() {
  const { t } = useTranslation()
  // SM-09 fix: Use granular selectors
  const syncCalendar = useAppStore((s) => s.syncCalendar)
  const calendarSyncing = useCalendarSyncing()
  // Gate the control on the USER's own request, not on any sync: the startup
  // mount sync parks on the boot gate for the whole startup window, and gating
  // on it disabled this button during exactly the period the bounded manual
  // path exists to serve.
  const calendarManualSyncing = useCalendarManualSyncing()
  // QA Logs toggle — moved here from the sidebar footer (advanced/dev setting).
  const qaLogsEnabled = useUIStore((s) => s.qaLogsEnabled)
  const setQaLogsEnabled = useUIStore((s) => s.setQaLogsEnabled)
  // Clipboard auto-capture toggle — background poll that adds copied screenshots.
  const autoCaptureScreenshots = useUIStore((s) => s.autoCaptureScreenshots)
  const setAutoCaptureScreenshots = useUIStore((s) => s.setAutoCaptureScreenshots)
  // Chat Placement — Floating (bubble) vs Embedded (docked pane) + preferred edge.
  const chatPlacement = useUIStore((s) => s.chatPlacement)
  const setChatPlacement = useUIStore((s) => s.setChatPlacement)
  const chatPosition = useUIStore((s) => s.chatPosition)
  const setChatPosition = useUIStore((s) => s.setChatPosition)
  const { config, loadConfig, updateConfig, configLoading } = useConfigStore()
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [storageError, setStorageError] = useState<string | null>(null) // B-SET-002: Storage error state
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Local form state
  const [icsUrl, setIcsUrl] = useState('')
  const [syncEnabled, setSyncEnabled] = useState(true)
  const [syncInterval, setSyncInterval] = useState(15)
  const [transcriptionProvider, setTranscriptionProvider] = useState<'gemini' | 'local-asr' | 'vibevoice'>('gemini')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [geminiModel, setGeminiModel] = useState('gemini-3.5-transcribe')
  const [localAsrPath, setLocalAsrPath] = useState('G:\\Code\\claude-plugins\\plugins\\mcp-asr')
  const [localAsrHfToken, setLocalAsrHfToken] = useState('')
  const [localAsrVocabularyFile, setLocalAsrVocabularyFile] = useState('vocabulary.json')
  const [localAsrDiarize, setLocalAsrDiarize] = useState(true)
  const [localAsrNumBeams, setLocalAsrNumBeams] = useState(5)
  const [chatProvider, setChatProvider] = useState<'gemini' | 'ollama'>('gemini')
  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
  const [showApiKey, setShowApiKey] = useState(false)
  const [storageLoading, setStorageLoading] = useState(false)
  const [storagePaths, setStoragePaths] = useState<Record<StorageFolder, string>>({
    recordings: '',
    transcripts: '',
    data: ''
  })
  const [savingStorageFolder, setSavingStorageFolder] = useState<StorageFolder | null>(null)
  // C-CHAT: RAG context window — default matches config.ts (10)
  const [ragContextSize, setRagContextSize] = useState<number>(RAG_DEFAULTS.MAX_CONTEXT_CHUNKS)
  const [showHfToken, setShowHfToken] = useState(false)

  // Transcription models are loaded LIVE from the Gemini API (config:listGeminiModels)
  // and filtered to the dedicated non-streaming transcription model. The
  // concrete fallback shows before the live list resolves or when offline.
  const [geminiModels, setGeminiModels] = useState<{ value: string; label: string }[]>([
    { value: 'gemini-3.5-transcribe', label: t('settings:transcription.defaultModelLabel') },
  ])
  const [modelsLive, setModelsLive] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [speakerModelAccess, setSpeakerModelAccess] = useState<SpeakerModelAccess | null>(null)
  const [speakerModelAccessChecking, setSpeakerModelAccessChecking] = useState(false)
  const lastAutoCheckedTokenRef = useRef<string | null>(null)

  const loadGeminiModels = useCallback(async () => {
    setModelsLoading(true)
    try {
      const res = await window.electronAPI.config.listGeminiModels()
      const data = res?.success ? res.data : res // tolerate either envelope
      if (data?.models?.length) {
        setGeminiModels(data.models)
        setModelsLive(!!data.ok)
      }
    } catch {
      // keep the fallback list (e.g. IPC not yet available before a restart)
    } finally {
      setModelsLoading(false)
    }
  }, [])

  const checkSpeakerModelAccess = useCallback(async () => {
    const token = localAsrHfToken.trim()
    setSpeakerModelAccessChecking(true)
    try {
      const response = await window.electronAPI.config.checkSpeakerModelAccess(token)
      if (response?.success && response.data) {
        setSpeakerModelAccess(response.data as SpeakerModelAccess)
      } else {
        const message = response?.error?.message || t('settings:transcription.checkAccessFallback')
        setSpeakerModelAccess({
          status: 'unavailable',
          model: 'pyannote/speaker-diarization-community-1',
          fallbackModel: 'pyannote/speaker-diarization-3.1',
          message
        })
      }
    } catch (error) {
      setSpeakerModelAccess({
        status: 'unavailable',
        model: 'pyannote/speaker-diarization-community-1',
        fallbackModel: 'pyannote/speaker-diarization-3.1',
        message: error instanceof Error
          ? error.message
          : t('settings:transcription.checkAccessRestartFallback')
      })
    } finally {
      setSpeakerModelAccessChecking(false)
    }
  }, [localAsrHfToken, t])

  const openSpeakerModelAccess = useCallback(async () => {
    try {
      const response = await window.electronAPI.config.openSpeakerModelAccess()
      if (!response?.success) {
        throw new Error(response?.error?.message || t('settings:transcription.openAccessPageError'))
      }
    } catch (error) {
      toast.error(
        t('settings:transcription.openAccessFailedTitle'),
        error instanceof Error ? error.message : t('settings:transcription.openAccessFailedFallback')
      )
    }
  }, [t])

  useEffect(() => {
    loadGeminiModels()
  }, [loadGeminiModels])

  // Always include the currently-saved model in the options so the <select> can
  // render it even if the live list filtered it out (e.g. a custom/older id).
  const geminiModelOptions = useMemo(() => {
    if (!geminiModel || geminiModels.some((m) => m.value === geminiModel)) return geminiModels
    return [{ value: geminiModel, label: t('settings:transcription.savedModelLabel', { model: geminiModel }) }, ...geminiModels]
  }, [geminiModels, geminiModel, t])

  // Validation function for config values
  const validateConfig = useCallback((updates: Partial<AppConfig>): string | null => {
    // Transcription settings validation
    if (updates.transcription) {
      if (
        (updates.transcription.provider === 'local-asr' || updates.transcription.provider === 'vibevoice') &&
        !updates.transcription.localAsrPath?.trim()
      ) {
        return t('settings:validation.asrPathRequired')
      }
      if (
        updates.transcription.provider === 'local-asr' &&
        updates.transcription.localAsrDiarize !== false &&
        !updates.transcription.localAsrHfToken?.trim()
      ) {
        return t('settings:validation.hfTokenRequired')
      }
      if (
        updates.transcription.localAsrNumBeams !== undefined &&
        (updates.transcription.localAsrNumBeams < 1 || updates.transcription.localAsrNumBeams > 10)
      ) {
        return t('settings:validation.beamsRange')
      }
      if (updates.transcription.geminiApiKey !== undefined) {
        const apiKey = updates.transcription.geminiApiKey.trim()
        if (apiKey && apiKey.length < 10) {
          return t('settings:validation.apiKeyTooShort')
        }
        if (apiKey && !apiKey.startsWith('AIza')) {
          return t('settings:validation.apiKeyFormat')
        }
      }
    }

    // Calendar settings validation
    if (updates.calendar) {
      if (updates.calendar.icsUrl !== undefined) {
        const url = updates.calendar.icsUrl.trim()
        if (url && !url.startsWith('http')) {
          return t('settings:validation.calendarUrlFormat')
        }
      }
      if (updates.calendar.syncIntervalMinutes !== undefined) {
        const interval = updates.calendar.syncIntervalMinutes
        if (interval < 5 || interval > 120) {
          return t('settings:validation.syncIntervalRange')
        }
      }
    }

    // Embeddings settings validation
    if (updates.embeddings) {
      if (updates.embeddings.ollamaBaseUrl !== undefined) {
        const url = updates.embeddings.ollamaBaseUrl.trim()
        if (url && !url.startsWith('http')) {
          return t('settings:validation.ollamaUrlFormat')
        }
      }
    }

    return null // Valid
  }, [t])

  // C-SET: Track form dirty state per section
  const isCalendarDirty = useMemo(() => {
    if (!config) return false
    return (
      icsUrl !== config.calendar.icsUrl ||
      syncEnabled !== config.calendar.syncEnabled ||
      syncInterval !== config.calendar.syncIntervalMinutes
    )
  }, [config, icsUrl, syncEnabled, syncInterval])

  const isTranscriptionDirty = useMemo(() => {
    if (!config) return false
    return (
      transcriptionProvider !== (config.transcription.provider || 'gemini') ||
      geminiApiKey !== config.transcription.geminiApiKey ||
      geminiModel !== (config.transcription.geminiModel || 'gemini-3.5-transcribe') ||
      localAsrPath !== (config.transcription.localAsrPath || 'G:\\Code\\claude-plugins\\plugins\\mcp-asr') ||
      localAsrHfToken !== (config.transcription.localAsrHfToken || '') ||
      localAsrVocabularyFile !== (config.transcription.localAsrVocabularyFile || 'vocabulary.json') ||
      localAsrDiarize !== (config.transcription.localAsrDiarize ?? true) ||
      localAsrNumBeams !== (config.transcription.localAsrNumBeams || 5)
    )
  }, [config, transcriptionProvider, geminiApiKey, geminiModel, localAsrPath, localAsrHfToken, localAsrVocabularyFile, localAsrDiarize, localAsrNumBeams])

  const isSpeakerTokenDirty = useMemo(
    () => !!config && localAsrHfToken !== (config.transcription.localAsrHfToken || ''),
    [config, localAsrHfToken]
  )

  const isChatDirty = useMemo(() => {
    if (!config) return false
    return (
      chatProvider !== config.chat.provider ||
      ollamaUrl !== config.embeddings.ollamaBaseUrl ||
      ragContextSize !== config.chat.maxContextChunks
    )
  }, [config, chatProvider, ollamaUrl, ragContextSize])

  // Stable loadConfig with useCallback for dependency array
  const loadConfigStable = useCallback(async () => {
    try {
      setLoadError(null)
      await loadConfig()
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings:loadError.fallbackMessage')
      setLoadError(message)
      toast.error(t('settings:loadError.title'), message)
    }
  }, [loadConfig, t])

  useEffect(() => {
    loadConfigStable()
    loadStorageInfo()
  }, [loadConfigStable])

  useEffect(() => {
    if (config) {
      setIcsUrl(config.calendar.icsUrl)
      setSyncEnabled(config.calendar.syncEnabled)
      setSyncInterval(config.calendar.syncIntervalMinutes)
      setTranscriptionProvider(config.transcription.provider || 'gemini')
      setGeminiApiKey(config.transcription.geminiApiKey)
      setGeminiModel(config.transcription.geminiModel || 'gemini-3.5-transcribe')
      setLocalAsrPath(config.transcription.localAsrPath || 'G:\\Code\\claude-plugins\\plugins\\mcp-asr')
      setLocalAsrHfToken(config.transcription.localAsrHfToken || '')
      setLocalAsrVocabularyFile(config.transcription.localAsrVocabularyFile || 'vocabulary.json')
      setLocalAsrDiarize(config.transcription.localAsrDiarize ?? true)
      setLocalAsrNumBeams(config.transcription.localAsrNumBeams || 5)
      setChatProvider(config.chat.provider)
      setOllamaUrl(config.embeddings.ollamaBaseUrl)
      // C-CHAT: Load RAG context window size
      setRagContextSize(config.chat.maxContextChunks)
    }
  }, [config])

  useEffect(() => {
    const token = config?.transcription.localAsrHfToken?.trim() || ''
    if (!token || localAsrHfToken.trim() !== token || lastAutoCheckedTokenRef.current === token) return
    lastAutoCheckedTokenRef.current = token
    void checkSpeakerModelAccess()
  }, [checkSpeakerModelAccess, config, localAsrHfToken])

  useEffect(() => {
    if (storageInfo) {
      setStoragePaths({
        recordings: config?.storage?.recordingsPath || storageInfo.recordingsPath || '',
        transcripts: config?.storage?.transcriptsPath || storageInfo.transcriptsPath || '',
        data: config?.storage?.dataPath || storageInfo.dataPath || ''
      })
    }
  }, [config?.storage?.dataPath, config?.storage?.recordingsPath, config?.storage?.transcriptsPath, storageInfo])

  const loadStorageInfo = async () => {
    try {
      setStorageError(null) // B-SET-002: Clear previous error
      setStorageLoading(true)
      const result = await window.electronAPI.storage.getInfo()
      if (result.success && result.data) {
        setStorageInfo(result.data)
      } else {
        // B-SET-002: Surface storage errors to user
        const errorMsg = result.error || t('settings:storage.loadErrorFallback')
        setStorageError(typeof errorMsg === 'string' ? errorMsg : String(errorMsg))
        console.error('Failed to load storage info:', result.error)
      }
    } catch (error) {
      // B-SET-002: Surface storage errors to user
      const errorMsg = error instanceof Error ? error.message : t('settings:storage.loadErrorFallback')
      setStorageError(errorMsg)
      console.error('Failed to load storage info:', error)
    } finally {
      setStorageLoading(false)
    }
  }

  const handleSaveCalendar = async () => {
    if (saving) {
      toast.warning(t('settings:calendar.pleaseWaitTitle'), t('settings:calendar.saveInProgressDescription'))
      return
    }

    // Store previous values for rollback
    const previousIcsUrl = config?.calendar.icsUrl || ''
    const previousSyncEnabled = config?.calendar.syncEnabled ?? true
    const previousSyncInterval = config?.calendar.syncIntervalMinutes || 15

    const updates = {
      icsUrl,
      syncEnabled,
      syncIntervalMinutes: syncInterval
    }

    // Validate before save - validateConfig accepts any shape
    const validationError = validateConfig({ calendar: updates } as Partial<AppConfig>)
    if (validationError) {
      toast.error(t('settings:calendar.validationErrorTitle'), validationError)
      return
    }

    setSaving(true)
    try {
      await updateConfig('calendar', updates)

      toast.success(t('settings:calendar.savedTitle'), t('settings:calendar.savedDescription'))
    } catch (error) {
      // Rollback on error
      setIcsUrl(previousIcsUrl)
      setSyncEnabled(previousSyncEnabled)
      setSyncInterval(previousSyncInterval)

      const message = error instanceof Error ? error.message : t('settings:calendar.saveFailedFallback')
      toast.error(t('settings:calendar.saveFailedTitle'), message)
      console.error('Failed to save calendar settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveTranscription = async () => {
    if (saving) {
      toast.warning(t('settings:transcription.pleaseWaitTitle'), t('settings:transcription.saveInProgressDescription'))
      return
    }

    // Store previous values for rollback
    const previousApiKey = config?.transcription.geminiApiKey || ''
    const previousModel = config?.transcription.geminiModel || 'gemini-3.5-transcribe'
    const previousProvider = config?.transcription.provider || 'gemini'
    const previousLocalAsrPath = config?.transcription.localAsrPath || 'G:\\Code\\claude-plugins\\plugins\\mcp-asr'
    const previousLocalAsrHfToken = config?.transcription.localAsrHfToken || ''
    const previousLocalAsrVocabularyFile = config?.transcription.localAsrVocabularyFile || 'vocabulary.json'
    const previousLocalAsrDiarize = config?.transcription.localAsrDiarize ?? true
    const previousLocalAsrNumBeams = config?.transcription.localAsrNumBeams || 5

    const updates = {
      provider: transcriptionProvider,
      geminiApiKey,
      geminiModel,
      localAsrPath,
      localAsrHfToken,
      localAsrVocabularyFile,
      localAsrDiarize,
      localAsrNumBeams
    }

    // Validate before save
    const validationError = validateConfig({ transcription: updates } as Partial<AppConfig>)
    if (validationError) {
      toast.error(t('settings:transcription.validationErrorTitle'), validationError)
      return
    }

    setSaving(true)
    try {
      await updateConfig('transcription', updates)

      toast.success(
        t('settings:transcription.savedTitle'),
        transcriptionProvider === 'local-asr'
          ? t('settings:transcription.savedLocalAsr')
          : t('settings:transcription.savedGeneric', { model: geminiModel })
      )
    } catch (error) {
      // Rollback on error
      setTranscriptionProvider(previousProvider)
      setGeminiApiKey(previousApiKey)
      setGeminiModel(previousModel)
      setLocalAsrPath(previousLocalAsrPath)
      setLocalAsrHfToken(previousLocalAsrHfToken)
      setLocalAsrVocabularyFile(previousLocalAsrVocabularyFile)
      setLocalAsrDiarize(previousLocalAsrDiarize)
      setLocalAsrNumBeams(previousLocalAsrNumBeams)

      const message = error instanceof Error ? error.message : t('settings:transcription.saveFailedFallback')
      toast.error(t('settings:transcription.saveFailedTitle'), message)
      console.error('Failed to save transcription settings:', error)
    } finally {
      setSaving(false)
    }
  }

  // F16/spec-003 Part I — Library value classification backfill card.
  // Uses the SAVED config (not the possibly-dirty form fields above) since
  // this reflects what the main process will actually see when the button
  // is clicked — mirrors getProviderConfigFromSettings()'s exact condition.
  const hasValueProvider = useMemo(
    () => config?.chat.provider === 'gemini' && !!config?.transcription.geminiApiKey,
    [config]
  )
  const [valueBackfillRunning, setValueBackfillRunning] = useState(false)
  const [valueBackfillProgress, setValueBackfillProgress] = useState<{
    processed: number
    total: number
    marked: number
    failed: number
  } | null>(null)
  const [valueBackfillRemaining, setValueBackfillRemaining] = useState(0)

  useEffect(() => {
    let cancelledEffect = false
    window.electronAPI?.valueBackfill?.getStatus().then((res) => {
      if (cancelledEffect || !res?.success || !res.data) return
      setValueBackfillRunning(res.data.running)
      setValueBackfillRemaining(res.data.remaining)
    })

    const unsubProgress = window.electronAPI?.valueBackfill?.onProgress((progress) => {
      setValueBackfillRunning(true)
      setValueBackfillProgress(progress)
    })
    const unsubComplete = window.electronAPI?.valueBackfill?.onComplete((result) => {
      setValueBackfillRunning(false)
      setValueBackfillProgress(result)
      setValueBackfillRemaining(Math.max(0, result.total - result.processed))
      toast.success(
        result.cancelled ? t('settings:valueClassification.cancelledTitle') : t('settings:valueClassification.completeTitle'),
        t('settings:valueClassification.resultDescription', { processed: result.processed, marked: result.marked })
      )
    })

    return () => {
      cancelledEffect = true
      unsubProgress?.()
      unsubComplete?.()
    }
  }, [t])

  const handleStartValueBackfill = useCallback(async () => {
    setValueBackfillRunning(true)
    try {
      const res = await window.electronAPI.valueBackfill.start()
      if (!res?.success || !res.started) {
        setValueBackfillRunning(false)
        if (res?.reason === 'no-provider') {
          toast.error(t('settings:valueClassification.noProviderTitle'), t('settings:valueClassification.noProviderDescription'))
        } else if (res?.reason !== 'already-running') {
          toast.error(t('settings:valueClassification.startFailedTitle'), res?.error || t('settings:valueClassification.unknownError'))
        }
      }
    } catch (error) {
      setValueBackfillRunning(false)
      toast.error(t('settings:valueClassification.startFailedTitle'), error instanceof Error ? error.message : t('settings:valueClassification.unknownError'))
    }
  }, [t])

  const handleCancelValueBackfill = useCallback(async () => {
    try {
      await window.electronAPI.valueBackfill.cancel()
    } catch (error) {
      console.error('Failed to cancel value backfill:', error)
    }
  }, [])

  const handleSaveChat = async () => {
    if (saving) {
      toast.warning(t('settings:chat.pleaseWaitTitle'), t('settings:chat.saveInProgressDescription'))
      return
    }

    // Store previous values for rollback
    const previousChatProvider = config?.chat.provider || 'gemini'
    const previousOllamaUrl = config?.embeddings.ollamaBaseUrl || 'http://localhost:11434'
    const previousContextSize = config?.chat.maxContextChunks || RAG_DEFAULTS.MAX_CONTEXT_CHUNKS

    const chatUpdates = {
      provider: chatProvider,
      maxContextChunks: ragContextSize
    }

    const embeddingsUpdates = {
      ollamaBaseUrl: ollamaUrl
    }

    // Validate before save
    const validationError = validateConfig({
      chat: chatUpdates,
      embeddings: embeddingsUpdates
    } as Partial<AppConfig>)
    if (validationError) {
      toast.error(t('settings:chat.validationErrorTitle'), validationError)
      return
    }

    setSaving(true)
    try {
      // Save both sections atomically using Promise.all to prevent partial state
      await Promise.all([
        updateConfig('chat', chatUpdates),
        updateConfig('embeddings', embeddingsUpdates)
      ])

      toast.success(t('settings:chat.savedTitle'), t('settings:chat.savedDescription', { provider: chatProvider }))
    } catch (error) {
      // Rollback on error - both sections revert
      setChatProvider(previousChatProvider)
      setOllamaUrl(previousOllamaUrl)
      setRagContextSize(previousContextSize)
      // Reload config from backend to ensure consistency after partial failure
      try { await loadConfig() } catch { /* best effort reload */ }

      const message = error instanceof Error ? error.message : t('settings:chat.saveFailedFallback')
      toast.error(t('settings:chat.saveFailedTitle'), message)
      console.error('Failed to save chat settings:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleStoragePathChange = (folder: StorageFolder, value: string) => {
    setStoragePaths((prev) => ({ ...prev, [folder]: value }))
  }

  const getCurrentStoragePath = (folder: StorageFolder): string => {
    if (folder === 'recordings') {
      return config?.storage?.recordingsPath || storageInfo?.recordingsPath || ''
    }
    if (folder === 'transcripts') {
      return config?.storage?.transcriptsPath || storageInfo?.transcriptsPath || ''
    }
    return config?.storage?.dataPath || storageInfo?.dataPath || ''
  }

  const saveStoragePath = async (folder: StorageFolder, rawPath: string) => {
    if (!config) return

    const nextPath = rawPath.trim()
    if (!nextPath) {
      toast.error(t('settings:storage.invalidFolderTitle'), t('settings:storage.emptyFolderDescription'))
      setStoragePaths((prev) => ({ ...prev, [folder]: getCurrentStoragePath(folder) }))
      return
    }

    if (nextPath === getCurrentStoragePath(folder)) return

    setSavingStorageFolder(folder)
    try {
      await updateConfig('storage', {
        [STORAGE_CONFIG_KEYS[folder]]: nextPath
      } as Partial<AppConfig['storage']>)
      setStoragePaths((prev) => ({ ...prev, [folder]: nextPath }))
      await loadStorageInfo()
      toast.success(t('settings:storage.folderSavedTitle'), t('settings:storage.folderUpdatedDescription', { label: storageFolderLabel(t, folder) }))
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings:storage.saveFailedFallback')
      toast.error(t('settings:storage.saveFailedTitle'), message)
      setStoragePaths((prev) => ({ ...prev, [folder]: getCurrentStoragePath(folder) }))
    } finally {
      setSavingStorageFolder(null)
    }
  }

  const handleSelectStorageFolder = async (folder: StorageFolder) => {
    if (!window.electronAPI.storage.selectFolder) {
      toast.error(
        t('settings:storage.restartRequiredTitle'),
        t('settings:storage.restartRequiredDescription')
      )
      return
    }

    try {
      const result = await window.electronAPI.storage.selectFolder(storagePaths[folder] || getCurrentStoragePath(folder))
      if (!result.success) {
        toast.error(t('settings:storage.folderSelectionFailedTitle'), result.error || t('settings:storage.folderPickerFallback'))
        return
      }
      if (!result.data) return

      setStoragePaths((prev) => ({ ...prev, [folder]: result.data! }))
      await saveStoragePath(folder, result.data)
    } catch (error) {
      const message = error instanceof Error ? error.message : t('settings:storage.folderPickerFallback')
      toast.error(t('settings:storage.folderSelectionFailedTitle'), message)
    }
  }

  const handleStoragePathKeyDown = (_folder: StorageFolder, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur()
    }
  }

  // Loading state
  if (configLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{t('settings:loading.settings')}</p>
      </div>
    )
  }

  // Error state with retry
  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold mb-2">{t('settings:loadError.title')}</h2>
        <p className="text-muted-foreground mb-4 text-center max-w-md">{loadError}</p>
        <Button onClick={loadConfigStable}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t('settings:loadError.retry')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b px-6 py-4">
        <h1 className="text-2xl font-bold">{t('settings:page.title')}</h1>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Modular features (Track I) — preset selector. The `features` anchor is
              the deep-link target of FeatureDisabledPage's "Enable in Settings". */}
          <div id="features">
            <FeaturesSettings />
          </div>

          {/* Appearance — display language */}
          <LanguageSettingsCard />

          {/* Assistant — Chat Placement */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings:assistant.title')}</CardTitle>
              <CardDescription>{t('settings:assistant.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Placement: Floating (bubble) vs Embedded (docked pane) */}
              <div className="space-y-2">
                <span className="text-sm font-medium">{t('settings:assistant.placement')}</span>
                <div
                  role="group"
                  aria-label={t('settings:assistant.placement')}
                  className="inline-flex rounded-lg border border-input bg-muted/40 p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={chatPlacement === 'floating'}
                    onClick={() => setChatPlacement('floating')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      chatPlacement === 'floating'
                        ? 'bg-background font-medium text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <MessageSquare className="h-4 w-4" aria-hidden="true" />
                    {t('settings:assistant.floating')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={chatPlacement === 'embedded'}
                    onClick={() => setChatPlacement('embedded')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      chatPlacement === 'embedded'
                        ? 'bg-background font-medium text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <PanelRightOpen className="h-4 w-4" aria-hidden="true" />
                    {t('settings:assistant.embedded')}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {chatPlacement === 'floating'
                    ? t('settings:assistant.placementHintFloating')
                    : t('settings:assistant.placementHintEmbedded')}
                </p>
              </div>

              {/* Position: Left / Right edge */}
              <div className="space-y-2">
                <span className="text-sm font-medium">{t('settings:assistant.position')}</span>
                <div
                  role="group"
                  aria-label={t('settings:assistant.positionAriaLabel')}
                  className="inline-flex rounded-lg border border-input bg-muted/40 p-0.5"
                >
                  <button
                    type="button"
                    aria-pressed={chatPosition === 'left'}
                    onClick={() => setChatPosition('left')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      chatPosition === 'left'
                        ? 'bg-background font-medium text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <PanelLeft className="h-4 w-4" aria-hidden="true" />
                    {t('settings:assistant.left')}
                  </button>
                  <button
                    type="button"
                    aria-pressed={chatPosition === 'right'}
                    onClick={() => setChatPosition('right')}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      chatPosition === 'right'
                        ? 'bg-background font-medium text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <PanelRight className="h-4 w-4" aria-hidden="true" />
                    {t('settings:assistant.right')}
                  </button>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('settings:assistant.positionHint')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Calendar Settings */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings:calendar.title')}</CardTitle>
              <CardDescription>{t('settings:calendar.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label htmlFor="icsUrl" className="text-sm font-medium">{t('settings:calendar.icsUrlLabel')}</label>
                <Input
                  id="icsUrl"
                  type="url"
                  placeholder={t('settings:calendar.icsUrlPlaceholder')}
                  value={icsUrl}
                  onChange={(e) => setIcsUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveCalendar()}
                  disabled={saving}
                  aria-label={t('settings:calendar.icsUrlLabel')}
                  aria-describedby="icsUrl-description"
                  className="mt-1"
                />
                <p id="icsUrl-description" className="text-xs text-muted-foreground mt-1">
                  {t('settings:calendar.icsUrlHint')}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="syncEnabled"
                    checked={syncEnabled}
                    onChange={(e) => setSyncEnabled(e.target.checked)}
                    disabled={saving}
                    aria-label={t('settings:calendar.autoSyncAriaLabel')}
                    className="rounded"
                  />
                  <label htmlFor="syncEnabled" className="text-sm">
                    {t('settings:calendar.autoSyncLabel')}
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="syncInterval" className="text-sm">{t('settings:calendar.every')}</label>
                  <Input
                    id="syncInterval"
                    type="number"
                    min={5}
                    max={120}
                    value={syncInterval}
                    onChange={(e) => {
                      const val = parseInt(e.target.value)
                      if (isNaN(val)) return
                      // Clamp to valid range
                      setSyncInterval(Math.min(120, Math.max(5, val)))
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveCalendar()}
                    disabled={saving}
                    aria-label={t('settings:calendar.syncIntervalAriaLabel')}
                    className="w-20"
                  />
                  <span className="text-sm">{t('settings:calendar.minutes')}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSaveCalendar}
                  disabled={saving || !isCalendarDirty}
                  aria-label={t('settings:calendar.saveAriaLabel')}
                >
                  <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                  {isCalendarDirty ? t('settings:calendar.save') : t('settings:calendar.saved')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => syncCalendar('manual')}
                  disabled={calendarManualSyncing || saving}
                  aria-label={t('settings:calendar.syncNowAriaLabel')}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${calendarSyncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {t('settings:calendar.syncNow')}
                </Button>
                {config?.calendar.lastSyncAt && (
                  <span className="text-xs text-muted-foreground ml-2">
                    {t('settings:calendar.lastSyncedPrefix')}{new Date(config.calendar.lastSyncAt).toLocaleString()}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Connectors (Layer 2): external-system integrations */}
          <ConnectorsSettings />

          {/* AI Brains (H10): pick which AI provider powers analysis/chat/outputs */}
          <AIBrainsSettings />

          {/* Transcription Settings */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings:transcription.title')}</CardTitle>
              <CardDescription>{t('settings:transcription.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label id="transcriptionProvider-label" className="text-sm font-medium">{t('settings:transcription.providerLabel')}</label>
                <div className="flex gap-2 mt-2" role="group" aria-labelledby="transcriptionProvider-label">
                  <Button
                    variant={transcriptionProvider === 'gemini' ? 'default' : 'outline'}
                    onClick={() => setTranscriptionProvider('gemini')}
                    disabled={saving}
                    aria-label={t('settings:transcription.useGeminiAriaLabel')}
                    aria-pressed={transcriptionProvider === 'gemini'}
                  >
                    {t('settings:transcription.gemini')}
                  </Button>
                  <Button
                    variant={transcriptionProvider === 'local-asr' ? 'default' : 'outline'}
                    onClick={() => setTranscriptionProvider('local-asr')}
                    disabled={saving}
                    aria-label={t('settings:transcription.useLocalAsrAriaLabel')}
                    aria-pressed={transcriptionProvider === 'local-asr'}
                  >
                    {t('settings:transcription.localAsr')}
                  </Button>
                  <Button
                    variant={transcriptionProvider === 'vibevoice' ? 'default' : 'outline'}
                    onClick={() => setTranscriptionProvider('vibevoice')}
                    disabled={saving}
                    aria-label={t('settings:transcription.useVibeVoiceAriaLabel')}
                    aria-pressed={transcriptionProvider === 'vibevoice'}
                  >
                    {t('settings:transcription.vibevoice')}
                  </Button>
                </div>
                {transcriptionProvider === 'vibevoice' && (
                  <p className="text-xs text-muted-foreground mt-2">
                    <Trans i18nKey="settings:transcription.vibevoiceHint">
                      VibeVoice (microsoft/VibeVoice-ASR) runs locally for full-file / re-processing:
                      joint transcription, speaker diarization and timestamps in one pass. Auto-detects
                      language. Requires the optional <code>vibevoice</code> install in the ASR MCP project.
                    </Trans>
                  </p>
                )}
              </div>

              <section
                aria-labelledby="speaker-model-heading"
                className="rounded-xl bg-muted/45 p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id="speaker-model-heading" className="text-sm font-semibold">
                      {t('settings:transcription.speakerModelHeading')}
                    </h3>
                    <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                      {t('settings:transcription.speakerModelDescription')}
                    </p>
                  </div>
                  <div
                    role="status"
                    aria-live="polite"
                    className={cn(
                      'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                      speakerModelAccess?.status === 'granted'
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : speakerModelAccess?.status === 'invalid-token' || speakerModelAccess?.status === 'terms-pending'
                          ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
                          : 'bg-background text-muted-foreground'
                    )}
                  >
                    {speakerModelAccessChecking ? (
                      <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                    ) : speakerModelAccess?.status === 'granted' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : speakerModelAccess?.status === 'invalid-token' || speakerModelAccess?.status === 'terms-pending' ? (
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    )}
                    <span className="truncate">
                      {speakerModelAccessChecking
                        ? t('settings:transcription.checkingAccess')
                        : speakerModelAccess?.status === 'granted'
                          ? isSpeakerTokenDirty ? t('settings:transcription.accessValidSaveToken') : t('settings:transcription.community1Ready')
                          : speakerModelAccess?.status === 'terms-pending'
                            ? t('settings:transcription.acceptanceRequired')
                            : speakerModelAccess?.status === 'invalid-token'
                              ? t('settings:transcription.tokenRejected')
                              : speakerModelAccess?.status === 'unavailable'
                                ? t('settings:transcription.checkUnavailable')
                                : localAsrHfToken.trim()
                                  ? t('settings:transcription.notChecked')
                                  : t('settings:transcription.tokenRequired')}
                    </span>
                  </div>
                </div>

                <div className="mt-4">
                  <label htmlFor="localAsrHfToken" className="text-sm font-medium">{t('settings:transcription.hfTokenLabel')}</label>
                  <div className="relative mt-1">
                    <Input
                      id="localAsrHfToken"
                      type={showHfToken ? 'text' : 'password'}
                      placeholder={t('settings:transcription.hfTokenPlaceholder')}
                      value={localAsrHfToken}
                      onChange={(event) => {
                        setLocalAsrHfToken(event.target.value)
                        setSpeakerModelAccess(null)
                        lastAutoCheckedTokenRef.current = null
                      }}
                      onKeyDown={(event) => event.key === 'Enter' && handleSaveTranscription()}
                      disabled={saving}
                      aria-label={t('settings:transcription.hfTokenAriaLabel')}
                      aria-describedby="localAsrHfToken-description speaker-model-access-detail"
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
                      onClick={() => setShowHfToken(!showHfToken)}
                      aria-label={showHfToken ? t('settings:transcription.hideToken') : t('settings:transcription.showToken')}
                      tabIndex={-1}
                    >
                      {showHfToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p id="localAsrHfToken-description" className="mt-1 text-xs text-muted-foreground">
                    {t('settings:transcription.hfTokenHint')}
                  </p>
                </div>

                <p
                  id="speaker-model-access-detail"
                  className={cn(
                    'mt-3 text-xs',
                    speakerModelAccess?.status === 'invalid-token' || speakerModelAccess?.status === 'terms-pending'
                      ? 'text-amber-800 dark:text-amber-300'
                      : 'text-muted-foreground'
                  )}
                >
                  {speakerModelAccess?.message ||
                    t('settings:transcription.accessNotCheckedYet')}
                  {speakerModelAccess?.account ? t('settings:transcription.accountSuffix', { account: speakerModelAccess.account }) : ''}
                  {speakerModelAccess?.status === 'granted' && isSpeakerTokenDirty
                    ? t('settings:transcription.saveToActivateSuffix')
                    : ''}
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={openSpeakerModelAccess}>
                    <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t('settings:transcription.reviewAccess')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={checkSpeakerModelAccess}
                    disabled={speakerModelAccessChecking}
                  >
                    <RefreshCw
                      className={cn('mr-2 h-4 w-4', speakerModelAccessChecking && 'animate-spin')}
                      aria-hidden="true"
                    />
                    {t('settings:transcription.checkAgain')}
                  </Button>
                </div>
              </section>

              {transcriptionProvider === 'gemini' ? (
                <>
                  <div>
                    <label htmlFor="geminiApiKey" className="text-sm font-medium">{t('settings:transcription.geminiApiKeyLabel')}</label>
                    <div className="relative mt-1">
                      <Input
                        id="geminiApiKey"
                        type={showApiKey ? 'text' : 'password'}
                        placeholder={t('settings:transcription.geminiApiKeyPlaceholder')}
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveTranscription()}
                        disabled={saving}
                        aria-label={t('settings:transcription.geminiApiKeyLabel')}
                        aria-describedby="geminiApiKey-description"
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                        onClick={() => setShowApiKey(!showApiKey)}
                        aria-label={showApiKey ? t('settings:transcription.hideApiKey') : t('settings:transcription.showApiKey')}
                        tabIndex={-1}
                      >
                        {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p id="geminiApiKey-description" className="text-xs text-muted-foreground mt-1">
                      <Trans i18nKey="settings:transcription.getApiKeyFrom">
                        Get your API key from{' '}
                        <a
                          href="https://aistudio.google.com/app/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          Google AI Studio
                        </a>
                      </Trans>
                    </p>
                  </div>

                  <div>
                    <label htmlFor="geminiModel" className="text-sm font-medium">{t('settings:transcription.modelLabel')}</label>
                    <select
                      id="geminiModel"
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveTranscription()}
                      disabled={saving}
                      aria-label={t('settings:transcription.modelLabel')}
                      aria-describedby="geminiModel-description"
                      className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                      {geminiModelOptions.map((model) => (
                        <option key={model.value} value={model.value}>
                          {model.label}
                        </option>
                      ))}
                    </select>
                    <p id="geminiModel-description" className="text-xs text-muted-foreground mt-1">
                      {modelsLoading
                        ? t('settings:transcription.modelLoadingHint')
                        : modelsLive
                          ? t('settings:transcription.modelLiveHint')
                          : t('settings:transcription.modelFallbackHint')}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="localAsrPath" className="text-sm font-medium">{t('settings:transcription.localAsrPathLabel')}</label>
                    <Input
                      id="localAsrPath"
                      value={localAsrPath}
                      onChange={(e) => setLocalAsrPath(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveTranscription()}
                      disabled={saving}
                      aria-label={t('settings:transcription.localAsrPathAriaLabel')}
                      aria-describedby="localAsrPath-description"
                      className="mt-1 font-mono text-xs"
                    />
                    <p id="localAsrPath-description" className="text-xs text-muted-foreground mt-1">
                      {t('settings:transcription.localAsrPathHint')}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="localAsrVocabularyFile" className="text-sm font-medium">{t('settings:transcription.vocabularyFileLabel')}</label>
                    <Input
                      id="localAsrVocabularyFile"
                      value={localAsrVocabularyFile}
                      onChange={(e) => setLocalAsrVocabularyFile(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveTranscription()}
                      disabled={saving}
                      aria-label={t('settings:transcription.vocabularyFileAriaLabel')}
                      aria-describedby="localAsrVocabularyFile-description"
                      className="mt-1 font-mono text-xs"
                    />
                    <p id="localAsrVocabularyFile-description" className="text-xs text-muted-foreground mt-1">
                      {t('settings:transcription.vocabularyFileHint')}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="localAsrDiarize"
                        checked={localAsrDiarize}
                        onChange={(e) => setLocalAsrDiarize(e.target.checked)}
                        disabled={saving}
                        aria-label={t('settings:transcription.diarizeAriaLabel')}
                        className="rounded"
                      />
                      <label htmlFor="localAsrDiarize" className="text-sm">
                        {t('settings:transcription.diarizeLabel')}
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <label htmlFor="localAsrNumBeams" className="text-sm">{t('settings:transcription.beamsLabel')}</label>
                      <Input
                        id="localAsrNumBeams"
                        type="number"
                        min={1}
                        max={10}
                        value={localAsrNumBeams}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10)
                          if (!isNaN(val)) setLocalAsrNumBeams(Math.min(10, Math.max(1, val)))
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveTranscription()}
                        disabled={saving}
                        aria-label={t('settings:transcription.beamsAriaLabel')}
                        className="w-20"
                      />
                    </div>
                  </div>
                </>
              )}

              <Button
                onClick={handleSaveTranscription}
                disabled={saving || !isTranscriptionDirty}
                aria-label={t('settings:transcription.saveAriaLabel')}
              >
                <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                {isTranscriptionDirty ? t('settings:transcription.save') : t('settings:transcription.saved')}
              </Button>
            </CardContent>
          </Card>

          {/* Library value classification (F16/spec-003) */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings:valueClassification.title')}</CardTitle>
              <CardDescription>
                {t('settings:valueClassification.description')}
              </CardDescription>
              {/* RE-3 — scope the promise honestly: the exclusion applies going
                  forward to content this version rates + attributes; it does not
                  retroactively pull already-woven graph facts from recordings an
                  earlier version analyzed. */}
              <p className="mt-1 px-6 text-xs text-muted-foreground">{LEGACY_GRAPH_DISCLOSURE}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {!hasValueProvider && (
                <p className="text-xs text-muted-foreground">{t('settings:valueClassification.needsProviderHint')}</p>
              )}
              {config?.transcription.valueClassificationEnabled === false && (
                <p className="text-xs text-muted-foreground">
                  {t('settings:valueClassification.disabledHint')}
                </p>
              )}
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleStartValueBackfill}
                  disabled={!hasValueProvider || valueBackfillRunning}
                  aria-label={t('settings:valueClassification.scanAriaLabel')}
                >
                  {valueBackfillRunning && <RefreshCw className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />}
                  {valueBackfillRunning
                    ? t('settings:valueClassification.scanning')
                    : valueBackfillRemaining > 0
                      ? t('settings:valueClassification.resumeScan', { remaining: valueBackfillRemaining })
                      : t('settings:valueClassification.scanUnrated')}
                </Button>
                {valueBackfillRunning && (
                  <Button variant="outline" onClick={handleCancelValueBackfill} aria-label={t('settings:valueClassification.cancelScanAriaLabel')}>
                    {t('settings:valueClassification.cancel')}
                  </Button>
                )}
              </div>
              {(valueBackfillRunning || valueBackfillProgress) && (
                <p className="text-xs text-muted-foreground" aria-live="polite">
                  {valueBackfillProgress
                    ? t('settings:valueClassification.progress', { processed: valueBackfillProgress.processed, total: valueBackfillProgress.total, marked: valueBackfillProgress.marked })
                    : t('settings:valueClassification.starting')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Chat Settings */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings:chat.title')}</CardTitle>
              <CardDescription>{t('settings:chat.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label id="chatProvider-label" className="text-sm font-medium">{t('settings:chat.providerLabel')}</label>
                <div className="flex gap-2 mt-2" role="group" aria-labelledby="chatProvider-label">
                  <Button
                    variant={chatProvider === 'gemini' ? 'default' : 'outline'}
                    onClick={() => setChatProvider('gemini')}
                    onKeyDown={(e) => e.key === 'Enter' && setChatProvider('gemini')}
                    disabled={saving}
                    aria-label={t('settings:chat.useGeminiAriaLabel')}
                    aria-pressed={chatProvider === 'gemini'}
                  >
                    {t('settings:chat.gemini')}
                  </Button>
                  <Button
                    variant={chatProvider === 'ollama' ? 'default' : 'outline'}
                    onClick={() => setChatProvider('ollama')}
                    onKeyDown={(e) => e.key === 'Enter' && setChatProvider('ollama')}
                    disabled={saving}
                    aria-label={t('settings:chat.useOllamaAriaLabel')}
                    aria-pressed={chatProvider === 'ollama'}
                  >
                    {t('settings:chat.ollama')}
                  </Button>
                </div>
              </div>

              {chatProvider === 'ollama' && (
                <div>
                  <label htmlFor="ollamaUrl" className="text-sm font-medium">{t('settings:chat.ollamaUrlLabel')}</label>
                  <Input
                    id="ollamaUrl"
                    type="url"
                    placeholder={t('settings:chat.ollamaUrlPlaceholder')}
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveChat()}
                    disabled={saving}
                    aria-label={t('settings:chat.ollamaUrlAriaLabel')}
                    aria-describedby="ollamaUrl-description"
                    className="mt-1"
                  />
                  <p id="ollamaUrl-description" className="text-xs text-muted-foreground mt-1">
                    {t('settings:chat.ollamaUrlHint')}
                  </p>
                </div>
              )}

              {/* C-CHAT: RAG Context Window Size */}
              <div>
                <label htmlFor="ragContextSize" className="text-sm font-medium">
                  {t('settings:chat.ragContextWindowLabel')}
                </label>
                <Input
                  id="ragContextSize"
                  type="number"
                  min={1}
                  max={20}
                  value={ragContextSize}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (!isNaN(val)) {
                      setRagContextSize(Math.min(20, Math.max(1, val)))
                    }
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveChat()}
                  disabled={saving}
                  aria-label={t('settings:chat.ragContextWindowAriaLabel')}
                  aria-describedby="ragContextSize-description"
                  className="mt-1"
                />
                <p id="ragContextSize-description" className="text-xs text-muted-foreground mt-1">
                  {t('settings:chat.ragContextWindowHint')}
                </p>
              </div>

              <Button
                onClick={handleSaveChat}
                disabled={saving || !isChatDirty}
                aria-label={t('settings:chat.saveAriaLabel')}
              >
                <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                {isChatDirty ? t('settings:chat.save') : t('settings:chat.saved')}
              </Button>
            </CardContent>
          </Card>

          {/* Storage */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings:storage.title')}</CardTitle>
              <CardDescription>{t('settings:storage.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Storage loading indicator */}
              {storageLoading && !storageInfo && (
                <div className="flex items-center gap-2 py-4 justify-center">
                  <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t('settings:storage.loadingInfo')}</span>
                </div>
              )}
              {/* B-SET-002: Storage error with retry button */}
              {storageError && (
                <div className="flex items-center gap-3 p-3 rounded-md bg-destructive/10 text-destructive border border-destructive/20">
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                  <div className="flex-1 text-sm">{storageError}</div>
                  <Button variant="outline" size="sm" onClick={loadStorageInfo}>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    {t('settings:storage.retry')}
                  </Button>
                </div>
              )}
              {storageInfo && (
                <>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">{t('settings:storage.totalSize')}</p>
                      <p className="font-medium">{formatBytes(storageInfo.totalSizeBytes)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t('settings:storage.recordings')}</p>
                      <p className="font-medium">{t('settings:storage.filesCount', { count: storageInfo.recordingsCount })}</p>
                    </div>
                  </div>

                  <div className="space-y-3 text-sm">
                    {([
                      ['recordings', t('settings:storage.recordings')],
                      ['transcripts', t('settings:storage.transcripts')],
                      ['data', t('settings:storage.data')]
                    ] as const).map(([folder, label]) => (
                      <div key={folder} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                        <div className="flex-1 min-w-0">
                          <label htmlFor={`${folder}Path`} className="text-muted-foreground text-xs">
                            {label}
                          </label>
                          <Input
                            id={`${folder}Path`}
                            value={storagePaths[folder]}
                            onChange={(e) => handleStoragePathChange(folder, e.target.value)}
                            onBlur={(e) => saveStoragePath(folder, e.target.value)}
                            onKeyDown={(e) => handleStoragePathKeyDown(folder, e)}
                            disabled={savingStorageFolder === folder}
                            className="mt-1 h-8 font-mono text-xs"
                            title={storagePaths[folder]}
                            aria-label={t('settings:storage.folderPathAriaLabel', { label })}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectStorageFolder(folder)}
                          disabled={savingStorageFolder === folder}
                          aria-label={t('settings:storage.selectFolderAriaLabel', { label: label.toLowerCase() })}
                        >
                          {savingStorageFolder === folder ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <FolderOpen className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Capture — turning ambient inputs (clipboard screenshots) into knowledge. */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings:capture.title')}</CardTitle>
              <CardDescription>{t('settings:capture.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <label htmlFor="autoCaptureScreenshotsToggle" className="text-sm font-medium">
                    {t('settings:capture.autoCaptureLabel')}
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    <Trans i18nKey="settings:capture.autoCaptureHint">
                      Watch the clipboard and automatically add copied screenshots as image
                      captures. You can always paste (<code>Ctrl/Cmd+V</code>) to add one manually,
                      even with this off.
                    </Trans>
                  </p>
                </div>
                <Switch
                  id="autoCaptureScreenshotsToggle"
                  checked={autoCaptureScreenshots}
                  onCheckedChange={setAutoCaptureScreenshots}
                  aria-label={t('settings:capture.autoCaptureLabel')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Developer / Advanced — QA logging lives here now (it used to sit in the
              always-visible sidebar footer, which the product owner flagged). */}
          <Card>
            <CardHeader>
              <CardTitle>{t('settings:developer.title')}</CardTitle>
              <CardDescription>{t('settings:developer.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <label htmlFor="qaLogsToggle" className="text-sm font-medium">
                    {t('settings:developer.qaLogsLabel')}
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    <Trans i18nKey="settings:developer.qaLogsHint">
                      Emit verbose <code>[QA-MONITOR]</code> diagnostics to the console. For
                      debugging only — leave off for normal use.
                    </Trans>
                  </p>
                </div>
                <Switch
                  id="qaLogsToggle"
                  checked={qaLogsEnabled}
                  onCheckedChange={setQaLogsEnabled}
                  aria-label={t('settings:developer.qaLogsAriaLabel')}
                />
              </div>
            </CardContent>
          </Card>

          {/* Health Check & Advanced Operations */}
          <HealthCheck />
        </div>
      </div>
    </div>
  )
}

export default Settings
