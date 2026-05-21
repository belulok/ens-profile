from django.urls import path

from . import views

urlpatterns = [
    path("", views.search, name="search"),
    path("graph/", views.graph, name="graph"),
    path("api/friendships/", views.api_friendships, name="api_friendships"),
    path("<str:ens_name>/", views.profile, name="profile"),
]
