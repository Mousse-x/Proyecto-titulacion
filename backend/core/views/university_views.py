"""Controladores de universidades: CRUD, logos e identidad DPE."""
from django.http import JsonResponse
import json
import os
import re
import uuid
from pathlib import Path
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.db.models import Case, When
from django.core.files.storage import default_storage
from ..models import AppUser, University, Evidence, Evaluation, CategoryResult, FinalResult, Feedback, EvidenceValidationResult, UniversityEvaluationSummary, IntegratedTransparencyResult, EvaluationPeriod
from ..middleware import require_auth, require_role
from .common import _get_bool, _get_value, _log_error, _parse_body


DPE_ENTITY_URL_RE = re.compile(r"transparencia\.dpe\.gob\.ec/entidades/(\d+)", re.IGNORECASE)


ALLOWED_LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


MAX_LOGO_SIZE = 2 * 1024 * 1024


def _normalize_dpe_transparency_url(value):
    """Acepta un ID de entidad DPE o una URL completa y devuelve la URL canonica."""
    raw = str(value or "").strip()
    if not raw:
        return ""

    if raw.isdigit():
        return f"https://transparencia.dpe.gob.ec/entidades/{raw}"

    match = DPE_ENTITY_URL_RE.search(raw)
    if match:
        return f"https://transparencia.dpe.gob.ec/entidades/{match.group(1)}"

    return raw


def _extract_dpe_entity_id(transparency_url):
    match = DPE_ENTITY_URL_RE.search(transparency_url or "")
    return match.group(1) if match else ""


def _save_university_logo(upload, acronym):
    if not upload:
        return None

    ext = Path(upload.name or "").suffix.lower()
    if ext not in ALLOWED_LOGO_EXTENSIONS:
        raise ValueError("El logo debe ser una imagen PNG, JPG, JPEG o WEBP")
    if upload.size and upload.size > MAX_LOGO_SIZE:
        raise ValueError("El logo no debe superar 2 MB")

    safe_acronym = _logo_storage_prefix(acronym)
    filename = f"{safe_acronym}-{uuid.uuid4().hex[:10]}{ext}"
    return default_storage.save(f"university_logos/{filename}", upload)


def _logo_storage_prefix(acronym):
    return re.sub(r"[^a-z0-9]+", "-", str(acronym or "universidad").lower()).strip("-") or "universidad"


def _find_existing_university_logo(acronym):
    safe_acronym = _logo_storage_prefix(acronym)
    try:
        _, files = default_storage.listdir("university_logos")
    except Exception:
        return None

    candidates = [
        f"university_logos/{name}"
        for name in files
        if name.lower().startswith(f"{safe_acronym}-") and Path(name).suffix.lower() in ALLOWED_LOGO_EXTENSIONS
    ]
    if not candidates:
        return None

    try:
        return max(candidates, key=lambda item: default_storage.get_modified_time(item))
    except Exception:
        return sorted(candidates)[-1]


def _resolve_university_logo_path(university):
    return getattr(university, "logo_path", None) or _find_existing_university_logo(getattr(university, "acronym", ""))


def _logo_url(request, logo_path):
    if not logo_path:
        return ""
    media_url = f"{settings.MEDIA_URL.rstrip('/')}/{str(logo_path).replace(os.sep, '/')}"
    return request.build_absolute_uri(media_url)


def _serialize_university(request, university, score_data=None):
    score_data = score_data or {}
    university_score = score_data.get(university.id, {})

    return {
        "id":               university.id,
        "name":             university.acronym,
        "full_name":        university.name,
        "city":             university.city,
        "province":         university.province,
        "type":             university.institution_type,
        "website":          university.website_url,
        "transparency_url": university.transparency_url,
        "dpe_entity_id":     _extract_dpe_entity_id(university.transparency_url),
        "logo_url":          _logo_url(request, _resolve_university_logo_path(university)),
        "logo_path":         _resolve_university_logo_path(university) or "",
        "is_active":        university.is_active,
        "transparency_score": university_score.get("transparency_score", 0),
        "integrated_transparency_score": university_score.get("integrated_transparency_score", 0),
        "evaluated_documents": university_score.get("evaluated_documents", 0),
        "rank":             university_score.get("rank", 0),
        "logo_initials":    university.acronym[:4] if university.acronym else "UNIV",
        "color":            "#6366F1",
    }


