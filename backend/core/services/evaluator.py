"""
evaluator.py
Servicio orquestador de validación automática de documentos LOTAIP.

Funciones principales:
- evaluar_documento(evidence_id): Valida un documento individual
- evaluar_universidad(university_id, period_id): Valida todos los docs aprobados de una universidad
"""

import logging
from decimal import Decimal

from django.conf import settings
from django.utils import timezone
from django.db import close_old_connections, transaction

from ..models import (
    Evidence, IndicatorTemplate, Indicator,
    EvidenceValidationResult, UniversityEvaluationSummary,
    EvaluationPeriod,
)
from ..cache_utils import invalidate_dashboard_cache
from .document_processor import process_document
from .document_processor import detect_lotaip_document_type
from .comparison_engine import evaluate_structure
from .integrated_transparency import (
    evaluate_integrated_transparency,
    refresh_lotaip_derived_indicators,
    serialize_integrated_result,
    sync_national_results,
)
from .international_evaluator import evaluate_international_standards  # compatibilidad; no se invoca en el flujo vigente
from .lotaip_rubric import summarize_rubrics
from ..lotaip_engine import evaluate_format
from ..lotaip_engine.rules import CONTENT_POLICY_VERSION, ENGINE_VERSION

logger = logging.getLogger(__name__)


class EvaluationCancelled(Exception):
    """La ejecución masiva fue cancelada por el usuario."""


def _raise_if_cancelled(should_cancel):
    if should_cancel and should_cancel():
        raise EvaluationCancelled('Evaluación detenida por solicitud del usuario.')


def is_lotaip_dictionary(evidence):
    """El diccionario describe variables del paquete; no es una unidad evaluable."""
    return any(
        detect_lotaip_document_type(value) == "Diccionario"
        for value in (getattr(evidence, "title", ""), getattr(evidence, "file_path", ""))
    )


# ──────────────────────────────────────────────────────────────────────
# CLASIFICACIÓN DE CUMPLIMIENTO
# ──────────────────────────────────────────────────────────────────────

def classify_compliance(total_score):
    """Clasifica el puntaje total en un estado de cumplimiento."""
    if total_score >= 90:
        return EvidenceValidationResult.ComplianceStatus.CUMPLE
    elif total_score >= 70:
        return EvidenceValidationResult.ComplianceStatus.CUMPLE_PARCIALMENTE
    elif total_score >= 40:
        return EvidenceValidationResult.ComplianceStatus.INCOMPLETO
    elif total_score > 0:
        return EvidenceValidationResult.ComplianceStatus.NO_CUMPLE
    else:
        return EvidenceValidationResult.ComplianceStatus.NO_PRESENTADO


# ──────────────────────────────────────────────────────────────────────
# VALIDAR DOCUMENTO INDIVIDUAL
# ──────────────────────────────────────────────────────────────────────

