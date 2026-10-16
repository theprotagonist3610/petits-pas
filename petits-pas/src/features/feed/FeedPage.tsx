import { useEffect, useId, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { FeedCommentRow, FeedPostRow } from '@petits-pas/shared/database.types'
import { COMMENT_MAX_LENGTH, POST_MAX_LENGTH, toThreads, useFeed, type FeedPost } from '@petits-pas/shared/feed'
import { usePlatform } from '@petits-pas/shared/platform'
import { useAvatarUrl } from '@petits-pas/shared/avatars'
import { feedService } from '@/lib/feed'
import { supabase } from '@/lib/supabase/client'
import { toAuthErrorCode } from '@/lib/auth'
import { compressPhoto } from '@/lib/image'
import { Button } from '@/components/Button'
import { Icon } from '@/components/Icon'
import { useAuth } from '@/features/auth/AuthProvider'
import { AuthCard, FormAlert, useAuthText } from '@/features/auth/AuthUi'

const relative = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
const fullDate = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })

/** « il y a 5 minutes », « hier », puis la date complète au-delà d'une semaine. */
function timeAgo(iso: string): string {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60_000)
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour')
  const days = Math.round(hours / 24)
  return Math.abs(days) < 7 ? relative.format(days, 'day') : fullDate.format(new Date(iso))
}

