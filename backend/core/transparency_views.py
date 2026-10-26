"""API de configuración y consulta del modelo integrado de transparencia."""

import json

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .middleware import require_auth, require_role
from .services.integrated_transparency import serialize_model, update_weights


@csrf_exempt
def transparency_model(request):
    _, err = require_auth(request)
    if err:
        return err
    if request.method == 'GET':
        return JsonResponse(serialize_model())
    if request.method == 'PUT':
        _, err = require_role(request, [1])
        if err:
            return err
        try:
            payload = json.loads(request.body or b'{}')
            return JsonResponse(update_weights(payload))
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            return JsonResponse({'error': str(exc)}, status=400)
    return JsonResponse({'error': 'Método no permitido'}, status=405)
