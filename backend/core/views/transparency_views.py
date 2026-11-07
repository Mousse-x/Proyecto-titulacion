"""API de configuración y consulta del modelo integrado de transparencia."""

import json
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Max
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from ..middleware import require_auth, require_role
from ..models import IntegratedIndicator, TransparencyDimension
from ..services.integrated_transparency import serialize_model, update_weights


@csrf_exempt
def transparency_model(request):
    _, err = require_auth(request)
    if err:
        return err
    if request.method == 'GET':
        return JsonResponse(serialize_model())
    if request.method == 'POST':
        _, err = require_role(request, [1])
        if err:
            return err
        try:
            payload = json.loads(request.body or b'{}')
            code = str(payload.get('code') or '').strip().upper()
            statement = str(payload.get('statement') or '').strip()
            classification = str(payload.get('classification') or '').strip().upper()
            dimension = TransparencyDimension.objects.get(id=payload.get('dimension_id'))
            if not code or not statement:
                raise ValueError('El código y el nombre del indicador son obligatorios.')
            if classification not in {
                IntegratedIndicator.Classification.NATIONAL,
                IntegratedIndicator.Classification.MIXED,
                IntegratedIndicator.Classification.INTERNATIONAL,
            }:
                raise ValueError('El tipo de indicador no es válido.')
            try:
                weight = Decimal('0') if classification == IntegratedIndicator.Classification.NATIONAL else Decimal(str(payload.get('weight', 0)))
            except (InvalidOperation, TypeError) as exc:
                raise ValueError('El peso debe ser un número válido.') from exc
            if weight < 0 or weight > 100:
                raise ValueError('El peso debe estar entre 0 y 100.')

            frameworks = {
                IntegratedIndicator.Classification.NATIONAL: ['LOTAIP'],
                IntegratedIndicator.Classification.MIXED: ['LOTAIP', 'COMPLEMENTARIO'],
                IntegratedIndicator.Classification.INTERNATIONAL: ['COMPLEMENTARIO'],
            }[classification]
            next_order = (IntegratedIndicator.objects.aggregate(value=Max('display_order'))['value'] or 0) + 1
            indicator = IntegratedIndicator.objects.create(
                dimension=dimension,
                code=code,
                statement=statement,
                classification=classification,
                family_code='',
                family_name='',
                traceability='',
                source_frameworks=frameworks,
                lotaip_numerals=[],
                weight_percent=weight,
                display_order=next_order,
                is_active=bool(payload.get('is_active', True)),
            )
            return JsonResponse({'id': indicator.id, 'message': 'Indicador creado'}, status=201)
        except TransparencyDimension.DoesNotExist:
            return JsonResponse({'error': 'La dimensión seleccionada no existe.'}, status=400)
        except IntegratedIndicator.DoesNotExist:
            return JsonResponse({'error': 'El indicador no existe.'}, status=404)
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            return JsonResponse({'error': str(exc)}, status=400)
        except Exception as exc:
            return JsonResponse({'error': str(exc)}, status=400)
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


@csrf_exempt
def integrated_indicator_detail(request, ind_id):
    _, err = require_role(request, [1])
    if err:
        return err
    if request.method != 'DELETE':
        return JsonResponse({'error': 'Método no permitido'}, status=405)
    try:
        with transaction.atomic():
            indicator = IntegratedIndicator.objects.select_for_update().get(id=ind_id)
            removed_results = indicator.results.count()
            indicator.results.all().delete()
            indicator.delete()
        return JsonResponse({
            'message': 'Indicador eliminado',
            'removed_results': removed_results,
        })
    except IntegratedIndicator.DoesNotExist:
        return JsonResponse({'error': 'Indicador no encontrado'}, status=404)
