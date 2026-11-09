from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    # /admin/* son rutas del frontend (SPA); el admin de Django vive aparte.
    path("django-admin/", admin.site.urls),
    path("api/", include("core.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)