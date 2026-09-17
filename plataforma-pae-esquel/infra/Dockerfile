# syntax=docker/dockerfile:1
# Trocha · imagen de la aplicación (Next.js en modo standalone)

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S trocha -u 1001
COPY --from=build /app/public ./public
COPY --from=build --chown=trocha:nodejs /app/.next/standalone ./
COPY --from=build --chown=trocha:nodejs /app/.next/static ./.next/static
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/scripts ./scripts
RUN mkdir -p /app/var/uploads && chown -R trocha:nodejs /app/var
USER trocha
EXPOSE 3000
CMD ["node", "server.js"]
