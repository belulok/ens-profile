from django.contrib import admin

from .models import Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("ens_name", "address", "reverse_verified", "resolved_at")
    search_fields = ("ens_name", "address")
    readonly_fields = ("resolved_at",)
