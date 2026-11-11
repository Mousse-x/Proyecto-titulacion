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
import threading
from datetime import timedelta

from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db import close_old_connections, transaction
from django.db.models import Q

from ..models import (
    Evidence, EvidenceValidationResult, UniversityEvaluationSummary,
    University, EvaluationPeriod, Indicator, IndicatorTemplate, AuditLog,
    LotaipEvaluationRun, LotaipManualReview, LotaipLinkReview,
    IntegratedIndicator, TransparencyDimension,
)
from ..middleware import require_auth, require_role
from ..services.integrated_transparency import (
    clear_international_dimension_cache,
    lotaip_score_rows,
    recalculate_integrated_index,
    reevaluate_integrated_indicator,
    serialize_integrated_result,
    sync_national_results,
)
from ..services.evaluator import is_lotaip_dictionary
from ..services.lotaip_rubric import pending_links, review_link, review_rubric, summarize_rubrics, VERSION
from ..lotaip_engine.rules import ENGINE_VERSION, LEGAL_SOURCE, NUMERAL_CONFIG
from ..cache_utils import invalidate_dashboard_cache


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


def _university_access_error(user, univ_id):
    return None


# ══════════════════════════════════════════════════════════════════════
#  VALIDAR DOCUMENTO INDIVIDUAL
# ══════════════════════════════════════════════════════════════════════

@csrf_exempt
def validate_document(request, ev_id):
    """
    POST /api/evaluacion/documentos/<id>/validar/
    Ejecuta la validacion automatica de un documento de evidencia aprobado.
    """
    user, err = require_role(request, [1, 2, 3])
    if err:
        return err

    if request.method != "POST":
        return JsonResponse({"error": "Metodo no permitido"}, status=405)

    try:
        evidence = Evidence.objects.only("id", "university_id").get(id=ev_id)
    except Evidence.DoesNotExist:
        return JsonResponse({"error": "Documento no encontrado"}, status=404)

    access_error = _university_access_error(user, evidence.university_id)
    if access_error:
        return access_error

    try:
        from ..services.evaluator import evaluar_documento
        try:
            payload = json.loads(request.body or b'{}')
        except (ValueError, TypeError):
            return JsonResponse({"error": "Solicitud JSON inválida"}, status=400)
        if (not isinstance(payload, dict)
                or type(payload.get('retry_pending', False)) is not bool
                or type(payload.get('reevaluate', False)) is not bool):
            return JsonResponse({"error": "retry_pending y reevaluate deben ser booleanos"}, status=400)
        result = evaluar_documento(
            ev_id,
            retry_pending=payload.get('retry_pending', False),
            reevaluate=payload.get('reevaluate', False),
        )

        if result.get("error"):
            return JsonResponse(result, status=400)

        _log(
            user_id=getattr(request, "_user_id", None),
            action="VALIDATE_DOCUMENT",
            description=f"Documento {ev_id} validado: {result.get('puntaje_total')}/100 - {result.get('estado_cumplimiento')}",
        )

        return JsonResponse(result)

    except Exception as exc:
        return JsonResponse({"error": f"Error al validar documento: {str(exc)}"}, status=500)


# ══════════════════════════════════════════════════════════════════════
#  VALIDAR TODOS LOS DOCUMENTOS DE UNA UNIVERSIDAD
# ══════════════════════════════════════════════════════════════════════

def _run_university_evaluation(run_id, univ_id, period_id, month, reevaluate, scope):
    """Consume la evaluación fuera de la petición y persiste su progreso."""
    close_old_connections()
    try:
        from ..services.evaluator import evaluar_universidad

        def run_cancelled():
            return not LotaipEvaluationRun.objects.filter(
                id=run_id, status=LotaipEvaluationRun.Status.PROCESSING,
            ).exists()

        final = None
        source = evaluar_universidad(
            univ_id, period_id, month=month, reevaluate=reevaluate,
            should_cancel=run_cancelled, scope=scope,
        )
        for line in source:
            try:
                payload = json.loads(line)
            except (TypeError, ValueError):
                continue
            if payload.get("status") == "cancelled":
                return
            if payload.get("status") == "done":
                final = payload
                continue
            if payload.get("status") == "progress":
                snapshot = {**payload, "updated_at": timezone.now().isoformat()}
                updated = LotaipEvaluationRun.objects.filter(
                    id=run_id, status=LotaipEvaluationRun.Status.PROCESSING,
                ).update(result=snapshot)
                if not updated:
                    return

        if final is None:
            raise RuntimeError("La evaluación terminó sin producir un resultado final.")
        final_status = (LotaipEvaluationRun.Status.COMPLETED_REVIEWS
                        if scope != 'international'
                        and final.get("summary", {}).get("sita", {}).get("criterios_pendientes")
                        else LotaipEvaluationRun.Status.COMPLETED)
        LotaipEvaluationRun.objects.filter(
            id=run_id, status=LotaipEvaluationRun.Status.PROCESSING,
        ).update(result=final, status=final_status, completed_at=timezone.now())
    except Exception as exc:
        LotaipEvaluationRun.objects.filter(
            id=run_id, status=LotaipEvaluationRun.Status.PROCESSING,
        ).update(status=LotaipEvaluationRun.Status.ERROR, error=str(exc),
                 completed_at=timezone.now())
    finally:
        close_old_connections()


