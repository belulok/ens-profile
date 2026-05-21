from django.urls import path

from . import views

urlpatterns = [
    path("", views.search, name="search"),
    path("<str:ens_name>/", views.profile, name="profile"),
]
