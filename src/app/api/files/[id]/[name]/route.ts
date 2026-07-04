import path from 'path'
import fs from 'fs'
import { requireUser } from '@/lib/access'
import { err, unauthorized } from '@/lib/api'

export const dynamic = 'force-dynamic'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string; name: string } }
) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
  const safeId = params.id.replace(/[^a-zA-Z0-9_-]/g, '')
  const safeName = decodeURIComponent(params.name).replace(/[/\\]/g, '')
  const filePath = path.join(dataDir, 'uploads', safeId, safeName)
  if (!fs.existsSync(filePath)) return err('No encontrado', 404)
  const buf = fs.readFileSync(filePath)
  const ext = path.extname(safeName).toLowerCase()
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'private, max-age=31536000',
    },
  })
}