def _evaluated_periods():
    """Períodos con índice integrado definitivo y cuántas universidades lo tienen."""
    counts = {}
    for period_id, university_id in IntegratedTransparencyResult.objects.filter(
            index_percent__isnull=False, is_provisional=False,
    ).values_list("period_id", "university_id").distinct():
        counts.setdefault(period_id, set()).add(university_id)
    periods = EvaluationPeriod.objects.filter(id__in=counts)
    rows = [{"id": p.id, "name": p.period_name, "year": p.year, "month": p.month,
             "universities": len(counts[p.id])} for p in periods]
    return sorted(rows, key=lambda row: (row["year"], row["month"] or 0, row["id"]), reverse=True)


def _dashboard_period_id():
    """Período que comparan los dashboards: el que tiene más universidades evaluadas
    por completo y, ante empate, el más reciente. Comparar a cada universidad en
    su propio último período mezclaría años y normas distintas."""
    periods = _evaluated_periods()
    if not periods:
        return None
    return max(periods, key=lambda row: (row["universities"], row["year"], row["month"] or 0, row["id"]))["id"]


def _get_university_score_data(validations=None, period_id=None, month=None):
    from ..services.evaluator import is_lotaip_dictionary
    from ..services.lotaip_rubric import summarize_rubrics
    period_id = period_id or _dashboard_period_id()
    if period_id is None:
        return {}
    if validations is None:
        validations = EvidenceValidationResult.objects.select_related(
            "evidence", "evidence__university", "evidence__indicator", "evidence__period"
        )
    validations = validations.filter(evidence__period_id=period_id)
    if month:
        validations = validations.filter(evidence__month=month)
    groups = {}
    for vr in validations:
        if vr.evidence_id and vr.evidence.university_id:
            groups.setdefault(vr.evidence.university_id, []).append(vr)
    ranked = []
    for university_id, rows in groups.items():
        rows = [vr for vr in rows if not is_lotaip_dictionary(vr.evidence)]
        if not rows or any(not vr.lotaip_rubric for vr in rows):
            continue  # Los resultados históricos requieren revalidación.
        sita = summarize_rubrics([vr.lotaip_rubric for vr in rows])
        national_index = sita.get("puntaje")
        integrated = IntegratedTransparencyResult.objects.filter(
            university_id=university_id, period_id=period_id,
            index_percent__isnull=False, is_provisional=False,
        )
        # Sin mes se usa el índice anual (mes 0); si no existe, el último mensual.
        integrated = (integrated.filter(month=int(month)) if month else
                      integrated.order_by(Case(When(month=0, then=0), default=1), '-month')).first()
        if national_index is None or integrated is None:
            continue  # Pendiente no equivale a cero ni entra en rankings.
        ranked.append((university_id, {
            "transparency_score": national_index,
            "integrated_transparency_score": float(integrated.index_percent),
            "evaluated_documents": len(rows),
            "period_id": period_id,
            "lotaip_components": sita.get("componentes") or {},
            "dimensions": [{"code": row.get("code"), "name": row.get("name"), "score": row.get("score")}
                           for row in integrated.dimension_scores or []],
            "simulated": (integrated.coverage or {}).get("origen") == "simulado",
        }))
    ranked.sort(key=lambda item: item[1]["integrated_transparency_score"], reverse=True)
    return {uid: {**score, "rank": i + 1} for i, (uid, score) in enumerate(ranked)}


