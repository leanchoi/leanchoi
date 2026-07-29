import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { UPLOADS_DIR } from '@/lib/db';
import path from 'path';
import fs from 'fs';

const MAX_AVATAR = 5 * 1024 * 1024; // 5MB

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;

  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
  if (!(file.type || '').startsWith('image/')) return NextResponse.json({ error: 'La foto debe ser una imagen' }, { status: 400 });
  if (file.size > MAX_AVATAR) return NextResponse.json({ error: 'La imagen supera el límite de 5MB' }, { status: 413 });

  // SVG entra por el filtro image/* pero puede llevar <script>: sólo bitmaps.
  const ALLOWED = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const rawExt = path.extname(file.name).toLowerCase().replace(/[^a-z0-9.]/g, '');
  if (!ALLOWED.includes(rawExt))
    return NextResponse.json({ error: 'Formato no admitido. Usá PNG, JPG, GIF o WEBP.' }, { status: 400 });

  const ext = rawExt;
  const storedName = `avatar-${userId}-${Date.now()}${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, storedName), Buffer.from(await file.arrayBuffer()));

  const old = (db.prepare('SELECT avatar FROM users WHERE id = ?').get(userId) as any)?.avatar;
  if (old) { try { fs.unlinkSync(path.join(UPLOADS_DIR, old)); } catch {} }

  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(storedName, userId);
  return NextResponse.json({ avatar: storedName });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id;
  const old = (db.prepare('SELECT avatar FROM users WHERE id = ?').get(userId) as any)?.avatar;
  if (old) { try { fs.unlinkSync(path.join(UPLOADS_DIR, old)); } catch {} }
  db.prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(userId);
  return NextResponse.json({ ok: true });
}
