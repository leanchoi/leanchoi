import db, { uid, now } from '@/lib/db';
import { getTenant, isExpired } from '@/lib/tenant';
import { notify } from '@/lib/notify';
import { json, err, notFound } from '@/lib/api';

export const dynamic = 'force-dynamic';

// Formularios públicos: no requieren sesión
function findForm(token: string) {
  // El token viene de la URL: se acota al alfabeto esperado antes de usarlo
  const safe = String(token || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safe) return null;
  // Antes se traían TODAS las vistas de tipo form y se hacía JSON.parse de cada
  // una en cada request; el LIKE deja el parseo sólo para las candidatas.
  const views = db
    .prepare(`SELECT * FROM base_views WHERE type = 'form' AND config LIKE ?`)
    .all(`%${safe}%`) as any[];
  for (const v of views) {
    const config = JSON.parse(v.config || '{}');
    if (config.form?.shareToken === safe && config.form?.enabled) {
      return { view: v, config };
    }
  }
  return null;
}

function formTenant(tableId: string) {
  const row = db
    .prepare(
      'SELECT b.tenant_id, b.owner_id, b.name AS base_name, t.name AS table_name FROM base_tables t JOIN bases b ON b.id = t.base_id WHERE t.id = ?'
    )
    .get(tableId) as any;
  return row || null;
}

const PUBLIC_TYPES = [
  'text', 'longtext', 'number', 'currency', 'percent', 'rating', 'checkbox',
  'select', 'multiselect', 'date', 'url', 'email', 'phone',
];

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const found = findForm(params.token);
  if (!found) return notFound();
  const info = formTenant(found.view.table_id);
  if (info && isExpired(getTenant(info.tenant_id))) return notFound();
  const allFields = (
    db
      .prepare('SELECT * FROM base_fields WHERE table_id = ? ORDER BY position')
      .all(found.view.table_id) as any[]
  ).map((f) => ({ ...f, options: JSON.parse(f.options || '{}') }));
  const included = (found.config.form.fields || [])
    .map((ff: any) => {
      const f = allFields.find((x) => x.id === ff.fieldId);
      if (!f || !PUBLIC_TYPES.includes(f.type)) return null;
      return { ...f, required: !!ff.required, help: ff.help || '' };
    })
    .filter(Boolean);
  return json({
    title: found.config.form.title || found.view.name,
    description: found.config.form.description || '',
    fields: included,
  });
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const found = findForm(params.token);
  if (!found) return notFound();
  const info = formTenant(found.view.table_id);
  if (info && isExpired(getTenant(info.tenant_id)))
    return err('Este formulario está desactivado', 403);
  const body = await req.json().catch(() => ({}));
  const submitted = body.data || {};
  const allFields = (
    db.prepare('SELECT * FROM base_fields WHERE table_id = ?').all(found.view.table_id) as any[]
  ).map((f) => ({ ...f, options: JSON.parse(f.options || '{}') }));
  const allowed = new Set((found.config.form.fields || []).map((ff: any) => ff.fieldId as string));
  const data: any = {};
  for (const [k, v] of Object.entries(submitted)) {
    const f = allFields.find((x) => x.id === k);
    if (f && allowed.has(k) && PUBLIC_TYPES.includes(f.type)) data[k] = v;
  }
  for (const ff of found.config.form.fields || []) {
    if (ff.required) {
      const v = data[ff.fieldId];
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0))
        return err('Faltan campos obligatorios');
    }
  }
  const max = db
    .prepare('SELECT COALESCE(MAX(position), -1) AS m FROM base_records WHERE table_id = ?')
    .get(found.view.table_id) as any;
  const id = uid();
  db.prepare(
    'INSERT INTO base_records (id, table_id, data, position, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)'
  ).run(id, found.view.table_id, JSON.stringify(data), max.m + 1, now(), now());

  if (info?.owner_id) {
    notify({
      userId: info.owner_id,
      type: 'form',
      body: `Nueva respuesta del formulario "${found.config.form.title || found.view.name}" en "${info.base_name}"`,
      link: `/record/${id}`,
    });
  }
  return json({ ok: true });
}
