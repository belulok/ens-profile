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
