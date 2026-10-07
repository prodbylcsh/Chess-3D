#!/usr/bin/env bash
# Start the local Supabase stack (database, auth, realtime, the `game` Edge Function)
# inside a Claude Code cloud container. Safe to run again: finished steps are skipped.
# Run from the repository root. Logs go to $LOGS (default /tmp/supabase-local).
set -euo pipefail

LOGS=${LOGS:-/tmp/supabase-local}
mkdir -p "$LOGS"
HERE=$(cd "$(dirname "$0")" && pwd)

step() { echo "· $*"; }
# The function answers itself (any status but gateway errors) once it is served.
fn_up() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:54321/functions/v1/game -H 'content-type: application/json' -d '{}' || true)
  [[ "$code" != 000 && "$code" != 502 && "$code" != 503 && "$code" != 504 ]]
}

# 1. Docker daemon (not started automatically in these containers)
if ! docker info >/dev/null 2>&1; then
  step "starting dockerd"
  (dockerd >"$LOGS/dockerd.log" 2>&1 &)
  until docker info >/dev/null 2>&1; do sleep 1; done
fi

# 2. npm registry mirror: the Edge Function container can't reach npm through the
#    agent proxy, so a tiny local mirror forwards requests (node uses the proxy).
if ! curl -s -o /dev/null http://127.0.0.1:4873/chess.js; then
  step "starting npm mirror on :4873"
  (NODE_USE_ENV_PROXY=1 node "$HERE/npm-mirror.mjs" >"$LOGS/mirror.log" 2>&1 &)
  until curl -s -o /dev/null http://127.0.0.1:4873/chess.js; do sleep 1; done
fi

# 3. The stack, without the services the app doesn't use. Images come from Docker Hub.
#    </dev/null: some supabase commands wait for stdin otherwise.
if ! curl -s -o /dev/null http://127.0.0.1:54321/rest/v1/; then
  step "supabase start (first run pulls images: several minutes)"
  SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start \
    -x studio,imgproxy,storage-api,logflare,vector,supavisor,mailpit,postgres-meta </dev/null >"$LOGS/start.log" 2>&1 \
    || { tail -20 "$LOGS/start.log"; exit 1; }
fi

# 4. Patch the edge-runtime image once: trust the agent proxy's CA and use the mirror.
EDGE=$(docker images supabase/edge-runtime --format '{{.Repository}}:{{.Tag}}' | grep -v -- '-orig$' | head -1)
if [ -z "$EDGE" ]; then
  step "pulling the edge-runtime image"
  npx supabase functions serve </dev/null >"$LOGS/functions.log" 2>&1 &
  until EDGE=$(docker images supabase/edge-runtime --format '{{.Repository}}:{{.Tag}}' | grep -v -- '-orig$' | head -1) && [ -n "$EDGE" ]; do sleep 2; done
  pkill -f "supabase functions serve" || true
fi
GATEWAY=$(docker network inspect supabase_network_chess-3d -f '{{(index .IPAM.Config 0).Gateway}}')
if ! docker image inspect "$EDGE" -f '{{.Config.Env}}' | grep -q NPM_CONFIG_REGISTRY; then
  step "patching $EDGE (CA bundle + npm mirror at $GATEWAY:4873)"
  D=$(mktemp -d)
  cp /root/.ccr/ca-bundle.crt "$D/ca.crt"
  docker tag "$EDGE" "$EDGE-orig"
  cat >"$D/Dockerfile" <<EOF
FROM $EDGE-orig
COPY ca.crt /etc/ssl/certs/ccr-ca-bundle.crt
ENV DENO_CERT=/etc/ssl/certs/ccr-ca-bundle.crt SSL_CERT_FILE=/etc/ssl/certs/ccr-ca-bundle.crt
ENV NPM_CONFIG_REGISTRY=http://$GATEWAY:4873/
EOF
  docker build -q -t "$EDGE" "$D" >/dev/null
  docker rm -f supabase_edge_runtime_chess-3d >/dev/null 2>&1 || true
fi

# 5. Edge Functions
if ! fn_up; then
  step "serving edge functions"
  (npx supabase functions serve </dev/null >"$LOGS/functions.log" 2>&1 &)
  for _ in $(seq 1 120); do
    fn_up && break
    sleep 1
  done
fi

ANON=$(npx supabase status -o env </dev/null 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')
echo
echo "Supabase is up at http://127.0.0.1:54321"
echo "Run the online tests with:"
echo "  SUPABASE_ANON_KEY=$ANON npm run test:e2e"
