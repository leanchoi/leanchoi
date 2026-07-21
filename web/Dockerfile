# ─── Build stage ──────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY scripts ./scripts
COPY public ./public
COPY src ./src
# Regenerate POI icons at build time (kept in sync with src/poiTypes.ts).
RUN node scripts/gen-icons.mjs
RUN npm run build

# ─── Runtime stage (nginx) ────────────────────────────────────
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
