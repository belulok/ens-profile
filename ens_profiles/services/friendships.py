"""Friendship CRUD service.

Friendships are undirected: we always store the pair with `name_a < name_b`
(alphabetical) and normalize input before any DB call. This keeps the table
free of duplicate "(a,b) AND (b,a)" rows and simplifies queries.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable

from django.db import transaction

from ..models import Friendship
from .ens import is_valid_ens_name

logger = logging.getLogger(__name__)


class FriendshipError(ValueError):
    """Raised for invalid friendship operations (bad names, self-loop, etc.)."""


@dataclass(frozen=True)
class Pair:
    a: str
    b: str

    @classmethod
    def canonical(cls, x: str, y: str) -> "Pair":
        """Build a canonical (alphabetically ordered) pair. Validates both names."""
        x = (x or "").strip().lower()
        y = (y or "").strip().lower()
        if not is_valid_ens_name(x) or not is_valid_ens_name(y):
            raise FriendshipError("invalid ENS name in pair")
        if x == y:
            raise FriendshipError("self-friendship is not allowed")
        a, b = sorted([x, y])
        return cls(a=a, b=b)


def add_friendship(x: str, y: str) -> tuple[Friendship, bool]:
    """Add a friendship between two names. Returns (row, created)."""
    pair = Pair.canonical(x, y)
    row, created = Friendship.objects.get_or_create(name_a=pair.a, name_b=pair.b)
    if created:
        logger.info("friendship_added a=%s b=%s", pair.a, pair.b)
    return row, created


def remove_friendship(x: str, y: str) -> int:
    """Delete a friendship. Returns number of rows deleted (0 or 1)."""
    pair = Pair.canonical(x, y)
    deleted, _ = Friendship.objects.filter(name_a=pair.a, name_b=pair.b).delete()
    if deleted:
        logger.info("friendship_removed a=%s b=%s", pair.a, pair.b)
    return deleted


def friendships_among(names: Iterable[str]) -> list[tuple[str, str]]:
    """List all friendships where BOTH endpoints are in `names`."""
    name_set = {n for n in names if is_valid_ens_name(n)}
    if not name_set:
        return []
    rows = Friendship.objects.filter(name_a__in=name_set, name_b__in=name_set).values_list("name_a", "name_b")
    return list(rows)


@transaction.atomic
def bulk_add_friendships(pairs: Iterable[tuple[str, str]]) -> int:
    """Persist a batch of pairs as friendships. Returns count of new rows.

    Wrapped in a single transaction so the batch either fully commits or
    rolls back together — avoids partial writes on a DB error mid-loop.
    Invalid pairs are silently skipped (already validated upstream).
    """
    new_count = 0
    for x, y in pairs:
        try:
            _, created = add_friendship(x, y)
            if created:
                new_count += 1
        except FriendshipError:
            continue
    return new_count
