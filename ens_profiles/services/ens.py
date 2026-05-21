"""ENS resolution service.

Resolves a name to address + all known text records via web3.py.
Reverse records are forward-verified per ENS docs.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Optional

from django.conf import settings
from django.utils import timezone
from ens import ENS
from web3 import Web3

logger = logging.getLogger(__name__)

# ENSIP-5 standard text record keys.
GLOBAL_KEYS = [
    "avatar", "description", "display", "email", "keywords",
    "location", "mail", "notice", "phone", "url",
]
SERVICE_KEYS_RECOMMENDED = [
    "com.github", "com.linkedin", "com.peepeth", "com.twitter",
    "io.keybase", "org.telegram",
]
# Not in ENSIP-5 but commonly populated in the wild.
SERVICE_KEYS_COMMON = [
    "com.discord", "com.reddit", "xyz.farcaster", "eth.ens.delegate",
]
LEGACY_KEYS = ["vnd.github", "vnd.peepeth", "vnd.twitter"]

ALL_KEYS = GLOBAL_KEYS + SERVICE_KEYS_RECOMMENDED + SERVICE_KEYS_COMMON + LEGACY_KEYS

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

# Resolution tuning.
TEXT_RECORD_WORKERS = 10
MAX_ENS_NAME_LENGTH = 253

# Validation: ASCII subset of `.eth` names. ENS supports Unicode (ENSIP-15) and
# other TLDs via CCIP-Read, but restricting to ASCII `.eth` here covers the
# exam scope, keeps the URL surface clean, and avoids embedding attacker-
# controlled bytes in HTML/script contexts. It also prevents random paths
# (e.g. /favicon.ico/) from triggering an on-chain RPC roundtrip.
_ENS_NAME_RE = re.compile(r"^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.eth$")


def is_valid_ens_name(value: str | None) -> bool:
    """Return True if `value` is a syntactically valid (ASCII) ENS name."""
    if not value:
        return False
    value = value.strip().lower()
    if len(value) > MAX_ENS_NAME_LENGTH:
        return False
    return bool(_ENS_NAME_RE.match(value))


class ENSNotFound(Exception):
    """Raised when an ENS name does not resolve to an address."""


@dataclass
class ResolvedProfile:
    ens_name: str
    address: str
    reverse_verified: bool
    records: dict = field(default_factory=dict)


_ns_singleton: Optional[ENS] = None


def _ns() -> ENS:
    global _ns_singleton
    if _ns_singleton is None:
        w3 = Web3(Web3.HTTPProvider(settings.ENS_RPC_URL))
        _ns_singleton = ENS.from_web3(w3)
    return _ns_singleton


# Exceptions we treat as "this record/call failed but the resolution can continue."
# Anything outside these (e.g., KeyError, AttributeError) is a real bug and re-raised.
_TRANSIENT_RPC_EXCEPTIONS: tuple[type[BaseException], ...] = (
    OSError,            # connection errors, DNS, etc.
    ValueError,         # web3 sometimes wraps RPC errors as ValueError
    TimeoutError,
)
try:
    from web3.exceptions import Web3RPCError, BadFunctionCallOutput, ContractLogicError
    _TRANSIENT_RPC_EXCEPTIONS = _TRANSIENT_RPC_EXCEPTIONS + (
        Web3RPCError, BadFunctionCallOutput, ContractLogicError,
    )
except ImportError:  # pragma: no cover — defensive in case web3 reshuffles exceptions
    pass


def _safe_get_text(name: str, key: str) -> str:
    try:
        value = _ns().get_text(name, key)
        return value or ""
    except _TRANSIENT_RPC_EXCEPTIONS as exc:
        logger.debug("get_text failed for %s/%s: %s", name, key, exc)
        return ""


def resolve_profile(ens_name: str) -> ResolvedProfile:
    """Resolve an ENS name to its address + all known text records.

    Raises ENSNotFound if the name is malformed or doesn't resolve to a valid address.
    """
    ens_name = (ens_name or "").strip().lower()
    if not is_valid_ens_name(ens_name):
        raise ENSNotFound(ens_name)

    try:
        address = _ns().address(ens_name)
    except _TRANSIENT_RPC_EXCEPTIONS as exc:
        logger.info("ENS forward resolution failed for %s: %s", ens_name, exc)
        raise ENSNotFound(ens_name) from exc

    if not address or address == ZERO_ADDRESS:
        raise ENSNotFound(ens_name)

    with ThreadPoolExecutor(max_workers=TEXT_RECORD_WORKERS) as ex:
        values = list(ex.map(lambda k: _safe_get_text(ens_name, k), ALL_KEYS))
    records = {k: v for k, v in zip(ALL_KEYS, values) if v}

    reverse_name: str | None = None
    try:
        reverse_name = _ns().name(address)
    except _TRANSIENT_RPC_EXCEPTIONS as exc:
        logger.debug("ENS reverse resolution failed for %s: %s", address, exc)
    verified = bool(reverse_name) and reverse_name.lower() == ens_name

    return ResolvedProfile(
        ens_name=ens_name,
        address=address,
        reverse_verified=verified,
        records=records,
    )


def get_or_resolve(ens_name: str):
    """Return a Profile model instance for `ens_name`, using the DB cache when fresh.

    Raises ENSNotFound if the name is invalid or cannot be resolved on-chain.
    Imported lazily to avoid a circular import (models → service layer).
    """
    from ..models import Profile  # local import to break the cycle

    ens_name = (ens_name or "").strip().lower()
    if not is_valid_ens_name(ens_name):
        raise ENSNotFound(ens_name)

    ttl = timedelta(seconds=settings.ENS_CACHE_TTL_SECONDS)
    cached = Profile.objects.filter(ens_name=ens_name).first()
    if cached and (timezone.now() - cached.resolved_at) < ttl:
        return cached

    data = resolve_profile(ens_name)
    profile, _ = Profile.objects.update_or_create(
        ens_name=ens_name,
        defaults={
            "address": data.address,
            "reverse_verified": data.reverse_verified,
            "records": data.records,
        },
    )
    return profile
