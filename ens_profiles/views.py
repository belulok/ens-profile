from django.shortcuts import redirect, render

from .services.avatar import normalize_avatar
from .services.ens import ENSNotFound, get_or_resolve, is_valid_ens_name
from .services.graph import SAMPLE_PAIRS, build_graph


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


def search(request):
    if request.method == "POST":
        name = (request.POST.get("ens_name") or "").strip().lower()
        if is_valid_ens_name(name):
            return redirect("profile", ens_name=name)
    return render(request, "search.html")


def profile(request, ens_name: str):
    ens_name = ens_name.strip().lower()

    if not is_valid_ens_name(ens_name):
        return render(request, "not_found.html", {"ens_name": ens_name}, status=404)

    try:
        profile_obj = get_or_resolve(ens_name)
    except ENSNotFound:
        return render(request, "not_found.html", {"ens_name": ens_name}, status=404)

    return render(
        request,
        "profile.html",
        {
            "profile": profile_obj,
            "avatar": normalize_avatar(profile_obj.records.get("avatar")),
            "groups": _record_groups(profile_obj.records),
        },
    )


def graph(request):
    raw_pairs = ""
    graph_data: dict = {"nodes": [], "edges": []}
    unresolved: list[str] = []
    malformed: list[str] = []
    node_count = 0
    edge_count = 0

    if request.method == "POST":
        raw_pairs = request.POST.get("pairs", "")
        result, malformed = build_graph(raw_pairs)
        graph_data = result.to_dict()
        unresolved = result.unresolved
        node_count = len(result.nodes)
        edge_count = len(result.edges)

    return render(
        request,
        "graph.html",
        {
            "raw_pairs": raw_pairs,
            "sample_pairs": SAMPLE_PAIRS,
            "graph_data": graph_data,
            "unresolved": unresolved,
            "malformed": malformed,
            "node_count": node_count,
            "edge_count": edge_count,
            "submitted": request.method == "POST",
        },
    )
