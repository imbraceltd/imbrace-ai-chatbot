#!/bin/sh
# Runtime config renderer — runs at container start from /docker-entrypoint.d/
# (the nginx image executes these scripts before starting nginx). This is what
# lets the SAME image be deployed to any environment: variables injected at
# `docker run -e ...` / an ECS task definition take effect at run time.
#
#   1. Apply defaults from .env.example ONLY for keys not already in the
#      environment, so injected env vars win.
#   2. Render .nginx/nginx.template.conf -> /etc/nginx/nginx.conf (envsubst).
#      BACKEND / BACKEND_HOST default to IMBRACE_APP_GATEWAY_URL and its host.
#   3. Write /usr/share/nginx/html/env.json (served at /config to the client),
#      reflecting the effective (runtime-overridden) values.
#
# With no env injected, the .env.example defaults are used — so a bare
# `docker run` still works for local trials.
set -e

DEFAULTS=/etc/imbrace/.env.example
OUT=/usr/share/nginx/html/env.json
TEMPLATE=/etc/nginx/nginx.template.conf
NGINX_CONF=/etc/nginx/nginx.conf

if [ ! -f "$DEFAULTS" ]; then
    echo "ERROR: $DEFAULTS not found in image." >&2
    exit 1
fi

# Apply each default only when the variable is not already set in the
# environment (so a value injected at runtime takes precedence).
while IFS='=' read -r key value; do
    key=$(printf '%s' "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
    case "$key" in '' | \#*) continue ;; esac
    value=$(printf '%s' "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^"//;s/"$//')
    eval "is_set=\${$key+set}"
    [ "$is_set" = set ] || export "$key=$value"
done < "$DEFAULTS"

# Derive the nginx upstream from the gateway URL when not set explicitly.
BACKEND="${BACKEND:-$IMBRACE_APP_GATEWAY_URL}"
if [ -z "$BACKEND" ]; then
    echo "ERROR: BACKEND (or IMBRACE_APP_GATEWAY_URL) must be set at runtime." >&2
    exit 1
fi
default_host=$(echo "$BACKEND" | sed -E 's|^[a-zA-Z]+://||; s|/.*$||; s|:[0-9]+$||')
BACKEND_HOST="${BACKEND_HOST:-$default_host}"
export BACKEND BACKEND_HOST

echo "Rendering nginx config (BACKEND=$BACKEND, BACKEND_HOST=$BACKEND_HOST)..."
# Only these two are substituted, so nginx runtime vars ($uri, $http_upgrade, ...) stay intact.
envsubst '${BACKEND} ${BACKEND_HOST}' < "$TEMPLATE" > "$NGINX_CONF"

# Generate env.json (client runtime config, served at /config). The two
# nginx-only keys are excluded so they are not exposed to the browser. Each
# value reflects the effective (runtime-overridden) value.
echo "{" > "$OUT"
first=1
while IFS='=' read -r key value; do
    key=$(printf '%s' "$key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//;s/^"//;s/"$//')
    case "$key" in '' | \#*) continue ;; esac
    case "$key" in BACKEND | BACKEND_HOST) continue ;; esac
    eval "eff=\${$key}"
    if [ $first -eq 1 ]; then
        printf '"%s":"%s"\n' "$key" "$eff" >> "$OUT"
        first=0
    else
        printf ',"%s":"%s"\n' "$key" "$eff" >> "$OUT"
    fi
done < "$DEFAULTS"
echo "}" >> "$OUT"

echo "Generated $OUT:"
cat "$OUT"
