import db from '@/lib/db'
import bcrypt from 'bcryptjs'
import { requireUser } from '@/lib/access'
import { json, err, unauthorized } from '@/lib/api'

export const dynamic = 'force-dynamic'

export async function PATCH(req: Request) {
  const user = await requireUser()
  if (!user) return unauthorized()
  const body = await req.json()
  const me = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any
  const name = body.name !== undefined ? String(body.name).trim() : me.name
  if (!name) return err('El nombre es obligatorio')
  const avatar = body.avatar !== undefined ? body.avatar : me.avatar
  let password = me.password
  if (body.newPassword) {
    if (!body.currentPassword || !bcrypt.compareSync(String(body.currentPassword), me.password))
      return err('La contraseña actual no es correcta')
    if (String(body.newPassword).length < 6)
      return err('La nueva contraseña debe tener al menos 6 caracteres')
    password = bcrypt.hashSync(String(body.newPassword), 10)
  }
  db.prepare('UPDATE users SET name = ?, avatar = ?, password = ? WHERE id = ?').run(
    name,
    avatar,
    password,
    user.id
  )
  return json({ ok: true })
}
