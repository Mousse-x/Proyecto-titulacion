"""
Vistas para la gestión documental de evidencias LOTAIP.
Incluye: listar, crear (con upload de archivos), actualizar, eliminar, descargar
y scraper automático del portal de transparencia de ESPOCH.
"""
import os
import re
import json
import mimetypes
from pathlib import Path

from django.http import JsonResponse, FileResponse
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
from django.utils import timezone
from django.core.mail import send_mail

from .models import (
    AppUser, University, Indicator, EvaluationPeriod, Evidence, AuditLog
)
from .middleware import require_auth, require_role
from .sanitizers import sanitize_text, sanitize_url
from .encryption import decrypt_email


# ─── Helper de auditoría local ───────────────────────────────────────

def _log(user_id, action, table_name=None, record_id=None, description=None):
    try:
        AuditLog.objects.create(
            user_id=user_id, module="evidences", action=action,
            table_name=table_name, record_id=record_id,
            description=description, created_at=timezone.now(),
        )
    except Exception:
        pass


# ─── Serialización ───────────────────────────────────────────────────

def _evidence_to_dict(ev):
    """Serializa una evidencia a dict JSON-safe."""
    media_base = getattr(settings, "MEDIA_URL", "/media/")
    file_url   = f"{media_base}{ev.file_path}" if ev.file_path else None

    return {
        "id":                ev.id,
        "title":             ev.title,
        "university_id":     ev.university_id,
        "university_name":   ev.university.acronym if ev.university_id else None,
        "period_id":         ev.period_id,
        "indicator_id":      ev.indicator_id,
        "indicator_code":    ev.indicator.code if ev.indicator_id else None,
        "indicator_name":    ev.indicator.name if ev.indicator_id else None,
        "uploaded_by":       ev.uploaded_by_user.full_name if ev.uploaded_by_user_id else "Sistema",
        "uploaded_at":       ev.uploaded_at.isoformat() if ev.uploaded_at else None,
        "updated_at":        ev.updated_at.isoformat() if ev.updated_at else None,
        "validation_status": ev.validation_status,   # pendiente | aprobado | rechazado
        "file_path":         ev.file_path,
        "file_url":          file_url,
        "source_url":        ev.source_url,
        "file_size":         ev.file_size,
        "file_type":         ev.file_type or "PDF",  # PDF | XLSX | DOCX | CSV | URL
        "observations":      ev.observations,
        "month":             ev.month,
        "year":              ev.period.year if ev.period else None,
    }


# ══════════════════════════════════════════════════════════════════════
#  LISTAR Y CREAR EVIDENCIAS
# ══════════════════════════════════════════════════════════════════════