@csrf_exempt
def validate_all_university(request, univ_id):
    """
    POST /api/evaluacion/universidades/<id>/validar-todo/?periodo_id=
    Inicia en segundo plano la validación de una universidad en un período.
    El cliente consulta ``lotaip_run_detail`` para recuperar el progreso.
    """
    user, err = require_role(request, [1, 2, 3])
    if err:
        return err

    if request.method != "POST":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    period_id = request.GET.get("periodo_id")
    month = request.GET.get("month") or request.GET.get("mes")
    reevaluate = False
    scope = 'all'
    try:
        body = json.loads(request.body or b'{}')
        if isinstance(body, dict):
            period_id = period_id or body.get("periodo_id")
            month = month or body.get("month") or body.get("mes")
            reevaluate = body.get("reevaluate", False)
            scope = body.get("scope", 'all')
    except (json.JSONDecodeError, TypeError):
        pass

    if not period_id:
        return JsonResponse({"error": "Se requiere periodo_id"}, status=400)
    if type(reevaluate) is not bool:
        return JsonResponse({"error": "reevaluate debe ser booleano"}, status=400)
    if not isinstance(scope, str) or scope not in {'all', 'lotaip', 'international'}:
        return JsonResponse({"error": "scope debe ser all, lotaip o international"}, status=400)

    access_error = _university_access_error(user, univ_id)
    if access_error:
        return access_error

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

    evidences_qs = Evidence.objects.filter(university_id=univ_id, period_id=period_id)
    if month_int:
        evidences_qs = evidences_qs.filter(month=month_int)
    if scope in {'all', 'lotaip'} and not evidences_qs.exists():
        return JsonResponse({"error": "No hay documentos para la universidad, periodo o mes seleccionado. No se puede realizar la evaluacion."}, status=400)

    run_month = month_int or EvaluationPeriod.objects.get(id=period_id).month or 1
    with transaction.atomic():
        # Serializa la creación por universidad y evita resultados mezclados
        # cuando se pulsa validar más de una vez.
        University.objects.select_for_update().get(id=univ_id)
        stale_seconds = max(300, getattr(settings, "LOTAIP_RUN_STALE_SECONDS", 7200))
        stale_cutoff = timezone.now() - timedelta(seconds=stale_seconds)
        LotaipEvaluationRun.objects.filter(
            university_id=univ_id,
            period_id=period_id,
            month=run_month,
            status=LotaipEvaluationRun.Status.PROCESSING,
        ).filter(
            Q(started_at__lt=stale_cutoff)
            | Q(started_at__isnull=True, created_at__lt=stale_cutoff)
        ).update(
            status=LotaipEvaluationRun.Status.ERROR,
            error="Ejecución cerrada automáticamente por falta de actividad o finalización.",
            completed_at=timezone.now(),
        )
        active = LotaipEvaluationRun.objects.filter(
            university_id=univ_id, period_id=period_id, month=run_month,
            status=LotaipEvaluationRun.Status.PROCESSING,
        ).order_by('-created_at').first()
        if active:
            return JsonResponse({
                "error": "Ya existe una evaluación automática en proceso para esta universidad, período y mes.",
                "run_id": active.id,
                "started_at": active.started_at.isoformat() if active.started_at else None,
                "can_cancel": True,
            }, status=409)
        run = LotaipEvaluationRun.objects.create(
            university_id=univ_id, period_id=period_id, month=run_month,
            status=LotaipEvaluationRun.Status.PROCESSING, engine_version=ENGINE_VERSION,
            legal_source=LEGAL_SOURCE, created_by_id=user.id, started_at=timezone.now(),
            result={"status": "progress", "pct": 0,
                    "scope": scope,
                    "msg": ("Iniciando evaluación internacional..." if scope == 'international'
                            else "Iniciando evaluación LOTAIP..."),
                    "phase": ("Preparando búsqueda web" if scope == 'international'
                              else "Preparando evaluación LOTAIP"),
                    "detail": ("Agrupando indicadores por dimensión."
                               if scope == 'international' else "Organizando los documentos seleccionados.")},
        )

    worker = threading.Thread(
        target=_run_university_evaluation,
        args=(run.id, univ_id, period_id, month_int, reevaluate, scope),
        name=f"lotaip-run-{run.id}", daemon=True,
    )
    worker.start()

    _log(
        user_id=getattr(request, "_user_id", None),
        action="VALIDATE_ALL_UNIVERSITY",
        description=f"Validación {scope} universidad={univ_id} periodo={period_id}",
    )

    return JsonResponse({
        "status": "run", "run_id": run.id, "engine_version": ENGINE_VERSION,
        "scope": scope,
        "message": ("Evaluación internacional iniciada en segundo plano."
                    if scope == 'international' else "Evaluación LOTAIP iniciada en segundo plano."),
    }, status=202)


