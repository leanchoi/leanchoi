import path from 'path'
import fs from 'fs'
import { uid } from '@/lib/db'
import { requireUser } from '@/lib/access'
import { json, err, unauthorized } from '@/lib/api'

export const dynamic = 'force-dynamic'

const MAX_SIZE = 50 * 1024 * 1024 // 50MB

export async function POST(req: Request) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file) return err('Falta el archivo')
  if (file.size > MAX_SIZE) return err('El archivo supera el límite de 50MB')
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data')
  const id = uid()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'archivo'
  const dir = path.join(dataDir, 'uploads', id)
  fs.mkdirSync(dir, { recursive: true })
  const buf = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(path.join(dir, safeName), buf)
  return json({
    id,
    name: file.name,
    url: `/api/files/${id}/${encodeURIComponent(safeName)}`,
    size: file.size,
    type: file.type || 'application/octet-stream',
  })
}
