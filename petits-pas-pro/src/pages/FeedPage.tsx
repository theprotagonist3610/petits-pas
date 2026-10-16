import { useEffect, useId, useState, type FormEvent } from 'react'
import type { FeedAuthorRole, FeedCommentRow, FeedPostRow } from '@petits-pas/shared/database.types'
import { COMMENT_MAX_LENGTH, POST_MAX_LENGTH, toThreads, useFeed, type FeedPost } from '@petits-pas/shared/feed'
import { useProAuth } from '@/auth/ProAuthProvider'
import { usePlatformSettings } from '@/auth/PlatformProvider'
import { useWorkspace } from '@/auth/workspace'
import { feed } from '@/lib/feed'
import { prepareFeedImage } from '@/lib/avatarImage'
import { errorMessage, toProErrorCode, type ProErrorCode } from '@/lib/errors'
import { formatAgo, formatDateTime } from '@/lib/format'
import { PageTitle } from '@/components/Layout'
import { Avatar } from '@/components/Avatar'
import { Icon } from '@/components/Icon'
import { Alert, Button, Dialog, inputClass } from '@/components/ui'

const ROLE_LABELS: Record<FeedAuthorRole, string> = { parent: 'Parent', professional: 'Professionnel de santé', team: 'Équipe' }

function Author({ item, size = 40 }: { item: Pick<FeedPostRow, 'author_role' | 'author_name' | 'author_detail' | 'author_avatar_path' | 'created_at'>; size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      {item.author_role === 'team' ? (
        <img src="/logo.png" alt="" width={size} height={size} className="shrink-0 rounded-full bg-surface p-0.5 ring-1 ring-line" />
      ) : (
        <Avatar path={item.author_role === 'professional' ? item.author_avatar_path : null} name={item.author_name} size={size} />
      )}
      <div className="min-w-0">
        <p className="truncate leading-tight font-extrabold">
          {item.author_name}
          {item.author_role !== 'parent' && <Icon name="check" size={14} className="ml-1 inline text-leaf" />}
        </p>
        <p className="truncate text-xs text-ink-soft" title={formatDateTime(item.created_at)}>
          {item.author_detail ?? ROLE_LABELS[item.author_role]} · {formatAgo(item.created_at)}
        </p>
      </div>
    </div>
  )
}

/** Rôles sous lesquels ce compte peut publier ou répondre. */
function useAuthorRoles(): FeedAuthorRole[] {
  const { canPractice, isAdmin } = useProAuth()
  return [...(canPractice ? (['professional'] as const) : []), ...(isAdmin ? (['team'] as const) : [])]
}

function RolePicker({ value, onChange }: { value: FeedAuthorRole; onChange: (role: FeedAuthorRole) => void }) {
  const { professional } = useProAuth()
  const roles = useAuthorRoles()
  if (roles.length < 2) return null
  return (
    <label className="flex items-center gap-2 text-sm text-ink-soft">
      Publier en tant que
      <select className="rounded-lg border border-line bg-surface px-2 py-1 font-bold text-ink" value={value} onChange={(e) => onChange(e.target.value as FeedAuthorRole)}>
        {roles.map((r) => (
          <option key={r} value={r}>
            {r === 'team' ? 'Équipe Petits Pas' : `${professional?.first_name} ${professional?.last_name}`}
          </option>
        ))}
      </select>
    </label>
  )
}

