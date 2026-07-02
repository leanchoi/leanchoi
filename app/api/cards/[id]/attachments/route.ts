import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { UPLOADS_DIR } from '@/lib/db';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'El archivo supera el límite de 50MB' }, { status: 413 });

  const ext = path.extname(file.name).slice(0, 20);
  const storedName = `${Date.now()}-${randomUUID()}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(UPLOADS_DIR, storedName), buffer);

  const userId = (session.user as any).id;
  const result = db.prepare(
    'INSERT INTO attachments (card_id, filename, stored_name, size, mime, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(params.id, file.name, storedName, file.size, file.type || null, userId);

  // If it's an image and the card has no cover yet, make it the cover automatically
  if ((file.type || '').startsWith('image/')) {
    const cardRow = db.prepare('SELECT cover_attachment_id FROM cards WHERE id = ?').get(params.id) as any;
    if (cardRow && !cardRow.cover_attachment_id) {
      db.prepare('UPDATE cards SET cover_attachment_id = ? WHERE id = ?').run(result.lastInsertRowid, params.id);
    }
  }

  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json(attachment, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ? AND card_id = ?').get(body.attachmentId, params.id) as any;
  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try { fs.unlinkSync(path.join(UPLOADS_DIR, attachment.stored_name)); } catch {}
  db.prepare('DELETE FROM attachments WHERE id = ?').run(attachment.id);

  // If it was the cover, promote the next image attachment (or clear it)
  const cardRow = db.prepare('SELECT cover_attachment_id FROM cards WHERE id = ?').get(params.id) as any;
  if (cardRow?.cover_attachment_id === attachment.id) {
    const nextImage = db.prepare("SELECT id FROM attachments WHERE card_id = ? AND mime LIKE 'image/%' ORDER BY created_at DESC LIMIT 1").get(params.id) as any;
    db.prepare('UPDATE cards SET cover_attachment_id = ? WHERE id = ?').run(nextImage?.id ?? null, params.id);
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  // Set or clear the card cover (attachmentId: number | null)
  db.prepare('UPDATE cards SET cover_attachment_id = ? WHERE id = ?').run(body.attachmentId ?? null, params.id);
  return NextResponse.json({ ok: true });
}