@csrf_exempt
def list_universities(request):
    # ── Control de acceso: GET=todos autenticados, POST=solo Admin (HT-08) ──
    if request.method == "POST":
        _, err = require_role(request, [1, 2, 3])
        if err:
            return err
    else:
        _, err = require_auth(request)
        if err:
            return err

    if request.method == "GET":
        try:
            include_inactive = request.GET.get("include_inactive") in {"1", "true", "True", "yes"}
            univs = University.objects.all() if include_inactive else University.objects.filter(is_active=True)
            univs = univs.order_by("is_active", "name") if include_inactive else univs.order_by("name")
            score_data = _get_university_score_data()
            data = [_serialize_university(request, u, score_data) for u in univs]
            return JsonResponse(data, safe=False)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener universidades: {str(exc)}"}, status=500)

    if request.method == "POST":
        if request.META.get("CONTENT_TYPE", "").startswith("multipart/form-data"):
            data, files, parse_error = _parse_body(request)
            if parse_error:
                return JsonResponse({"error": parse_error}, status=400)

            transparency_input = (
                _get_value(data, "dpe_entity_id")
                or _get_value(data, "transparency_id")
                or _get_value(data, "establishment_id")
                or _get_value(data, "transparency_url", "")
            )
            acronym = _get_value(data, "name", "").strip().upper()

            try:
                logo_path = _save_university_logo(files.get("logo"), acronym) or _find_existing_university_logo(acronym)
                now = timezone.now()
                univ = University.objects.create(
                    name             = _get_value(data, "full_name", "").strip(),
                    acronym          = acronym,
                    province         = _get_value(data, "province", ""),
                    city             = _get_value(data, "city", ""),
                    website_url      = _get_value(data, "website", ""),
                    transparency_url = _normalize_dpe_transparency_url(transparency_input),
                    logo_path        = logo_path,
                    institution_type = _get_value(data, "type", "Pública"),
                    is_active        = _get_bool(data, "is_active", True),
                    created_at       = now,
                    updated_at       = now,
                )
                return JsonResponse({"id": univ.id, "logo_url": _logo_url(request, logo_path), "message": "Universidad creada"}, status=201)
            except ValueError as exc:
                return JsonResponse({"error": str(exc)}, status=400)
            except Exception as exc:
                return JsonResponse({"error": f"Error al crear universidad: {str(exc)}"}, status=500)

        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)

        transparency_input = (
            data.get("dpe_entity_id")
            or data.get("transparency_id")
            or data.get("establishment_id")
            or data.get("transparency_url", "")
        )

        now = timezone.now()
        try:
            acronym = data.get("name", "").strip().upper()
            logo_path = _find_existing_university_logo(acronym)
            univ = University.objects.create(
                name             = data.get("full_name", "").strip(),
                acronym          = acronym,
                province         = data.get("province", ""),
                city             = data.get("city", ""),
                website_url      = data.get("website", ""),
                transparency_url = _normalize_dpe_transparency_url(transparency_input),
                logo_path        = logo_path,
                institution_type = data.get("type", "Pública"),
                is_active        = data.get("is_active", True),
                created_at       = now,
                updated_at       = now,
            )
            return JsonResponse({"id": univ.id, "message": "Universidad creada"}, status=201)
        except Exception as exc:
            return JsonResponse({"error": f"Error al crear universidad: {str(exc)}"}, status=500)

    return JsonResponse({"error": "Método no permitido"}, status=405)