function Composer({ defaultRole, onPublished }: { defaultRole: FeedAuthorRole; onPublished: () => void }) {
  const { user } = useProAuth()
  const inputId = useId()
  const [role, setRole] = useState(defaultRole)
  const [body, setBody] = useState('')
  const [photo, setPhoto] = useState<Blob>()
  const [preview, setPreview] = useState<string>()
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!photo) return setPreview(undefined)
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim() || busy || !user) return
    setBusy(true)
    setError(undefined)
    try {
      await feed.publish(user.id, role, body, photo)
      setBody('')
      setPhoto(undefined)
      onPublished()
    } catch (e) {
      setError(toProErrorCode(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-surface p-5 shadow-sm">
      <RolePicker value={role} onChange={setRole} />
      <textarea
        className={`${inputClass} min-h-24 resize-y py-2`}
        value={body}
        maxLength={POST_MAX_LENGTH}
        placeholder="Partagez un conseil de santé, une information de prévention…"
        aria-label="Nouvelle publication"
        onChange={(e) => setBody(e.target.value)}
      />
      {preview && (
        <div className="relative w-fit">
          <img src={preview} alt="" className="max-h-56 rounded-xl" />
          <button
            type="button"
            onClick={() => setPhoto(undefined)}
            aria-label="Retirer la photo"
            className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {error && <Alert>{errorMessage(error)}</Alert>}
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-3 font-bold text-ink-soft hover:bg-ink/5">
          <Icon name="camera" size={18} /> Photo
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void prepareFeedImage(file).then(setPhoto, () => setError('invalid_data'))
            e.target.value = ''
          }}
        />
        <Button type="submit" disabled={busy || !body.trim()} className="ml-auto">
          {busy ? 'Publication…' : 'Publier'}
        </Button>
      </div>
    </form>
  )
}

/** Suppression douce (administrateurs) : confirmation, puis élément masqué pour tous sauf les administrateurs. */
function ModerationButton({ kind, id, deleted, onDone }: { kind: 'post' | 'comment'; id: string; deleted: boolean; onDone: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)

  async function apply() {
    setBusy(true)
    try {
      await feed.setDeleted(kind, id, !deleted)
      setConfirming(false)
      onDone()
    } catch (e) {
      setError(toProErrorCode(e))
    } finally {
      setBusy(false)
    }
  }

  if (deleted) {
    return (
      <button className="text-xs font-bold text-sky-brand hover:underline" onClick={() => void apply()} disabled={busy}>
        Rétablir
      </button>
    )
  }
  return (
    <>
      <button className="text-xs font-bold text-red-700 hover:underline" onClick={() => setConfirming(true)}>
        Supprimer
      </button>
      {confirming && (
        <Dialog title={kind === 'post' ? 'Supprimer la publication ?' : 'Supprimer ce message ?'} onClose={() => setConfirming(false)} busy={busy}>
          <p className="text-ink-soft">
            Elle ne sera plus visible des parents ni des professionnels. Elle reste conservée et vous pourrez la rétablir.
          </p>
          {error && <Alert>{errorMessage(error)}</Alert>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={() => void apply()} disabled={busy}>
              Supprimer
            </Button>
          </div>
        </Dialog>
      )}
    </>
  )
}

function CommentBlock({ comment, answer, onChanged }: { comment: FeedCommentRow; answer?: boolean; onChanged: () => void }) {
  const { isAdmin } = useProAuth()
  const deleted = !!comment.deleted_at
  return (
    <div className={`rounded-xl p-3 ${answer ? 'ml-6 border-l-4 border-leaf bg-leaf-soft' : 'bg-cream'} ${deleted ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <Author item={comment} size={30} />
        {isAdmin && <ModerationButton kind="comment" id={comment.id} deleted={deleted} onDone={onChanged} />}
      </div>
      {deleted && <p className="mt-1 text-xs font-bold text-red-700">Supprimé (visible des administrateurs seulement)</p>}
      <p className="mt-1.5 text-sm whitespace-pre-line break-words">{comment.body}</p>
    </div>
  )
}

function AnswerForm({ postId, questionId, role, onAnswered }: { postId: string; questionId: string; role: FeedAuthorRole; onAnswered: () => void }) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true)
    try {
      await feed.comment(postId, role, body, questionId)
      setBody('')
      setOpen(false)
      onAnswered()
    } catch (e) {
      setError(toProErrorCode(e))
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button className="ml-6 text-sm font-bold text-leaf hover:underline" onClick={() => setOpen(true)}>
        Répondre
      </button>
    )
  }
  return (
    <form onSubmit={submit} className="ml-6 space-y-2">
      <textarea
        className={`${inputClass} min-h-20 py-2 text-sm`}
        value={body}
        maxLength={COMMENT_MAX_LENGTH}
        placeholder="Votre réponse au parent (visible de tous)…"
        autoFocus
        onChange={(e) => setBody(e.target.value)}
      />
      {error && <Alert>{errorMessage(error)}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !body.trim()}>
          Publier la réponse
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Annuler
        </Button>
      </div>
    </form>
  )
}

function PostCard({ post, answerRole, canWrite, onChanged }: { post: FeedPost; answerRole: FeedAuthorRole | undefined; canWrite: boolean; onChanged: () => void }) {
  const { isAdmin } = useProAuth()
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState<FeedCommentRow[]>()
  const deleted = !!post.deleted_at
  // Refusée ou supprimée : grisée, sans nouvelle réponse possible.
  const muted = deleted || post.status === 'rejected'

  useEffect(() => {
    if (open) void feed.comments(post.id).then(setComments)
  }, [open, post.id, post.comments_count])

  const reload = () => {
    void feed.comments(post.id).then(setComments)
    onChanged()
  }
  const threads = comments ? toThreads(comments) : []
  const unanswered = threads.filter((t) => t.answers.length === 0).length

  return (
    <article className={`space-y-3 rounded-2xl bg-surface p-5 shadow-sm ${muted ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <Author item={post} />
        {isAdmin && <ModerationButton kind="post" id={post.id} deleted={deleted} onDone={onChanged} />}
      </div>
      {deleted && <p className="text-xs font-bold text-red-700">Publication supprimée (visible des administrateurs seulement)</p>}
      {post.status === 'rejected' && (
        <p className="text-xs font-bold text-red-700">Refusée : {post.rejection_reason} (visible de l’auteur et des administrateurs seulement)</p>
      )}
      <p className="whitespace-pre-line break-words">{post.body}</p>
      {post.image_path && <img src={feed.imageUrl(post.image_path)} alt="" loading="lazy" className="max-h-96 rounded-xl" />}
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-2 text-sm font-bold text-ink-soft hover:text-ink">
        <Icon name="chat" size={18} />
        {open ? 'Masquer les questions' : post.comments_count ? `${post.comments_count} question${post.comments_count > 1 ? 's' : ''} et réponse${post.comments_count > 1 ? 's' : ''}` : 'Aucune question'}
        {open && unanswered > 0 && <span className="rounded-full bg-sun px-2 py-0.5 text-xs text-white">{unanswered} sans réponse</span>}
      </button>
      {open && (
        <div className="space-y-3 border-t border-line pt-3">
          {comments && threads.length === 0 && <p className="text-sm text-ink-soft">Les parents peuvent poser leurs questions depuis l’application Petits Pas.</p>}
          {threads.map(({ question, answers }) => (
            <div key={question.id} className="space-y-2">
              <CommentBlock comment={question} onChanged={reload} />
              {answers.map((a) => (
                <CommentBlock key={a.id} comment={a} answer onChanged={reload} />
              ))}
              {answerRole && canWrite && !question.deleted_at && !muted && (
                <AnswerForm postId={post.id} questionId={question.id} role={answerRole} onAnswered={reload} />
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

/** Validation d'une publication de parent (administrateurs). */
function ReviewCard({ post, onDone }: { post: FeedPost; onDone: () => void }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<ProErrorCode>()
  const [busy, setBusy] = useState(false)

  async function review(approve: boolean) {
    if (!approve && !reason.trim()) return
    setBusy(true)
    try {
      await feed.review(post.id, approve, reason)
      setRejecting(false)
      onDone()
    } catch (e) {
      setError(toProErrorCode(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="space-y-3 rounded-2xl border-2 border-honey/60 bg-surface p-4">
      <Author item={post} />
      <p className="whitespace-pre-line break-words">{post.body}</p>
      {post.image_path && <img src={feed.imageUrl(post.image_path)} alt="" loading="lazy" className="max-h-72 rounded-xl" />}
      {error && <Alert>{errorMessage(error)}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void review(true)} disabled={busy}>
          <Icon name="check" size={18} /> Valider et publier
        </Button>
        <Button variant="ghost" onClick={() => setRejecting(true)} disabled={busy}>
          Refuser
        </Button>
      </div>
      {rejecting && (
        <Dialog title="Refuser la publication" onClose={() => setRejecting(false)} busy={busy}>
          <p className="mb-3 text-sm text-ink-soft">Le motif est visible par le parent seulement. La publication ne sera jamais diffusée.</p>
          <textarea
            className={`${inputClass} min-h-20 py-2`}
            value={reason}
            maxLength={500}
            autoFocus
            placeholder="Ex. : information médicale à vérifier, données personnelles d’un enfant…"
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={() => void review(false)} disabled={busy || !reason.trim()}>
              Refuser la publication
            </Button>
          </div>
        </Dialog>
      )}
    </li>
  )
}

/** Fil d'actualité : écran d'ouverture de Petits Pas Pro. */
export function FeedPage() {
  const { isAdmin, canPractice } = useProAuth()
  const { platform } = usePlatformSettings()
  const [workspace] = useWorkspace({ isAdmin, canPractice })
  const roles = useAuthorRoles()
  const list = useFeed(feed)
  // Dans l'espace administration, on publie par défaut au nom de l'équipe.
  const defaultRole: FeedAuthorRole | undefined = workspace === 'admin' && roles.includes('team') ? 'team' : roles[0]
  const closed = platform?.settings.maintenance === true && !isAdmin
  // En attente : section de validation (administrateurs). Refusées : visibles des administrateurs seulement.
  const pending = (list.posts ?? []).filter((p) => p.status === 'pending' && !p.deleted_at)
  const published = (list.posts ?? []).filter((p) => p.status !== 'pending')

  return (
    <>
      <PageTitle title="Fil d’actualité" subtitle="Informez les parents et répondez à leurs questions." />
      <div className="mx-auto max-w-2xl space-y-4">
        {closed && <Alert>Plateforme en maintenance : les publications sont suspendues.</Alert>}
        {defaultRole && !closed && <Composer key={defaultRole} defaultRole={defaultRole} onPublished={() => void list.reload()} />}
        {list.error !== undefined && !list.posts && <Alert>{errorMessage(toProErrorCode(list.error))}</Alert>}
        {isAdmin && pending.length > 0 && (
          <section className="space-y-3 rounded-2xl bg-honey-soft p-4">
            <h2 className="font-extrabold">À valider ({pending.length})</h2>
            <p className="text-sm text-ink-soft">Publications de parents, visibles par leur auteur seulement tant qu’elles ne sont pas validées.</p>
            <ul className="space-y-3">
              {pending.map((post) => (
                <ReviewCard key={post.id} post={post} onDone={() => void list.reload()} />
              ))}
            </ul>
          </section>
        )}
        {list.posts && published.length === 0 && <p className="text-center text-ink-soft">Aucune publication pour le moment.</p>}
        {published.map((post) => (
          <PostCard key={post.id} post={post} answerRole={defaultRole} canWrite={!closed} onChanged={() => void list.reload()} />
        ))}
        {list.posts && list.hasMore && (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => void list.more()} disabled={list.loadingMore}>
              Voir plus de publications
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
