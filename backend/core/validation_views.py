"""
validation_views.py
Vistas REST para el módulo de validación automática de documentos LOTAIP.

Endpoints:
- POST /api/evaluacion/documentos/<id>/validar/
- POST /api/evaluacion/universidades/<id>/validar-todo/?periodo_id=
- GET  /api/evaluacion/documentos/<id>/resultado/
- GET  /api/evaluacion/universidades/<id>/resumen/?periodo_id=
- GET  /api/evaluacion/universidades/<id>/observaciones/?periodo_id=
"""

import json

from django.http import JsonResponse, StreamingHttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone

from .models import (
    Evidence, EvidenceValidationResult, UniversityEvaluationSummary,
    University, EvaluationPeriod, Indicator, IndicatorTemplate, AuditLog,
)
from .middleware import require_auth, require_role
from .services.international_evaluator import evaluate_international_standards, summarize_indices


# ─── Helper de auditoría ────────────────────────────────────────────

def _log(user_id, action, description=None):
    try:
        AuditLog.objects.create(
            user_id=user_id, module="validation", action=action,
            table_name="evaluation.evidence_validation_results",
            description=description, created_at=timezone.now(),
        )
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════
#  VALIDAR DOCUMENTO INDIVIDUAL
# ══════════════════════════════════════════════════════════════════════

@csrf_exempt
def validate_document(request, ev_id):
    """
    POST /api/evaluacion/documentos/<id>/validar/
    Ejecuta la validación automática de un documento de evidencia aprobado.
    """
    _, err = require_role(request, [1, 2, 3])
    if err:
        return err

    if request.method != "POST":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    try:
        from .services.evaluator import evaluar_documento
        result = evaluar_documento(ev_id)

        if result.get("error"):
            return JsonResponse(result, status=400)

        _log(
            user_id=getattr(request, "_user_id", None),
            action="VALIDATE_DOCUMENT",
            description=f"Documento {ev_id} validado: {result.get('puntaje_total')}/100 — {result.get('estado_cumplimiento')}",
        )

        return JsonResponse(result)

    except Exception as exc:
        return JsonResponse({"error": f"Error al validar documento: {str(exc)}"}, status=500)


# ══════════════════════════════════════════════════════════════════════
#  VALIDAR TODOS LOS DOCUMENTOS DE UNA UNIVERSIDAD
# ══════════════════════════════════════════════════════════════════════

@csrf_exempt
def validate_all_university(request, univ_id):
    """
    POST /api/evaluacion/universidades/<id>/validar-todo/?periodo_id=
    Valida todos los documentos aprobados de una universidad en un período.
    Retorna un StreamingHttpResponse con progreso en tiempo real.
    """
    _, err = require_role(request, [1, 2, 3])
    if err:
        return err

    if request.method != "POST":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    period_id = request.GET.get("periodo_id")
    month = request.GET.get("month") or request.GET.get("mes")
    if not period_id:
        # Intentar leer del body
        try:
            body = json.loads(request.body)
            period_id = body.get("periodo_id")
            month = month or body.get("month") or body.get("mes")
        except (json.JSONDecodeError, Exception):
            pass

    if not period_id:
        return JsonResponse({"error": "Se requiere periodo_id"}, status=400)

    try:
        University.objects.get(id=univ_id)
        EvaluationPeriod.objects.get(id=period_id)
    except (University.DoesNotExist, EvaluationPeriod.DoesNotExist) as exc:
        return JsonResponse({"error": f"Referencia inválida: {str(exc)}"}, status=404)

    month_int = None
    if month:
        try:
            month_int = int(month)
        except (TypeError, ValueError):
            return JsonResponse({"error": "El mes debe ser un número entre 1 y 12"}, status=400)
        if month_int < 1 or month_int > 12:
            return JsonResponse({"error": "El mes debe estar entre 1 y 12"}, status=400)

    from .services.evaluator import evaluar_universidad
    gen = evaluar_universidad(univ_id, period_id, month=month_int)

    _log(
        user_id=getattr(request, "_user_id", None),
        action="VALIDATE_ALL_UNIVERSITY",
        description=f"Validación masiva universidad={univ_id} periodo={period_id}",
    )

    return StreamingHttpResponse(gen, content_type="application/x-ndjson")