def evaluar_documento(evidence_id, network_cache=None, retry_pending=False, reevaluate=False,
                      should_cancel=None, progress_callback=None, ai_budget=None):
    """
    Valida un documento de evidencia individual.

    Flujo:
    1. Buscar Evidence y su IndicatorTemplate asociada
    2. Procesar el documento (extraer metadatos, texto, columnas)
    3. Preparar los seis criterios oficiales y los diagnósticos del paquete
    4. Calcular puntaje total y clasificar
    5. Guardar EvidenceValidationResult
    6. Retornar dict con resultado

    Args:
        evidence_id: ID del documento de evidencia

    Returns:
        dict con el resultado de la validación
    """
    def report(phase, detail, stage_pct):
        if progress_callback:
            progress_callback({"phase": phase, "detail": detail, "stage_pct": stage_pct})

    report("Preparando evaluación", "Cargando la evidencia y su configuración normativa.", 5)
    try:
        evidence = Evidence.objects.select_related(
            "university", "indicator", "period"
        ).get(id=evidence_id)
    except Evidence.DoesNotExist:
        return {
            "error": True,
            "message": f"Evidencia con ID {evidence_id} no encontrada.",
        }

    # Verificar que esté aprobada
    if evidence.validation_status not in ("aprobado", "pendiente"):
        return {
            "error": True,
            "message": f"Solo se pueden validar documentos aprobados o pendientes. Estado actual: {evidence.validation_status}",
        }

    if is_lotaip_dictionary(evidence):
        return {
            "error": False,
            "excluded_from_evaluation": True,
            "evidence_id": evidence.id,
            "documento": evidence.title,
            "message": ("El diccionario de datos no se evalúa como documento independiente; "
                        "se usa únicamente para interpretar las variables y sus notas aclaratorias."),
        }

    # Buscar plantilla base del indicador
    template = None
    try:
        if evidence.indicator:
            template = IndicatorTemplate.objects.get(indicator=evidence.indicator)
    except IndicatorTemplate.DoesNotExist:
        pass  # Sin plantilla, evaluación parcial

    # Consultar/abrir no recalcula resultados persistidos. El POST con
    # retry_pending permite completar sólo paquetes que todavía tienen pendientes.
    saved = EvidenceValidationResult.objects.filter(
        evidence__university_id=evidence.university_id, evidence__period_id=evidence.period_id,
        evidence__indicator_id=evidence.indicator_id, evidence__month=evidence.month,
    ).select_related('evidence', 'evidence__university', 'evidence__indicator', 'evidence__period').order_by('-validated_at').first()
    saved_uses_current_content_policy = bool(
        saved and saved.lotaip_rubric
        and saved.lotaip_rubric.get("content_policy_version") == CONTENT_POLICY_VERSION
    )
    if saved_uses_current_content_policy and not reevaluate:
        pending = any(c.get('aplica') and c.get('calificacion') is None for c in saved.lotaip_rubric.get('criterios', []))
        if not (retry_pending and pending):
            from core.validation_views import _validation_result_to_dict
            cached = _validation_result_to_dict(saved)
            cached.update(evidence_id=evidence.id, documento=evidence.title, resultado_guardado=True)
            if saved.evidence_id != evidence.id and not EvidenceValidationResult.objects.filter(evidence_id=evidence.id).exists():
                _save_validation_result(evidence, cached, sync_package=False)
            report("Resultado disponible", "Se reutilizó una evaluación vigente guardada.", 100)
            return cached

    try:
        _raise_if_cancelled(should_cancel)
        # 1. Procesar documento
        report("Procesando documento", "Leyendo el archivo y extrayendo su estructura local.", 12)
        processed_data = process_document(evidence)
        _raise_if_cancelled(should_cancel)

        # El paquete se evalúa con la rúbrica oficial; las comprobaciones locales
        # son sugerencias hasta verificar publicación y condiciones en el PNT.
        siblings = list(Evidence.objects.filter(
            university_id=evidence.university_id, period_id=evidence.period_id,
            indicator_id=evidence.indicator_id, month=evidence.month,
            validation_status__in=["aprobado", "pendiente"],
        ).order_by("id"))
        report("Preparando paquete", f"Se encontraron {len(siblings)} archivo(s) asociados al literal.", 18)
        from .lotaip_automatic import fetch_public
        cache = network_cache if network_cache is not None else {}
        def fetch(url):
            _raise_if_cancelled(should_cancel)
            if url not in cache:
                if len(cache) >= 32:
                    cache.pop(next(iter(cache)))
                cache[url] = fetch_public(url)
            _raise_if_cancelled(should_cancel)
            return cache[url]
        _raise_if_cancelled(should_cancel)
        rubric = evaluate_format(
            evidence, siblings, template=template, check_online=True, fetch=fetch,
            previous=(saved.lotaip_rubric
                      if saved_uses_current_content_policy and retry_pending and not reevaluate
                      else _manual_link_decisions(saved.lotaip_rubric if saved else None)),
            progress_callback=progress_callback,
            ai_budget=(ai_budget if ai_budget is not None else {
                "limit": getattr(settings, "FREELLMAPI_MAX_TOKENS_PER_RUN", 200000),
                "used": 0,
            }),
        )
        _raise_if_cancelled(should_cancel)
        score = summarize_rubrics([rubric])["puntaje_formato"]
        result_data = _build_result(
            evidence, template, total_score=score,
            status=classify_compliance(score) if score is not None else "PENDIENTE_REVISION",
            observations=[f"{c['criterio']}: {c['observacion']}" for c in rubric["criterios"]],
        )
        result_data["rubrica_lotaip"] = rubric
        result_data["sita"] = summarize_rubrics([rubric])
        # Diagnóstico técnico conservado para la revisión del formato nacional.
        result_data["puntaje_estructura"] = evaluate_structure(processed_data, template)[0]

        # 6. Guardar en BD
        _raise_if_cancelled(should_cancel)
        report("Guardando resultados", "Persistiendo la rúbrica y sincronizando los archivos del paquete.", 95)
        _save_validation_result(evidence, result_data)
        report("Literal completado", "La evaluación del literal terminó correctamente.", 100)

        return result_data

    except EvaluationCancelled:
        raise
    except Exception as e:
        logger.error(f"Error validando documento {evidence_id}: {e}", exc_info=True)
        error_result = _build_result(
            evidence, template,
            total_score=None,
            status=EvidenceValidationResult.ComplianceStatus.ERROR_PROCESAMIENTO,
            observations=[f"❌ Error durante el procesamiento: {str(e)}"],
        )
        _save_validation_result(evidence, error_result)
        return error_result