@csrf_exempt
def list_evidences(request):
    """
    GET  /api/evidences/   — lista con filtros opcionales
    POST /api/evidences/   — crea evidencia (multipart con archivo o JSON con URL)
    """
    # ── Control de acceso (HT-08) ────────────────────────────────
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
            qs = (
                Evidence.objects
                .select_related("university", "indicator", "uploaded_by_user")
                .order_by("-uploaded_at")
            )
            univ_id = request.GET.get("university_id")
            status  = request.GET.get("status")
            ind_id  = request.GET.get("indicator_id")
            month   = request.GET.get("month")

            if univ_id:
                qs = qs.filter(university_id=univ_id)
            if status:
                qs = qs.filter(validation_status=status)
            if ind_id:
                qs = qs.filter(indicator_id=ind_id)
            if month:
                qs = qs.filter(month=month)

            return JsonResponse([_evidence_to_dict(ev) for ev in qs], safe=False)
        except Exception as exc:
            return JsonResponse({"error": f"Error al listar evidencias: {str(exc)}"}, status=500)

    if request.method == "POST":
        try:
            ct = request.content_type or ""
            if "multipart" in ct:
                title         = request.POST.get("title", "").strip()
                indicator_id  = request.POST.get("indicator_id")
                university_id = request.POST.get("university_id")
                user_id       = request.POST.get("uploaded_by_user_id")
                period_id     = request.POST.get("period_id", 1)
                source_url    = request.POST.get("source_url", "")
                month_val     = request.POST.get("month")
                uploaded_file = request.FILES.get("file")
            else:
                body          = json.loads(request.body)
                title         = body.get("title", "").strip()
                indicator_id  = body.get("indicator_id")
                university_id = body.get("university_id")
                user_id       = body.get("uploaded_by_user_id")
                period_id     = body.get("period_id", 1)
                source_url    = body.get("source_url", "")
                month_val     = body.get("month")
                uploaded_file = None

            if not title or not indicator_id or not university_id:
                return JsonResponse(
                    {"error": "title, indicator_id y university_id son obligatorios"}, status=400
                )

            # Validar fecha lógica (Año/Mes no futuros)
            year_val = request.POST.get("year") if "multipart" in ct else body.get("year")
            if year_val and month_val:
                try:
                    y_int = int(year_val)
                    m_int = int(month_val)
                    now_d = timezone.now()
                    if y_int > now_d.year:
                        return JsonResponse({"error": "No se puede subir un documento de un año posterior al actual"}, status=400)
                    if y_int == now_d.year and m_int > now_d.month:
                        return JsonResponse({"error": "No se puede subir un documento de un mes posterior al actual"}, status=400)
                except ValueError:
                    pass # Si no son enteros, se asume que fallará en la validación del modelo si aplica.

            # Validar FK
            try:
                indicator  = Indicator.objects.get(id=indicator_id)
                university = University.objects.get(id=university_id)
                
                # Obtener o crear el Período según el año seleccionado
                if year_val:
                    try:
                        y_int = int(year_val)
                        period = EvaluationPeriod.objects.filter(year=y_int).first()
                        if not period:
                            period = EvaluationPeriod.objects.create(
                                period_name=f"Evaluación {y_int}",
                                year=y_int,
                                start_date=f"{y_int}-01-01",
                                end_date=f"{y_int}-12-31",
                                status="OPEN",
                                created_at=timezone.now()
                            )
                    except ValueError:
                        period = EvaluationPeriod.objects.get(id=period_id)
                else:
                    period = EvaluationPeriod.objects.get(id=period_id)

            except (Indicator.DoesNotExist, University.DoesNotExist, EvaluationPeriod.DoesNotExist) as exc:
                return JsonResponse({"error": f"Referencia inválida: {str(exc)}"}, status=400)

            uploader = None
            if user_id:
                try:
                    uploader = AppUser.objects.get(id=user_id)
                except AppUser.DoesNotExist:
                    pass

            # ── Guardar archivo en disco ──────────────────────────────
            file_path_rel = None
            file_size     = None
            file_type     = "URL" if source_url and not uploaded_file else "PDF"

            if uploaded_file:
                orig_name = uploaded_file.name
                ext       = Path(orig_name).suffix.lower()
                ext_map   = {
                    ".pdf": "PDF", ".xlsx": "XLSX", ".xls": "XLSX",
                    ".docx": "DOCX", ".doc": "DOCX", ".csv": "CSV",
                }
                file_type = ext_map.get(ext, "PDF")

                safe_name = re.sub(r"[^a-zA-Z0-9._\-]", "_", orig_name)
                rel_dir   = f"evidences/{university_id}/{indicator_id}"
                abs_dir   = Path(settings.MEDIA_ROOT) / rel_dir
                abs_dir.mkdir(parents=True, exist_ok=True)

                abs_path      = abs_dir / safe_name
                file_size     = uploaded_file.size
                file_path_rel = f"{rel_dir}/{safe_name}"

                with open(abs_path, "wb") as fout:
                    for chunk in uploaded_file.chunks():
                        fout.write(chunk)

            now = timezone.now()
            ev  = Evidence.objects.create(
                university        = university,
                period            = period,
                indicator         = indicator,
                uploaded_by_user  = uploader,
                title             = title,
                uploaded_at       = now,
                updated_at        = now,
                validation_status = "pendiente",
                file_path         = file_path_rel,
                source_url        = source_url or None,
                file_size         = file_size,
                file_type         = file_type,
                month             = int(month_val) if month_val else None,
            )

            _log(
                user_id     = user_id,
                action      = "EVIDENCE_UPLOAD",
                table_name  = "evidence.evidences",
                record_id   = ev.id,
                description = f"Evidencia subida: {title} [{indicator.code}]",
            )
            return JsonResponse(_evidence_to_dict(ev), status=201)

        except Exception as exc:
            return JsonResponse({"error": f"Error al crear evidencia: {str(exc)}"}, status=500)

    return JsonResponse({"error": "Método no permitido"}, status=405)


