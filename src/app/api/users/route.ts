import db, { uid } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { requireUser } from '@/lib/access'
import { json, err, unauthorized, forbidden } from '@/lib/api'

export const dynamic = 'force-dynamic'

const MAX_USERS = 50

export async function GET() {
  const user = await requireUser()
  if (!user) return unauthorized()
  // todos pueden listar usuarios (para menciones/asignaciones); solo el admin ve extra
  const users = db
    .prepare('SELECT id, username, name, role, avatar, created_at FROM users ORDER BY name')
    .all()
  return json({ users, isAdmin: user.role === 'admin' })
}

export async function POST(req: Request) {
  const user = await requireUser()
  if (!user) return unauthorized()
  if (user.role !== 'admin') return forbidden()
  const body = await req.json()
  const username = String(body.username || '').trim().toLowerCase()
  const name = String(body.name || '').trim()
  const password = String(body.password || '')
  if (!/^[a-z0-9._-]{2,30}$/.test(username))
    return err('Usuario inválido: solo letras, números, punto, guion (2-30)')
  if (!name) return err('El nombre es obligatorio')
  if (password.length < 6) return err('La contraseña debe tener al menos 6 caracteres')
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get() as any
  if (count.c >= MAX_USERS) return err(`Límite de ${MAX_USERS} usuarios alcanzado`)
  const exists = db
    .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
    .get(username)
  if (exists) return err('Ese nombre de usuario ya existe')
  const id = uid()
  db.prepare('INSERT INTO users (id, username, name, password, role) VALUES (?, ?, ?, ?, ?)').run(
    id,
    username,
    name,
    bcrypt.hashSync(password, 10),
    body.role === 'admin' ? 'admin' : 'user'
  )
  return json({ id })
}