@csrf_exempt
def cancel_lotaip_run(request, run_id):
    """Detiene de forma cooperativa una evaluación LOTAIP en curso."""
    user, err = require_role(request, [1, 2, 3])
    if err:
        return err
    if request.method != "POST":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    with transaction.atomic():
        try:
            run = LotaipEvaluationRun.objects.select_for_update().get(id=run_id)
        except LotaipEvaluationRun.DoesNotExist:
            return JsonResponse({"error": "Ejecución no encontrada"}, status=404)
        access_error = _university_access_error(user, run.university_id)
        if access_error:
            return access_error
        if run.status == LotaipEvaluationRun.Status.CANCELLED:
            return JsonResponse({"id": run.id, "status": run.status,
                                 "message": "La evaluación ya estaba detenida."})
        if run.status != LotaipEvaluationRun.Status.PROCESSING:
            return JsonResponse({"error": "La evaluación ya finalizó y no puede detenerse.",
                                 "status": run.status}, status=409)
        run.status = LotaipEvaluationRun.Status.CANCELLED
        run.error = "Evaluación detenida por solicitud del usuario."
        run.completed_at = timezone.now()
        run.save(update_fields=["status", "error", "completed_at"])

    _log(user_id=getattr(request, "_user_id", None), action="CANCEL_LOTAIP_RUN",
         description=f"Evaluación LOTAIP detenida run={run_id}")
    return JsonResponse({"id": run.id, "status": run.status,
                         "message": "Evaluación detenida correctamente."})


def _international_action_context(request):
    try:
        payload = json.loads(request.body or b'{}')
    except (TypeError, ValueError):
        raise ValueError('Solicitud JSON inválida.')
    period_id = payload.get('period_id') or payload.get('periodo_id')
    if not period_id:
        raise ValueError('Se requiere period_id.')
    try:
        period_id = int(period_id)
        month = int(payload.get('month') or payload.get('mes') or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError('El período y el mes deben ser numéricos.') from exc
    if month not in range(0, 13):
        raise ValueError('El mes debe estar entre 1 y 12.')
    EvaluationPeriod.objects.get(id=period_id)
    return period_id, month or None


@csrf_exempt
def retry_international_indicator(request, univ_id, indicator_code):
    user, err = require_role(request, [1, 2, 3])
    if err:
        return err
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido'}, status=405)
    access_error = _university_access_error(user, univ_id)
    if access_error:
        return access_error
    try:
        period_id, month = _international_action_context(request)
        payload = reevaluate_integrated_indicator(
            univ_id, period_id, indicator_code, month,
        )
        return JsonResponse({'result': payload})
    except (University.DoesNotExist, EvaluationPeriod.DoesNotExist, IntegratedIndicator.DoesNotExist):
        return JsonResponse({'error': 'Universidad, período o indicador no encontrado.'}, status=404)
    except ValueError as exc:
        return JsonResponse({'error': str(exc)}, status=400)
    except Exception as exc:
        return JsonResponse({'error': f'No se pudo reevaluar el indicador: {exc}'}, status=500)


@csrf_exempt
def clear_international_cache(request, univ_id, dimension_code):
    user, err = require_role(request, [1, 2, 3])
    if err:
        return err
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido'}, status=405)
    access_error = _university_access_error(user, univ_id)
    if access_error:
        return access_error
    try:
        period_id, month = _international_action_context(request)
        result = clear_international_dimension_cache(
            univ_id, period_id, dimension_code, month,
        )
        return JsonResponse(result)
    except (University.DoesNotExist, EvaluationPeriod.DoesNotExist, TransparencyDimension.DoesNotExist):
        return JsonResponse({'error': 'Universidad, período o dimensión no encontrada.'}, status=404)
    except ValueError as exc:
        return JsonResponse({'error': str(exc)}, status=400)
    except Exception as exc:
        return JsonResponse({'error': f'No se pudo limpiar la caché: {exc}'}, status=500)


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


def _validation_result_to_dict(vr, include_raw=True):
    """Serializa un EvidenceValidationResult a dict.

    include_raw=False omite automatic_result y manual_override: el resumen por
    universidad no los usa y duplicaban la rúbrica (varios MB por respuesta).
    """
    ev = vr.evidence
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
        "puntaje_total": summarize_rubrics([vr.lotaip_rubric])["puntaje_formato"] if vr.lotaip_rubric else float(vr.total_score),
        "rubrica_lotaip": vr.lotaip_rubric or None,
        "engine_version": vr.engine_version or vr.lotaip_rubric.get("engine_version"),
        "requires_review": vr.requires_review,
        "requiere_revalidacion": not bool(vr.lotaip_rubric),
        "sita": summarize_rubrics([vr.lotaip_rubric]),
        "estado_cumplimiento": vr.compliance_status,
        "observaciones": vr.observations or [],
        "fecha_validacion": vr.validated_at.isoformat() if vr.validated_at else None,
    }
    if include_raw:
        result["automatic_result"] = vr.automatic_result or vr.lotaip_rubric
        result["manual_override"] = vr.manual_override or {}
    return result


