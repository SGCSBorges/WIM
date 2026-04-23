FROM node:22-alpine AS builder
WORKDIR /workspace

# Copy workspace manifests first for layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
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

COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/apps/api/dist ./dist
COPY --from=builder /workspace/apps/api/package.json ./
COPY --from=builder /workspace/apps/api/prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/index.js"]
