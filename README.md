# ENS Profiles

Three-step ENS toolkit. On `main`, a **React + Three.js** SPA fronts a **Django + Postgres** JSON API. The `number-one/two/three` branches preserve the all-Django version of each milestone.

1. Look up any `.eth` profile and render every on-chain field
2. Visualize a social graph of ENS names (networkx + force-directed canvas)
3. Edit edges in the browser; persist as friendships in Postgres

**Live demo**: <https://sebastian.hackathn.xyz>

## Run locally

```bash
# Backend
python3.11+ -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py test ens_profiles.tests   # 55 tests

# Frontend (main branch only)
cd frontend && npm ci && npm run build && cd ..

# Serve
python manage.py runserver
```

Open <http://127.0.0.1:8000>. The home page renders the Three.js particle wave; `/graph` is the editor.

For frontend hot-reload during dev: `cd frontend && npm run dev` (Vite at :5173, proxies `/api/*` to Django at :8000).

## Routes

**SPA (served by the React build)**

| Path | Purpose |
|---|---|
| `/` | Home — Three.js hero + search box |
| `/:name` | Profile page for an ENS name |
| `/graph` | Social graph + edge editor |

**JSON API (Django)**

| Path | Method | Purpose |
|---|---|---|
| `/api/csrf/` | GET | Prime the csrftoken cookie for SPA clients |
| `/api/profile/<name>/` | GET | Resolve name → JSON of address, avatar, records, groups |
| `/api/graph/` | POST | Build a graph from `{pairs: string}`; returns nodes/edges/positions |
| `/api/friendships/` | POST | Create friendship `{a, b}` — 201/200 |
| `/api/friendships/` | DELETE | Remove friendship `{a, b}` — `{deleted}` |

API mutations require Django's CSRF token (`X-CSRFToken` header). Mutations are rate-limited at the nginx layer (30 req/min/IP, burst 10).

## Architecture

```
frontend/                     # React 18 + TS + Vite (main branch only)
├── src/
│   ├── components/
│   │   ├── Layout.tsx        # header + outlet
│   │   └── ParticleWave.tsx  # @react-three/fiber wave (home only)
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── ProfilePage.tsx   # TanStack Query → /api/profile/
│   │   ├── GraphPage.tsx     # react-force-graph-2d + edge editing
│   │   └── NotFoundPage.tsx
│   └── lib/
│       ├── api.ts            # fetch + CSRF wrapper
│       └── validation.ts     # client-side .eth-only mirror

ens_profiles/                 # Django app (JSON API on main)
├── services/
│   ├── ens.py                # web3.py + parallel text-record fetch; get_or_resolve() cache
│   ├── avatar.py             # ENSIP-12 URI normalization (https / ipfs / data / nft)
│   ├── graph.py              # parse_pairs + networkx spring_layout
│   └── friendships.py        # canonical pair ordering + add/remove/list
├── models.py                 # Profile (cache), Friendship (undirected, canonical)
├── views.py                  # JSON endpoints + SPA shell
├── urls.py
└── tests/                    # 55 tests
```

## Configuration

`.env` overrides built-in defaults. Local dev works without one (SQLite).

| Variable | Default | Purpose |
|---|---|---|
| `RPC_URL` | `https://ethereum.publicnode.com` | Ethereum RPC endpoint |
| `DATABASE_URL` | _(empty → SQLite)_ | `postgres://user:pass@host/db` for production |
| `DJANGO_SECRET_KEY` | dev placeholder | **Required** in production |
| `DJANGO_DEBUG` | `True` | Set `False` in production |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated |
| `ENS_CACHE_TTL_SECONDS` | `3600` | How long to cache resolved profiles |
| `CSRF_TRUSTED_ORIGINS` | _(empty)_ | `https://yourdomain.com` when behind a proxy |
| `USE_X_FORWARDED_PROTO` | `False` | Set `True` when behind an HTTPS reverse proxy |
| `ENS_LOG_LEVEL` | `INFO` | App logger level |

## Security posture

- `is_valid_ens_name()` restricts URL/input to `^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.eth$` on **both** sides
- API responses set `Cache-Control: no-store`; mutations require CSRF token
- HSTS, Referrer-Policy, X-Content-Type-Options, X-Frame-Options, SameSite/Secure cookies (when behind HTTPS)
- nginx `limit_req` zone for `/api/`
- Postgres role is least-privilege (owns only the app DB; no superuser)

## Branches

- `main` — React + Three.js SPA + Django JSON API
- `number-one` — step 1 only, all-Django templates
- `number-two` — step 1 + 2, all-Django templates + audit pass
- `number-three` — all three steps, all-Django templates

**Demo switcher** (on the server): `ssh splash && cd ~/ens-profiles && git checkout <branch> && ./deploy.sh` — `deploy.sh` detects whether `frontend/` exists and builds React if so; otherwise just runs the Django side.

## Out of scope (next steps)

- **Auth on edge mutations** — anyone can currently add/delete. Next: sign-in-with-ethereum for wallet-scoped writes.
- **NFT avatar resolution** — requires tokenURI fetch + ownership verification; falls back to initials today.
- **ENS multi-coin addresses** + contenthash decoding.
- **Non-`.eth` TLDs** via CCIP-Read.