def _monthly_integrated_series(univ_id, period_id, validations, score_rows=None):
    """ITI y componente internacional de cada mes con documentos evaluados."""
    series = []
    months = sorted({row.evidence.month for row in validations if row.evidence.month})
    for month in months:
        sync_national_results(univ_id, period_id, month, score_rows=score_rows)
        result = recalculate_integrated_index(univ_id, period_id, month)
        international = (result.coverage or {}).get('components', {}).get('international', {}).get('score')
        series.append({
            'month': month,
            'index_percent': float(result.index_percent) if result.index_percent is not None else None,
            'international': float(international) if international is not None else None,
        })
    return series


def _summary_from_validations(validations):
    counters = {
        "CUMPLE": 0,
        "CUMPLE_PARCIALMENTE": 0,
        "INCOMPLETO": 0,
        "NO_CUMPLE": 0,
        "NO_PRESENTADO": 0,
        "ERROR_PROCESAMIENTO": 0,
        "PENDIENTE_REVISION": 0,
        "NO_VERIFICABLE": 0,
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
def get_latest_validation_period(request, univ_id):
    """
    GET /api/evaluacion/universidades/<id>/ultimo-periodo/
    Devuelve el ultimo periodo con resultados de validacion para una universidad.
    """
    user, err = require_auth(request)
    if err:
        return err

    if request.method != "GET":
        return JsonResponse({"error": "Metodo no permitido"}, status=405)

    access_error = _university_access_error(user, univ_id)
    if access_error:
        return access_error

    results = (
        EvidenceValidationResult.objects
        .filter(evidence__university_id=univ_id, evidence__period_id__isnull=False)
        .select_related("evidence", "evidence__period")
        .order_by("-evidence__period__year", "-evidence__month", "-validated_at")
    )
    # Mismo período que comparan los dashboards, si la universidad tiene resultados en él.
    from .university_views import _dashboard_period_id
    dashboard_period = _dashboard_period_id()
    row = (results.filter(evidence__period_id=dashboard_period).first() if dashboard_period else None) or results.first()

    if not row or not row.evidence or not row.evidence.period:
        return JsonResponse({"period": None}, status=404)

    ev = row.evidence
    return JsonResponse({
        "period": {
            "id": ev.period_id,
            "year": ev.period.year,
            "month": ev.month,
            "period_name": ev.period.period_name,
        }
    })


def _official_lotaip_result(run):
    """Mapea una salida oficial persistida sin recalcular ningun componente."""
    run_summary = (run.result or {}).get("summary", {})
    if not all(field in run_summary for field in ("CTA", "ETA", "RP", "CI", "SITA")):
        return None
    provisional = (
        run.status == LotaipEvaluationRun.Status.COMPLETED_REVIEWS
        or run_summary.get("SITA_status") == "SITA_PROVISIONAL"
        or run_summary.get("CI_status") == "CI_PROVISIONAL"
        or bool(run_summary.get("requires_review"))
    )
    return {
        "cta": float(run_summary["CTA"]) if run_summary['CTA'] is not None else None,
        "eta": float(run_summary["ETA"]) if run_summary['ETA'] is not None else None,
        "rp": float(run_summary["RP"]) if run_summary['RP'] is not None else None,
        "ci": float(run_summary["CI"]) if run_summary['CI'] is not None else None,
        "sita": float(run_summary["SITA"]) if run_summary['SITA'] is not None else None,
        "is_provisional": provisional,
        "status": "PROVISIONAL" if provisional else "DEFINITIVO",
        "engine_version": run.engine_version,
        "run_id": run.id,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "formats": run_summary.get("formats_evaluated") or (run.result or {}).get("formats_found"),
        "sita_min": run_summary.get("SITA_min"),
        "sita_max": run_summary.get("SITA_max"),
    }


@csrf_exempt
def get_compliance_summary(request, univ_id):
    """
    GET /api/evaluacion/universidades/<id>/resumen/?periodo_id=
    Devuelve el resumen de cumplimiento por literal y el índice general.
    """
    user, err = require_auth(request)
    if err:
        return err

    if request.method != "GET":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    access_error = _university_access_error(user, univ_id)
    if access_error:
        return access_error

    period_id = request.GET.get("periodo_id")
    month = request.GET.get("month") or request.GET.get("mes")
    if not period_id:
        return JsonResponse({"error": "Se requiere periodo_id"}, status=400)

    # Obtener resultados de validación de todos los documentos aprobados
    validations = list(EvidenceValidationResult.objects.filter(
        evidence__university_id=univ_id,
        evidence__period_id=period_id,
    ).select_related(
        "evidence", "evidence__indicator", "evidence__university", "evidence__period"
    ).defer(
        # Columnas pesadas que el resumen no usa.
        "automatic_result", "manual_override", "evidence__extracted_text", "evidence__metadata_json",
    ).order_by("evidence__indicator__code"))
    if month:
        validations = [row for row in validations if str(row.evidence.month) == str(month)]
    # Oculta también resultados históricos que fueron creados antes de que los
    # diccionarios dejaran de considerarse documentos evaluables.
    validations = [row for row in validations if not is_lotaip_dictionary(row.evidence)]

    # Lista de resultados por literal
    results = [_validation_result_to_dict(vr, include_raw=False) for vr in validations]
    summary = _summary_from_validations(validations)
    sita = summarize_rubrics([row.lotaip_rubric for row in validations if row.lotaip_rubric])
    national_index = sita.get("puntaje")
    month_value = int(month) if month else None
    # Las rúbricas se leen una vez para el período y se reparten por mes.
    score_rows = lotaip_score_rows(univ_id, int(period_id), month_value)
    sync_national_results(univ_id, int(period_id), month_value, score_rows=score_rows)
    recalculate_integrated_index(univ_id, int(period_id), month_value)
    integrated = serialize_integrated_result(univ_id, int(period_id), month_value)
    summary["monthly_integrated"] = (
        [] if month_value else _monthly_integrated_series(univ_id, int(period_id), validations, score_rows)
    )
    summary.update({
        "total_index": national_index,
        "national_index": national_index,
        "integrated_index": integrated["index_percent"],
        "integrated": integrated,
        "evaluated_documents": len(results),
        "sita": sita,
        "engine_version": ENGINE_VERSION,
    })

    # Fuente de verdad del tablero: la ultima ejecucion finalizada que contiene
    # los cinco resultados oficiales del motor. Los resumentes legacy pueden
    # existir en ejecuciones anteriores, pero no son una calificacion SITA.
    lotaip = None
    valid_statuses = (
        LotaipEvaluationRun.Status.COMPLETED,
        LotaipEvaluationRun.Status.COMPLETED_REVIEWS,
    )
    runs = LotaipEvaluationRun.objects.filter(
        university_id=univ_id,
        period_id=period_id,
        status__in=valid_statuses,
    )
    if month:
        runs = runs.filter(month=month)
    for candidate in runs.order_by("-completed_at", "-id"):
        if (candidate.result or {}).get('summary', {}).get('scope') == 'international':
            continue
        lotaip = _official_lotaip_result(candidate)
        if lotaip:
            break
    if lotaip and sita.get("formatos") is not None:
        lotaip["formats"] = sita["formatos"]
    # Agregar notas ya persistidas no vuelve a evaluar documentos. Reflejar los
    # reintentos individuales sin depender de una ejecución masiva antigua.
    packages = {r['rubrica_lotaip']['unidad']: r['rubrica_lotaip'] for r in results if r.get('rubrica_lotaip')}
    if packages and any(r.get('version') == VERSION for r in packages.values()):
        from ..lotaip_engine.evaluator import summarize_evaluations
        current = summarize_evaluations(list(packages.values()))
        provisional = current['SITA_status'] == 'SITA_PROVISIONAL'
        lotaip = {key.lower(): current[key] for key in ('CTA', 'ETA', 'RP', 'CI', 'SITA')}
        lotaip.update(status='PROVISIONAL' if provisional else 'DEFINITIVO', is_provisional=provisional,
                      engine_version=VERSION, formats=len(packages), sita_min=current['SITA_min'], sita_max=current['SITA_max'])
    summary["lotaip"] = lotaip

    by_number = {}
    for item in results:
        import re
        match = re.search(r"(\d+)", item.get("literal", ""))
        if match: by_number.setdefault(int(match.group(1)), []).append(item)
    # "formats" lleva los ids de los resultados; antes repetía cada resultado
    # completo (con su rúbrica) y duplicaba el tamaño de la respuesta.
    numerals = [{**rule.as_dict(), "formats": [item["id"] for item in by_number.get(number, [])],
                 "status": "EVALUATED" if by_number.get(number) else "NOT_PRESENTED"}
                for number, rule in NUMERAL_CONFIG.items()]

    response = JsonResponse({
        "university_id": univ_id,
        "period_id": int(period_id),
        "month": int(month) if month else None,
        "summary": summary,
        "results": results,
        "numerals": numerals,
    })
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    return response


def _persist_package_rubric(ev, related, rubric):
    """Guarda una rúbrica revisada en todos los archivos del paquete."""
    score = summarize_rubrics([rubric])["puntaje_formato"]
    applicable = [c["calificacion"] for c in rubric["criterios"] if c["aplica"]]
    if any(value is None for value in applicable):
        status = "NO_VERIFICABLE"
    elif all(value in (1, "SI", "SIN EVALUACIÓN") for value in applicable):
        status = "CUMPLE"
    elif rubric["criterios"][0]["calificacion"] == 0:
        status = "NO_CUMPLE"
    else:
        status = "CUMPLE_PARCIALMENTE"
    EvidenceValidationResult.objects.filter(id__in=[row.id for row in related]).update(
        lotaip_rubric=rubric, total_score=score or 0, compliance_status=status,
        observations=[f"{c['criterio']}: {c['observacion']}" for c in rubric["criterios"]],
        validated_at=timezone.now(),
    )
    # El resumen cacheado anterior ya no representa estas calificaciones.
    UniversityEvaluationSummary.objects.filter(university_id=ev.university_id, period_id=ev.period_id).delete()


def _dataset_record(ev, row_number):
    """Fila del conjunto de datos para resultados guardados antes de conservarla."""
    from ..lotaip_engine.parsers import parse_csv
    from ..services.document_processor import detect_lotaip_document_type
    if not row_number:
        return {}
    siblings = Evidence.objects.filter(university_id=ev.university_id, period_id=ev.period_id,
                                       month=ev.month, indicator_id=ev.indicator_id)
    dataset = next((s for s in siblings if (detect_lotaip_document_type(s.file_path or "")
                    or detect_lotaip_document_type(s.title or "")) == "Conjunto de datos"), None)
    rows = parse_csv(dataset).get("rows", []) if dataset else []
    if row_number > len(rows):
        return {}
    return {header: value for header, value in zip(rows[0], rows[row_number - 1]) if str(value).strip()}


@csrf_exempt
def lotaip_pending_links(request, univ_id):
    """Cola de enlaces que el verificador no pudo comprobar (p. ej. Cloudflare)."""
    _, err = require_role(request, [1, 4])
    if err: return err
    if request.method != "GET": return JsonResponse({"error": "Método no permitido"}, status=405)
    try:
        period_id = int(request.GET["periodo_id"])
        month = int(request.GET["month"]) if request.GET.get("month") else None
    except (KeyError, ValueError):
        return JsonResponse({"error": "Indique periodo_id y, opcionalmente, month."}, status=400)
    results = (EvidenceValidationResult.objects
               .filter(evidence__university_id=univ_id, evidence__period_id=period_id,
                       evidence__indicator__code__startswith="LOTAIP")
               .select_related("evidence", "evidence__indicator").order_by("-validated_at"))
    if month:
        results = results.filter(evidence__month=month)
    seen, items = set(), []
    for vr in results:
        ev = vr.evidence
        unit = (vr.lotaip_rubric or {}).get("unidad") or f"{ev.month}:{ev.indicator_id}"
        if unit in seen or (vr.lotaip_rubric or {}).get("version") != VERSION:
            continue
        seen.add(unit)
        for index, item in pending_links(vr.lotaip_rubric):
            items.append({
                "evidence_id": ev.id, "index": index, "month": ev.month,
                "format": ev.indicator.code, "format_name": ev.indicator.name,
                "document": item.get("document"), "row": item.get("row"), "field": item.get("field"),
                "url": item.get("url") or item.get("value"), "http_status": item.get("http_status"),
                "bot_challenge": bool(item.get("bot_challenge")), "reason": item.get("reason"),
                "record": item.get("record") or (_dataset_record(ev, item.get("row"))
                                                 if item.get("document") == "Conjunto de datos" else {}),
            })
    items.sort(key=lambda x: (x["month"], [int(p) for p in x["format"].split("-")[1].split(".")], x["row"] or 0))
    return JsonResponse({"count": len(items), "items": items})


@csrf_exempt
def lotaip_decide_link(request, ev_id, index):
    """Aprueba o rechaza un enlace pendiente y recalcula el paquete."""
    user, err = require_role(request, [1, 4])
    if err: return err
    if request.method != "POST": return JsonResponse({"error": "Método no permitido"}, status=405)
    try:
        payload = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"error": "JSON inválido"}, status=400)
    with transaction.atomic():
        try:
            vr = EvidenceValidationResult.objects.select_related("evidence").get(evidence_id=ev_id)
        except EvidenceValidationResult.DoesNotExist:
            return JsonResponse({"error": "Primero ejecute la validación del documento."}, status=404)
        ev = vr.evidence
        related = list(EvidenceValidationResult.objects.select_for_update().filter(
            evidence__university_id=ev.university_id, evidence__period_id=ev.period_id,
            evidence__month=ev.month, evidence__indicator_id=ev.indicator_id,
        ).order_by("id"))
        current = next(row for row in related if row.id == vr.id)
        try:
            rubric = review_link(current.lotaip_rubric, index, payload.get("decision"),
                                 payload.get("observation"), user.id, timezone.now().isoformat())
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)
        _persist_package_rubric(ev, related, rubric)
    invalidate_dashboard_cache()
    criterion = next(c for c in rubric["criterios"] if c["id"] == "verificables")
    _log(user.id, "REVIEW_LOTAIP_LINK",
         f"Paquete {rubric.get('unidad')}; enlace {index}: {payload.get('decision')}; verificables={criterion['calificacion']}")
    return JsonResponse({"evidence_id": ev.id, "index": index, "verificables": criterion["calificacion"],
                         "pending": len(pending_links(rubric))})


