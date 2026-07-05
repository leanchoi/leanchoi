'use client'

import { useEffect, useState, useCallback } from 'react'
import { Field } from '@/lib/fields'
import { Rec, UserLite } from './types'
import { CellCtx, FieldInput, CellValue } from './cells'
import Avatar from './Avatar'
import Modal from './Modal'

type Comment = {
  id: string
  body: string
  created_at: string
  user_name: string
  user_avatar: string | null
}

function fmtDate(iso: string) {
  const d = new Date(iso.includes('T') ? iso : iso + 'Z')
  return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

// Resalta @menciones en un comentario
function CommentBody({ text }: { text: string }) {
  const parts = text.split(/(@[a-zA-Z0-9._-]+)/g)
  return (
    <span className="whitespace-pre-wrap break-words text-sm">
      {parts.map((p, i) =>
        p.startsWith('@') ? (
          <span key={i} className="rounded bg-teal-900/60 px-1 font-medium text-teal-300">
            {p}
          </span>
        ) : (
          p
        )
      )}
    </span>
  )
}

export default function RecordModal({
  record,
  fields,
  ctx,
  canEdit,
  canComment,
  users,
  onClose,
  onPatch,
  onDelete,
}: {
  record: Rec
  fields: Field[]
  ctx: CellCtx
  canEdit: boolean
  canComment: boolean
  users: UserLite[]
  onClose: () => void
  onPatch: (fieldId: string, value: any) => void
  onDelete: () => void
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [sending, setSending] = useState(false)
  const [mentionOpen, setMentionOpen] = useState(false)
  const primary = fields[0]

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/records/${record.id}/comments`)
    if (res.ok) setComments((await res.json()).comments)
  }, [record.id])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  async function sendComment(e: React.FormEvent) {
    e.preventDefault()
    if (!newComment.trim()) return
    setSending(true)
    const res = await fetch(`/api/records/${record.id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: newComment }),
    })
    setSending(false)
    if (res.ok) {
      setNewComment('')
      loadComments()
    }
  }

  // autocompletar @mención con el último token
  const mentionMatch = newComment.match(/@([a-zA-Z0-9._-]*)$/)
  const mentionCandidates = mentionMatch
    ? users.filter((u) =>
        u.username.toLowerCase().startsWith(mentionMatch[1].toLowerCase())
      )
    : []

  return (
    <Modal open onClose={onClose} wide>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold">
          {String(record.data[primary?.id] ?? '') || 'Sin nombre'}
        </h2>
        <div className="flex items-center gap-1">
          {canEdit && (
            <button
              className="btn-ghost text-red-400"
              onClick={() => {
                if (confirm('¿Borrar este registro?')) onDelete()
              }}
            >
              Borrar
            </button>
          )}
          <button onClick={onClose} className="btn-ghost px-2 text-lg leading-none">
            ✕
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {fields.map((f) => (
            <div key={f.id}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {f.name}
              </p>
              {canEdit && f.type !== 'createdtime' ? (
                <FieldInput
                  field={f}
                  value={record.data[f.id]}
                  onChange={(v) => onPatch(f.id, v)}
                  ctx={ctx}
                />
              ) : (
                <div className="min-h-8 rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-1.5 text-sm">
                  <CellValue
                    field={f}
                    value={f.type === 'createdtime' ? record.created_at : record.data[f.id]}
                    ctx={ctx}
                    compact={false}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Comentarios
          </p>
          <div className="max-h-80 flex-1 space-y-3 overflow-y-auto pr-1">
            {comments.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-500">Sin comentarios todavía</p>
            )}
            {comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Avatar name={c.user_name} avatar={c.user_avatar} userId={(c as any).user_num_id} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-400">
                    <span className="font-medium text-slate-200">{c.user_name}</span> ·{' '}
                    {fmtDate(c.created_at)}
                  </p>
                  <CommentBody text={c.body} />
                </div>
              </div>
            ))}
          </div>
          {canComment && (
            <form onSubmit={sendComment} className="relative mt-3">
              {mentionCandidates.length > 0 && mentionOpen && (
                <div className="popover absolute bottom-full left-0 mb-1 w-full p-1">
                  {mentionCandidates.slice(0, 5).map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-800"
                      onClick={() => {
                        setNewComment(newComment.replace(/@[a-zA-Z0-9._-]*$/, `@${u.username} `))
                        setMentionOpen(false)
                      }}
                    >
                      <Avatar name={u.name} avatar={u.avatar} userId={u.id} size={20} />
                      {u.name} <span className="text-xs text-slate-500">@{u.username}</span>
                    </button>
                  ))}
                </div>
              )}
              <textarea
                className="input min-h-[60px] text-sm"
                placeholder="Comentá… usá @usuario para mencionar"
                value={newComment}
                onChange={(e) => {
                  setNewComment(e.target.value)
                  setMentionOpen(/@[a-zA-Z0-9._-]*$/.test(e.target.value))
                }}
              />
              <button type="submit" disabled={sending || !newComment.trim()} className="btn-primary mt-1.5 w-full py-1.5">
                {sending ? 'Enviando…' : 'Comentar'}
              </button>
            </form>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Creado el {fmtDate(record.created_at)}
        {record.created_by
          ? ` por ${users.find((u) => u.id === record.created_by)?.name || 'usuario eliminado'}`
          : ' desde un formulario público'}
      </p>
    </Modal>
  )
}
