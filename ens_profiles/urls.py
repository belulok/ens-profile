from django.urls import path, re_path

from . import views

urlpatterns = [
    path("api/csrf/", views.api_csrf, name="api_csrf"),
    path("api/profile/<str:ens_name>/", views.api_profile, name="api_profile"),
    path("api/graph/", views.api_graph, name="api_graph"),
    path("api/friendships/", views.api_friendships, name="api_friendships"),
    # SPA fallback — everything else serves index.html so React Router handles it.
    re_path(r"^.*$", views.spa_index, name="spa_index"),
]
