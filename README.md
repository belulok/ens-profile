# ENS Profiles — Step 1

Django app that resolves any ENS name and renders all populated on-chain fields.

## Run locally

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Open <http://127.0.0.1:8000>. Try `vitalik.eth`, `nick.eth`, `ens.eth`.

## Configuration

Copy `.env.example` to `.env` and edit. All vars have sensible defaults — `.env` is only needed for production (Postgres URL, SECRET_KEY, ALLOWED_HOSTS).

| Variable | Default | Purpose |
|---|---|---|
| `RPC_URL` | `https://ethereum.publicnode.com` | Ethereum RPC endpoint |
| `DATABASE_URL` | _(empty → SQLite)_ | Postgres URL for production |
| `DJANGO_SECRET_KEY` | dev placeholder | Required in production |
| `DJANGO_DEBUG` | `True` | Set `False` in production |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated |
| `ENS_CACHE_TTL_SECONDS` | `3600` | How long to cache resolved profiles |

## What it does

- `/` — search form
- `/<ens_name>/` — profile page (e.g., `/vitalik.eth/`)
- Resolves via `web3.py` against Ethereum mainnet
- Queries 23 known text record keys in parallel (ENSIP-5 globals + recommended service keys + common ones)
- Verifies reverse record (forward-resolves the address back, must match)
- Caches resolved profiles to Postgres/SQLite for 1 hour
- Avatars: handles `https://`, `ipfs://`, `data:` URIs. NFT avatars (`eip155:...`) flagged but not rendered (out of scope).

## Architecture

```
ens_profiles/
├── services/
│   ├── ens.py        # resolve_profile() — web3.py + parallel text record fetch
│   └── avatar.py     # ENSIP-12 URI normalization
├── models.py         # Profile (cache table)
├── views.py          # search + profile views
├── urls.py
└── templates/        # base, search, profile, not_found
```

## Production deployment notes

- `whitenoise` serves static files in production
- `gunicorn` is in requirements; run as `gunicorn config.wsgi:application`
- Set `DATABASE_URL` to your Postgres connection string
- Run `python manage.py collectstatic` before starting gunicorn
- `python manage.py migrate` on each deploy

## Out of scope (future)

- NFT avatar resolution (requires tokenURI + ownership verification)
- Multi-coin addresses (BTC, LTC, etc. via `addr(node, coinType)`)
- Contenthash decoding (IPFS site links)
- Steps 2 (social graph) and 3 (editable edges)
