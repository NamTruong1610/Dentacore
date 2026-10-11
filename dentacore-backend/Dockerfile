# ---- deps: all dependencies, including build tools (Nest CLI, Prisma CLI, TypeScript) ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: generate the Prisma client, then compile the app into dist/ ----
FROM deps AS build
COPY . .
# The Prisma client (src/generated/prisma) isn't in Git: it's generated from the schema here,
# then compiled together with the rest of src/.
RUN npx prisma generate && npm run build

# ---- migrate: applies database migrations, then exits ----
# Run it before starting the app (docker compose does this with the "migrate" service).
# A separate image because it needs the Prisma CLI, which the runtime image leaves out.
FROM deps AS migrate
COPY prisma ./prisma
COPY prisma7.config.ts ./
CMD ["npx", "prisma", "migrate", "deploy"]

# ---- runtime: production dependencies and the compiled app only ----
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://localhost:3000/ || exit 1
CMD ["node", "dist/main.js"]
