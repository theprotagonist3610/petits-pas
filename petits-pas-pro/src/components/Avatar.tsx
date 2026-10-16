import { useEffect, useId, useState } from 'react'
import { useAvatarUrl } from '@petits-pas/shared/avatars'
import { supabase } from '@/lib/supabase'
import { uploadAvatar } from '@/lib/avatar'
import { AVATAR_MAX_INPUT_BYTES, checkAvatarFile, prepareAvatar } from '@/lib/avatarImage'
import { errorMessage, type ProErrorCode } from '@/lib/errors'
import { Icon } from './Icon'
import { Alert, Button } from './ui'

/** Photo ronde d'un professionnel, ou ses initiales si elle n'est pas (encore) disponible. */
export function Avatar({ path, name, size = 40 }: { path: string | null | undefined; name: string; size?: number }) {
  const url = useAvatarUrl(supabase, path)
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
  return url ? (
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-sky-soft font-extrabold text-sky-brand"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials}
    </span>
  )
}

/** Choix, aperçu et envoi de la photo de profil. */
export function AvatarPicker({
  userId,
  professionalId,
  currentPath,
  name,
  onSaved,
}: {
  userId: string
  professionalId: string
  currentPath: string | null
  name: string
  onSaved: (path: string) => void
}) {
  const inputId = useId()
  const [photo, setPhoto] = useState<Blob>()
  const [preview, setPreview] = useState<string>()
  const [invalid, setInvalid] = useState<string>()
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!photo) return setPreview(undefined)
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  async function pick(file: File | undefined) {
    if (!file) return
    setError(undefined)
    const problem = checkAvatarFile(file)
    if (problem) {
      return setInvalid(problem === 'not_image' ? 'Choisissez une image (photo JPEG, PNG…).' : `Image trop lourde (${AVATAR_MAX_INPUT_BYTES / 1024 / 1024} Mo au maximum).`)
    }
    setInvalid(undefined)
    try {
      setPhoto(await prepareAvatar(file))
    } catch {
      setInvalid('Cette image ne peut pas être lue. Essayez une autre photo.')
    }
  }

  async function save() {
    if (!photo || busy) return
    setBusy(true)
    const result = await uploadAvatar(userId, professionalId, photo, currentPath)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    setPhoto(undefined)
    onSaved(result.data)
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
      <label htmlFor={inputId} className="relative cursor-pointer rounded-full ring-4 ring-sky-soft hover:opacity-90" title="Choisir une photo">
        {preview ? (
          <img src={preview} alt="Aperçu de la nouvelle photo" className="size-28 rounded-full object-cover" />
        ) : (
          <Avatar path={currentPath} name={name} size={112} />
        )}
        <span className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full bg-sky-brand text-white shadow">
          <Icon name="camera" size={18} />
        </span>
      </label>
      <input id={inputId} type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
      <div className="space-y-2 text-center sm:text-left">
        <p className="text-sm text-ink-soft">Photo de face, visage bien visible, sur fond neutre. Elle est montrée aux parents dont vous suivez la consultation.</p>
        {invalid && <Alert>{invalid}</Alert>}
        {error && <Alert>{errorMessage(error)}</Alert>}
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          <Button type="button" variant="secondary" onClick={() => document.getElementById(inputId)?.click()}>
            {currentPath || photo ? 'Choisir une autre photo' : 'Choisir une photo'}
          </Button>
          {photo && (
            <Button type="button" onClick={() => void save()} disabled={busy}>
              {busy ? 'Envoi…' : 'Enregistrer la photo'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
