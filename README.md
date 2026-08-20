# Imbrace Chatbot

An AI chatbot single-page app built with [Vite](https://vitejs.dev), React 19, and the
[AI SDK](https://ai-sdk.dev/docs/introduction). It is the chat frontend for the Imbrace
platform: authentication, agent selection, streaming chat with tool calls and
human-in-the-loop approvals, artifacts (text / code / sheet / databoard / vibe-code),
multi-agent (team-lead + sub-agent) workflows, and file attachments.

The app is a pure client-side SPA — it has no backend of its own. All requests are
proxied to the Imbrace app-gateway:

| Prefix | Upstream |
|---|---|
| `/appgateway/*` | app-gateway (prefix stripped) — auth, organizations, agents, file upload |
| `/ai-agent/*` | app-gateway → AI service (`/ai-agent/*` is rewritten to `/api/*`) — chat streaming + persistence |
| `/config` | static client runtime config (`env.json`), baked into the Docker image at build time |

In dev the mapping is done by the Vite proxy ([vite.config.mjs](vite.config.mjs)); in the
Docker image it is done by nginx ([.nginx/nginx.template.conf](.nginx/nginx.template.conf)).

## Running locally

```bash
pnpm install
cp .env.example .env   # then point the URLs at your gateway / services
pnpm dev
```

The dev server runs on [localhost:6790](http://localhost:6790).

All values in `.env` are public client configuration (service URLs) — there are no
secrets. See [.env.example](.env.example) for documentation of each variable.

## Docker

Configuration is baked in at **build time** from `.env` (falling back to
`.env.example` when no `.env` exists), so the image runs with no runtime env vars or
mounted files:

```bash
cp .env.example .env   # adjust URLs
docker build -t imbrace-chatbot .
docker run -p 3000:3000 imbrace-chatbot
```

At build time [generate-env-json.sh](generate-env-json.sh) renders the nginx config from
the template and writes `env.json` (served at `/config`). The nginx upstream defaults to
`IMBRACE_APP_GATEWAY_URL`; set `BACKEND` / `BACKEND_HOST` in `.env` to override.

## API & pages documentation

The app ships its own documentation page at [`/docs`](http://localhost:6790/docs) —
a complete reference of every API endpoint the UI calls (with cURL/Postman snippets),
the environment variables, and all user-facing routes. It is public (no login needed).

## Tests

```bash
pnpm test   # Playwright e2e tests
```
