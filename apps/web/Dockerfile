FROM node:22-alpine AS builder
WORKDIR /workspace
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/types/package.json ./packages/types/
COPY packages/types/src ./packages/types/src
# Stub the api package so workspace resolution succeeds without its source
RUN mkdir -p apps/api && echo '{"name":"@wim/api","version":"0.0.0"}' > apps/api/package.json

# Vite needs devDependencies at build time, so install everything here.
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

# nginx:alpine drops privileges to user `nginx` for worker processes by
# default, but the master process still runs as root. Switch the entry
# process too — we only need to listen on port 80, which the nginx user
# can bind because we're inside the container's network namespace.
RUN sed -i 's/listen       80;/listen       8080;/' /etc/nginx/conf.d/default.conf || true \
    && sed -i 's/listen 80;/listen 8080;/' /etc/nginx/conf.d/default.conf || true \
    && touch /var/run/nginx.pid \
    && chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /etc/nginx/conf.d /usr/share/nginx/html

USER nginx
EXPOSE 8080
