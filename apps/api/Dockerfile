FROM node:22-alpine AS builder
WORKDIR /workspace

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/types/src ./packages/types/src
# Stub the web package so workspace resolution succeeds without its source
RUN mkdir -p apps/web && echo '{"name":"@wim/web","version":"0.0.0"}' > apps/web/package.json

RUN npm ci --workspace=apps/api --include-workspace-root

COPY apps/api ./apps/api

WORKDIR /workspace/apps/api
RUN npx prisma generate
RUN npm run build

# ---- production image ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install only production dependencies — drops Vitest, ESLint, ts-node, etc.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
COPY packages/types/src ./packages/types/src
RUN mkdir -p apps/web && echo '{"name":"@wim/web","version":"0.0.0"}' > apps/web/package.json
RUN npm ci --workspace=apps/api --include-workspace-root --omit=dev

COPY --from=builder /workspace/apps/api/dist ./apps/api/dist
COPY --from=builder /workspace/apps/api/prisma ./apps/api/prisma
# Prisma client is generated into node_modules; copy that engine + client
# from the builder so we don't have to rerun `prisma generate` here.
COPY --from=builder /workspace/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /workspace/node_modules/@prisma/client ./node_modules/@prisma/client

# Run as a non-root user. Alpine ships with `node` already; otherwise create one.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/index.js"]
