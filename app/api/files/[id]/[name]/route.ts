import path from 'path';
import fs from 'fs';
import db, { UPLOADS_DIR } from '@/lib/db';
import { requireUser } from '@/lib/access';
import { fileHeaders, sanitizeFilename } from '@/lib/files';
import { err, unauthorized, forbidden } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string; name: string } }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const safeId = params.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeName = sanitizeFilename(decodeURIComponent(params.name));

  // Los archivos quedan registrados por rama en storage_files: sin este chequeo
  // cualquier usuario logueado podía bajar los archivos de otra rama con sólo
  // conocer la URL.
  const record = db.prepare('SELECT tenant_id FROM storage_files WHERE id = ?').get(safeId) as any;
  if (record && !user.isMaster && Number(record.tenant_id) !== user.tenantId) return forbidden();

  const arrayanDir = path.join(UPLOADS_DIR, 'arrayan');
  const filePath = path.join(arrayanDir, safeId, safeName);
  if (!filePath.startsWith(arrayanDir) || !fs.existsSync(filePath)) return err('No encontrado', 404);

  const buf = fs.readFileSync(filePath);
  const wantsInline = new URL(req.url).searchParams.get('download') !== '1';
  return new Response(new Uint8Array(buf), {
    // El Content-Type sale de la extensión, no del mime que declaró el cliente:
    // un .svg (que puede llevar <script>) ya no se sirve embebido.
    headers: fileHeaders({ filename: safeName, wantsInline, cacheSeconds: 31536000 }),
  });
}
