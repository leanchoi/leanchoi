import db from '@/lib/db';
import { requireUser, baseRole, canEdit, baseIdOfTable } from '@/lib/access';
import { readOnlyReason } from '@/lib/tenant';
import { json, err, unauthorized, forbidden, notFound } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Reordenamiento en lote de los registros de una tabla.
 *
 * Antes, arrastrar una fila mandaba un PATCH por cada registro cuya posición
 * cambiaba, uno detrás del otro. En la tabla de publicaciones (851 registros),
 * mover una fila del final al principio eran ~850 requests encadenadas.
 *
 * Body: { records: [{ id, position }] }
 */
export async function POST(req: Request, { params }: { params: { tableId: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const ro = readOnlyReason(user.id);
  if (ro) return err(ro, 403);
  const baseId = baseIdOfTable(params.tableId);
  if (!baseId) return notFound();
  const role = baseRole(user, baseId);
  if (!canEdit(role)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const records: any[] = Array.isArray(body.records) ? body.records : [];
  if (records.length === 0) return json({ ok: true, moved: 0 });

  // Sólo registros de ESTA tabla
  const valid = new Set(
    (db.prepare('SELECT id FROM base_records WHERE table_id = ?').all(params.tableId) as any[]).map((r) => r.id)
  );

  const update = db.prepare('UPDATE base_records SET position = ? WHERE id = ?');
  let moved = 0;
  const tx = db.transaction(() => {
    for (const r of records) {
      const pos = Number(r?.position);
      if (!valid.has(r?.id) || !Number.isFinite(pos)) continue;
      update.run(pos, r.id);
      moved++;
    }
  });
  tx();

  return json({ ok: true, moved });
}