# ══════════════════════════════════════════════════════════════════════
#  DETALLE, ACTUALIZAR Y ELIMINAR EVIDENCIA
# ══════════════════════════════════════════════════════════════════════

@csrf_exempt
def evidence_detail(request, ev_id):
    """
    GET    /api/evidences/<id>/
    PUT    /api/evidences/<id>/   — actualiza estado / observaciones
    DELETE /api/evidences/<id>/   — elimina y borra archivo del disco
    """
    # ── Control de acceso (HT-08) ────────────────────────────────
    if request.method in ("PUT", "DELETE"):
        _, err = require_role(request, [1, 2, 3])
        if err:
            return err
    else:
        _, err = require_auth(request)
        if err:
            return err

    try:
        ev = Evidence.objects.select_related(
            "university", "indicator", "uploaded_by_user"
        ).get(id=ev_id)
    except Evidence.DoesNotExist:
        return JsonResponse({"error": "Evidencia no encontrada"}, status=404)

    if request.method == "GET":
        return JsonResponse(_evidence_to_dict(ev))

    if request.method == "PUT":
        try:
            data = json.loads(request.body)
        except json.JSONDecodeError:
            return JsonResponse({"error": "JSON inválido"}, status=400)

        if "validation_status" in data:
            allowed = {"pendiente", "aprobado", "rechazado", "inconsistente"}
            if data["validation_status"] not in allowed:
                return JsonResponse(
                    {"error": f"Estado inválido. Use: {allowed}"}, status=400
                )
            
            old_status = ev.validation_status
            ev.validation_status = data["validation_status"]

            # Notificar al usuario si cambia a rechazado o inconsistente
            if ev.validation_status in ("rechazado", "inconsistente") and old_status != ev.validation_status:
                if ev.uploaded_by_user and ev.uploaded_by_user.email:
                    try:
                        user_email = decrypt_email(ev.uploaded_by_user.email)
                        obs = data.get("observations", "Sin observaciones adicionales.")
                        subject = f"Documento marcado como {ev.validation_status.upper()}"
                        msg = (
                            f"Hola {ev.uploaded_by_user.full_name},\n\n"
                            f"Su documento '{ev.title}' ha sido marcado como {ev.validation_status.upper()}.\n\n"
                            f"Observaciones del auditor/administrador:\n{obs}\n\n"
                            "Por favor, revise la plataforma para más detalles.\n"
                        )
                        send_mail(subject, msg, settings.DEFAULT_FROM_EMAIL, [user_email], fail_silently=True)
                    except Exception as e:
                        print("Error enviando notificación:", e)

        if "observations" in data:
            ev.observations = data["observations"]
        if "title" in data:
            ev.title = data["title"]

        ev.updated_at = timezone.now()
        ev.save()

        _log(
            user_id     = data.get("_reviewer_id"),
            action      = "EVIDENCE_UPDATE",
            table_name  = "evidence.evidences",
            record_id   = ev.id,
            description = f"Evidencia actualizada → estado='{ev.validation_status}'",
        )
        return JsonResponse(_evidence_to_dict(ev))

    if request.method == "DELETE":
        if ev.file_path:
            abs_path = Path(settings.MEDIA_ROOT) / ev.file_path
            if abs_path.exists():
                abs_path.unlink()

        ev_title = ev.title
        ev.delete()
        return JsonResponse({"message": f"Evidencia '{ev_title}' eliminada"})

    return JsonResponse({"error": "Método no permitido"}, status=405)


# ══════════════════════════════════════════════════════════════════════
#  ACTUALIZACIÓN MASIVA DE EVIDENCIAS
# ══════════════════════════════════════════════════════════════════════

