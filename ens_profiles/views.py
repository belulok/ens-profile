from datetime import timedelta

from django.conf import settings
from django.shortcuts import redirect, render
from django.utils import timezone

from .models import Profile
from .services.avatar import normalize_avatar
from .services.ens import ENSNotFound, resolve_profile


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
        if name:
            return redirect("profile", ens_name=name)
    return render(request, "search.html")


def profile(request, ens_name: str):
    ens_name = ens_name.strip().lower()

    ttl = timedelta(seconds=settings.ENS_CACHE_TTL_SECONDS)
    cached = Profile.objects.filter(ens_name=ens_name).first()
    is_fresh = cached and (timezone.now() - cached.resolved_at) < ttl

    if not is_fresh:
        try:
            data = resolve_profile(ens_name)
        except ENSNotFound:
            return render(request, "not_found.html", {"ens_name": ens_name}, status=404)

        cached, _ = Profile.objects.update_or_create(
            ens_name=ens_name,
            defaults={
                "address": data.address,
                "reverse_verified": data.reverse_verified,
                "records": data.records,
            },
        )

    avatar = normalize_avatar(cached.records.get("avatar"))
    groups = _record_groups(cached.records)

    return render(
        request,
        "profile.html",
        {
            "profile": cached,
            "avatar": avatar,
            "groups": groups,
        },
    )
