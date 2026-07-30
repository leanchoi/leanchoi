'use client'

import { useEffect, useState, useCallback } from 'react'
import { ChevronDown, Trash2, X } from 'lucide-react'
import { Field, FIELD_TYPES } from '@/lib/fields'
import { Rec, UserLite } from './types'
import { CellCtx, FieldInput, CellValue } from './cells'
import Avatar from './Avatar'
import Modal from './Modal'
import Popover from './Popover'

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


// Los campos de selección, colaborador y vínculo despliegan TODA su lista de
// opciones: eso está bien dentro de un popover (como en la grilla), pero en la
// tarjeta de registro significaba media pantalla por campo. Acá se muestran
// colapsados con el valor actual y abren la lista al tocarlos.
const COLLAPSIBLE = ['select', 'multiselect', 'user', 'link']

function CollapsedField({
  field, value, ctx, onChange,
}: {
  field: Field
  value: any
  ctx: CellCtx
  onChange: (v: any) => void
}) {
  const [open, setOpen] = useState(false)
  const vacio =
    value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="input flex min-h-9 w-full items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0 flex-1 truncate">
          {vacio ? <span className="text-ink-lo">Sin asignar</span> : <CellValue field={field} value={value} ctx={ctx} compact />}
        </span>
        <ChevronDown size={13} className={`flex-shrink-0 text-ink-lo transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} className="w-[min(20rem,88vw)] p-1.5">
        <FieldInput
          field={field}
          value={value}
          ctx={ctx}
          onChange={onChange}
          // Los de selección única cierran al elegir; los múltiples quedan abiertos
          onCommit={field.type === 'select' ? () => setOpen(false) : undefined}
        />
      </Popover>
    </div>
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
  // En teléfono no se puede mostrar todo junto: con 7 campos había que pasar
  // por todos para llegar a los comentarios. Se separan en dos pestañas.
  const [tab, setTab] = useState<'campos' | 'material' | 'comentarios'>('campos')
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

  // El campo primario ya es el título: no se repite en el cuerpo.
  // Todos los demás se muestran siempre y en el orden de la tabla, tengan dato
  // o no: expandir el registro es el momento de completar lo que falta.
  const body = fields.filter((f) => f.id !== primary?.id)
  // Los adjuntos van a la columna derecha, arriba de los comentarios
  const mediaFields = body.filter((f) => f.type === 'attachment')
  const mediaCount = mediaFields.reduce((n, f) => {
    const v = record.data[f.id]
    return n + (Array.isArray(v) ? v.length : 0)
  }, 0)
  const dataFields = body.filter((f) => f.type !== 'attachment')

  const creador = record.created_by
    ? users.find((u) => u.id === record.created_by)?.name || 'usuario eliminado'
    : null

  function renderField(f: Field) {
    return (
      <div key={f.id} className="min-w-0">
        <p className="eyebrow mb-1.5 flex items-center gap-1.5">
          <span className="font-mono text-[0.68rem] font-normal text-ink-lo/70">
            {FIELD_TYPES.find((t) => t.type === f.type)?.icon || '•'}
          </span>
          {f.name}
        </p>
        {canEdit && f.type !== 'createdtime' ? (
          COLLAPSIBLE.includes(f.type) ? (
            <CollapsedField field={f} value={record.data[f.id]} ctx={ctx} onChange={(v) => onPatch(f.id, v)} />
          ) : (
            <FieldInput field={f} value={record.data[f.id]} onChange={(v) => onPatch(f.id, v)} ctx={ctx} />
          )
        ) : (
          <div className="min-h-9 rounded-control border border-line/70 bg-surface-sunken/60 px-3 py-1.5 text-sm">
            <CellValue
              field={f}
              value={f.type === 'createdtime' ? record.created_at : record.data[f.id]}
              ctx={ctx}
              compact={false}
            />
          </div>
        )}
      </div>
    )
  }

  const comentarios = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto pr-1">
        {comments.length === 0 && (
          <p className="py-6 text-center text-meta text-ink-lo">Todavía no hay comentarios.</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <Avatar name={c.user_name} avatar={c.user_avatar} userId={(c as any).user_num_id} size={26} />
            <div className="min-w-0 flex-1">
              <p className="fineprint">
                <span className="font-medium text-ink-md">{c.user_name}</span> · {fmtDate(c.created_at)}
              </p>
              <div className="mt-1 rounded-control bg-surface-sunken/70 px-2.5 py-1.5 text-ink-md">
                <CommentBody text={c.body} />
              </div>
            </div>
          </div>
        ))}
      </div>
      {canComment && (
        <form onSubmit={sendComment} className="relative mt-3 flex-shrink-0">
          {mentionCandidates.length > 0 && mentionOpen && (
            <div className="popover absolute bottom-full left-0 mb-1 w-full p-1">
              {mentionCandidates.slice(0, 5).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/[0.06]"
                  onClick={() => {
                    setNewComment(newComment.replace(/@[a-zA-Z0-9._-]*$/, `@${u.username} `))
                    setMentionOpen(false)
                  }}
                >
                  <Avatar name={u.name} avatar={u.avatar} userId={u.id} size={20} />
                  {u.name} <span className="fineprint">@{u.username}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            className="input min-h-[64px] resize-none text-sm"
            placeholder="Comentá… usá @ para mencionar"
            aria-label="Escribir un comentario"
            value={newComment}
            onChange={(e) => {
              setNewComment(e.target.value)
              setMentionOpen(/@[a-zA-Z0-9._-]*$/.test(e.target.value))
            }}
          />
          <button type="submit" disabled={sending || !newComment.trim()} className="btn-primary mt-2 w-full">
            {sending ? 'Enviando…' : 'Comentar'}
          </button>
        </form>
      )}
    </div>
  )

  return (
    <Modal open onClose={onClose} wide sheetOnMobile bare>
      {/* Encabezado fijo: el título y las acciones quedan a la vista mientras
          se recorre el registro. */}
      <div className="flex-shrink-0 border-b border-line/70 px-4 pb-3 pt-3 sm:px-5 sm:pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[1.15rem] font-semibold sm:text-xl">
              {String(record.data[primary?.id] ?? '') || 'Sin nombre'}
            </h2>
            <p className="fineprint mt-0.5 truncate">
              {creador ? `Creado por ${creador}` : 'Creado desde un formulario público'} ·{' '}
              {fmtDate(record.created_at)}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            {canEdit && (
              <button
                aria-label="Borrar el registro"
                title="Borrar el registro"
                className="btn-icon hover:bg-state-crit/15 hover:text-[#f79c8d]"
                onClick={() => {
                  if (confirm('¿Borrar este registro?')) onDelete()
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button onClick={onClose} aria-label="Cerrar" className="btn-icon">
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Pestañas: sólo en teléfono, donde no caben las dos columnas */}
        <div className="mt-3 flex gap-1.5 sm:hidden" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'campos'}
            onClick={() => setTab('campos')}
            className={`chip chip-tap flex-1 justify-center ${tab === 'campos' ? 'chip-brand' : 'chip-neutral'}`}
          >
            Campos
          </button>
          {mediaFields.length > 0 && (
            <button
              role="tab"
              aria-selected={tab === 'material'}
              onClick={() => setTab('material')}
              className={`chip chip-tap flex-1 justify-center ${tab === 'material' ? 'chip-brand' : 'chip-neutral'}`}
            >
              Material
              {mediaCount > 0 && <span className="tnum opacity-70">{mediaCount}</span>}
            </button>
          )}
          <button
            role="tab"
            aria-selected={tab === 'comentarios'}
            onClick={() => setTab('comentarios')}
            className={`chip chip-tap flex-1 justify-center ${tab === 'comentarios' ? 'chip-brand' : 'chip-neutral'}`}
          >
            Comentarios
            {comments.length > 0 && <span className="tnum opacity-70">{comments.length}</span>}
          </button>
        </div>
      </div>

      {/* Cuerpo: datos a la izquierda, material y comentarios a la derecha */}
      <div className="min-h-0 flex-1 overflow-y-auto sm:grid sm:grid-cols-[1fr_21rem] sm:gap-0 sm:overflow-hidden">
        <div
          className={`space-y-4 px-4 py-4 sm:overflow-y-auto sm:px-5 ${tab === 'campos' ? '' : 'hidden sm:block'}`}
        >
          {dataFields.map(renderField)}

          {dataFields.length === 0 && (
            <p className="py-6 text-center text-meta text-ink-lo">Esta tabla no tiene más campos.</p>
          )}
        </div>

        {/* Columna derecha: el material va arriba y los comentarios abajo. El
            uploader necesita el ancho de la columna completo, así que la
            columna scrollea entera en lugar de scrollear sólo los comentarios. */}
        <div
          className={`flex min-h-0 flex-col border-line/70 bg-surface-sunken/40 sm:border-l ${
            tab === 'material' || tab === 'comentarios' ? '' : 'hidden sm:flex'
          }`}
        >
          {mediaFields.length > 0 && (
            <div
              className={`flex-shrink-0 space-y-4 border-line/70 px-4 py-4 sm:border-b ${
                tab === 'material' ? '' : 'hidden sm:block'
              }`}
            >
              {mediaFields.map(renderField)}
            </div>
          )}
          <div
            className={`flex min-h-0 flex-1 flex-col px-4 py-4 ${
              tab === 'comentarios' ? '' : 'hidden sm:flex'
            }`}
          >
            <p className="eyebrow mb-2.5 flex-shrink-0">Comentarios</p>
            {comentarios}
          </div>
        </div>
      </div>
    </Modal>
  )
}