# ══════════════════════════════════════════════════════════════════════
#  RESULTADO DE VALIDACIÓN DE UN DOCUMENTO
# ══════════════════════════════════════════════════════════════════════

@csrf_exempt
def get_validation_result(request, ev_id):
    """
    GET /api/evaluacion/documentos/<id>/resultado/
    Devuelve el resultado de validación de un documento.
    """
    _, err = require_auth(request)
    if err:
        return err

    if request.method != "GET":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    try:
        vr = EvidenceValidationResult.objects.select_related(
            "evidence", "evidence__university", "evidence__indicator", "evidence__period"
        ).get(evidence_id=ev_id)
    except EvidenceValidationResult.DoesNotExist:
        return JsonResponse({"error": "Resultado de validación no encontrado. Ejecute la validación primero."}, status=404)

    return JsonResponse(_validation_result_to_dict(vr))


def _validation_result_to_dict(vr):
    """Serializa un EvidenceValidationResult a dict."""
    ev = vr.evidence
    template = None
    try:
        if ev.indicator_id:
            template = IndicatorTemplate.objects.get(indicator_id=ev.indicator_id)
    except IndicatorTemplate.DoesNotExist:
        pass
    months = {
        1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
        5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
        9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
    }
    result = {
        "id": vr.id,
        "evidence_id": ev.id,
        "universidad": ev.university.acronym if ev.university else "N/A",
        "universidad_id": ev.university_id,
        "literal": ev.indicator.code if ev.indicator else "N/A",
        "literal_name": ev.indicator.name if ev.indicator else "N/A",
        "periodo": f"{months.get(ev.month, '')} {ev.period.year}" if ev.period else "N/A",
        "periodo_id": ev.period_id,
        "documento": ev.title,
        "file_type": ev.file_type or "N/A",
        "puntaje_existencia": float(vr.score_existence),
        "puntaje_formato": float(vr.score_format),
        "puntaje_actualizacion": float(vr.score_update),
        "puntaje_estructura": float(vr.score_structure),
        "puntaje_contenido": float(vr.score_content),
        "puntaje_accesibilidad": float(vr.score_accessibility),
        "puntaje_total": float(vr.total_score),
        "estado_cumplimiento": vr.compliance_status,
        "observaciones": vr.observations or [],
        "fecha_validacion": vr.validated_at.isoformat() if vr.validated_at else None,
    }
    result["evaluacion_internacional"] = evaluate_international_standards(
        ev,
        template=template,
        lotaip_result=result,
    )
    return result


def _summary_from_validations(validations):
    counters = {
        "CUMPLE": 0,
        "CUMPLE_PARCIALMENTE": 0,
        "INCOMPLETO": 0,
        "NO_CUMPLE": 0,
        "NO_PRESENTADO": 0,
        "ERROR_PROCESAMIENTO": 0,
    }
    total_score = 0
    total = 0

    for vr in validations:
        total += 1
        total_score += float(vr.total_score)
        if vr.compliance_status in counters:
            counters[vr.compliance_status] += 1

    general_observations = []
    if counters["CUMPLE"]:
        general_observations.append(f"{counters['CUMPLE']} documentos cumplen completamente.")
    if counters["CUMPLE_PARCIALMENTE"]:
        general_observations.append(f"{counters['CUMPLE_PARCIALMENTE']} documentos cumplen parcialmente.")
    if counters["INCOMPLETO"]:
        general_observations.append(f"{counters['INCOMPLETO']} documentos estan incompletos.")
    if counters["NO_CUMPLE"]:
        general_observations.append(f"{counters['NO_CUMPLE']} documentos no cumplen.")
    if counters["NO_PRESENTADO"]:
        general_observations.append(f"{counters['NO_PRESENTADO']} documentos no fueron presentados.")

    return {
        "total_index": round(total_score / total, 2) if total else 0,
        "total_indicators": total,
        "indicators_compliant": counters["CUMPLE"],
        "indicators_partial": counters["CUMPLE_PARCIALMENTE"],
        "indicators_incomplete": counters["INCOMPLETO"],
        "indicators_non_compliant": counters["NO_CUMPLE"] + counters["ERROR_PROCESAMIENTO"],
        "indicators_not_presented": counters["NO_PRESENTADO"],
        "general_observations": general_observations,
        "calculated_at": timezone.now().isoformat(),
    }


