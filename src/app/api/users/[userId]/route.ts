import db from '@/lib/db'
import bcrypt from 'bcryptjs'
import { requireUser } from '@/lib/access'
import { json, err, unauthorized, forbidden, notFound } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request, { params }: { params: { userId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(params.userId) as any
  if (!target) return notFound()
  const body = await req.json()
  const name = body.name !== undefined ? String(body.name).trim() : target.name
  if (!name) return err('El nombre es obligatorio')
  let role = target.role
  if (body.role !== undefined) {
    role = body.role === 'admin' ? 'admin' : 'user'
    if (target.id === user.id && role !== 'admin')
      return err('No podés quitarte el rol de admin a vos mismo')
  }
  let password = target.password
  if (body.password) {
    if (String(body.password).length < 6)
      return err('La contraseña debe tener al menos 6 caracteres')
    password = bcrypt.hashSync(String(body.password), 10)
  }
  db.prepare('UPDATE users SET name = ?, role = ?, password = ? WHERE id = ?').run(
    name,
    role,
    password,
    params.userId
  )
  return json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { userId: string } }) {
  const user = await requireUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  if (params.userId === user.id) return err('No podés borrarte a vos mismo')
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(params.userId) as any
  if (!target) return notFound()
  const ownedBases = db
    .prepare('SELECT COUNT(*) AS c FROM bases WHERE owner_id = ?')
    .get(params.userId) as any
  if (ownedBases.c > 0)
    return err('Ese usuario es dueño de bases. Transferí o borrá sus bases primero.')
  db.prepare('DELETE FROM users WHERE id = ?').run(params.userId)
  db.prepare('DELETE FROM collaborators WHERE user_id = ?').run(params.userId)
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(params.userId)
  return json({ ok: true })
}
