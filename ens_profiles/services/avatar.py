"""ENSIP-12 avatar URI normalization.

Supports https, ipfs, data. NFT URIs (eip155:...) are flagged but not resolved
in step 1 — resolving them requires fetching the NFT's tokenURI metadata and
verifying ownership, which is out of scope for the initial profile page.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class NormalizedAvatar:
    url: str | None
    kind: str  # https | ipfs | data | nft | unknown | none
    unrendered_reason: str | None = None


IPFS_GATEWAY = "https://ipfs.io/ipfs/"


def normalize_avatar(uri: str | None) -> NormalizedAvatar:
    if not uri:
        return NormalizedAvatar(url=None, kind="none")

    uri = uri.strip()

    if uri.startswith(("https://", "http://")):
        return NormalizedAvatar(url=uri, kind="https")

    if uri.startswith("ipfs://"):
        path = uri[len("ipfs://"):].lstrip("/")
        return NormalizedAvatar(url=f"{IPFS_GATEWAY}{path}", kind="ipfs")

    if uri.startswith("data:"):
        return NormalizedAvatar(url=uri, kind="data")

    if uri.startswith("eip155:"):
        return NormalizedAvatar(
            url=None,
            kind="nft",
            unrendered_reason="NFT avatar (resolution not implemented in step 1)",
        )

    return NormalizedAvatar(
        url=None,
        kind="unknown",
        unrendered_reason=f"Unsupported URI scheme: {uri[:40]}",
    )
