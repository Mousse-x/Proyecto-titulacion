"""Controlador de estadísticas generales del sistema."""
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.core.cache import cache
from ..models import (
    AppUser, University, Indicator, Evidence, EvidenceValidationResult, EvaluationPeriod,
    IntegratedTransparencyResult,
)
from ..middleware import require_auth
from ..cache_utils import stats_cache_key
from .university_views import (
    _dashboard_period_id, _evaluated_periods, _get_university_score_data, _logo_url,
    _resolve_university_logo_path,
)

MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def _monthly_trend(period_id, ranking):
    """Índice integrado mensual de cada universidad del ranking y su promedio."""
    if not period_id or not ranking:
        return []
    names = {item["id"]: item["name"] for item in ranking}
    points = {}
    for university_id, month, value in IntegratedTransparencyResult.objects.filter(
            period_id=period_id, university_id__in=names, month__gte=1,
            index_percent__isnull=False,
    ).values_list("university_id", "month", "index_percent"):
        points.setdefault(month, {})[names[university_id]] = float(value)
    trend = []
    for month in sorted(points):
        row = {"month": month, "label": MONTH_LABELS[month - 1], **points[month]}
        row["Promedio"] = round(sum(points[month].values()) / len(points[month]), 2)
        trend.append(row)
    return trend


@csrf_exempt
def system_stats(request):
    _, err = require_auth(request)
    if err:
        return err

    if request.method == "GET":
        try:
            period_id = request.GET.get("periodo_id")
            month = request.GET.get("month") or request.GET.get("mes")
            cache_key = stats_cache_key(period_id, month)
            cached = cache.get(cache_key)
            if cached is not None:
                return JsonResponse(cached)

            available_periods = _evaluated_periods()
            period_id = int(period_id) if period_id else _dashboard_period_id()
            period = EvaluationPeriod.objects.filter(id=period_id).first() if period_id else None
            evidences = Evidence.objects.all()
            validations = EvidenceValidationResult.objects.select_related(
                "evidence", "evidence__university", "evidence__indicator", "evidence__period"
            )
            if period_id:
                evidences = evidences.filter(period_id=period_id)
                validations = validations.filter(evidence__period_id=period_id)
            if month:
                evidences = evidences.filter(month=month)
                validations = validations.filter(evidence__month=month)

            scores = _get_university_score_data(validations, period_id=period_id, month=month)
            ranking = []
            for univ in University.objects.filter(id__in=scores, is_active=True):
                ranking.append({
                    "id": univ.id, "name": univ.acronym, "full_name": univ.name,
                    "logo_url": _logo_url(request, _resolve_university_logo_path(univ)),
                    "logo_path": _resolve_university_logo_path(univ) or "",
                    "logo_initials": univ.acronym[:4] if univ.acronym else "UNIV",
                    **scores[univ.id],
                })
            ranking.sort(key=lambda item: item["integrated_transparency_score"], reverse=True)
            validation_count = sum(item["evaluated_documents"] for item in ranking)
            avg_transparency = round(sum(item["transparency_score"] for item in ranking) / len(ranking), 2) if ranking else 0
            avg_transparency_integrated = round(sum(item["integrated_transparency_score"] for item in ranking) / len(ranking), 2) if ranking else 0

            recent_documents = [
                {
                    "id": ev.id,
                    "title": ev.title,
                    "indicator_code": ev.indicator.code if ev.indicator_id else None,
                    "university": ev.university.acronym if ev.university_id else None,
                    "status": ev.validation_status,
                    "file_type": ev.file_type,
                    "uploaded_at": ev.uploaded_at.isoformat() if ev.uploaded_at else None,
                }
                for ev in evidences.select_related("indicator", "university").order_by("-uploaded_at")[:8]
            ]

            data = {
                "total_universities": University.objects.filter(is_active=True).count(),
                "total_documents":    evidences.count(),
                "pending_reviews":    evidences.filter(validation_status="pendiente").count(),
                "approved_docs":      evidences.filter(validation_status="aprobado").count(),
                "avg_transparency":   avg_transparency,
                "avg_transparency_integrated": avg_transparency_integrated,
                "active_users":       AppUser.objects.filter(is_active=True).count(),
                "observations_open":  validations.exclude(observations=[]).count(),
                "indicators_active":  Indicator.objects.filter(is_active=True).count(),
                "evaluated_documents": validation_count,
                "ranking": ranking[:10],
                "recent_documents": recent_documents,
                "period": ({"id": period.id, "name": period.period_name, "year": period.year,
                            "month": int(month) if month else None} if period else None),
                "available_periods": available_periods,
                "trend": _monthly_trend(period_id, ranking),
                "simulated": any(item.get("simulated") for item in ranking),
            }
            cache.set(cache_key, data, 60)
            return JsonResponse(data)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener estadisticas: {str(exc)}"}, status=500)

    return JsonResponse({"error": "Metodo no permitido"}, status=405)