@csrf_exempt
def bulk_update_evidences(request):
    """
    PUT /api/evidences/bulk/
    Body: { "evidence_ids": [1, 2, 3], "validation_status": "aprobado", "_reviewer_id": 5 }
    Actualiza el estado de validación de varias evidencias a la vez.
    """
    # ── Control de acceso: Admin y Auditor (HT-08) ───────────────
    _, err = require_role(request, [1, 4])
    if err:
        return err

    if request.method != "PUT":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    ev_ids = data.get("evidence_ids", [])
    new_status = data.get("validation_status")
    reviewer_id = data.get("_reviewer_id")

    if not ev_ids or not new_status:
        return JsonResponse({"error": "Faltan datos (evidence_ids o validation_status)"}, status=400)

    allowed = {"pendiente", "aprobado", "rechazado", "inconsistente"}
    if new_status not in allowed:
        return JsonResponse({"error": f"Estado inválido. Use: {allowed}"}, status=400)

    try:
        # Obtener evidencias a actualizar para agrupar correos si es necesario
        evidences_to_update = list(Evidence.objects.select_related("uploaded_by_user").filter(id__in=ev_ids))

        # Actualizar masivamente
        updated_count = Evidence.objects.filter(id__in=ev_ids).update(
            validation_status=new_status,
            updated_at=timezone.now()
        )

        # Enviar correos consolidados si es rechazado o inconsistente
        if new_status in ("rechazado", "inconsistente") and updated_count > 0:
            user_docs = {}
            for e in evidences_to_update:
                if e.uploaded_by_user and e.uploaded_by_user.email:
                    if e.uploaded_by_user not in user_docs:
                        user_docs[e.uploaded_by_user] = []
                    user_docs[e.uploaded_by_user].append(e)

            for u, docs in user_docs.items():
                try:
                    user_email = decrypt_email(u.email)
                    subject = f"Atención: {len(docs)} documento(s) marcados como {new_status.upper()}"
                    
                    doc_list = "\n".join([f"- {d.title}" for d in docs])
                    msg = (
                        f"Hola {u.full_name},\n\n"
                        f"{len(docs)} de sus documentos han sido marcados como {new_status.upper()}:\n\n"
                        f"{doc_list}\n\n"
                        "Por favor, ingrese a la plataforma para revisar las observaciones y tomar acciones correctivas.\n"
                    )
                    send_mail(subject, msg, settings.DEFAULT_FROM_EMAIL, [user_email], fail_silently=True)
                except Exception as e:
                    print("Error enviando correos consolidados:", e)

        _log(
            user_id     = reviewer_id,
            action      = "EVIDENCE_BULK_UPDATE",
            table_name  = "evidence.evidences",
            description = f"Evidencias actualizadas ({updated_count}): {ev_ids} -> '{new_status}'",
        )

        return JsonResponse({"message": f"{updated_count} evidencias actualizadas correctamente"})
    except Exception as exc:
        return JsonResponse({"error": f"Error en actualización masiva: {str(exc)}"}, status=500)


# ══════════════════════════════════════════════════════════════════════
#  ELIMINACIÓN MASIVA DE EVIDENCIAS
# ══════════════════════════════════════════════════════════════════════

@csrf_exempt
def bulk_delete_evidences(request):
    """
    DELETE /api/evidences/bulk_delete/
    Body: { "evidence_ids": [1, 2, 3], "_reviewer_id": 5 }
    Elimina varias evidencias a la vez y sus archivos.
    """
    # ── Control de acceso: solo Administrador (HT-08) ────────────
    _, err = require_role(request, [1])
    if err:
        return err

    if request.method not in ["DELETE", "POST"]:
        return JsonResponse({"error": "Método no permitido"}, status=405)

    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    ev_ids = data.get("evidence_ids", [])
    reviewer_id = data.get("_reviewer_id")

    if not ev_ids:
        return JsonResponse({"error": "Faltan datos (evidence_ids)"}, status=400)

    try:
        evidences = Evidence.objects.filter(id__in=ev_ids)
        deleted_count = 0
        for ev in evidences:
            if ev.file_path:
                abs_path = Path(settings.MEDIA_ROOT) / ev.file_path
                if abs_path.exists():
                    abs_path.unlink()
            ev.delete()
            deleted_count += 1

        _log(
            user_id     = reviewer_id,
            action      = "EVIDENCE_BULK_DELETE",
            table_name  = "evidence.evidences",
            description = f"Evidencias eliminadas masivamente ({deleted_count}): {ev_ids}",
        )

        return JsonResponse({"message": f"{deleted_count} evidencias eliminadas correctamente"})
    except Exception as exc:
        return JsonResponse({"error": f"Error en eliminación masiva: {str(exc)}"}, status=500)



# ══════════════════════════════════════════════════════════════════════
#  DESCARGA SEGURA DE ARCHIVO
# ══════════════════════════════════════════════════════════════════════

