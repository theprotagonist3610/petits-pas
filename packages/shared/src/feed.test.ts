import { describe, expect, it } from 'vitest'
import type { FeedCommentRow } from './database.types'
import { toThreads } from './feed'

const c = (id: string, at: string, replyTo: string | null = null): FeedCommentRow => ({
  id,
  post_id: 'p',
  reply_to: replyTo,
  author_id: null,
  author_role: replyTo ? 'professional' : 'parent',
  author_name: id,
  author_detail: null,
  author_avatar_path: null,
  body: id,
  created_at: at,
  deleted_at: null,
  deleted_by: null,
})

describe('fil d’actualité', () => {
  it('regroupe questions et réponses, dans l’ordre chronologique', () => {
    const threads = toThreads([
      c('reponse-2', '2026-10-16T12:00:00Z', 'q1'),
      c('q2', '2026-10-16T11:00:00Z'),
      c('q1', '2026-10-16T09:00:00Z'),
      c('reponse-1', '2026-10-16T10:00:00Z', 'q1'),
    ])
    expect(threads.map((t) => [t.question.id, t.answers.map((a) => a.id)])).toEqual([
      ['q1', ['reponse-1', 'reponse-2']],
      ['q2', []],
    ])
  })

  it('ignore une réponse dont la question n’est plus visible (supprimée)', () => {
    expect(toThreads([c('orpheline', '2026-10-16T10:00:00Z', 'disparue')])).toEqual([])
  })
})