@csrf_exempt
def review_lotaip_criteria(request, ev_id):
    """Revisión con fundamento por criterio para el paquete completo del formato."""
    user, err = require_role(request, [1, 4])  # administrador o auditor
    if err:
        return err
    if request.method != "POST":
        return JsonResponse({"error": "Método no permitido"}, status=405)
    try:
        payload = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse({"error": "JSON inválido"}, status=400)
    with transaction.atomic():
        try:
            vr = EvidenceValidationResult.objects.select_related("evidence").get(evidence_id=ev_id)
        except EvidenceValidationResult.DoesNotExist:
            return JsonResponse({"error": "Primero ejecute la validación del documento."}, status=404)
        if vr.lotaip_rubric.get("version") != VERSION:
            return JsonResponse({"error": "Revalide el documento con la rúbrica vigente del proyecto."}, status=400)
        ev = vr.evidence
        related = list(EvidenceValidationResult.objects.select_for_update().filter(
            evidence__university_id=ev.university_id, evidence__period_id=ev.period_id,
            evidence__month=ev.month, evidence__indicator_id=ev.indicator_id,
        ).order_by("id"))
        current = next(row for row in related if row.id == vr.id)
        try:
            rubric = review_rubric(current.lotaip_rubric, payload, user.id, timezone.now().isoformat())
        except ValueError as exc:
            return JsonResponse({"error": str(exc)}, status=400)
        _persist_package_rubric(ev, related, rubric)
    invalidate_dashboard_cache()
    _log(user.id, "REVIEW_LOTAIP_CRITERIA", f"Paquete {rubric['unidad']}; criterios: {json.dumps(payload, ensure_ascii=False)}")
    vr.refresh_from_db()
    return JsonResponse(_validation_result_to_dict(vr))


