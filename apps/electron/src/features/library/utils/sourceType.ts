/**
 * Artifact-type facets and capability helpers for the Knowledge Library.
 *
 * i18n note (Task 11c): `BUILTIN_ARTIFACT_TYPES`'s `label`/`pluralLabel`
 * fields are read directly as plain strings by `LibraryFilters.tsx` (Part B,
 * already committed) — `type.pluralLabel` — so they cannot become functions.
 * They are resolved once via the shared `i18n` singleton at module-eval time
 * (task brief "approach 2", "value needed at module scope"); see the
 * file-level note in utils/deletionCopy.ts for the full reasoning and the
 * known non-reactive-to-live-language-switch limitation. `sourceTypeLabel()`
 * itself is a function and is called fresh by SourceRow.tsx on every render,
 * but it can only be as fresh as the (module-scope) descriptor it reads
 * `.label` from.
 */

import type { UnifiedRecording } from '@/types/unified-recording'
import i18n from '@/i18n'

export type ArtifactCapability =
  | 'timed'
  | 'conversation'
  | 'rateable'
  | 'transcribable'
  | 'device-backed'
  | 'previewable'

export interface LibraryArtifactTypeDescriptor {
  id: string
  label: string
  pluralLabel: string
  extensions: string[]
  capabilities: ArtifactCapability[]
}

export type LibrarySourceType = string
export type SourceTypeFilter = 'all' | (string & {})

const NOTE_LABEL = i18n.t('library:sourceType.noteLabel')
const NOTE_PLURAL_LABEL = i18n.t('library:sourceType.notePluralLabel')

export const BUILTIN_ARTIFACT_TYPES: LibraryArtifactTypeDescriptor[] = [
  {
    id: 'audio',
    label: i18n.t('library:sourceType.audioLabel'),
    pluralLabel: i18n.t('library:sourceType.audioPluralLabel'),
    extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'webm', 'hda', 'opus', 'wma'],
    capabilities: ['timed', 'conversation', 'rateable', 'transcribable', 'device-backed', 'previewable']
  },
  {
    id: 'image',
    label: i18n.t('library:sourceType.imageLabel'),
    pluralLabel: i18n.t('library:sourceType.imagePluralLabel'),
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'tiff'],
    capabilities: ['rateable', 'previewable']
  },
  {
    id: 'pdf',
    label: i18n.t('library:sourceType.pdfLabel'),
    pluralLabel: i18n.t('library:sourceType.pdfPluralLabel'),
    extensions: ['pdf'],
    capabilities: ['rateable', 'previewable']
  },
  {
    id: 'note',
    label: NOTE_LABEL,
    pluralLabel: NOTE_PLURAL_LABEL,
    extensions: ['md', 'markdown', 'txt', 'text', 'rtf', 'json', 'csv', 'tsv', 'yaml', 'yml'],
    capabilities: ['rateable', 'previewable']
  }
]

export function getExtension(filename: string | undefined | null): string {
  if (!filename) return ''
  const idx = filename.lastIndexOf('.')
  if (idx <= 0 || idx === filename.length - 1) return ''
  return filename.slice(idx + 1).toLowerCase()
}

/** Fold extraction-level text kinds into one useful Library facet; retain add-on kinds. */
export function normalizeArtifactTypeDescriptors(
  descriptors: LibraryArtifactTypeDescriptor[] | null | undefined
): LibraryArtifactTypeDescriptor[] {
  if (!descriptors?.length) return BUILTIN_ARTIFACT_TYPES

  const byId = new Map<string, LibraryArtifactTypeDescriptor>()
  for (const descriptor of descriptors) {
    if (!descriptor?.id || !descriptor.label || !Array.isArray(descriptor.extensions)) continue
    const id = ['md', 'txt', 'json'].includes(descriptor.id) ? 'note' : descriptor.id
    const existing = byId.get(id)
    if (existing) {
      existing.extensions = Array.from(new Set([...existing.extensions, ...descriptor.extensions]))
      existing.capabilities = Array.from(new Set([...existing.capabilities, ...descriptor.capabilities]))
    } else {
      byId.set(
        id,
        id === 'note'
          ? { ...descriptor, id: 'note', label: NOTE_LABEL, pluralLabel: NOTE_PLURAL_LABEL }
          : { ...descriptor, extensions: [...descriptor.extensions], capabilities: [...descriptor.capabilities] }
      )
    }
  }

  for (const builtin of BUILTIN_ARTIFACT_TYPES) {
    if (!byId.has(builtin.id)) byId.set(builtin.id, { ...builtin })
  }
  return Array.from(byId.values())
}

export function getSourceType(
  recording: Pick<UnifiedRecording, 'filename' | 'location'>,
  descriptors: LibraryArtifactTypeDescriptor[] = BUILTIN_ARTIFACT_TYPES
): LibrarySourceType {
  if (recording.location === 'device-only' || recording.location === 'both') return 'audio'

  const ext = getExtension(recording.filename)
  if (!ext) return 'audio'
  return descriptors.find((descriptor) => descriptor.extensions.includes(ext))?.id ?? 'unknown'
}

export function getArtifactTypeDescriptor(
  type: string,
  descriptors: LibraryArtifactTypeDescriptor[] = BUILTIN_ARTIFACT_TYPES
): LibraryArtifactTypeDescriptor | undefined {
  return descriptors.find((descriptor) => descriptor.id === type)
}

export function sourceTypeHasCapability(
  type: string,
  capability: ArtifactCapability,
  descriptors: LibraryArtifactTypeDescriptor[] = BUILTIN_ARTIFACT_TYPES
): boolean {
  return getArtifactTypeDescriptor(type, descriptors)?.capabilities.includes(capability) ?? false
}

export function sourceTypeHasDuration(type: LibrarySourceType): boolean {
  return sourceTypeHasCapability(type, 'timed')
}

export function sourceTypeLabel(type: LibrarySourceType): string {
  return getArtifactTypeDescriptor(type)?.label ?? (type === 'unknown' ? i18n.t('library:sourceType.fileFallback') : type)
}

export function matchesSourceTypeFilter(type: LibrarySourceType, filter: SourceTypeFilter): boolean {
  return filter === 'all' || type === filter
}