def _manual_link_decisions(rubric):
    """Decisiones manuales de enlaces que sobreviven a una reevaluación completa.

    Sin versión, el motor no reutiliza criterios; sólo el verificador de enlaces
    toma estas filas, y únicamente cuando el registro y la URL no cambiaron
    (misma huella ``record_hash``).
    """
    criterion = next((c for c in (rubric or {}).get("criterios", []) if c.get("id") == "verificables"), None)
    manual = [item for item in (criterion or {}).get("evidencias", []) if item.get("manual_review")]
    return {"criterios": [{"id": "verificables", "evidencias": manual}]} if manual else None


def _build_result(evidence, template, score_existence=0, score_format=0,
                  score_update=0, score_structure=0, score_content=0,
                  score_accessibility=0, total_score=0, status="NO_PRESENTADO",
                  observations=None):
    """Construye el dict de resultado de validación."""
    return {
        "error": False,
        "evidence_id": evidence.id,
        "universidad": evidence.university.acronym if evidence.university else "N/A",
        "universidad_id": evidence.university_id,
        "literal": evidence.indicator.code if evidence.indicator else "N/A",
        "literal_name": evidence.indicator.name if evidence.indicator else "N/A",
        "periodo": f"{_month_name(evidence.month)} {evidence.period.year}" if evidence.period else "N/A",
        "periodo_id": evidence.period_id,
        "documento": evidence.title,
        "file_type": evidence.file_type or "N/A",
        "template_name": template.file_name if template else None,
        "puntaje_existencia": score_existence,
        "puntaje_formato": score_format,
        "puntaje_actualizacion": score_update,
        "puntaje_estructura": score_structure,
        "puntaje_contenido": score_content,
        "puntaje_accesibilidad": score_accessibility,
        "puntaje_total": total_score,
        "estado_cumplimiento": status,
        "observaciones": observations or [],
    }


def _month_name(month_num):
    """Convierte número de mes a nombre en español."""
    months = {
        1: "enero", 2: "febrero", 3: "marzo", 4: "abril",
        5: "mayo", 6: "junio", 7: "julio", 8: "agosto",
        9: "septiembre", 10: "octubre", 11: "noviembre", 12: "diciembre",
    }
    return months.get(month_num, "")


