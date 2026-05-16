import os
import django
from django.utils import timezone

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from core.models import Indicator, Evidence, IndicatorTemplate, Evaluation

print("Eliminando evidencias y evaluaciones para evitar errores de integridad...")
Evidence.objects.all().delete()
Evaluation.objects.all().delete()
IndicatorTemplate.objects.all().delete()

print("Eliminando todos los indicadores existentes...")
Indicator.objects.all().delete()

names = [
    "1-1-estructura-organica.xlsx",
    "1-2-base-legal-regulaciones-procedimientos-internos.xlsx",
    "1-3-metas-y-objetivos_unidades.xlsx",
    "2-directorio-y-distributivo-personal-de-la-entidad.xlsx",
    "3-remuneraciones-ingresos-adicionales.xlsx",
    "4-detalle-licencia-comisiones.xlsx",
    "5-22-servicios-formularios-formatos-tramites.xlsx",
    "6-presupuesto-de-la-institucion.xlsx",
    "7-resultados-de-las-auditorias-internas-y-gubernamentales.xlsx",
    "8-procesos-de-contratacion-publica.xlsx",
    "9-listado-de-empresas-y-personas-que-han-incumplido-contratos.xlsx",
    "10-planes-y-programas.xlsx",
    "11-contratos-de-credito-externos-o-internos.xlsx",
    "12-mecanismos-rendicion-cuentas.xlsx",
    "13-viaticos-informes-de-trabajo-y-justificativos-de-movilizacion.xlsx",
    "14-responsables-del-acceso-de-informacion-publica.xlsx",
    "15-texto-integro-de-los-contratos-colectivos-vigentes-y-reformas.xlsx",
    "16-indice-informacion-reservada.xlsx",
    "17-audiencias-y-reuniones-autoridades.xlsx",
    "18-detalle-de-convenios-nacionales-e-internacionales.xlsx",
    "19-detalle-donativos-oficiales-y-protocolares.xlsx",
    "20-registro-de-activos-de-informacion-frecuente-y-complementaria.xlsx",
    "21-politicas-publicas-o-informacion-grupo-especifico.xlsx",
    "23-detalle-personas-servidoras-publicas-con-acciones-afirmativas.xlsx",
    "24-informacion-relevante-para-el-ejercicio-de-derechos-ods.xlsx"
]

now = timezone.now()

for idx, name in enumerate(names):
    # e.g., "1-1-estructura-organica.xlsx"
    clean_name = name.replace(".xlsx", "")
    parts = clean_name.split("-", 1)
    
    code = f"LOTAIP-{parts[0]}"
    if len(parts) > 1 and parts[1] and parts[1][0].isdigit():
        code = f"LOTAIP-{parts[0]}.{parts[1].split('-')[0]}"
        
    friendly_name = clean_name.replace("-", " ").capitalize()
    
    Indicator.objects.create(
        category_id=1,
        code=code,
        name=friendly_name,
        weight_percent=100.0 / len(names),
        max_score=10.0,
        evidence_type="DOCUMENT",
        scoring_type="TRINARY",
        is_required=True,
        is_active=True,
        display_order=idx + 1,
        created_at=now
    )
    print(f"Creado: {code} -> {friendly_name}")

print("Proceso completado.")
