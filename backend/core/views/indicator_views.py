"""Controladores de indicadores LOTAIP y sus plantillas."""
from django.http import JsonResponse
import json
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from ..models import Indicator
from ..middleware import require_auth, require_role


@csrf_exempt
def list_indicators(request):
    # ── Control de acceso: todos los autenticados (HT-08) ────────
    _, err = require_auth(request)
    if err:
        return err

    if request.method == "GET":
        try:
            indicators = Indicator.objects.select_related("category").prefetch_related("template").order_by("display_order", "code")
            data = []
            for i in indicators:
                template_url = None
                template_name = None
                if hasattr(i, 'template') and i.template:
                    template_url = i.template.file_path.url
                    template_name = i.template.file_name

                data.append({
                    "id":           i.id,
                    "code":         i.code,
                    "name":         i.name,
                    "description":  i.description,
                    "category":     i.category.name if i.category else "",
                    "category_id":  i.category_id,
                    "weight":       float(i.weight_percent),
                    "max_score":    float(i.max_score),
                    "evidence_type": i.evidence_type,
                    "scoring_type": i.scoring_type,
                    "is_required":  i.is_required,
                    "is_active":    i.is_active,
                    "display_order": i.display_order,
                    "article":      f"Art. LOTAIP" if i.lotaip_item_id else "",
                    "framework":    "LOTAIP",
                    "template_url":  template_url,
                    "template_name": template_name,
                })
            return JsonResponse(data, safe=False)
        except Exception as exc:
            return JsonResponse({"error": f"Error al obtener indicadores: {str(exc)}"}, status=500)

    if request.method == "POST":
        _, err = require_role(request, [1])
        if err: return err
        try:
            body = json.loads(request.body)
            indicator = Indicator.objects.create(
                category_id=body.get("category_id", 1),
                code=body.get("code", ""),
                name=body.get("name", ""),
                description=body.get("description", ""),
                weight_percent=body.get("weight", 0),
                is_active=body.get("is_active", True),
                evidence_type="DOCUMENT",
                scoring_type="TRINARY",
                is_required=True,
                created_at=timezone.now()
            )
            return JsonResponse({"id": indicator.id, "message": "Creado"}, status=201)
        except Exception as exc:
            return JsonResponse({"error": str(exc)}, status=400)

    return JsonResponse({"error": "Método no permitido"}, status=405)


@csrf_exempt
def indicator_detail(request, ind_id):
    _, err = require_auth(request)
    if err: return err

    try:
        indicator = Indicator.objects.get(id=ind_id)
    except Indicator.DoesNotExist:
        return JsonResponse({"error": "Indicador no encontrado"}, status=404)

    if request.method == "PUT":
        _, err = require_role(request, [1])
        if err: return err
        try:
            body = json.loads(request.body)
            indicator.code = body.get("code", indicator.code)
            indicator.name = body.get("name", indicator.name)
            indicator.description = body.get("description", indicator.description)
            indicator.weight_percent = body.get("weight", indicator.weight_percent)
            indicator.is_active = body.get("is_active", indicator.is_active)
            indicator.save()
            return JsonResponse({"message": "Actualizado"})
        except Exception as exc:
            return JsonResponse({"error": str(exc)}, status=400)

    if request.method == "DELETE":
        _, err = require_role(request, [1])
        if err: return err
        indicator.delete()
        return JsonResponse({"message": "Eliminado"})

    return JsonResponse({"error": "Método no permitido"}, status=405)


@csrf_exempt
def indicator_template_view(request, ind_id):
    # Solo Administrador puede gestionar plantillas
    _, err = require_role(request, [1])
    if err:
        return err

    try:
        indicator = Indicator.objects.get(id=ind_id)
    except Indicator.DoesNotExist:
        return JsonResponse({"error": "Indicador no encontrado"}, status=404)

    if request.method == "POST":
        file_obj = request.FILES.get("file")
        if not file_obj:
            return JsonResponse({"error": "No se proporcionó ningún archivo"}, status=400)
            
        from ..models import IndicatorTemplate
        
        # Eliminar si ya existe una plantilla
        if hasattr(indicator, 'template') and indicator.template:
            indicator.template.file_path.delete(save=False)
            indicator.template.delete()
            
        template = IndicatorTemplate.objects.create(
            indicator=indicator,
            file_path=file_obj,
            file_name=file_obj.name
        )
        return JsonResponse({"message": "Plantilla subida con éxito", "url": template.file_path.url, "name": template.file_name})

    if request.method == "DELETE":
        if hasattr(indicator, 'template') and indicator.template:
            indicator.template.file_path.delete(save=False)
            indicator.template.delete()
            return JsonResponse({"message": "Plantilla eliminada"})
        return JsonResponse({"error": "No hay plantilla asignada"}, status=400)

    return JsonResponse({"error": "Método no permitido"}, status=405)
