import bcrypt from 'bcryptjs'
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { z } from 'zod'

// Nota: NO importar prisma aquí a nivel superior — este módulo también se
// usa desde middleware.ts (edge) y Prisma solo corre en Node.
// El acceso a DB se hace con import dinámico dentro de authorize().

const LoginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
})

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: 'jwt',
    // Sesión deslizante de 7 días: con actividad se re-emite (updateAge 1 día)
    // y no se pide login; tras 7 días sin actividad hay que entrar de nuevo.
    maxAge: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  trustHost: true,
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      name: 'Usuario y contraseña',
      credentials: {
        username: { label: 'Usuario', type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(raw, req) {
        const parsed = LoginSchema.safeParse(raw)
        if (!parsed.success) return null
        const { username, password } = parsed.data

        // Fuerza bruta aquí (no solo en loginAction): el endpoint
        // /api/auth/callback/credentials también llega a este punto.
        const { checkLimit, resetLimit, clientIp } =
          await import('@/lib/rate-limit')
        const { LOGIN_MAX, LOGIN_WINDOW_MS } = await import('@/lib/rate-limit')
        const headers =
          req && typeof req === 'object' && 'headers' in req
            ? (req.headers as Headers)
            : undefined
        const ip = headers ? clientIp(headers) : 'unknown'
        const limitKey = `${ip}:${username}`
        const allowed = await checkLimit(
          'login',
          limitKey,
          LOGIN_MAX,
          LOGIN_WINDOW_MS,
        )
        if (!allowed.ok) return null

        const { prisma } = await import('@/lib/prisma')
        const user = await prisma.user.findUnique({ where: { username } })
        if (!user) return null
        const ok = await bcrypt.compare(password, user.password)
        if (!ok) return null
        // El acierto no consume cuota.
        await resetLimit('login', limitKey)
        return {
          id: user.id,
          name: user.name,
          sessionVersion: user.sessionVersion,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id
        token.sv = (user as { sessionVersion?: number }).sessionVersion ?? 0
      }
      if (user?.name) token.name = user.name
      return token
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        ;(session.user as { id?: string }).id = token.sub
      }
      // Revocación al cambiar contraseña. Solo en Node (Edge/middleware no
      // tiene Prisma): si la versión cambió, se retira el id y la petición
      // queda como no autenticada. Defensivo ante la ventana previa a aplicar
      // la migración `session_version`.
      if (token.sub && process.env.NEXT_RUNTIME !== 'edge') {
        try {
          const { prisma } = await import('@/lib/prisma')
          const row = await prisma.user.findUnique({
            where: { id: token.sub },
            select: { sessionVersion: true },
          })
          const sv = typeof token.sv === 'number' ? token.sv : 0
          if (!row || row.sessionVersion !== sv) {
            if (session.user) delete (session.user as { id?: string }).id
          }
        } catch {
          // Pre-migración: se permite la sesión existente.
        }
      }
      return session
    },
  },
})
