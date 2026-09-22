/**
 * Artifact-type facets and capability helpers for the Knowledge Library.
 *
 * i18n note (Task 11c; reactivity fixed in Task 11d): `BUILTIN_ARTIFACT_TYPES`'s
 * `label`/`pluralLabel` fields are read directly as plain strings by
 * `LibraryFilters.tsx` (Part B, already committed) — `type.pluralLabel` — so
 * they cannot become functions. `sourceTypeLabel()` itself is a function and
 * is called fresh by SourceRow.tsx (via rowMeta.ts) on every render, but it
 * can only be as fresh as the descriptor it reads `.label` from.
 *
 * Task 11d fix: `label`/`pluralLabel` on every `BUILTIN_ARTIFACT_TYPES` entry
 * are `get` accessors, not plain data properties. `type.pluralLabel` is
 * syntactically identical either way, so no consumer changes — but a getter
 * calls `i18n.t()` fresh on every property access, so it reads whatever
 * language is current at that moment instead of freezing the value from
 * module-evaluation time. The same applies to the private `noteLabel()`/
 * `notePluralLabel()` helpers backing the 'note' descriptor.
 *
 * One gotcha this does NOT fix by itself: `normalizeArtifactTypeDescriptors()`
 * below builds its result by spreading descriptors (`{ ...builtin }` for any
 * builtin not overridden by the main-process registry) — a spread reads
 * (`[[Get]]`s) every own enumerable property, including getters, and bakes
 * the return value as a plain data property on the new object. Spreading a
 * getter-backed descriptor would silently re-freeze `label`/`pluralLabel` at
 * spread time, reintroducing the exact staleness this fix exists to remove.
 * `cloneArtifactTypeDescriptor()` (below) clones by property DESCRIPTOR
 * (`Object.getOwnPropertyDescriptors`) instead of by value, so the getter
 * itself — not its current return value — is what gets copied, and the
 * clone stays just as live as `builtin`. This is the one call site
 * (`pages/Library.tsx`'s `artifactTypes` state, fed by this function) that
 * needed deliberate handling beyond "add `get`"; the far more common path,
 * `sourceTypeLabel()` via `rowMeta.ts`, is fixed by the getters alone.
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

// Private helpers (not exported — mirrors the pre-existing NOTE_LABEL/
// NOTE_PLURAL_LABEL shape) so the 'note' key strings are written once and
// shared between the BUILTIN_ARTIFACT_TYPES entry below and the
// normalizeArtifactTypeDescriptors() merge branch further down, instead of
// being duplicated at both call sites.
const noteLabel = (): string => i18n.t('library:sourceType.noteLabel')
const notePluralLabel = (): string => i18n.t('library:sourceType.notePluralLabel')

export const BUILTIN_ARTIFACT_TYPES: LibraryArtifactTypeDescriptor[] = [
  {
    id: 'audio',
    get label() { return i18n.t('library:sourceType.audioLabel') },
    get pluralLabel() { return i18n.t('library:sourceType.audioPluralLabel') },
    extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'webm', 'hda', 'opus', 'wma'],
    capabilities: ['timed', 'conversation', 'rateable', 'transcribable', 'device-backed', 'previewable']
  },
  {
    id: 'image',
    get label() { return i18n.t('library:sourceType.imageLabel') },
    get pluralLabel() { return i18n.t('library:sourceType.imagePluralLabel') },
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'tiff'],
    capabilities: ['rateable', 'previewable']
  },
  {
    id: 'pdf',
    get label() { return i18n.t('library:sourceType.pdfLabel') },
    get pluralLabel() { return i18n.t('library:sourceType.pdfPluralLabel') },
    extensions: ['pdf'],
    capabilities: ['rateable', 'previewable']
  },
  {
    id: 'note',
    get label() { return noteLabel() },
    get pluralLabel() { return notePluralLabel() },
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

/**
 * Clones a descriptor by property DESCRIPTOR rather than by value. A plain
 * `{ ...descriptor }` would evaluate `label`/`pluralLabel` (getters on every
 * `BUILTIN_ARTIFACT_TYPES` entry — see the file-level i18n note) immediately
 * and bake the result as a fixed data property on the clone, silently
 * reintroducing the language-switch staleness Task 11d removed. Copying
 * property descriptors instead copies the getter itself, so the clone
 * stays exactly as live as the original.
 */
function cloneArtifactTypeDescriptor(descriptor: LibraryArtifactTypeDescriptor): LibraryArtifactTypeDescriptor {
  return Object.defineProperties({}, Object.getOwnPropertyDescriptors(descriptor)) as LibraryArtifactTypeDescriptor
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
          ? {
              ...descriptor,
              id: 'note',
              get label() { return noteLabel() },
              get pluralLabel() { return notePluralLabel() }
            }
          : { ...descriptor, extensions: [...descriptor.extensions], capabilities: [...descriptor.capabilities] }
      )
    }
  }

  for (const builtin of BUILTIN_ARTIFACT_TYPES) {
    if (!byId.has(builtin.id)) byId.set(builtin.id, cloneArtifactTypeDescriptor(builtin))
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
