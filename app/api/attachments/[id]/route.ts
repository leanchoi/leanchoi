import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/access';
import { guardAttachment } from '@/lib/boardAccess';
import { fileHeaders, sanitizeFilename } from '@/lib/files';
import db, { UPLOADS_DIR } from '@/lib/db';
import path from 'path';
import fs from 'fs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  // Antes alcanzaba con estar logueado: los ids son enteros correlativos, así
  // que se podían enumerar y bajar los adjuntos de cualquier tablero.
  const g = guardAttachment(user, params.id, 'view');
  if (!g.ok) return NextResponse.json({ error: 'Sin acceso a este archivo' }, { status: g.status });

  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(params.id) as any;
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // stored_name lo genera el servidor, pero se sanea igual antes de tocar disco
  const stored = sanitizeFilename(attachment.stored_name);
  const filePath = path.join(UPLOADS_DIR, stored);
  if (!filePath.startsWith(UPLOADS_DIR) || !fs.existsSync(filePath))
    return NextResponse.json({ error: 'Archivo no encontrado en el disco' }, { status: 404 });

  const buffer = fs.readFileSync(filePath);
  return new NextResponse(new Uint8Array(buffer), {
    headers: fileHeaders({
      // El tipo sale de la extensión real, no del mime que declaró el cliente
      filename: attachment.filename || stored,
      wantsInline: req.nextUrl.searchParams.get('inline') === '1',
      size: attachment.size,
    }),
  });
}