/** Auteur d'une publication ou d'un commentaire (photo pour les professionnels, logo pour l'équipe). */
function Author({ item, size = 40 }: { item: Pick<FeedPostRow, 'author_role' | 'author_name' | 'author_detail' | 'author_avatar_path' | 'created_at'>; size?: number }) {
  const { t } = useTranslation()
  const photo = useAvatarUrl(supabase, item.author_role === 'professional' ? item.author_avatar_path : null)
  const style = { width: size, height: size }
  return (
    <div className="flex items-center gap-2.5">
      {item.author_role === 'team' ? (
        <img src="/logo.png" alt="" style={style} className="shrink-0 rounded-full bg-surface p-0.5 ring-1 ring-line" />
      ) : photo ? (
        <img src={photo} alt="" style={style} className="shrink-0 rounded-full object-cover" />
      ) : (
        <span
          style={style}
          className={`flex shrink-0 items-center justify-center rounded-full font-extrabold ${
            item.author_role === 'professional' ? 'bg-leaf-soft text-leaf' : 'bg-sky-soft text-sky-brand'
          }`}
        >
          {item.author_name.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate leading-tight font-extrabold">
          {item.author_name}
          {item.author_role !== 'parent' && (
            <Icon name="check" size={14} className="ml-1 inline text-leaf" aria-label={t(`feed.roles.${item.author_role}`)} />
          )}
        </p>
        <p className="truncate text-xs text-ink-soft">
          {item.author_detail ?? t(`feed.roles.${item.author_role}`)} · {timeAgo(item.created_at)}
        </p>
      </div>
    </div>
  )
}

function Composer({ userId, onPublished }: { userId: string; onPublished: () => void }) {
  const [sent, setSent] = useState(false)
  const { t } = useTranslation()
  const text = useAuthText()
  const inputId = useId()
  const [body, setBody] = useState('')
  const [photo, setPhoto] = useState<Blob>()
  const [preview, setPreview] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!photo) return setPreview(undefined)
    const url = URL.createObjectURL(photo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true)
    setError(undefined)
    try {
      await feedService!.publish(userId, 'parent', body, photo)
      setBody('')
      setPhoto(undefined)
      setSent(true)
      onPublished()
    } catch (e) {
      setError(text.error(toAuthErrorCode(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-3xl bg-surface p-4 shadow-sm">
      <textarea
        className="block min-h-20 w-full resize-none rounded-2xl border border-line bg-cream px-4 py-3 outline-none focus:border-sky-brand"
        value={body}
        maxLength={POST_MAX_LENGTH}
        placeholder={t('feed.placeholder')}
        aria-label={t('feed.placeholder')}
        onChange={(e) => {
          setBody(e.target.value)
          setSent(false)
        }}
      />
      {preview && (
        <div className="relative">
          <img src={preview} alt="" className="max-h-64 w-full rounded-2xl object-cover" />
          <button
            type="button"
            onClick={() => setPhoto(undefined)}
            aria-label={t('feed.removePhoto')}
            className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      )}
      {error && <FormAlert>{error}</FormAlert>}
      {sent && <FormAlert tone="success">{t('feed.sentForReview')}</FormAlert>}
      <div className="flex items-center gap-2">
        <label htmlFor={inputId} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl px-3 font-bold text-ink-soft active:bg-ink/5">
          <Icon name="camera" size={20} /> {t('feed.addPhoto')}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void compressPhoto(file).then(({ blob }) => setPhoto(blob))
            e.target.value = ''
          }}
        />
        <Button type="submit" disabled={busy || !body.trim()} className="ml-auto w-auto px-6">
          {busy ? t('feed.publishing') : t('feed.publish')}
        </Button>
      </div>
    </form>
  )
}

function Comment({ comment, answer = false }: { comment: FeedCommentRow; answer?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${answer ? 'ml-6 border-l-4 border-leaf bg-leaf-soft' : 'bg-cream'}`}>
      <Author item={comment} size={30} />
      <p className="mt-1.5 text-sm whitespace-pre-line break-words">{comment.body}</p>
    </div>
  )
}

function Questions({ post, canAsk, onChanged }: { post: FeedPost; canAsk: boolean; onChanged: () => void }) {
  const { t } = useTranslation()
  const text = useAuthText()
  const [comments, setComments] = useState<FeedCommentRow[]>()
  const [question, setQuestion] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const load = () => feedService!.comments(post.id).then(setComments, (e) => setError(text.error(toAuthErrorCode(e))))

  useEffect(() => {
    void load()
    // Rechargé quand le nombre de commentaires change (nouvelle réponse reçue en direct) ; `load` ne dépend que d'eux.
  }, [post.id, post.comments_count])

  async function ask(event: FormEvent) {
    event.preventDefault()
    if (!question.trim() || busy) return
    setBusy(true)
    setError(undefined)
    try {
      await feedService!.comment(post.id, 'parent', question)
      setQuestion('')
      await load()
      onChanged()
    } catch (e) {
      setError(text.error(toAuthErrorCode(e)))
    } finally {
      setBusy(false)
    }
  }

  const threads = comments ? toThreads(comments) : []

  return (
    <div className="space-y-3 border-t border-line pt-3">
      {comments && threads.length === 0 && <p className="text-sm text-ink-soft">{t('feed.noQuestions')}</p>}
      {threads.map(({ question: q, answers }) => (
        <div key={q.id} className="space-y-2">
          <Comment comment={q} />
          {answers.map((a) => (
            <Comment key={a.id} comment={a} answer />
          ))}
          {answers.length === 0 && <p className="ml-6 text-xs text-ink-soft italic">{t('feed.waitingAnswer')}</p>}
        </div>
      ))}
      {error && <FormAlert>{error}</FormAlert>}
      {canAsk && (
        <form onSubmit={ask} className="space-y-2">
          <div className="flex items-end gap-2">
            <textarea
              className="block min-h-11 flex-1 resize-none rounded-2xl border border-line bg-cream px-4 py-2.5 text-sm outline-none focus:border-sky-brand"
              rows={1}
              value={question}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder={t('feed.askPlaceholder')}
              aria-label={t('feed.askPlaceholder')}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              aria-label={t('feed.ask')}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sky-brand text-white disabled:opacity-50"
            >
              <Icon name="send" size={20} />
            </button>
          </div>
          <p className="text-xs text-ink-soft">{t('feed.askHint')}</p>
        </form>
      )}
    </div>
  )
}

/** Longueur au-delà de laquelle le texte est replié (« Lire la suite »). */
const FOLD_AT = 400

function PostCard({ post, canAsk, onChanged }: { post: FeedPost; canAsk: boolean; onChanged: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const long = post.body.length > FOLD_AT

  return (
    <article className={`space-y-3 rounded-3xl bg-surface p-4 shadow-sm ${post.status !== 'published' ? 'ring-2 ring-honey/60' : ''}`}>
      <Author item={post} />
      {/* Sa propre publication, pas encore visible des autres (la base ne la montre qu'à son auteur). */}
      {post.status === 'pending' && <p className="rounded-xl bg-honey-soft px-3 py-2 text-sm font-bold">{t('feed.pending')}</p>}
      {post.status === 'rejected' && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{t('feed.rejected', { reason: post.rejection_reason ?? '' })}</p>
      )}
      <p className="whitespace-pre-line break-words">{long && !expanded ? `${post.body.slice(0, FOLD_AT).trimEnd()}…` : post.body}</p>
      {long && !expanded && (
        <button className="text-sm font-bold text-sky-brand" onClick={() => setExpanded(true)}>
          {t('feed.readMore')}
        </button>
      )}
      {post.image_path && (
        <img src={feedService!.imageUrl(post.image_path)} alt="" loading="lazy" className="max-h-96 w-full rounded-2xl bg-cream object-cover" />
      )}
      {post.status === 'published' && (
        <>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex min-h-11 items-center gap-2 text-sm font-bold text-ink-soft"
          >
            <Icon name="chat" size={18} />
            {open ? t('feed.hideQuestions') : t('feed.questions', { count: post.comments_count })}
          </button>
          {open && <Questions post={post} canAsk={canAsk} onChanged={onChanged} />}
        </>
      )}
    </article>
  )
}

/** Fil d'actualité : écran d'ouverture de l'application. */
export function FeedPage() {
  const { t } = useTranslation()
  const { status, user } = useAuth()
  const { platform } = usePlatform(supabase)
  const feed = useFeed(feedService)
  const closed = platform?.settings.maintenance === true
  const signedIn = status === 'signed_in' && !!user

  if (!feedService) {
    return <AuthCard>{t('feed.unavailable')}</AuthCard>
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">{t('feed.title')}</h1>
        <p className="text-ink-soft">{t('feed.subtitle')}</p>
      </div>

      {closed && <FormAlert>{platform?.settings.maintenance_message || t('feed.maintenance')}</FormAlert>}
      {signedIn && !closed && <Composer userId={user.id} onPublished={() => void feed.reload()} />}
      {status === 'signed_out' && (
        <AuthCard>
          <p>{t('feed.signInToPost')}</p>
          <Link to="/connexion?next=%2F" className="flex min-h-12 items-center justify-center rounded-2xl bg-sky-brand font-bold text-white">
            {t('feed.signIn')}
          </Link>
        </AuthCard>
      )}

      {feed.error !== undefined && !feed.posts && (
        // « Hors connexion » seulement si le téléphone l'est vraiment ; sinon, une autre erreur (serveur…).
        <div className="space-y-2">
          <FormAlert>{navigator.onLine ? t('feed.loadError') : t('feed.offline')}</FormAlert>
          <Button variant="secondary" onClick={() => void feed.reload()}>
            {t('feed.retry')}
          </Button>
        </div>
      )}
      {feed.posts?.length === 0 && <AuthCard>{t('feed.empty')}</AuthCard>}
      {feed.posts?.map((post) => (
        <PostCard key={post.id} post={post} canAsk={signedIn && !closed} onChanged={() => void feed.reload()} />
      ))}
      {feed.posts && feed.hasMore && (
        <Button variant="secondary" onClick={() => void feed.more()} disabled={feed.loadingMore}>
          {t('feed.more')}
        </Button>
      )}
    </div>
  )
}
