import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { UPLOADS_DIR } from '@/lib/db';
import path from 'path';
import fs from 'fs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(params.id) as any;
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const filePath = path.join(UPLOADS_DIR, attachment.stored_name);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'Archivo no encontrado en el disco' }, { status: 404 });

  const inline = req.nextUrl.searchParams.get('inline') === '1';
  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': attachment.mime || 'application/octet-stream',
      'Content-Length': String(attachment.size),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
      ...(inline ? { 'Cache-Control': 'private, max-age=3600' } : {}),
    },
  });
}
