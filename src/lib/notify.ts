import db, { uid } from './db'

export function notify(opts: {
  userId: string
  actorId?: string | null
  type: string
  body: string
  link?: string | null
}) {
  if (opts.actorId && opts.actorId === opts.userId) return // no auto-notificarse
  db.prepare(
    `INSERT INTO notifications (id, user_id, actor_id, type, body, link) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(uid(), opts.userId, opts.actorId ?? null, opts.type, opts.body, opts.link ?? null)
}

// Notifica a los usuarios recién asignados en campos tipo "user"
export function notifyAssignments(
  tableId: string,
  recordId: string,
  oldData: any,
  newData: any,
  actor: { id: string; name: string }
) {
  const fields = db
    .prepare(`SELECT * FROM fields WHERE table_id = ? AND type = 'user'`)
    .all(tableId) as any[]
  const t = db.prepare('SELECT base_id, name FROM tables WHERE id = ?').get(tableId) as any
  for (const f of fields) {
    const before: string[] = Array.isArray(oldData?.[f.id]) ? oldData[f.id] : []
    const after: string[] = Array.isArray(newData?.[f.id]) ? newData[f.id] : []
    for (const userId of after) {
      if (!before.includes(userId)) {
        notify({
          userId,
          actorId: actor.id,
          type: 'assign',
          body: `${actor.name} te asignó un registro en "${t?.name || 'una tabla'}"`,
          link: `/record/${recordId}`,
        })
      }
    }
  }
}

// Detecta @menciones por username en un texto y notifica a cada usuario mencionado
export function notifyMentions(opts: {
  text: string
  actorId: string
  actorName: string
  context: string
  link: string
}) {
  const usernames = Array.from(opts.text.matchAll(/@([a-zA-Z0-9._-]+)/g)).map((m) => m[1])
  if (usernames.length === 0) return
  const seen = new Set<string>()
  for (const uname of usernames) {
    const u = db
      .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
      .get(uname) as any
    if (u && !seen.has(u.id)) {
      seen.add(u.id)
      notify({
        userId: u.id,
        actorId: opts.actorId,
        type: 'mention',
        body: `${opts.actorName} te mencionó en ${opts.context}`,
        link: opts.link,
      })
    }
  }
}