@transaction.atomic
def _save_validation_result(evidence, result_data, sync_package=True):
    """Crea o actualiza el EvidenceValidationResult en la BD."""
    try:
        obj, created = EvidenceValidationResult.objects.update_or_create(
            evidence=evidence,
            defaults={
                "score_existence":     Decimal(str(result_data.get("puntaje_existencia", 0))),
                "score_format":        Decimal(str(result_data.get("puntaje_formato", 0))),
                "score_update":        Decimal(str(result_data.get("puntaje_actualizacion", 0))),
                "score_structure":     Decimal(str(result_data.get("puntaje_estructura", 0))),
                "score_content":       Decimal(str(result_data.get("puntaje_contenido", 0))),
                "score_accessibility": Decimal(str(result_data.get("puntaje_accesibilidad", 0))),
                "total_score":         Decimal(str(result_data.get("puntaje_total") or 0)),
                "compliance_status":   result_data.get("estado_cumplimiento", "NO_PRESENTADO"),
                "observations":        result_data.get("observaciones", []),
                "lotaip_rubric": result_data.get("rubrica_lotaip", {}),
                "engine_version": result_data.get("rubrica_lotaip", {}).get("engine_version", ENGINE_VERSION),
                "automatic_result": result_data.get("rubrica_lotaip", {}),
                "manual_override": {},
                "requires_review": bool(result_data.get("rubrica_lotaip", {}).get("requiere_revision")),
            },
        )
        logger.info(f"Resultado de validación {'creado' if created else 'actualizado'} para evidencia {evidence.id}")
        if result_data.get("rubrica_lotaip") and sync_package:
            # Todos los archivos comparten el resultado del paquete, incluso
            # cuando se inició la evaluación desde uno solo de ellos.
            siblings = list(Evidence.objects.filter(
                university_id=evidence.university_id, period_id=evidence.period_id,
                month=evidence.month, indicator_id=evidence.indicator_id,
            ).exclude(id=evidence.id))
            siblings = [sibling for sibling in siblings if not is_lotaip_dictionary(sibling)]
            for sibling in siblings:
                EvidenceValidationResult.objects.get_or_create(
                    evidence=sibling,
                    defaults={"total_score": result_data.get("puntaje_total") or 0,
                              "compliance_status": result_data["estado_cumplimiento"]},
                )
            EvidenceValidationResult.objects.filter(
                evidence_id__in=[sibling.id for sibling in siblings],
            ).update(
                lotaip_rubric=result_data["rubrica_lotaip"], total_score=result_data.get("puntaje_total") or 0,
                compliance_status=result_data["estado_cumplimiento"],
                observations=result_data["observaciones"], validated_at=timezone.now(),
                engine_version=result_data["rubrica_lotaip"].get("engine_version", ENGINE_VERSION),
                automatic_result=result_data["rubrica_lotaip"], manual_override={},
                requires_review=bool(result_data["rubrica_lotaip"].get("requiere_revision")),
            )
        UniversityEvaluationSummary.objects.filter(
            university_id=evidence.university_id, period_id=evidence.period_id,
        ).delete()
        invalidate_dashboard_cache()
    except Exception as e:
        logger.error(f"Error guardando resultado de validación: {e}")
        raise


# ──────────────────────────────────────────────────────────────────────
# VALIDAR TODOS LOS DOCUMENTOS DE UNA UNIVERSIDAD
# ──────────────────────────────────────────────────────────────────────

