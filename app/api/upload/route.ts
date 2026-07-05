import path from 'path';
import fs from 'fs';
import db, { uid, UPLOADS_DIR } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { readOnlyReason, storageQuotaError, registerFile } from '@/lib/tenant';
import { json, err, unauthorized } from '@/lib/api';

export const dynamic = 'force-dynamic';

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

// Subida de archivos del módulo Arrayán (celdas de adjuntos)
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const ro = readOnlyReason(user.id);
  if (ro) return err(ro, 403);
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return err('Falta el archivo');
  if (file.size > MAX_SIZE) return err('El archivo supera el límite de 50MB');
  const quota = storageQuotaError(user.id, file.size);
  if (quota) return err(quota, 403);
  const id = uid();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'archivo';
  const dir = path.join(UPLOADS_DIR, 'arrayan', id);
  fs.mkdirSync(dir, { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(dir, safeName), buf);
  registerFile({
    id,
    tenantId: user.tenantId,
    userId: user.id,
    ref: `arrayan/${id}/${safeName}`,
    size: file.size,
  });
  return json({
    id,
    name: file.name,
    url: `/api/files/${id}/${encodeURIComponent(safeName)}`,
    size: file.size,
    type: file.type || 'application/octet-stream',
  });
}
