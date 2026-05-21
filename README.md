# ENS Profiles

Three-step Django app:
1. Look up any `.eth` profile and render every on-chain field
2. Visualize a social graph of ENS names with networkx + Cytoscape.js
3. Edit edges in the browser; persist as friendships in Postgres

**Live demo**: <https://sebastian.hackathn.xyz>

## Run locally

```bash
python3.11+ -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py test ens_profiles.tests   # 55 tests
python manage.py runserver
```

Open <http://127.0.0.1:8000>. Try `vitalik.eth`, `/graph/` with the sample button.

## Routes

| Path | Method | Purpose |
|---|---|---|
| `/` | GET / POST | Search box; POST redirects to profile |
| `/<ens_name>/` | GET | Profile page — address, avatar, every populated text record |
| `/graph/` | GET / POST | Social graph; textarea pairs are persisted as friendships |
| `/api/friendships/` | POST | Create a friendship `{a, b}` — 201 created / 200 idempotent |
| `/api/friendships/` | DELETE | Remove a friendship `{a, b}` — `{deleted: 0\|1}` |

API mutations require Django's CSRF token (X-CSRFToken header). Mutations are rate-limited at the nginx layer (30 req/min/IP with burst of 10).

## Architecture

```
ens_profiles/
├── services/
│   ├── ens.py          # web3.py + parallel text-record fetch; get_or_resolve() cache
│   ├── avatar.py       # ENSIP-12 URI normalization (https / ipfs / data / nft)
│   ├── graph.py        # parse_pairs + networkx spring_layout + Cytoscape elements
│   └── friendships.py  # canonical pair ordering + add/remove/list helpers
├── models.py           # Profile (cache), Friendship (undirected, canonical pair)
├── views.py            # search / profile / graph / api_friendships
├── urls.py
├── tests/              # 55 tests (validation, avatar, parsing, grouping, friendships, API)
└── templates/          # base, search, profile, graph, not_found
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

- `is_valid_ens_name()` restricts URL/input to `^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.eth$`
- Graph JSON embedded with `{% json_script %}` (no `\|safe` on user input)
- CSRF middleware enforces a token on every state-changing request
- HSTS, Referrer-Policy, X-Content-Type-Options, X-Frame-Options, SameSite/Secure cookies (when behind HTTPS)
- nginx `limit_req` zone for `/api/`
- Postgres role is least-privilege (owns only the app DB; no superuser)

## Branches

- `main` — latest
- `number-one` — step 1 milestone (profile lookup only)
- `number-two` — step 1 + step 2 + the audit pass
- `number-three` — all three steps

To demo a given stage on the server: `ssh splash && cd ~/ens-profiles && git checkout <branch> && sudo systemctl restart ens-profiles`.

## Out of scope (next steps)

- **Authentication on edge mutations** — anyone can currently add/delete edges. The natural next step is wallet-signed mutations (sign-in-with-ethereum) so an edge can only be added/removed by an endpoint owner.
- **NFT avatar resolution** — would require fetching tokenURI + verifying NFT ownership; falls back to initials today.
- **ENS multi-coin addresses** (BTC/LTC/etc.) and contenthash decoding for IPFS site links.
- **Non-`.eth` TLDs** via CCIP-Read off-chain resolvers (`*.cb.id`, etc.).
