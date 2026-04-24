FROM node:22-alpine AS builder
WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
# Stub the api package so workspace resolution succeeds without its source
RUN mkdir -p apps/api && echo '{"name":"@wim/api","version":"0.0.0"}' > apps/api/package.json

RUN npm ci --workspace=apps/web --include-workspace-root

COPY apps/web ./apps/web

WORKDIR /workspace/apps/web
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# ---- production image ----
FROM nginx:alpine
COPY --from=builder /workspace/apps/web/dist /usr/share/nginx/html

# SPA fallback: serve index.html for all unknown routes
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' \
    > /etc/nginx/conf.d/default.conf

EXPOSE 80
