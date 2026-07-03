import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import db, { UPLOADS_DIR } from '@/lib/db';
import path from 'path';
import fs from 'fs';

export async function GET(_: NextRequest, { params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const user = db.prepare('SELECT avatar FROM users WHERE id = ?').get(params.userId) as any;
  if (!user?.avatar) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const filePath = path.join(UPLOADS_DIR, user.avatar);
  if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ext = path.extname(user.avatar).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return new NextResponse(fs.readFileSync(filePath), {
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=300' },
  });
}
