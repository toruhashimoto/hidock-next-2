/**
 * Notes.
 *
 * The thing this competes with is Notepad. So the page opens on a list and a
 * textarea, a new note takes one click and no questions, and everything the AI
 * adds sits to the side of the writing rather than in front of it.
 */

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Sparkles, Trash2, Link2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toaster'
import { cn } from '@/lib/utils'
import { useNotes } from '@/features/notes/useNotes'
import { noteDisplayTitle, noteSubtitle } from '@/features/notes/noteTitle'

export default function Notes(): React.ReactElement {
  const { t } = useTranslation('notes')
  const {
    notes,
    selected,
    draft,
    saving,
    search,
    related,
    suggestions,
    setSearch,
    refresh,
    select,
    edit,
    create,
    remove,
    patch,
    analyzeNow,
    loadRelated,
    loadSuggestions,
  } = useNotes()

  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => void refresh(search), 250)
    return () => clearTimeout(timer)
  }, [search, refresh])

  /**
   * Start a note, and say it was started now.
   *
   * `live: true` is not a claim that a recording is running — the renderer
   * cannot know that, and a renderer clock can be wrong. It tells the main
   * process to look at the calendar for a meeting covering this moment and
   * attach the note to it. No meeting covering now means no link, not a guess.
   *
   * Every new note goes through here, because "I am writing this during the
   * meeting" is the case that cannot be reconstructed afterwards, and asking
   * the person to say so is exactly the friction this feature exists to avoid.
   */
  const startNote = useCallback(async () => {
    await create({ live: true })
  }, [create])

  // Ctrl+N / Cmd+N while the notes page is open. Not a system-wide accelerator:
  // one of those would pull focus out of whatever the person is doing, which on
  // this machine is a rule, not a preference.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // `code`, not `key`: on a layout where that physical key produces a
      // non-Latin character, `key` is that character and the shortcut dies.
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.code === 'KeyN') {
        event.preventDefault()
        void startNote()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [startNote])

  const withBusy = async (fn: () => Promise<{ success: boolean; error?: string }>, failure: string) => {
    setBusy(true)
    try {
      const result = await fn()
      if (!result.success) toast.error(failure, result.error)
      return result
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Input
            value={search}
            placeholder={t('notesPage.searchPlaceholder')}
            aria-label={t('notesPage.searchAriaLabel')}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button
            size="icon"
            aria-label={t('notesPage.newNoteAriaLabel')}
            title={t('notesPage.newNoteTitle')}
            onClick={() => void startNote()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {notes.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">
              {search
                ? t('notesPage.emptySearchMessage')
                : t('notesPage.emptyMessage')}
            </li>
          )}
          {notes.map((note) => (
            <li key={note.id}>
              <button
                type="button"
                onClick={() => select(note)}
                className={cn(
                  'w-full border-b border-border px-3 py-2 text-left hover:bg-accent',
                  selected?.id === note.id && 'bg-accent'
                )}
              >
                <p className="truncate text-sm font-medium">{noteDisplayTitle(note)}</p>
                <p className="truncate text-xs text-muted-foreground">{noteSubtitle(note)}</p>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {!selected ? (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          {t('notesPage.noSelectionMessage')}
        </div>
      ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <Input
              value={selected.title ?? ''}
              placeholder={selected.suggestedTitle || t('notesPage.titlePlaceholder')}
              aria-label={t('notesPage.titleAriaLabel')}
              className="max-w-md"
              onChange={(event) => void patch(selected.id, { title: event.target.value })}
            />
            <span className="text-xs text-muted-foreground">
              {saving ? t('notesPage.savingLabel') : t('notesPage.savedLabel')}
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void withBusy(() => analyzeNow(selected.id), t('notesPage.analyseFailedTitle'))
                }
              >
                <Sparkles className="mr-2 h-4 w-4" />
                {t('notesPage.analyseButtonLabel')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void withBusy(() => loadRelated(selected.id), t('notesPage.findRelatedFailedTitle'))
                }
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('notesPage.findRelatedButtonLabel')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void withBusy(() => loadSuggestions(selected.id), t('notesPage.suggestMeetingFailedTitle'))
                }
              >
                <Link2 className="mr-2 h-4 w-4" />
                {t('notesPage.suggestMeetingButtonLabel')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                aria-label={t('notesPage.deleteNoteAriaLabel')}
                onClick={() => void remove(selected.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <textarea
              value={draft}
              aria-label={t('notesPage.editorAriaLabel')}
              spellCheck
              autoFocus
              placeholder={t('notesPage.editorPlaceholder')}
              className="min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-sm outline-none"
              onChange={(event) => edit(event.target.value)}
            />

            <aside className="w-80 shrink-0 space-y-4 overflow-y-auto border-l border-border p-3 text-sm">
              {selected.aiStatus === 'failed' && (
                <p className="text-muted-foreground">
                  {t('notesPage.analysisFailedMessage', { error: selected.aiError ?? '' })}
                </p>
              )}
              {selected.summary && (
                <section>
                  <h2 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    {t('notesPage.summaryHeading')}
                  </h2>
                  <p>{selected.summary}</p>
                </section>
              )}
              {(selected.category || selected.tags.length > 0) && (
                <section>
                  <h2 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    {t('notesPage.categoryHeading')}
                  </h2>
                  <Input
                    value={selected.category ?? ''}
                    aria-label={t('notesPage.categoryAriaLabel')}
                    onChange={(event) => void patch(selected.id, { category: event.target.value })}
                  />
                  {selected.categorySource === 'user' && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('notesPage.categoryUserSetHint')}
                    </p>
                  )}
                  {selected.tags.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">{selected.tags.join(' · ')}</p>
                  )}
                </section>
              )}

              {selected.meetingId && (
                <section>
                  <h2 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    {t('notesPage.meetingHeading')}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {selected.linkSource === 'live'
                      ? t('notesPage.linkSourceLiveMessage')
                      : selected.linkSource === 'user'
                        ? t('notesPage.linkSourceUserMessage')
                        : t('notesPage.linkSourceSuggestedMessage')}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() =>
                      void patch(selected.id, { meetingId: null, linkSource: null })
                    }
                  >
                    {t('notesPage.unlinkButtonLabel')}
                  </Button>
                </section>
              )}

              {suggestions.length > 0 && (
                <section>
                  <h2 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    {t('notesPage.suggestionsHeading')}
                  </h2>
                  <ul className="space-y-2">
                    {suggestions.map((suggestion) => (
                      <li key={suggestion.meetingId} className="rounded border border-border p-2">
                        <p className="font-medium">{suggestion.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {suggestion.reasonKey
                            ? t(`notesPage.suggestionReason.${suggestion.reasonKey}`)
                            : suggestion.reason}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2"
                          onClick={() =>
                            void patch(selected.id, {
                              meetingId: suggestion.meetingId,
                              // Picking one off a list IS choosing by hand. The
                              // only link this app calls 'suggested' is one it
                              // made itself, and it never makes one.
                              linkSource: 'user',
                            })
                          }
                        >
                          {t('notesPage.linkToMeetingButtonLabel')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {related.length > 0 && (
                <section>
                  <h2 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    {t('notesPage.relatedHeading')}
                  </h2>
                  <ul className="space-y-2">
                    {related.map((item) => (
                      <li key={`${item.kind}-${item.id}`} className="rounded border border-border p-2">
                        <p className="font-medium">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{item.excerpt}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          </div>
        </div>
      )}
    </div>
  )
}
