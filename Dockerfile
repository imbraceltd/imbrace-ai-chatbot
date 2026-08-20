# syntax=docker/dockerfile:1
# Multi-stage build: Vite static build -> nginx alpine.
#
# Configuration is rendered at RUNTIME (container start), not baked at build:
# generate-env-json.sh runs from /docker-entrypoint.d/ and renders the nginx
# config (.nginx/nginx.template.conf -> /etc/nginx/nginx.conf) plus the client
# runtime config (env.json, served at /config) from the environment. Variables
# injected via `docker run -e ...` / an ECS task definition win; .env.example
# supplies defaults, so a bare `docker run` still works for local trials.

FROM node:20-alpine AS build

ENV NODE_OPTIONS=--max-old-space-size=4096
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
RUN pnpm config set store-dir .pnpm-store

COPY package.json pnpm-lock.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install -r --offline
RUN pnpm build

# ---------------------------------------------------------------------------

FROM nginx:alpine

RUN apk add --no-cache gettext

COPY --from=build /app/dist /usr/share/nginx/html

# Render nginx.conf + env.json at RUNTIME from injected env (defaults in
# .env.example). The nginx image runs /docker-entrypoint.d/*.sh before starting
# nginx, so the config reflects the environment of THIS container.
COPY .nginx/nginx.template.conf /etc/nginx/nginx.template.conf
COPY .env.example /etc/imbrace/.env.example
COPY generate-env-json.sh /docker-entrypoint.d/30-imbrace-render.sh
RUN chmod +x /docker-entrypoint.d/30-imbrace-render.sh

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