def evaluar_universidad(university_id, period_id, month=None, reevaluate=False,
                        should_cancel=None, scope='all'):
    """
    Valida todos los documentos aprobados de una universidad en un período.
    Genera el resumen de evaluación (UniversityEvaluationSummary).

    Es un generador que yield resultados parciales para streaming.

    Args:
        university_id: ID de la universidad
        period_id: ID del período de evaluación

    Yields:
        dict con resultado de cada documento validado y resumen final
    """
    import json
    import queue
    from concurrent.futures import ThreadPoolExecutor

    if scope not in {'all', 'lotaip', 'international'}:
        raise ValueError('El alcance debe ser all, lotaip o international.')

    filters = {
        "university_id": university_id,
        "period_id": period_id,
        "validation_status__in": ["aprobado", "pendiente"],
    }
    if month:
        filters["month"] = month

    evidences = list(Evidence.objects.filter(**filters).select_related(
        "university", "indicator", "period"
    ).order_by("indicator__code"))
    evidences = [evidence for evidence in evidences if not is_lotaip_dictionary(evidence)]
    # La rúbrica se calcula por paquete (literal/mes), no por cada copia de
    # conjunto de datos y metadatos. _save_validation_result sincroniza el
    # resultado con los documentos hermanos sin repetir red, OCR ni IA.
    packages = {}
    for evidence in evidences:
        key = (evidence.university_id, evidence.period_id, evidence.indicator_id, evidence.month)
        packages.setdefault(key, evidence)
    evidences = list(packages.values())

    if scope == 'international':
        evidences = []

    total = len(evidences)

    if total == 0 and scope != 'international':
        yield json.dumps({
            "status": "done",
            "message": "No hay documentos aprobados o pendientes para validar en este período.",
            "results": [],
            "summary": None,
        }) + "\n"
        return

    yield json.dumps({
        "status": "progress",
        "msg": (f"Iniciando validación de {total} documentos LOTAIP..."
                if scope != 'international' else "Iniciando evaluación de indicadores internacionales..."),
        "phase": ("Preparando evaluación LOTAIP"
                  if scope != 'international' else "Preparando búsqueda web"),
        "detail": ("Organizando los documentos nacionales seleccionados."
                   if scope != 'international' else "Agrupando los 34 aportes web por dimensión."),
        "pct": 0,
    }) + "\n"

    results = []
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

    network_cache = {}
    ai_budget = {
        "limit": max(0, getattr(settings, "FREELLMAPI_MAX_TOKENS_PER_RUN", 200000)),
        "used": 0,
    }
    for idx, ev in enumerate(evidences):
        if should_cancel and should_cancel():
            yield json.dumps({"status": "cancelled", "msg": "Evaluación detenida por el usuario."}) + "\n"
            return
        start_pct = 5 + (idx / total) * 90
        end_pct = 5 + ((idx + 1) / total) * 90
        literal = ev.indicator.code if ev.indicator else 'N/A'

        yield json.dumps({
            "status": "progress",
            "msg": f"Validando {idx+1}/{total}: {literal} — {ev.title[:50]}",
            "phase": "Preparando literal",
            "detail": "Organizando los archivos y criterios que se comprobarán.",
            "document_index": idx + 1,
            "document_total": total,
            "pct": round(start_pct),
        }) + "\n"

        progress_events = queue.Queue()
        def on_progress(event):
            progress_events.put(event)

        def evaluate_current_document():
            close_old_connections()
            try:
                return evaluar_documento(
                    ev.id,
                    network_cache=network_cache,
                    reevaluate=reevaluate,
                    should_cancel=should_cancel,
                    progress_callback=on_progress,
                    ai_budget=ai_budget,
                )
            finally:
                close_old_connections()

        try:
            with ThreadPoolExecutor(max_workers=1, thread_name_prefix="lotaip-document") as executor:
                future = executor.submit(evaluate_current_document)
                while not future.done():
                    try:
                        event = progress_events.get(timeout=0.5)
                    except queue.Empty:
                        continue
                    stage_pct = max(0, min(100, float(event.get("stage_pct", 0))))
                    overall_pct = start_pct + (end_pct - start_pct) * stage_pct / 100
                    yield json.dumps({
                        "status": "progress",
                        "msg": f"Validando {idx+1}/{total}: {literal} — {ev.title[:50]}",
                        "phase": event.get("phase", "Procesando literal"),
                        "detail": event.get("detail", "La evaluación continúa en segundo plano."),
                        "document_index": idx + 1,
                        "document_total": total,
                        "pct": round(overall_pct),
                    }) + "\n"
                while not progress_events.empty():
                    event = progress_events.get_nowait()
                    stage_pct = max(0, min(100, float(event.get("stage_pct", 0))))
                    overall_pct = start_pct + (end_pct - start_pct) * stage_pct / 100
                    yield json.dumps({
                        "status": "progress",
                        "msg": f"Validando {idx+1}/{total}: {literal} — {ev.title[:50]}",
                        "phase": event.get("phase", "Procesando literal"),
                        "detail": event.get("detail", "La evaluación continúa en segundo plano."),
                        "document_index": idx + 1,
                        "document_total": total,
                        "pct": round(overall_pct),
                    }) + "\n"
                result = future.result()
        except EvaluationCancelled:
            yield json.dumps({"status": "cancelled", "msg": "Evaluación detenida por el usuario."}) + "\n"
            return
        results.append(result)

        status = result.get("estado_cumplimiento", "NO_PRESENTADO")
        if status in counters:
            counters[status] += 1

    if should_cancel and should_cancel():
        yield json.dumps({"status": "cancelled", "msg": "Evaluación detenida por el usuario."}) + "\n"
        return

    integrated_result = None
    if scope in {'all', 'international'}:
        yield json.dumps({
            "status": "progress",
            "msg": "Evaluando los complementos internacionales...",
            "phase": "Preparando búsqueda web",
            "detail": ("La evaluación LOTAIP terminó; se comprobarán los 34 aportes internacionales."
                       if scope == 'all' else "Se comprobarán los 22 complementos mixtos y 12 indicadores internacionales."),
            "document_index": total,
            "document_total": total,
            "pct": 95 if scope == 'all' else 1,
        }) + "\n"

        international_events = queue.Queue()
        def on_international_progress(event):
            international_events.put(event)

        with ThreadPoolExecutor(max_workers=1, thread_name_prefix="integrated-transparency") as executor:
            future = executor.submit(
                evaluate_integrated_transparency,
                university_id, period_id, month,
                should_cancel, on_international_progress, reevaluate,
            )
            while not future.done():
                try:
                    event = international_events.get(timeout=.5)
                except queue.Empty:
                    continue
                stage_pct = float(event.get("stage_pct", 0))
                yield json.dumps({
                    "status": "progress",
                    "msg": event.get("phase", "Evaluando indicadores internacionales"),
                    "phase": event.get("phase", "Evaluando indicadores internacionales"),
                    "detail": event.get("detail", "Buscando y verificando evidencia pública."),
                    "document_index": total,
                    "document_total": total,
                    "pct": (95 + round(stage_pct * .04)) if scope == 'all' else round(stage_pct * .98),
                }) + "\n"
            integrated_result = future.result()
    else:
        sync_national_results(university_id, period_id, month)
        # La interoperabilidad (IND-57) se mide sobre los paquetes LOTAIP recién evaluados.
        integrated_result = refresh_lotaip_derived_indicators(university_id, period_id, month)

    if integrated_result is None:
        yield json.dumps({"status": "cancelled", "msg": "Evaluación detenida por el usuario."}) + "\n"
        return

    yield json.dumps({
        "status": "progress",
        "msg": ("Consolidando la evaluación nacional..." if scope == 'lotaip'
                else "Consolidando la evaluación institucional..."),
        "phase": ("Calculando la calificación LOTAIP" if scope == 'lotaip' else "Calculando el ITI"),
        "detail": ("Actualizando los 24 indicadores nacionales sin ejecutar búsquedas web."
                   if scope == 'lotaip' else "Aplicando los pesos configurados a los 58 indicadores y ocho dimensiones."),
        "document_index": total,
        "document_total": total,
        "pct": 99,
    }) + "\n"

    # Calcular el componente nacional y consolidarlo con el modelo integrado.
    from core.lotaip_engine.evaluator import summarize_evaluations
    persisted_qs = EvidenceValidationResult.objects.select_related('evidence').filter(
        evidence__university_id=university_id,
        evidence__period_id=period_id,
    ).exclude(lotaip_rubric={})
    if month:
        persisted_qs = persisted_qs.filter(evidence__month=month)
    packages = {}
    for validation in persisted_qs:
        if is_lotaip_dictionary(validation.evidence):
            continue
        rubric = validation.lotaip_rubric or {}
        unit = rubric.get('unidad')
        if unit:
            packages[unit] = rubric
    persisted_summary = summarize_evaluations(list(packages.values()))
    national_index = persisted_summary.get("SITA")
    integrated = serialize_integrated_result(university_id, period_id, month)

    # Generar observaciones generales
    general_obs = []
    if counters["CUMPLE"] > 0:
        general_obs.append(f"✅ {counters['CUMPLE']} literales cumplen completamente.")
    if counters["CUMPLE_PARCIALMENTE"] > 0:
        general_obs.append(f"⚠️ {counters['CUMPLE_PARCIALMENTE']} literales cumplen parcialmente.")
    if counters["INCOMPLETO"] > 0:
        general_obs.append(f"📋 {counters['INCOMPLETO']} literales están incompletos.")
    if counters["NO_CUMPLE"] > 0:
        general_obs.append(f"❌ {counters['NO_CUMPLE']} literales no cumplen.")
    if counters["NO_PRESENTADO"] > 0:
        general_obs.append(f"🔲 {counters['NO_PRESENTADO']} literales no fueron presentados.")

    general_obs.append("Evaluación LOTAIP automática: cada criterio aplicable termina con una calificación; si no se acredita el cumplimiento después de los reintentos, se asigna NO/0.")

    # Los índices se obtienen de las rúbricas persistidas en la consulta de
    # resumen. No almacenar cero para una evaluación todavía pendiente.
    invalidate_dashboard_cache()

    yield json.dumps({
        "status": "done",
        "msg": ("Evaluación LOTAIP completada."
                if scope == 'lotaip' else "Evaluación internacional completada."
                if scope == 'international' else "Diagnósticos completados."),
        "pct": 100,
        "summary": {
            **persisted_summary,
            "ai_tokens_used": ai_budget["used"],
            "ai_token_limit": ai_budget["limit"],
            "total_index": national_index,
            "national_index": national_index,
            "integrated_index": integrated["index_percent"],
            "integrated": integrated,
            "total_indicators": (integrated.get('component_scores', {}).get('international', {}).get('total', 34)
                                 if scope == 'international' else total),
            "counters": counters,
            "sita": persisted_summary,
            "general_observations": general_obs,
            "scope": scope,
        },
    }) + "\n"
