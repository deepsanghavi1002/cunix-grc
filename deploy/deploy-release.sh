#!/usr/bin/env bash
set -euo pipefail
cd /home/dhs/apps/cunix-grc
: "${DEPLOY_IMAGE:?An immutable image is required}"
test -f cunix-grc.env
test -f compose.production.yml.new
previous=""
if test -f release.env; then previous=$(sed -n 's/^DEPLOY_IMAGE=//p' release.env); fi
export DEPLOY_IMAGE
docker pull "$DEPLOY_IMAGE"
cp compose.production.yml.new compose.production.yml
docker compose -p cunix-grc -f compose.production.yml up -d
for attempt in $(seq 1 40); do
  if curl --fail --silent http://127.0.0.1:3011/api/health; then
    printf 'DEPLOY_IMAGE=%s\n' "$DEPLOY_IMAGE" > release.env
    exit 0
  fi
  sleep 2
done
docker compose -p cunix-grc -f compose.production.yml logs --tail 100
if test -n "$previous"; then
  export DEPLOY_IMAGE="$previous"
  docker compose -p cunix-grc -f compose.production.yml up -d
fi
exit 1