@csrf_exempt
def lotaip_run_detail(request, run_id):
    """Estado y resultado persistido de una ejecución versionada."""
    _, err = require_auth(request)
    if err: return err
    if request.method != "GET": return JsonResponse({"error": "Método no permitido"}, status=405)
    try:
        run = LotaipEvaluationRun.objects.get(id=run_id)
    except LotaipEvaluationRun.DoesNotExist:
        return JsonResponse({"error": "Ejecución no encontrada"}, status=404)
    return JsonResponse({"id": run.id, "university_id": run.university_id, "period_id": run.period_id,
                         "month": run.month, "status": run.status, "engine_version": run.engine_version,
                         "legal_source": run.legal_source, "result": run.result, "error": run.error,
                         "created_at": run.created_at.isoformat(),
                         "completed_at": run.completed_at.isoformat() if run.completed_at else None})

@csrf_exempt
def lotaip_link_review_queue(request, run_id):
    user, err = require_role(request, [1, 4])
    if err: return err
    try: run = LotaipEvaluationRun.objects.get(id=run_id)
    except LotaipEvaluationRun.DoesNotExist: return JsonResponse({"error":"Ejecución no encontrada"}, status=404)
    if request.method == "GET":
        qs=run.link_reviews.all()
        for key in ("numeral","status","reason_code"):
            if request.GET.get(key): qs=qs.filter(**{key:request.GET[key]})
        domain=request.GET.get("domain")
        if domain: qs=qs.filter(original_url__icontains=domain)
        return JsonResponse({"count":qs.count(),"items":[{"id":x.id,"university":run.university.name,"period":run.period.period_name,
            "numeral":x.numeral,"format":x.format_code,"row":x.row_number,"field":x.field_name,"original_url":x.original_url,
            "final_url":x.final_url,"http_status":x.http_status,"reason":x.reason_code,"expected_identifiers":x.expected_identifiers,
            "automatic_evidence":x.automatic_evidence,"automatic_decision":x.automatic_decision,"status":x.status} for x in qs]})
    return JsonResponse({"error":"Método no permitido"},status=405)

