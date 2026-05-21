"""ENS resolution service.

Resolves a name to address + all known text records via web3.py.
Reverse records are forward-verified per ENS docs.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Optional

from django.conf import settings
from ens import ENS
from web3 import Web3

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


def _safe_get_text(name: str, key: str) -> str:
    try:
        value = _ns().get_text(name, key)
        return value or ""
    except Exception:
        return ""


def resolve_profile(ens_name: str) -> ResolvedProfile:
    """Resolve an ENS name to its address + all known text records.

    Raises ENSNotFound if the name doesn't resolve to a valid address.
    """
    ens_name = (ens_name or "").strip().lower()
    if not ens_name or "." not in ens_name:
        raise ENSNotFound(ens_name)

    try:
        address = _ns().address(ens_name)
    except Exception as exc:
        raise ENSNotFound(ens_name) from exc

    if not address or address == ZERO_ADDRESS:
        raise ENSNotFound(ens_name)

    with ThreadPoolExecutor(max_workers=10) as ex:
        values = list(ex.map(lambda k: _safe_get_text(ens_name, k), ALL_KEYS))
    records = {k: v for k, v in zip(ALL_KEYS, values) if v}

    reverse_name = None
    try:
        reverse_name = _ns().name(address)
    except Exception:
        pass
    verified = bool(reverse_name) and reverse_name.lower() == ens_name

    return ResolvedProfile(
        ens_name=ens_name,
        address=address,
        reverse_verified=verified,
        records=records,
    )
