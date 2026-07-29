import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import db from './db';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Usuario', type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;
        // Username matching is case-insensitive; the password is not
        const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(credentials.username.trim()) as any;
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;
        try { db.prepare('INSERT INTO logins (user_id) VALUES (?)').run(user.id); } catch {}
        return { id: String(user.id), name: user.display_name, email: user.username, isAdmin: !!user.is_admin };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.isAdmin = (user as any).isAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        (session.user as any).id = token.id;

        // Auto-checkin: si no hay un login registrado en las últimas 2 horas, registrar uno
        try {
          const userId = Number(token.id);
          const recentLogin = db
            .prepare("SELECT 1 FROM logins WHERE user_id = ? AND created_at > datetime('now', '-2 hours') LIMIT 1")
            .get(userId);
          if (!recentLogin) {
            db.prepare('INSERT INTO logins (user_id) VALUES (?)').run(userId);
          }
        } catch (e) {
          console.error('Error recording session check-in:', e);
        }

        // rol/rama frescos desde la DB en cada request (permite revocar al instante)
        const u = db
          .prepare('SELECT id, username, display_name, is_admin, is_master, tenant_id, avatar FROM users WHERE id = ?')
          .get(Number(token.id)) as any;
        if (u) {
          (session.user as any).isAdmin = !!u.is_admin;
          (session.user as any).isMaster = !!u.is_master;
          (session.user as any).tenantId = u.tenant_id;
          (session.user as any).username = u.username;
          (session.user as any).avatar = u.avatar || null;
          session.user.name = u.display_name;
        } else {
          (session.user as any).isAdmin = token.isAdmin;
        }
      }
      return session;
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET,
};
