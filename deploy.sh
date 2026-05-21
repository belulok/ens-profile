#!/usr/bin/env bash
# Deploy helper. Run from the repo root after `git pull` (or use --pull below).
#
# Picks up branch state automatically:
#   - if frontend/ exists      → builds React SPA
#   - if frontend/ is missing  → skips frontend build (number-one/two/three)
# Both branches end with `systemctl restart ens-profiles`.

set -euo pipefail

cd "$(dirname "$0")"

# Optional: pull latest first
if [[ "${1:-}" == "--pull" ]]; then
  git pull --ff-only
fi

# Frontend (main branch only)
if [[ -f frontend/package.json ]]; then
  echo ">> Building React SPA"
  (
    cd frontend
    # Use npm install rather than npm ci — keeps the script tolerant of
    # cross-version lockfile drift between dev machines and the droplet.
    npm install --silent --no-audit --no-fund
    npm run build
  )
else
  echo ">> No frontend/ on this branch — skipping React build"
fi

# Backend
echo ">> Installing Python deps"
.venv/bin/pip install -r requirements.txt --quiet

echo ">> Migrating database"
.venv/bin/python manage.py migrate --noinput

echo ">> Collecting static files"
.venv/bin/python manage.py collectstatic --noinput | tail -2

cat <<'NEXT'

>> Build complete. Finish with:
       sudo systemctl restart ens-profiles
   Then verify:
       https://sebastian.hackathn.xyz
NEXT