@csrf_exempt
def download_evidence(request, ev_id):
    """
    GET /api/evidences/<id>/download/
    Descarga el archivo. Si es tipo URL devuelve la URL de redirección.
    """
    # ── Control de acceso: todos los autenticados (HT-08) ────────
    _, err = require_auth(request)
    if err:
        return err

    if request.method != "GET":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    try:
        ev = Evidence.objects.get(id=ev_id)
    except Evidence.DoesNotExist:
        return JsonResponse({"error": "Evidencia no encontrada"}, status=404)

    if ev.file_type == "URL" or not ev.file_path:
        if ev.source_url:
            return JsonResponse({"redirect_url": ev.source_url})
        return JsonResponse({"error": "No hay archivo descargable"}, status=404)

    abs_path = Path(settings.MEDIA_ROOT) / ev.file_path
    if not abs_path.exists():
        return JsonResponse({"error": "Archivo no encontrado en servidor"}, status=404)

    ct, _ = mimetypes.guess_type(str(abs_path))
    ct = ct or "application/octet-stream"

    return FileResponse(
        open(abs_path, "rb"),
        content_type=ct,
        as_attachment=True,
        filename=abs_path.name,
    )


# ══════════════════════════════════════════════════════════════════════
#  SCRAPER AUTOMATIZADO — Portal ESPOCH LOTAIP
# ══════════════════════════════════════════════════════════════════════

MONTH_NAME_TO_NUMBER = {
    "ENERO": 1, "FEBRERO": 2, "MARZO": 3, "ABRIL": 4, "MAYO": 5,
    "JUNIO": 6, "JULIO": 7, "AGOSTO": 8, "SEPTIEMBRE": 9,
    "OCTUBRE": 10, "NOVIEMBRE": 11, "DICIEMBRE": 12,
}

# Mapeo letra LOTAIP → código de indicador (adaptar según indicadores reales en BD)
LOTAIP_LETTER_MAP = {
    "a": "LOTAIP-A", "b": "LOTAIP-B", "c": "LOTAIP-C", "d": "LOTAIP-D",
    "e": "LOTAIP-E", "f": "LOTAIP-F", "g": "LOTAIP-G", "h": "LOTAIP-H",
    "i": "LOTAIP-I", "j": "LOTAIP-J", "k": "LOTAIP-K", "l": "LOTAIP-L",
    "m": "LOTAIP-M", "n": "LOTAIP-N", "o": "LOTAIP-O", "p": "LOTAIP-P",
    "q": "LOTAIP-Q", "r": "LOTAIP-R", "s": "LOTAIP-S", "t": "LOTAIP-T",
    "u": "LOTAIP-U", "v": "LOTAIP-V", "w": "LOTAIP-W", "x": "LOTAIP-X",
    "y": "LOTAIP-Y",
}

LITERAL_RE = re.compile(
    r"^Literal\s+([a-wA-W])\s*[\d\.]*\)?\s*(.+)$", re.IGNORECASE
)
MONTH_RE = re.compile(
    r"^(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)$",
    re.IGNORECASE,
)


