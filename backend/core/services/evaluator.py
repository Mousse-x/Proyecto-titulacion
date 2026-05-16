"""
evaluator.py
Servicio orquestador de validación automática de documentos LOTAIP.

Funciones principales:
- evaluar_documento(evidence_id): Valida un documento individual
- evaluar_universidad(university_id, period_id): Valida todos los docs aprobados de una universidad
"""

import logging
from decimal import Decimal

from django.utils import timezone

from ..models import (
    Evidence, IndicatorTemplate, Indicator,
    EvidenceValidationResult, UniversityEvaluationSummary,
    EvaluationPeriod,
)
from .document_processor import process_document
from .comparison_engine import (
    evaluate_existence, evaluate_format, evaluate_period,
    evaluate_structure, evaluate_content, evaluate_accessibility,
)

logger = logging.getLogger(__name__)


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

def evaluar_documento(evidence_id):
    """
    Valida un documento de evidencia individual.

    Flujo:
    1. Buscar Evidence y su IndicatorTemplate asociada
    2. Procesar el documento (extraer metadatos, texto, columnas)
    3. Ejecutar los 6 evaluadores
    4. Calcular puntaje total y clasificar
    5. Guardar EvidenceValidationResult
    6. Retornar dict con resultado

    Args:
        evidence_id: ID del documento de evidencia

    Returns:
        dict con el resultado de la validación
    """
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
    if evidence.validation_status != "aprobado":
        return {
            "error": True,
            "message": f"Solo se pueden validar documentos aprobados. Estado actual: {evidence.validation_status}",
        }

    # Buscar plantilla base del indicador
    template = None
    try:
        if evidence.indicator:
            template = IndicatorTemplate.objects.get(indicator=evidence.indicator)
    except IndicatorTemplate.DoesNotExist:
        pass  # Sin plantilla, evaluación parcial

    try:
        # 1. Procesar documento
        processed_data = process_document(evidence)

        # 2. Ejecutar evaluadores
        all_observations = []

        score_existence, obs = evaluate_existence(processed_data)
        all_observations.extend(obs)

        # Si no existe, puntaje directo = 0
        if score_existence == 0:
            result_data = _build_result(
                evidence, template,
                score_existence=0, score_format=0, score_update=0,
                score_structure=0, score_content=0, score_accessibility=0,
                total_score=0,
                status=EvidenceValidationResult.ComplianceStatus.NO_PRESENTADO,
                observations=all_observations,
            )
            _save_validation_result(evidence, result_data)
            return result_data

        score_format, obs = evaluate_format(processed_data)
        all_observations.extend(obs)

        score_update, obs = evaluate_period(evidence, processed_data)
        all_observations.extend(obs)

        score_structure, obs = evaluate_structure(processed_data, template)
        all_observations.extend(obs)

        score_content, obs = evaluate_content(processed_data, template)
        all_observations.extend(obs)

        score_accessibility, obs = evaluate_accessibility(processed_data)
        all_observations.extend(obs)

        # 3. Calcular total
        total_score = (
            score_existence + score_format + score_update +
            score_structure + score_content + score_accessibility
        )

        # 4. Clasificar
        status = classify_compliance(total_score)

        # 5. Construir resultado
        result_data = _build_result(
            evidence, template,
            score_existence=score_existence,
            score_format=score_format,
            score_update=score_update,
            score_structure=score_structure,
            score_content=score_content,
            score_accessibility=score_accessibility,
            total_score=total_score,
            status=status,
            observations=all_observations,
        )

        # 6. Guardar en BD
        _save_validation_result(evidence, result_data)

        return result_data

    except Exception as e:
        logger.error(f"Error validando documento {evidence_id}: {e}", exc_info=True)
        error_result = _build_result(
            evidence, template,
            total_score=0,
            status=EvidenceValidationResult.ComplianceStatus.ERROR_PROCESAMIENTO,
            observations=[f"❌ Error durante el procesamiento: {str(e)}"],
        )
        _save_validation_result(evidence, error_result)
        return error_result


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


def _save_validation_result(evidence, result_data):
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
                "total_score":         Decimal(str(result_data.get("puntaje_total", 0))),
                "compliance_status":   result_data.get("estado_cumplimiento", "NO_PRESENTADO"),
                "observations":        result_data.get("observaciones", []),
            },
        )
        logger.info(f"Resultado de validación {'creado' if created else 'actualizado'} para evidencia {evidence.id}")
    except Exception as e:
        logger.error(f"Error guardando resultado de validación: {e}")


# ──────────────────────────────────────────────────────────────────────
# VALIDAR TODOS LOS DOCUMENTOS DE UNA UNIVERSIDAD
# ──────────────────────────────────────────────────────────────────────

def evaluar_universidad(university_id, period_id):
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

    evidences = Evidence.objects.filter(
        university_id=university_id,
        period_id=period_id,
        validation_status="aprobado",
    ).select_related("university", "indicator", "period").order_by("indicator__code")

    total = evidences.count()

    if total == 0:
        yield json.dumps({
            "status": "done",
            "message": "No hay documentos aprobados para validar en este período.",
            "results": [],
            "summary": None,
        }) + "\n"
        return

    yield json.dumps({
        "status": "progress",
        "msg": f"Iniciando validación de {total} documentos aprobados...",
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
    }

    for idx, ev in enumerate(evidences):
        pct = int(((idx + 1) / total) * 90) + 5

        yield json.dumps({
            "status": "progress",
            "msg": f"Validando {idx+1}/{total}: {ev.indicator.code if ev.indicator else 'N/A'} — {ev.title[:50]}",
            "pct": pct,
        }) + "\n"

        result = evaluar_documento(ev.id)
        results.append(result)

        status = result.get("estado_cumplimiento", "NO_PRESENTADO")
        if status in counters:
            counters[status] += 1

    # Calcular índice general
    total_score_sum = sum(r.get("puntaje_total", 0) for r in results)
    total_index = round(total_score_sum / len(results), 2) if results else 0

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

    # Guardar resumen
    try:
        period = EvaluationPeriod.objects.get(id=period_id)
        summary, _ = UniversityEvaluationSummary.objects.update_or_create(
            university_id=university_id,
            period=period,
            defaults={
                "total_index": Decimal(str(total_index)),
                "total_indicators": total,
                "indicators_compliant": counters["CUMPLE"],
                "indicators_partial": counters["CUMPLE_PARCIALMENTE"],
                "indicators_incomplete": counters["INCOMPLETO"],
                "indicators_non_compliant": counters["NO_CUMPLE"],
                "indicators_not_presented": counters["NO_PRESENTADO"],
                "general_observations": general_obs,
            },
        )
    except Exception as e:
        logger.error(f"Error guardando resumen de evaluación: {e}")

    yield json.dumps({
        "status": "done",
        "msg": f"Validación completada. Índice general: {total_index}%",
        "pct": 100,
        "summary": {
            "total_index": total_index,
            "total_indicators": total,
            "counters": counters,
            "general_observations": general_obs,
        },
    }) + "\n"
