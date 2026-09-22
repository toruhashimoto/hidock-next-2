/**
 * ArtifactReader Component
 *
 * Renders the content area for non-audio library rows that are backed by an
 * imported artifact (image, PDF, note, data file, etc.). It fetches the capture's
 * artifacts and the first artifact's full content, then renders a preview suited
 * to the artifact kind. Audio rows are never handled here — they stay in the
 * existing SourceReader transcript/player path.
 */

import { useState, useEffect, useMemo } from 'react'
import { FolderOpen, Sparkles, FileText } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatDateTime, formatBytes } from '@/lib/utils'
import type { UnifiedRecording } from '@/types/unified-recording'

/** Slim artifact summary returned by `artifacts:getForCapture`. */
interface ArtifactSummary {
  id: string
  knowledgeCaptureId: string | null
  kind: string
  mime: string | null
  size: number | null
  storagePath: string | null
  hasText: boolean
  metadata: Record<string, unknown> | null
  createdAt: string
  filename?: string
}

/** Full artifact content returned by `artifacts:getContent`. */
interface ArtifactContent {
  kind: string
  mime: string | null
  storagePath: string | null
  textContent: string | null
  blobBase64?: string
}

interface ArtifactReaderProps {
  recording: UnifiedRecording
  onAskAboutSource?: () => void
}

/** Normalise the artifact kind string for dispatching the right surface. */
function normaliseKind(kind: string | null | undefined): string {
  return (kind ?? '').toLowerCase().trim()
}

/**
 * Metadata may arrive as a parsed object or as a JSON string depending on the
 * IPC serialisation path. This helper reads a single key, returning undefined
 * when the key is missing or the metadata cannot be parsed.
 */
function getMetadataValue(
  metadata: Record<string, unknown> | string | null | undefined,
  key: string
): unknown {
  if (!metadata) return undefined
  let parsed: Record<string, unknown>
  if (typeof metadata === 'string') {
    try {
      parsed = JSON.parse(metadata) as Record<string, unknown>
    } catch {
      return undefined
    }
  } else {
    parsed = metadata as Record<string, unknown>
  }
  return parsed[key]
}

/** Format the artifact's added date; tolerate null/undefined. */
function formatAddedAt(t: TFunction, createdAt: string | null | undefined): string {
  if (!createdAt) return t('library:artifactReader.unknownDate')
  try {
    return formatDateTime(createdAt)
  } catch {
    return String(createdAt)
  }
}

/** Common "related data" card shown for every artifact kind. */
function RelatedData({
  artifact,
  recording,
}: {
  artifact: ArtifactSummary
  recording: UnifiedRecording
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{t('library:artifactReader.relatedDataHeading')}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">{t('library:artifactReader.filenameLabel')}</p>
          <p className="truncate" title={recording.filename}>{recording.filename}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('library:artifactReader.kindLabel')}</p>
          <Badge variant="neutral" className="capitalize">{artifact.kind}</Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('library:artifactReader.sizeLabel')}</p>
          <p>{formatBytes(artifact.size ?? 0)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('library:artifactReader.dateAddedLabel')}</p>
          <p>{formatAddedAt(t, artifact.createdAt)}</p>
        </div>
      </div>
    </div>
  )
}

/** Actions available for every artifact kind. */
function ArtifactActions({
  artifact,
  onAskAboutSource,
}: {
  artifact: ArtifactSummary
  onAskAboutSource?: () => void
}) {
  const { t } = useTranslation()
  const handleOpenInFolder = () => {
    window.electronAPI?.artifacts?.openInFolder?.(artifact.id)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {onAskAboutSource && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAskAboutSource}
          className="gap-2"
          title={t('library:artifactReader.askAboutSourceTitle')}
        >
          <Sparkles className="h-4 w-4" />
          {t('library:artifactReader.askAboutSourceButton')}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleOpenInFolder}
        className="gap-2"
        title={t('library:artifactReader.openInFolderTitle')}
      >
        <FolderOpen className="h-4 w-4" />
        {t('library:artifactReader.openInFolderButton')}
      </Button>
    </div>
  )
}

/** Image preview plus the PixelRAG vision description, if any. */
function ImageSurface({
  artifact,
  content,
}: {
  artifact: ArtifactSummary
  content: ArtifactContent | null
}) {
  const { t } = useTranslation()
  const mime = content?.mime || artifact.mime || 'image/png'
  const src = content?.blobBase64 ? `data:${mime};base64,${content.blobBase64}` : undefined
  const description = getMetadataValue(artifact.metadata, 'description')

  return (
    <div className="space-y-4">
      {src ? (
        <img
          src={src}
          alt={artifact.filename || artifact.storagePath || t('library:artifactReader.imagePreviewAlt')}
          className="max-h-[420px] object-contain mx-auto rounded-md"
        />
      ) : (
        <div
          className={
            'flex items-center justify-center h-48 rounded-md border ' +
            'border-border bg-muted/30 text-muted-foreground'
          }
        >
          <p className="text-sm">{t('library:artifactReader.imagePreviewUnavailable')}</p>
        </div>
      )}
      <div className="rounded-lg border p-3 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          {t('library:artifactReader.extractedInfoHeading')}
        </p>
        <p className="text-sm">
          {typeof description === 'string' && description.trim()
            ? description
            : t('library:artifactReader.noDescriptionExtracted')}
        </p>
      </div>
    </div>
  )
}

