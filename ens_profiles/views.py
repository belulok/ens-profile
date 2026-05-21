"""JSON API + SPA shell.

All routes return JSON except the catch-all, which serves the React build's
index.html so React Router can take over client-side routing. Django no
longer renders any HTML templates on `main` — see number-one/two/three for
the all-Django version.
"""

import json
import logging

from dataclasses import asdict
from django.conf import settings
from django.http import (
    Http404,
    HttpResponse,
    HttpResponseNotAllowed,
    JsonResponse,
)
from django.middleware.csrf import get_token
from django.views.decorators.http import require_http_methods, require_GET

from .services.avatar import normalize_avatar
from .services.ens import ENSNotFound, get_or_resolve, is_valid_ens_name
from .services.friendships import (
    FriendshipError,
    add_friendship,
    remove_friendship,
)
from .services.graph import build_graph

logger = logging.getLogger(__name__)


# ---------- helpers ----------------------------------------------------------

def _no_store(response):
    """Mutation responses must not be cached."""
    response["Cache-Control"] = "no-store"
    return response


def _record_groups(records: dict) -> dict:
    """Group records into display sections. Drops empty values."""
    identity_keys = ["display", "description", "location", "url", "keywords", "notice"]
    contact_keys = ["email", "mail", "phone"]
    social_keys = [
        "com.twitter", "com.github", "com.linkedin", "com.discord",
        "com.reddit", "org.telegram", "io.keybase", "xyz.farcaster",
    ]
    grouped_keys = set(identity_keys + contact_keys + social_keys + ["avatar"])
    return {
        "identity": [(k, records[k]) for k in identity_keys if records.get(k)],
        "contact": [(k, records[k]) for k in contact_keys if records.get(k)],
        "social": [(k, records[k]) for k in social_keys if records.get(k)],
        "other": [(k, v) for k, v in records.items() if k not in grouped_keys and v],
    }


# ---------- API endpoints ----------------------------------------------------

@require_GET
def api_csrf(request):
    """GET-only endpoint that primes the csrftoken cookie for SPA clients."""
    get_token(request)  # ensures Vary: Cookie + sets cookie on response
    return _no_store(JsonResponse({"ok": True}))


@require_GET
def api_profile(request, ens_name: str):
    ens_name = ens_name.strip().lower()
    if not is_valid_ens_name(ens_name):
        return JsonResponse({"error": "invalid ENS name"}, status=404)
    try:
        profile = get_or_resolve(ens_name)
    except ENSNotFound:
        return JsonResponse({"error": "ENS name not found"}, status=404)

    avatar = normalize_avatar(profile.records.get("avatar"))
    return JsonResponse({
        "ens_name": profile.ens_name,
        "address": profile.address,
        "reverse_verified": profile.reverse_verified,
        "records": profile.records,
        "avatar": asdict(avatar),
        "groups": _record_groups(profile.records),
        "resolved_at": profile.resolved_at.isoformat(),
    })


@require_http_methods(["POST"])
def api_graph(request):
    try:
        payload = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "invalid JSON"}, status=400)

    pairs = payload.get("pairs", "")
    if not isinstance(pairs, str):
        return JsonResponse({"error": "'pairs' must be a string"}, status=400)

    result, malformed = build_graph(pairs, persist_pairs=True, merge_db_friendships=True)
    return _no_store(JsonResponse({
        "nodes": [
            {
                "data": {
                    "id": n.id,
                    "label": n.label,
                    "address": n.address,
                    "avatar": n.avatar_url,
                    "resolved": n.resolved,
                },
                "position": {"x": n.x, "y": n.y},
            }
            for n in result.nodes
        ],
        "edges": [
            {"data": {"source": e.source, "target": e.target, "id": f"{e.source}--{e.target}"}}
            for e in result.edges
        ],
        "unresolved": result.unresolved,
        "malformed": malformed,
        "node_count": len(result.nodes),
        "edge_count": len(result.edges),
    }))


@require_http_methods(["POST", "DELETE"])
def api_friendships(request):
    """POST {a, b} → create friendship.   DELETE {a, b} → remove friendship."""
    try:
        payload = json.loads(request.body or b"{}")
    except json.JSONDecodeError:
        return _no_store(JsonResponse({"error": "invalid JSON"}, status=400))

    a = payload.get("a")
    b = payload.get("b")
    if not isinstance(a, str) or not isinstance(b, str):
        return _no_store(JsonResponse({"error": "missing 'a' or 'b'"}, status=400))

    try:
        if request.method == "POST":
            row, created = add_friendship(a, b)
            return _no_store(JsonResponse(
                {"a": row.name_a, "b": row.name_b, "created": created},
                status=201 if created else 200,
            ))
        deleted = remove_friendship(a, b)
        return _no_store(JsonResponse({"deleted": deleted}))
    except FriendshipError as exc:
        return _no_store(JsonResponse({"error": str(exc)}, status=400))


# ---------- SPA shell --------------------------------------------------------

def spa_index(request):
    """Serve the React build's index.html for any non-API path.

    React Router handles client-side routing from there. If the build hasn't
    been produced yet, return a clear 503 with instructions instead of a
    cryptic stack trace.
    """
    path = settings.SPA_INDEX_PATH
    try:
        return HttpResponse(path.read_bytes(), content_type="text/html; charset=utf-8")
    except FileNotFoundError:
        return HttpResponse(
            "Frontend build is missing. Run: cd frontend && npm ci && npm run build",
            status=503,
            content_type="text/plain; charset=utf-8",
        )
