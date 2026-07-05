import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import db from './db'

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET || 'arrayan-secret-dev',
  pages: { signIn: '/login' },
  // Cookies con nombre propio: la app convive con otras apps NextAuth en la
  // misma IP (distinto puerto) y el navegador no separa cookies por puerto.
  // Sin esto, las apps se pisan la sesión entre sí (JWT_SESSION_ERROR).
  cookies: {
    sessionToken: {
      name: 'arrayan.session-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: false },
    },
    callbackUrl: {
      name: 'arrayan.callback-url',
      options: { sameSite: 'lax', path: '/', secure: false },
    },
    csrfToken: {
      name: 'arrayan.csrf-token',
      options: { httpOnly: true, sameSite: 'lax', path: '/', secure: false },
    },
  },
  providers: [
    CredentialsProvider({
      name: 'Credenciales',
      credentials: {
        username: { label: 'Usuario', type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null
        const user = db
          .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
          .get(credentials.username.trim()) as any
        if (!user) return null
        const ok = bcrypt.compareSync(credentials.password, user.password)
        if (!ok) return null
        return { id: user.id, name: user.name, email: user.username }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.uid = (user as any).id
      return token
    },
    async session({ session, token }) {
      if (session.user && token.uid) {
        const u = db
          .prepare('SELECT id, username, name, role, avatar FROM users WHERE id = ?')
          .get(token.uid as string) as any
        if (u) {
          ;(session.user as any).id = u.id
          ;(session.user as any).username = u.username
          ;(session.user as any).role = u.role
          ;(session.user as any).avatar = u.avatar
          session.user.name = u.name
        }
      }
      return session
    },
  },
}

export type SessionUser = {
  id: string
  username: string
  name: string
  role: string
  avatar: string | null
}