@csrf_exempt
def scrape_espoch(request):
    """
    POST /api/scraper/espoch/
    Body: { "portal_url": "...", "period_id": 1, "user_id": <int> }
    """
    # ── Control de acceso: solo Administrador (HT-08) ────────────
    _, err = require_role(request, [1])
    if err:
        return err

    if request.method != "POST":
        return JsonResponse({"error": "Método no permitido"}, status=405)

    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "JSON inválido"}, status=400)

    portal_url = body.get("portal_url", "https://www.espoch.edu.ec/2026-2/")
    period_id  = body.get("period_id", 1)
    user_id    = body.get("user_id")

    # ── Verificar dependencias ────────────────────────────────
    try:
        import requests as _req
        from bs4 import BeautifulSoup
    except ImportError:
        return JsonResponse(
            {"error": "Dependencias no instaladas. Ejecuta: pip install requests beautifulsoup4"},
            status=500,
        )

    # ── 1. Obtener o crear ESPOCH ─────────────────────────────
    now = timezone.now()
    try:
        espoch = University.objects.get(acronym="ESPOCH")
    except University.DoesNotExist:
        espoch = University.objects.create(
            name             = "Escuela Superior Politécnica de Chimborazo",
            acronym          = "ESPOCH",
            province         = "Chimborazo",
            city             = "Riobamba",
            website_url      = "https://www.espoch.edu.ec",
            transparency_url = portal_url,
            institution_type = "Pública",
            is_active        = True,
            created_at       = now,
            updated_at       = now,
        )

    # ── 2. Validar período ────────────────────────────────────
    try:
        period = EvaluationPeriod.objects.get(id=period_id)
    except EvaluationPeriod.DoesNotExist:
        return JsonResponse({"error": f"Período ID={period_id} no encontrado"}, status=404)

    # ── 3. Obtener indicadores disponibles ───────────────────
    all_indicators = list(Indicator.objects.filter(is_active=True).order_by("display_order", "code"))
    ind_by_code    = {i.code: i for i in all_indicators}
    fallback_ind   = all_indicators[0] if all_indicators else None

    if not fallback_ind:
        return JsonResponse({"error": "No hay indicadores activos en la BD"}, status=500)

    # ── 4. Scraping ───────────────────────────────────────────
    try:
        response = _req.get(
            portal_url, timeout=25,
            headers={"User-Agent": "Mozilla/5.0 SisTransp-Scraper/1.0"}
        )
        response.raise_for_status()
        # Forzar UTF-8 para caracteres especiales del portal ESPOCH
        response.encoding = response.apparent_encoding or "utf-8"
    except Exception as exc:
        return JsonResponse({"error": f"Error al acceder al portal ESPOCH: {str(exc)}"}, status=502)

    soup = BeautifulSoup(response.content, "html.parser")

    stats           = {"created": 0, "skipped": 0, "errors": 0}
    items_created   = []
    current_month   = None
    seen_urls       = set(
        Evidence.objects.filter(university=espoch, source_url__isnull=False)
        .values_list("source_url", flat=True)
    )

    month_number_to_name = {v: k.capitalize() for k, v in MONTH_NAME_TO_NUMBER.items()}

    for link in soup.find_all("a"):
        text = link.get_text(strip=True)
        href = (link.get("href") or "").strip()

        # Detectar encabezado de mes
        m = MONTH_RE.match(text.strip())
        if m:
            current_month = MONTH_NAME_TO_NUMBER.get(text.strip().upper())
            continue

        # Detectar literal LOTAIP
        lit = LITERAL_RE.match(text)
        if not lit:
            continue

        letter      = lit.group(1).lower()
        description = lit.group(2).strip()

        # Filtrar links sin destino real
        if not href or href in (portal_url, "#") or href.endswith("/2026-2/"):
            stats["skipped"] += 1
            continue

        # Evitar duplicados
        if href in seen_urls:
            stats["skipped"] += 1
            continue

        # Buscar indicador correspondiente
        ind_code  = LOTAIP_LETTER_MAP.get(letter)
        indicator = ind_by_code.get(ind_code, fallback_ind)

        # Construir título descriptivo
        month_label = month_number_to_name.get(current_month, "")
        if month_label:
            title = f"[{month_label}] Literal {letter.upper()} — {description}"
        else:
            title = f"Literal {letter.upper()} — {description}"
        title = title[:200]

        try:
            ev = Evidence.objects.create(
                university        = espoch,
                period            = period,
                indicator         = indicator,
                uploaded_by_user  = None,
                title             = title,
                uploaded_at       = now,
                updated_at        = now,
                validation_status = "pendiente",
                file_type         = "URL",
                source_url        = href,
                month             = current_month,
            )
            seen_urls.add(href)
            stats["created"] += 1
            items_created.append({
                "id":     ev.id,
                "title":  title[:80],
                "month":  current_month,
                "letter": letter,
                "url":    href,
            })
        except Exception as exc:
            stats["errors"] += 1

    _log(
        user_id     = user_id,
        action      = "SCRAPE_ESPOCH",
        table_name  = "evidence.evidences",
        description = (
            f"ESPOCH portal scraping: {stats['created']} creados, "
            f"{stats['skipped']} omitidos, {stats['errors']} errores"
        ),
    )

    return JsonResponse({
        "message":       f"Scraping completado. {stats['created']} evidencias registradas.",
        "university_id": espoch.id,
        "period":        period.period_name,
        "stats":         stats,
        "items":         items_created[:30],
    })