@csrf_exempt
def university_detail(request, univ_id):
    # ── Control de acceso: solo Administrador (HT-08) ────────────
    _, err = require_role(request, [1, 2, 3])
    if err:
        return err

    try:
        univ = University.objects.get(id=univ_id)
    except University.DoesNotExist:
        return JsonResponse({"error": "Universidad no encontrada"}, status=404)

    if request.method == "PUT":
        if request.META.get("CONTENT_TYPE", "").startswith("multipart/form-data"):
            data, files, parse_error = _parse_body(request)
            if parse_error:
                return JsonResponse({"error": parse_error}, status=400)

            if "full_name" in data: univ.name = _get_value(data, "full_name")
            if "name" in data:      univ.acronym = _get_value(data, "name").upper()
            if "city" in data:      univ.city = _get_value(data, "city")
            if "province" in data:  univ.province = _get_value(data, "province")
            if "website" in data:   univ.website_url = _get_value(data, "website")
            if any(k in data for k in ("dpe_entity_id", "transparency_id", "establishment_id", "transparency_url")):
                transparency_input = (
                    _get_value(data, "dpe_entity_id")
                    or _get_value(data, "transparency_id")
                    or _get_value(data, "establishment_id")
                    or _get_value(data, "transparency_url", "")
                )
                univ.transparency_url = _normalize_dpe_transparency_url(transparency_input)
            if "type" in data:      univ.institution_type = _get_value(data, "type")
            if "is_active" in data: univ.is_active = _get_bool(data, "is_active", univ.is_active)
            if files.get("logo"):
                try:
                    if getattr(univ, "logo_path", None):
                        default_storage.delete(univ.logo_path)
                    univ.logo_path = _save_university_logo(files.get("logo"), univ.acronym)
                except ValueError as exc:
                    return JsonResponse({"error": str(exc)}, status=400)
            elif not getattr(univ, "logo_path", None):
                univ.logo_path = _find_existing_university_logo(univ.acronym)
            univ.updated_at = timezone.now()
            univ.save()
            return JsonResponse({"message": "Universidad actualizada", "logo_url": _logo_url(request, getattr(univ, "logo_path", None))})

        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "Cuerpo JSON inválido"}, status=400)

        if "full_name" in data: univ.name = data["full_name"]
        if "name" in data:      univ.acronym = data["name"].upper()
        if "city" in data:      univ.city = data["city"]
        if "province" in data:  univ.province = data["province"]
        if "website" in data:   univ.website_url = data["website"]
        if any(k in data for k in ("dpe_entity_id", "transparency_id", "establishment_id", "transparency_url")):
            transparency_input = (
                data.get("dpe_entity_id")
                or data.get("transparency_id")
                or data.get("establishment_id")
                or data.get("transparency_url", "")
            )
            univ.transparency_url = _normalize_dpe_transparency_url(transparency_input)
        if "type" in data:      univ.institution_type = data["type"]
        if "is_active" in data: univ.is_active = data["is_active"]
        if not getattr(univ, "logo_path", None):
            univ.logo_path = _find_existing_university_logo(univ.acronym)
        univ.updated_at = timezone.now()
        univ.save()
        return JsonResponse({"message": "Universidad actualizada"})


    if request.method == "DELETE":
        evidence_rows = list(Evidence.objects.filter(university=univ).only("id", "file_path"))
        evidence_ids = [ev.id for ev in evidence_rows]
        deleted_files = 0

        with transaction.atomic():
            if evidence_ids:
                EvidenceValidationResult.objects.filter(evidence_id__in=evidence_ids).delete()
                Evidence.objects.filter(id__in=evidence_ids).delete()

            UniversityEvaluationSummary.objects.filter(university=univ).delete()
            Evaluation.objects.filter(university=univ).delete()
            CategoryResult.objects.filter(university=univ).delete()
            FinalResult.objects.filter(university=univ).delete()
            Feedback.objects.filter(university=univ).delete()
            AppUser.objects.filter(university=univ).update(university=None)
            univ.delete()

        for ev in evidence_rows:
            if ev.file_path:
                try:
                    if default_storage.exists(ev.file_path):
                        default_storage.delete(ev.file_path)
                        deleted_files += 1
                except Exception as exc:
                    _log_error(
                        f"No se pudo eliminar archivo de evidencia '{ev.file_path}': {str(exc)}",
                        function_name="university_detail",
                        error_code="EVIDENCE_FILE_DELETE_ERROR",
                        exc=exc,
                    )

        cache.clear()
        return JsonResponse({
            "message": "Universidad eliminada",
            "deleted_evidences": len(evidence_rows),
            "deleted_files": deleted_files,
        })

    return JsonResponse({"error": "Método no permitido"}, status=405)
