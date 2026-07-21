# Build context is the REPO ROOT (see docker-compose.yml) so the seed script at
# db/seed/ and its imports into api/src are both available in the image.
FROM node:20-alpine
WORKDIR /app/api

# Install deps (dev deps kept so `tsx` is available for `npm run seed`).
COPY api/package.json api/package-lock.json ./
RUN npm ci

# App sources.
COPY api/tsconfig.json api/drizzle.config.ts ./
COPY api/src ./src
COPY db /app/db

RUN npm run build

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.js"]