@csrf_exempt
def lotaip_link_review_decide(request, item_id):
    user, err = require_role(request, [1, 4])
    if err: return err
    if request.method != "POST": return JsonResponse({"error":"Método no permitido"},status=405)
    try: payload=json.loads(request.body); item=LotaipLinkReview.objects.get(id=item_id)
    except (ValueError,LotaipLinkReview.DoesNotExist): return JsonResponse({"error":"Solicitud inválida"},status=400)
    decision=payload.get("decision"); observation=str(payload.get("observation","")).strip()
    if decision not in {"APROBADO_MANUALMENTE","RECHAZADO_MANUALMENTE"} or not observation:
        return JsonResponse({"error":"Decisión y observación son obligatorias"},status=400)
    item.status=decision; item.reviewed_by_id=user.id; item.reviewed_at=timezone.now(); item.review_observation=observation
    item.review_evidence=payload.get("evidence",{}); item.save(update_fields=["status","reviewed_by","reviewed_at","review_observation","review_evidence"])
    return JsonResponse({"id":item.id,"status":item.status,"automatic_evidence":item.automatic_evidence})


@csrf_exempt
def lotaip_numerals(request):
    _, err = require_auth(request)
    if err: return err
    if request.method != "GET": return JsonResponse({"error": "Método no permitido"}, status=405)
    return JsonResponse({"engine_version": ENGINE_VERSION, "legal_source": LEGAL_SOURCE,
                         "numerals": [rule.as_dict() for rule in NUMERAL_CONFIG.values()]})


