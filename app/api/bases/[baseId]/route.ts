import db from '@/lib/db';
import { requireUser, baseRole, canView, isOwner } from '@/lib/access';
import { readOnlyReason } from '@/lib/tenant';
import { json, err, unauthorized, forbidden, notFound } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { baseId: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const role = baseRole(user, params.baseId);
  if (!canView(role)) return forbidden();
  const base = db.prepare('SELECT * FROM bases WHERE id = ?').get(params.baseId) as any;
  if (!base) return notFound();
  const tables = (
    db.prepare('SELECT * FROM base_tables WHERE base_id = ? ORDER BY position').all(params.baseId) as any[]
  ).map((t) => ({
    ...t,
    views: (
      db.prepare('SELECT * FROM base_views WHERE table_id = ? ORDER BY position').all(t.id) as any[]
    )
      .filter((v) => !v.personal || v.created_by === user.id)
      .map((v) => ({ ...v, config: JSON.parse(v.config || '{}') })),
  }));
  const collaborators = db
    .prepare(
      `SELECT c.id, c.user_id, c.role, u.display_name AS name, u.username, u.avatar
       FROM base_collaborators c JOIN users u ON u.id = c.user_id WHERE c.base_id = ?`
    )
    .all(params.baseId) as any[];
  return json({ base, tables, collaborators, myRole: role });
}

export async function PATCH(req: Request, { params }: { params: { baseId: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const ro = readOnlyReason(user.id);
  if (ro) return err(ro, 403);
  const role = baseRole(user, params.baseId);
  if (!isOwner(role)) return forbidden();
  const body = await req.json();
  const base = db.prepare('SELECT * FROM bases WHERE id = ?').get(params.baseId) as any;
  if (!base) return notFound();
  const name = body.name !== undefined ? String(body.name).trim() : base.name;
  if (!name) return err('El nombre es obligatorio');
  db.prepare('UPDATE bases SET name = ?, color = ?, icon = ? WHERE id = ?').run(
    name,
    body.color ?? base.color,
    body.icon ?? base.icon,
    params.baseId
  );
  return json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { baseId: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const ro = readOnlyReason(user.id);
  if (ro) return err(ro, 403);
  const role = baseRole(user, params.baseId);
  if (!isOwner(role)) return forbidden();
  const tables = db
    .prepare('SELECT id FROM base_tables WHERE base_id = ?')
    .all(params.baseId) as any[];
  const tx = db.transaction(() => {
    for (const t of tables) {
      db.prepare('DELETE FROM base_fields WHERE table_id = ?').run(t.id);
      db.prepare('DELETE FROM base_views WHERE table_id = ?').run(t.id);
      db.prepare('DELETE FROM record_comments WHERE table_id = ?').run(t.id);
      db.prepare('DELETE FROM base_records WHERE table_id = ?').run(t.id);
    }
    db.prepare('DELETE FROM base_tables WHERE base_id = ?').run(params.baseId);
    db.prepare('DELETE FROM base_collaborators WHERE base_id = ?').run(params.baseId);
    db.prepare('DELETE FROM bases WHERE id = ?').run(params.baseId);
  });
  tx();
  return json({ ok: true });
}
