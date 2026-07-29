import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import db, { UPLOADS_DIR } from '@/lib/db';
import { sanitizeFilename } from '@/lib/files';
import path from 'path';
import fs from 'fs';

const AVATAR_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export async function GET(_: NextRequest, { params }: { params: { userId: string } }) {
  const me = await requireUser();
  if (!me) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const row = db.prepare('SELECT avatar, tenant_id FROM users WHERE id = ?').get(params.userId) as any;
  if (!row?.avatar) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // Las fotos sólo se ven dentro de la propia rama
  if (!me.isMaster && Number(row.tenant_id) !== me.tenantId)
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const stored = sanitizeFilename(row.avatar);
  const filePath = path.join(UPLOADS_DIR, stored);
  if (!filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Sin fallback a image/jpeg: una extensión desconocida (.svg, por ejemplo) se
  // baja como archivo en lugar de renderizarse.
  const ext = path.extname(stored).toLowerCase();
  const mime = AVATAR_MIME[ext];
  if (!mime) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return new NextResponse(new Uint8Array(fs.readFileSync(filePath)), {
    headers: {
      'Content-Type': mime,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=300',
    },
  });
}