# ══════════════════════════════════════════════════════════════════════
#  RESUMEN DE CUMPLIMIENTO POR UNIVERSIDAD
# ══════════════════════════════════════════════════════════════════════

@csrf_exempt
def get_compliance_summary(request, univ_id):
    """
    GET /api/evaluacion/universidades/<id>/resumen/?periodo_id=
    Devuelve el resumen de cumplimiento por literal y el índice general.
    """
    _, err = require_auth(request)
    if err:
        return err

    if request.method != "GET":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    period_id = request.GET.get("periodo_id")
    month = request.GET.get("month") or request.GET.get("mes")
    if not period_id:
        return JsonResponse({"error": "Se requiere periodo_id"}, status=400)

    # Obtener resultados de validación de todos los documentos aprobados
    validations = EvidenceValidationResult.objects.filter(
        evidence__university_id=univ_id,
        evidence__period_id=period_id,
    ).select_related(
        "evidence", "evidence__indicator", "evidence__university", "evidence__period"
    ).order_by("evidence__indicator__code")
    if month:
        validations = validations.filter(evidence__month=month)

    # Obtener resumen general si existe
    summary = None
    try:
        summary_obj = UniversityEvaluationSummary.objects.get(
            university_id=univ_id, period_id=period_id
        )
        summary = {
            "total_index": float(summary_obj.total_index),
            "total_indicators": summary_obj.total_indicators,
            "indicators_compliant": summary_obj.indicators_compliant,
            "indicators_partial": summary_obj.indicators_partial,
            "indicators_incomplete": summary_obj.indicators_incomplete,
            "indicators_non_compliant": summary_obj.indicators_non_compliant,
            "indicators_not_presented": summary_obj.indicators_not_presented,
            "general_observations": summary_obj.general_observations,
            "calculated_at": summary_obj.calculated_at.isoformat() if summary_obj.calculated_at else None,
        }
    except UniversityEvaluationSummary.DoesNotExist:
        pass

    # Lista de resultados por literal
    results = [_validation_result_to_dict(vr) for vr in validations]
    summary = _summary_from_validations(validations)
    indices = summarize_indices(results)
    summary.update({
        "total_index": indices["indice_nacional"],
        "national_index": indices["indice_nacional"],
        "international_index": indices["indice_internacional"],
        "integrated_index": indices["indice_nacional_internacional"],
        "international_average_score": indices["puntaje_internacional_promedio"],
        "international_max_score": indices["puntaje_internacional_maximo"],
    })

    return JsonResponse({
        "university_id": univ_id,
        "period_id": int(period_id),
        "month": int(month) if month else None,
        "summary": summary,
        "results": results,
    })


# ══════════════════════════════════════════════════════════════════════
#  OBSERVACIONES DETALLADAS
# ══════════════════════════════════════════════════════════════════════

@csrf_exempt
def get_observations(request, univ_id):
    """
    GET /api/evaluacion/universidades/<id>/observaciones/?periodo_id=
    Devuelve las observaciones automáticas generadas por la validación.
    """
    _, err = require_auth(request)
    if err:
        return err

    if request.method != "GET":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    period_id = request.GET.get("periodo_id")
    month = request.GET.get("month") or request.GET.get("mes")
    if not period_id:
        return JsonResponse({"error": "Se requiere periodo_id"}, status=400)

    validations = EvidenceValidationResult.objects.filter(
        evidence__university_id=univ_id,
        evidence__period_id=period_id,
    ).select_related(
        "evidence", "evidence__indicator"
    ).order_by("evidence__indicator__code")
    if month:
        validations = validations.filter(evidence__month=month)

    observations_list = []
    for vr in validations:
        observations_list.append({
            "literal": vr.evidence.indicator.code if vr.evidence.indicator else "N/A",
            "literal_name": vr.evidence.indicator.name if vr.evidence.indicator else "N/A",
            "documento": vr.evidence.title,
            "puntaje_total": float(vr.total_score),
            "estado": vr.compliance_status,
            "observaciones": vr.observations or [],
        })

    return JsonResponse({
        "university_id": univ_id,
        "period_id": int(period_id),
        "month": int(month) if month else None,
        "observations": observations_list,
    })