/** PDF preview in Chromium's built-in viewer plus collapsible extracted text. */
function PdfSurface({
  artifact,
  content,
}: {
  artifact: ArtifactSummary
  content: ArtifactContent | null
}) {
  const { t } = useTranslation()
  // Chromium blocks data: URLs in iframes (top-level navigation restriction) —
  // the preview renders blank. A same-origin blob: URL is the supported path.
  const src = useMemo(() => {
    if (!content?.blobBase64) return undefined
    const bytes = Uint8Array.from(atob(content.blobBase64), (c) => c.charCodeAt(0))
    return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  }, [content?.blobBase64])
  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src)
    }
  }, [src])
  const pageCount = getMetadataValue(artifact.metadata, 'pageCount')

  return (
    <div className="space-y-4">
      {src ? (
        <iframe
          src={src}
          className="w-full h-[480px] rounded-md border border-border"
          title={artifact.filename || artifact.storagePath || t('library:artifactReader.pdfPreviewTitle')}
        />
      ) : (
        <div
          className={
            'flex items-center justify-center h-48 rounded-md border ' +
            'border-border bg-muted/30 text-muted-foreground'
          }
        >
          <p className="text-sm">{t('library:artifactReader.pdfPreviewUnavailable')}</p>
        </div>
      )}
      {content?.textContent && (
        <details className="rounded-md border border-border bg-background">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-muted/50">
            {t('library:artifactReader.extractedTextSummary')}
          </summary>
          <div className="max-h-64 overflow-y-auto border-t border-border p-3">
            <pre className="whitespace-pre-wrap text-sm font-sans">{content.textContent}</pre>
          </div>
        </details>
      )}
      {typeof pageCount === 'number' && pageCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('library:artifactReader.pageCount', { count: pageCount })}
        </p>
      )}
    </div>
  )
}

/** Plain-text surface for notes, markdown, json, csv, and similar text kinds. */
function TextSurface({ content }: { content: ArtifactContent | null }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <div className="max-h-[480px] overflow-y-auto rounded-md border border-border p-3 bg-muted/30">
        <pre className="whitespace-pre-wrap font-mono text-sm">
          {content?.textContent || t('library:artifactReader.noExtractedTextAvailable')}
        </pre>
      </div>
    </div>
  )
}

/** Graceful fallback when we cannot render a preview for the kind. */
function FallbackSurface({ kind }: { kind: string }) {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-muted-foreground">
      <p className="text-sm font-medium">{t('library:artifactReader.previewNotAvailable')}</p>
      {kind && <p className="text-xs mt-1 capitalize">{kind}</p>}
    </div>
  )
}

/** Empty-state fallback when no artifacts are linked to the capture. */
function EmptySurface() {
  const { t } = useTranslation()
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-muted-foreground">
      <p className="text-sm font-medium">{t('library:artifactReader.emptyTitle')}</p>
      <p className="text-xs mt-1">{t('library:artifactReader.emptyHint')}</p>
    </div>
  )
}

export function ArtifactReader({ recording, onAskAboutSource }: ArtifactReaderProps) {
  const { t } = useTranslation()
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>([])
  const [content, setContent] = useState<ArtifactContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setArtifacts([])
    setContent(null)

    async function load() {
      try {
        const api = window.electronAPI?.artifacts
        if (typeof api?.getForCapture !== 'function') {
          if (!cancelled) setLoading(false)
          return
        }

        const listRes = await api.getForCapture(recording.id)
        const list = (listRes?.success ? (listRes.data as ArtifactSummary[]) : []) ?? []
        if (cancelled) return
        setArtifacts(list)

        const primary = list[0]
        if (!primary) {
          if (!cancelled) setLoading(false)
          return
        }

        const getContent = api.getContent
        if (typeof getContent !== 'function') {
          if (!cancelled) setLoading(false)
          return
        }

        const contentRes = await getContent(primary.id)
        if (cancelled) return
        setContent(contentRes?.success ? (contentRes.data as ArtifactContent) : null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : t('library:artifactReader.loadFailedFallback'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [recording.id, t])

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <p className="text-sm">{t('library:artifactReader.loadingArtifact')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      </div>
    )
  }

  const artifact = artifacts[0]
  if (!artifact) {
    return <EmptySurface />
  }

  const kind = normaliseKind(artifact.kind)
  const isTextKind = ['note', 'txt', 'md', 'json', 'data'].includes(kind)

  return (
    <div className="space-y-4">
      {kind === 'image' && <ImageSurface artifact={artifact} content={content} />}
      {kind === 'pdf' && <PdfSurface artifact={artifact} content={content} />}
      {isTextKind && <TextSurface content={content} />}
      {!['image', 'pdf'].includes(kind) && !isTextKind && <FallbackSurface kind={kind} />}

      <RelatedData artifact={artifact} recording={recording} />
      <ArtifactActions artifact={artifact} onAskAboutSource={onAskAboutSource} />
    </div>
  )
}