@csrf_exempt
def manual_review_item(request, ev_id):
    """Audita una excepción sin borrar el resultado automático original."""
    user, err = require_role(request, [1, 4])
    if err: return err
    if request.method != "POST": return JsonResponse({"error": "Método no permitido"}, status=405)
    try: payload = json.loads(request.body)
    except (ValueError, UnicodeDecodeError): return JsonResponse({"error": "JSON inválido"}, status=400)
    criterion, decision, observation = payload.get("criterion"), payload.get("decision"), payload.get("observation", "").strip()
    if criterion not in {"cta","eta","rp","verificables","vigencia","validez"}:
        return JsonResponse({"error": "Criterio inválido"}, status=400)
    if decision not in {"ACEPTAR", "RECHAZAR"} or not observation:
        return JsonResponse({"error": "Se requieren decisión y observación"}, status=400)
    with transaction.atomic():
        try: vr = EvidenceValidationResult.objects.select_for_update().get(evidence_id=ev_id)
        except EvidenceValidationResult.DoesNotExist: return JsonResponse({"error":"Resultado no encontrado"}, status=404)
        automatic = (vr.automatic_result or vr.lotaip_rubric).get("criteria", {}).get(criterion, {})
        review = LotaipManualReview.objects.create(validation_result=vr, criterion=criterion,
            automatic_result=automatic, decision=decision, observation=observation, reviewed_by_id=user.id)
        overrides = dict(vr.manual_override or {})
        overrides[criterion] = {"decision": decision, "observation": observation,
                                "reviewed_by": user.id, "reviewed_at": review.reviewed_at.isoformat()}
        vr.manual_override = overrides
        vr.requires_review = False
        vr.save(update_fields=["manual_override", "requires_review"])
    _log(user.id, "LOTAIP_MANUAL_REVIEW", f"evidence={ev_id}; criterion={criterion}; decision={decision}")
    return JsonResponse({"id": review.id, "automatic_result": automatic, "manual_override": overrides[criterion]})


# ══════════════════════════════════════════════════════════════════════
#  OBSERVACIONES DETALLADAS
# ══════════════════════════════════════════════════════════════════════

@csrf_exempt
def get_observations(request, univ_id):
    """
    GET /api/evaluacion/universidades/<id>/observaciones/?periodo_id=
    Devuelve las observaciones automáticas generadas por la validación.
    """
    user, err = require_auth(request)
    if err:
        return err

    if request.method != "GET":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    access_error = _university_access_error(user, univ_id)
    if access_error:
        return access_error

    period_id = request.GET.get("periodo_id")
    month = request.GET.get("month") or request.GET.get("mes")
    if not period_id:
        return JsonResponse({"error": "Se requiere periodo_id"}, status=400)

    validations = list(EvidenceValidationResult.objects.filter(
        evidence__university_id=univ_id,
        evidence__period_id=period_id,
    ).select_related(
        "evidence", "evidence__indicator"
    ).order_by("evidence__indicator__code"))
    if month:
        validations = [row for row in validations if str(row.evidence.month) == str(month)]
    validations = [row for row in validations if not is_lotaip_dictionary(row.evidence)]

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
