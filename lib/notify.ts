import db, { notify as trochiNotify } from './db';

// Notificaciones del módulo Arrayán: van a la misma campanita de Trochi,
// usando la columna `link` para navegar a registros/bases.
export function notify(opts: {
  userId: number;
  actorId?: number | null;
  type: string;
  body: string;
  link?: string | null;
}) {
  if (opts.actorId && opts.actorId === opts.userId) return; // no auto-notificarse
  trochiNotify(opts.userId, opts.type, opts.body, null, null, opts.link ?? null);
}

// Detecta @menciones por username y notifica (solo usuarios de la misma rama)
export function notifyMentions(opts: {
  text: string;
  actorId: number;
  actorName: string;
  actorTenantId: number;
  context: string;
  link: string;
}) {
  const usernames = Array.from(opts.text.matchAll(/@([a-zA-Z0-9._-]+)/g)).map((m) => m[1]);
  if (usernames.length === 0) return;
  const seen = new Set<number>();
  for (const uname of usernames) {
    const u = db
      .prepare('SELECT id, tenant_id FROM users WHERE username = ? COLLATE NOCASE')
      .get(uname) as any;
    if (u && u.tenant_id === opts.actorTenantId && !seen.has(u.id)) {
      seen.add(u.id);
      notify({
        userId: u.id,
        actorId: opts.actorId,
        type: 'mention',
        body: `${opts.actorName} te mencionó en ${opts.context}`,
        link: opts.link,
      });
    }
  }
}

// Notifica a los usuarios recién asignados en campos tipo "user"
export function notifyAssignments(
  tableId: string,
  recordId: string,
  oldData: any,
  newData: any,
  actor: { id: number; name: string }
) {
  const fields = db
    .prepare(`SELECT * FROM base_fields WHERE table_id = ? AND type = 'user'`)
    .all(tableId) as any[];
  const t = db.prepare('SELECT name FROM base_tables WHERE id = ?').get(tableId) as any;
  for (const f of fields) {
    const before: number[] = Array.isArray(oldData?.[f.id]) ? oldData[f.id] : [];
    const after: number[] = Array.isArray(newData?.[f.id]) ? newData[f.id] : [];
    for (const userId of after) {
      if (!before.includes(userId)) {
        notify({
          userId: Number(userId),
          actorId: actor.id,
          type: 'assigned',
          body: `${actor.name} te asignó un registro en "${t?.name || 'una tabla'}"`,
          link: `/record/${recordId}`,
        });
      }
    }
  }
}
