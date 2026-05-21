from django.db import models


class Profile(models.Model):
    ens_name = models.CharField(max_length=255, unique=True, db_index=True)
    address = models.CharField(max_length=42, blank=True, db_index=True)
    reverse_verified = models.BooleanField(default=False)
    records = models.JSONField(default=dict, blank=True)
    contenthash = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["resolved_at"]),
        ]

    def __str__(self) -> str:
        return self.ens_name


class Friendship(models.Model):
    """Undirected friendship between two ENS names.

    Stored canonically with `name_a < name_b` (alphabetical) so each
    relationship lives in exactly one row. Names are strings, not FKs to
    Profile, because a friendship can be asserted before either profile
    has been resolved on-chain.
    """

    name_a = models.CharField(max_length=255)
    name_b = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["name_a", "name_b"], name="unique_friendship_pair"),
            models.CheckConstraint(check=models.Q(name_a__lt=models.F("name_b")), name="canonical_order"),
        ]
        indexes = [
            models.Index(fields=["name_a"]),
            models.Index(fields=["name_b"]),
        ]

    def __str__(self) -> str:
        return f"{self.name_a} — {self.name_b}"
