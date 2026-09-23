import { useState, useCallback, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus, RefreshCw, ArrowRight } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select'
import type { Person, PersonType } from '@/types/knowledge'
import { toast } from '@/components/ui/toaster'

/** Selectable person types (mirrors PersonDetail's editor). */
const PERSON_TYPES: PersonType[] = ['team', 'candidate', 'customer', 'external', 'unknown']

interface AddPersonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called with the freshly created person on success. */
  onCreated: (person: Person) => void
  /** Called when the user chooses to open an existing duplicate instead. */
  onOpenExisting: (id: string) => void
}

/**
 * Small "Add Person" dialog: name is required; email, role, and type are optional
 * refinements. On an exact-name collision the backend returns DUPLICATE_NAME and we
 * offer to open the existing contact rather than silently minting a twin.
 */
export function AddPersonDialog({ open, onOpenChange, onCreated, onOpenExisting }: AddPersonDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [type, setType] = useState<PersonType>('unknown')
  const [submitting, setSubmitting] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  // Set when an exact-name contact already exists — offers to open it instead.
  const [duplicate, setDuplicate] = useState<{ id: string; name: string } | null>(null)

  const reset = useCallback(() => {
    setName('')
    setEmail('')
    setRole('')
    setType('unknown')
    setSubmitting(false)
    setNameError(null)
    setEmailError(null)
    setDuplicate(null)
  }, [])

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset()
      onOpenChange(next)
    },
    [onOpenChange, reset]
  )

  const handleSubmit = useCallback(
    async (e?: FormEvent) => {
      e?.preventDefault()
      setNameError(null)
      setEmailError(null)
      setDuplicate(null)

      const trimmedName = name.trim()
      if (!trimmedName) {
        setNameError(t('people:addPersonDialog.nameRequiredError'))
        return
      }
      const trimmedEmail = email.trim()
      if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        setEmailError(t('people:shared.invalidEmailError'))
        return
      }

      setSubmitting(true)
      try {
        const result = await window.electronAPI.contacts.create({
          name: trimmedName,
          email: trimmedEmail || null,
          role: role.trim() || undefined,
          type
        })
        if (result.success) {
          toast.success(t('people:addPersonDialog.toast.createdTitle'), t('people:addPersonDialog.toast.createdMessage', { name: result.data.name }))
          const created = result.data
          reset()
          onOpenChange(false)
          onCreated(created)
          return
        }
        // Exact-name collision → offer to open the existing contact.
        if ((result as any).error?.code === 'DUPLICATE_ENTRY') {
          const details = (result as any).error?.details
          if (details?.existingId) {
            setDuplicate({ id: details.existingId, name: details.existingName || trimmedName })
            return
          }
        }
        toast.error(t('people:addPersonDialog.toast.addFailedTitle'), (result as any).error?.message || t('common:errors.unknown'))
      } catch (error) {
        console.error('Failed to create contact:', error)
        toast.error(t('people:addPersonDialog.toast.addFailedTitle'), error instanceof Error ? error.message : t('people:errors.unexpectedErrorFallback'))
      } finally {
        setSubmitting(false)
      }
    },
    [name, email, role, type, onCreated, onOpenChange, reset]
  )

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              {t('people:addPersonDialog.title')}
            </DialogTitle>
            <DialogDescription>
              {t('people:addPersonDialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-person-name">
                {t('people:addPersonDialog.nameLabel')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add-person-name"
                value={name}
                autoFocus
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) setNameError(null)
                  if (duplicate) setDuplicate(null)
                }}
                placeholder={t('people:addPersonDialog.namePlaceholder')}
                aria-invalid={!!nameError}
                aria-describedby={nameError ? 'add-person-name-error' : undefined}
              />
              {nameError && (
                <p id="add-person-name-error" className="text-xs text-destructive">
                  {nameError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="add-person-email">{t('people:shared.emailLabel')}</Label>
              <Input
                id="add-person-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (emailError) setEmailError(null)
                }}
                placeholder={t('people:addPersonDialog.emailPlaceholder')}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'add-person-email-error' : undefined}
              />
              {emailError && (
                <p id="add-person-email-error" className="text-xs text-destructive">
                  {emailError}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="add-person-role">{t('people:shared.roleLabel')}</Label>
                <Input
                  id="add-person-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder={t('people:addPersonDialog.rolePlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-person-type">{t('people:addPersonDialog.typeLabel')}</Label>
                <Select value={type} onValueChange={(v) => setType(v as PersonType)}>
                  <SelectTrigger id="add-person-type" aria-label={t('people:shared.personTypeAriaLabel')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSON_TYPES.map((pt) => (
                      <SelectItem key={pt} value={pt}>
                        {t(`people:personTypeOption.${pt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {duplicate && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] px-3 py-2.5 text-xs">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  {t('people:addPersonDialog.duplicateWarning', { name: duplicate.name })}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7"
                  onClick={() => {
                    const id = duplicate.id
                    reset()
                    onOpenChange(false)
                    onOpenExisting(id)
                  }}
                >
                  {t('people:addPersonDialog.openExistingButton')}
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
              {t('people:shared.cancelButton')}
            </Button>
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-4 w-4" />
              )}
              {t('people:addPersonDialog.submitButton')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default AddPersonDialog
