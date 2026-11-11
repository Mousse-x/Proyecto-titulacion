"""Rúbrica DPE 053-DPE-CGAJ-2024, tablas 1, 2, 3, 6 y 7; sección 9."""
import csv
import io
import re
from collections import Counter
from copy import deepcopy
from pathlib import Path

from django.conf import settings

from .document_processor import detect_lotaip_document_type
from .comparison_engine import ABSENCE_MARKERS, absence_marker, normalize_text
from core.lotaip_engine.schemas import header_key, header_map, resolve_format
from core.lotaip_engine.rules import ENGINE_VERSION

VERSION = ENGINE_VERSION

# Rúbrica recortada en PostgreSQL a lo que lee summarize_rubrics. Las rúbricas
# completas (evidencias, enlaces) pesan decenas de MB por período y leerlas
# enteras era lo más lento de los dashboards y lo que inflaba la RAM.
SLIM_RUBRIC_SQL = """
CASE WHEN jsonb_typeof(lotaip_rubric) <> 'object' OR lotaip_rubric = '{}'::jsonb THEN NULL
ELSE jsonb_build_object(
    'unidad', lotaip_rubric->'unidad',
    'version', lotaip_rubric->'version',
    'criterios', CASE WHEN jsonb_typeof(lotaip_rubric->'criterios') = 'array' THEN (
        SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', c->'id', 'aplica', c->'aplica',
            'calificacion', c->'calificacion', 'sugerencia', c->'sugerencia') ORDER BY ord), '[]'::jsonb)
        FROM jsonb_array_elements(lotaip_rubric->'criterios') WITH ORDINALITY AS t(c, ord)
    ) END
) END
"""


def slim_rubric_expression():
    """Anotación para EvidenceValidationResult: values(..., slim_rubric=slim_rubric_expression())."""
    from django.db.models import JSONField
    from django.db.models.expressions import RawSQL
    return RawSQL(SLIM_RUBRIC_SQL, [], output_field=JSONField())


SOURCE ="https://www.registroficial.gob.ec/registro-oficial-no-633/"
DEFINITIONS = [
    ("cta", "Información completa y actualizada", [0, 0.5, 1], "6.2.1 · Tabla 1 · p. 59",
     "1: publicada, accesible, completa y actualizada; 0,5: accesible pero incompleta o desactualizada; 0: no publicada o inaccesible."),
    ("eta", "Estructura de datos abiertos", [0, 1], "6.2.2 · Tabla 2 · p. 60",
     "1: datos estructurados publicados en CSV delimitado por comas; 0: sin publicación accesible que cumpla ese formato."),
    ("rp", "Registro dentro del plazo", [0, 1], "6.2.3 · Tabla 3 · p. 60",
     "1: registro en el PNT hasta el día 15 del mes siguiente o siguiente día laborable; 0: registro fuera del plazo. Verificar feriados aplicables."),
    ("verificables", "Estado de verificables", ["SI", "NO", "SIN EVALUACIÓN"], "7.1.1 y 7.2 · Tabla 6 · p. 63; muestra de la nota 3",
     "Sí: todos los verificables de una muestra reproducible de 3 filas son de libre acceso, corresponden y son legibles. No: alguno no cumple. SIN EVALUACIÓN: NO APLICA, o INFORMACIÓN NO DISPONIBLE con nota aclaratoria en el diccionario (nota 1)."),
    ("vigencia", "Vigencia de la información", ["SI", "NO", "SIN EVALUACIÓN"], "7.1.2 y 7.2 · pp. 61–63",
     "Sí: información dentro del plazo de vigencia; No: vencida. Art. 19, numerales 16 y 18; art. 21, formatos 1, 2, 4 y 5."),
    ("validez", "Validez de la información", ["SI", "NO", "SIN EVALUACIÓN"], "7.1.3 y 7.2 · pp. 62–63",
     "Sí: importes coherentes; No: inconsistencias. Art. 19.3: suma de componentes = total de ingresos adicionales; art. 19.6: devengado + saldo por devengar = codificado."),
]


def indicator_number(code):
    # El catálogo del proyecto usa LOTAIP-1.1 ... LOTAIP-24 (artículo 19).
    match = re.fullmatch(r"LOTAIP-(\d+)(?:\.\d+)?", str(code or ""), re.I)
    return int(match.group(1)) if match else None

def expected_data_period(year, month):
    """El período publicado contiene la información del mes inmediato anterior."""
    if not year or not month: return (None, None)
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _read_csv(evidence):
    path = Path(settings.MEDIA_ROOT) / str(evidence.file_path or "")
    if not evidence.file_path or not path.is_file():
        return {"error": "Archivo local no disponible."}
    raw = path.read_bytes()
    wrong_extension = path.suffix.lower() != ".csv"
    # Un archivo de texto tabular con otra extensión se lee para calificar su
    # contenido (CTA); ETA lo penaliza porque no es un CSV publicado como tal.
    if wrong_extension and (b"\x00" in raw[:4096] or raw[:4] in {b"%PDF", b"PK\x03\x04"}):
        return {"error": f"Formato {path.suffix or 'desconocido'}: no es CSV delimitado por comas.", "not_csv": True}
    # latin-1 nunca falla: recupera CSV con bytes fuera de cp1252 (p. ej. 0x81)
    # en lugar de declarar ilegible un archivo publicado.
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    candidates = []
    for delimiter in (",", ";", "\t", "|"):
        try:
            parsed = list(csv.reader(io.StringIO(text), delimiter=delimiter, strict=True))
        except csv.Error:
            continue
        widths = Counter(len(row) for row in parsed if any(cell.strip() for cell in row))
        if widths:
            common_width, common_count = widths.most_common(1)[0]
            # Favorecer una tabla consistente y con más columnas; evita confundir
            # comas decimales con el delimitador real. Una sola columna significa
            # que ese carácter no separa campos (p. ej. CSV con punto y coma).
            candidates.append(((common_width >= 2, common_count / sum(widths.values()), common_width),
                               delimiter, parsed))
    if not candidates:
        return {"error": "CSV vacío o estructura/delimitador no verificable."}
    _, delimiter, rows = max(candidates, key=lambda item: item[0])
    rows = [row for row in rows if any(cell.strip() for cell in row)]
    last_used = max((i for row in rows for i, cell in enumerate(row) if cell.strip()), default=-1)
    rows = [row[:last_used + 1] for row in rows]
    if len(rows) < 2 or len(rows[0]) < 2:
        return {"error": "No hay encabezados y filas estructuradas suficientes para verificar el CSV."}
    width = len(rows[0])
    empty = sum(not cell.strip() for row in rows for cell in row)
    ragged = sum(len(row) != width for row in rows)
    return {"rows": rows, "delimiter": delimiter, "empty": empty,
            "ragged": ragged, "text": text, "wrong_extension": wrong_extension,
            "extension": path.suffix or "sin extensión"}


def _required_empty_values(data, schema):
    """Cuenta vacíos obligatorios; omite celdas jerárquicas declaradas anulables."""
    rows = data.get("rows", [])
    if len(rows) < 2 or not schema:
        return data.get("empty", 0)
    mapping = header_map(schema)
    canonical = [mapping.get(header_key(header)) for header in rows[0]]
    nullable = set(schema.get("nullable_fields", []))
    required = set(schema.get("required_fields", [])) - nullable
    return sum(
        not (str(row[index]).strip() if index < len(row) else "")
        for row in rows[1:]
        for index, field in enumerate(canonical)
        if field in required
    )


def evaluate_package(evidence, siblings, check_online=False, fetch=None, previous=None,
                     progress_callback=None, ai_budget=None):
    """Una unidad de evaluación por universidad/mes/formato, no por cada CSV."""
    def report(phase, detail, stage_pct):
        if progress_callback:
            progress_callback({"phase": phase, "detail": detail, "stage_pct": stage_pct})

    report("Leyendo paquete documental", "Identificando conjunto de datos, metadatos y diccionario.", 20)
    siblings = list(siblings)
    number = indicator_number(evidence.indicator.code if evidence.indicator else "")
    schema = resolve_format(getattr(evidence.indicator, "code", None), number)
    criteria = []
    for key, name, options, reference, rule in DEFINITIONS:
        applies = True
        if number is not None:
            if key == "verificables":
                applies = number not in {2, 3, 4, 6, 23}
            elif key == "vigencia":
                applies = number in {16, 18}
            elif key == "validez":
                applies = number in {3, 6}
        criteria.append({"id": key, "criterio": name, "opciones": options,
                         "referencia": reference, "regla": rule, "aplica": applies,
                         "calificacion": None, "sugerencia": None,
                         "observacion": "Pendiente de revisión de la información publicada en el PNT." if applies
                         else "Este criterio no corresponde al numeral según la matriz configurada."})
    by_key = {c["id"]: c for c in criteria}
    files = {}
    diagnostics = []
    for sibling in siblings:
        kind = detect_lotaip_document_type(sibling.file_path) or detect_lotaip_document_type(sibling.title)
        if kind:
            if kind in files:
                diagnostics.append(f"Hay más de un archivo de {kind}; revisar la versión publicada.")
            files[kind] = _read_csv(sibling)
    required = {"Metadatos", "Diccionario", "Conjunto de datos"}
    missing = sorted(required - files.keys())
    if missing:
        diagnostics.append("Faltan archivos locales del paquete: " + ", ".join(missing) + ".")
    for kind, data in files.items():
        if data.get("error"):
            diagnostics.append(f"{kind}: {data['error']}")
        else:
            required_empty = (_required_empty_values(data, schema)
                              if kind == "Conjunto de datos" else 0 if kind == "Diccionario" else data['empty'])
            data["required_empty"] = required_empty
            allowed_empty = max(0, data['empty'] - required_empty)
            empty_note = f"{required_empty} valores obligatorios vacíos"
            if allowed_empty:
                empty_note += f", {allowed_empty} vacíos estructurales permitidos"
            diagnostics.append(f"{kind}: {len(data['rows']) - 1} filas, {empty_note}, {data['ragged']} filas con ancho irregular.")
            if data.get("delimiter") != ",":
                diagnostics.append(f"{kind}: delimitado por «{data['delimiter']}», no por comas.")
            if data.get("wrong_extension"):
                diagnostics.append(f"{kind}: extensión «{data['extension']}» en lugar de .csv.")
    dates = [" ".join(row) for row in files.get("Metadatos", {}).get("rows", [])
             if row and "fecha" in row[0].lower()]
    if dates:
        diagnostics.append("Campos de fecha en metadatos: " + "; ".join(dates) + ".")
    cta = by_key["cta"]
    cta["observacion"] = " ".join(diagnostics) + " Verificar todos los campos de los tres archivos, las notas aclaratorias del diccionario y el campo fecha de metadatos (mes anterior al monitoreo). La fecha de carga local no acredita actualización."
    if missing or any(d.get("required_empty") or d.get("ragged") for d in files.values()):
        cta["sugerencia"] = 0.5
        cta["observacion"] += " Sugerencia 0,5 únicamente si se confirma publicación accesible e incompleta."
    readable = any(d.get("rows") for d in files.values())
    period = getattr(evidence, "period", None)
    evaluated_year = getattr(period, "year", None)
    # El mes seleccionado en el PNT es el mes de los datos. El monitoreo
    # corresponde al siguiente mes; no se resta un mes una segunda vez.
    expected = (evaluated_year, evidence.month)
    from .lotaip_automatic import parse_date
    metadata_dates = []
    for row in files.get("Metadatos", {}).get("rows", []):
        if row and "fecha" in normalize_text(row[0]):
            for cell in row[1:]:
                parsed = parse_date(cell)
                if parsed:
                    metadata_dates.append((parsed.year, parsed.month))
    sentinels = ABSENCE_MARKERS
    placeholders = {normalize_text(cell) for data in files.values() for row in data.get("rows", []) for cell in row
                    if normalize_text(cell) in sentinels}
    from core.lotaip_engine.verificables import justified_exception
    dictionary_rows = files.get("Diccionario", {}).get("rows", [])
    explained = True
    for kind in ("Conjunto de datos", "Metadatos"):
        content = files.get(kind, {}).get("rows", [])
        for row in content[1:] if kind == "Conjunto de datos" else content:
            for index, cell in enumerate(row):
                if absence_marker(cell):
                    field = content[0][index] if kind == "Conjunto de datos" and index < len(content[0]) else row[0]
                    explained = explained and justified_exception(dictionary_rows, field)
    complete = not missing and all(not d.get("error") and not d.get("required_empty") and not d.get("ragged") for d in files.values())
    if not readable:
        cta["sugerencia"] = None
    elif complete and metadata_dates and all(value == expected for value in metadata_dates) and explained:
        cta["sugerencia"] = 1
    elif not complete or not explained or (metadata_dates and expected[0] is not None and any(value != expected for value in metadata_dates)):
        cta["sugerencia"] = 0.5
    elif expected[0] is not None:
        # Publicada y legible, pero sin fecha de metadatos que acredite la
        # actualización: Tabla 1 la ubica en 0,5, nunca en 0 (no publicada).
        cta["sugerencia"] = 0.5
    else:
        cta["sugerencia"] = None
    cta["observacion"] += f" Comprobación local: paquete completo={complete}; fechas de metadatos coinciden con el período seleccionado={bool(metadata_dates) and all(value == expected for value in metadata_dates)}. Las excepciones NO APLICA/INFORMACIÓN NO DISPONIBLE requieren comprobar su nota aclaratoria."
    eta = by_key["eta"]
    valid_csv = not missing and all(not d.get("error") and d.get("delimiter") == "," and not d.get("ragged")
                                    and not d.get("wrong_extension") for d in files.values())
    eta["sugerencia"] = 1 if valid_csv else 0 if files else None
    eta["observacion"] = ("Los tres archivos locales son CSV estructurados delimitados por comas. Confirmar su publicación y acceso en el PNT."
                           if valid_csv else "No se ha verificado un paquete completo de CSV estructurados delimitados por comas. " + " ".join(diagnostics))
    by_key["rp"]["observacion"] = "Falta comprobar la fecha de registro en el PNT y el día límite (15 o siguiente laborable). No se utiliza uploaded_at ni la fecha de modificación del archivo como prueba."
    if by_key["verificables"]["aplica"]:
        data = files.get("Conjunto de datos", {})
        links = set(re.findall(r"https?://[^\s\";,]+", data.get("text", "")))
        by_key["verificables"]["observacion"] = f"Se detectaron {len(links)} enlaces en el conjunto de datos local. Revisar libre acceso, correspondencia y legibilidad. La presencia de una URL no demuestra su funcionamiento."
    if by_key["vigencia"]["aplica"]:
        by_key["vigencia"]["observacion"] = "Comprobar fechas de inicio y duración frente al período evaluado; si hay más de tres filas, revisar tres elegidas aleatoriamente y registrar cuáles (nota 3, p. 62)."
    if by_key["validez"]["aplica"]:
        by_key["validez"]["observacion"] = "Revisar las sumas de los importes de cada registro: " + by_key["validez"]["regla"]
    if check_online:
        from .lotaip_automatic import check_sums, check_validity, check_deadline, check_publication, fetch_public
        from core.lotaip_engine.verificables import check_package_links
        from django.utils import timezone
        import calendar
        from datetime import date
        import time
        request = fetch or fetch_public
        deadline = time.monotonic() + settings.LOTAIP_PACKAGE_TIMEOUT
        def bounded_fetch(url):
            if time.monotonic() > deadline:
                return {"status": None, "error": "Tiempo de comprobación agotado; se puede reintentar", "body": b""}
            return request(url)
        # Semilla estable por institución, período y formato: la muestra de
        # tres filas (nota 3) se repite idéntica en cada reevaluación.
        sample_seed = f"{evidence.university_id}:{evidence.period_id}:{evidence.month}:{getattr(evidence.indicator, 'code', number)}"
        report("Comprobando publicación", "Contrastando el paquete con la publicación oficial en el PNT.", 35)
        published_matches, source_notes = check_publication(evidence, siblings, bounded_fetch)
        # La fecha oficial del PNT debe consultarse antes de las descargas, el
        # OCR y la IA. Así conserva su presupuesto de red aunque los enlaces
        # verificables sean numerosos o contengan documentos pesados.
        report("Comprobando plazo", "Verificando la fecha oficial de publicación del literal.", 42)
        value, note = check_deadline(evidence, bounded_fetch)
        by_key["rp"].update(calificacion=value, sugerencia=value, observacion=note)
        by_key["cta"]["observacion"] = " ".join(diagnostics) + f" Comprobación automática: paquete completo={complete}; actualización del período={bool(metadata_dates) and all(value == expected for value in metadata_dates)}; excepciones documentadas={explained}."
        for key in ("cta", "eta"):
            row = by_key[key]
            row["calificacion"] = row["sugerencia"] if published_matches else 0 if published_matches is False else None
            row["observacion"] += (" Verificación automática: el PNT marca el numeral como publicado y su inventario oficial contiene las URLs de los archivos locales."
                                   if published_matches else " No se pudo acreditar coincidencia entre todo el paquete local y su publicación HTTP. " + source_notes)
        rows = files.get("Conjunto de datos", {}).get("rows", [])
        dictionary = files.get("Diccionario", {}).get("rows", [])
        if rows and dictionary:
            first = [normalize_text(cell) for cell in rows[0]]
            known = {name for name in ("decimo tercera remuneracion", "decima cuarta remuneracion",
                     "horas suplementarias y extraordinarias", "encargos y subrogaciones",
                     "total ingresos adicionales", "devengado", "saldo por devengar", "codificado")}
            # Los encabezados del conjunto son evidencia primaria. El diccionario
            # describe y valida columnas, pero nunca sustituye datos ni encabezados.
        if by_key["validez"]["aplica"]:
            value, note = check_sums(number, rows)
            if rows[1:] and explained and all(absence_marker(cell) for row in rows[1:] for cell in row):
                value, note = "SIN EVALUACIÓN", "NO APLICA con nota aclaratoria: no existen registros para validar importes."
            by_key["validez"].update(calificacion=value if published_matches else None, sugerencia=value, observacion=note)
        if by_key["vigencia"]["aplica"]:
            year = getattr(getattr(evidence, "period", None), "year", None)
            reference = date(year, evidence.month, calendar.monthrange(year, evidence.month)[1]) if year and evidence.month else None
            value, note = check_validity(rows, reference, sample_seed=sample_seed)
            dataset_sentinels = {absence_marker(cell) for row in rows[1:] for cell in row if absence_marker(cell)}
            if dataset_sentinels and explained and all(absence_marker(cell) for row in rows[1:] for cell in row if cell.strip()):
                value, note = "SIN EVALUACIÓN", "No existen registros sujetos a vigencia; el conjunto declara NO APLICA y el diccionario explica la causa."
            by_key["vigencia"].update(calificacion=value if published_matches else None, sugerencia=value, observacion=note)
        if by_key["verificables"]["aplica"]:
            report("Verificando enlaces", "Preparando descarga, extracción de texto y análisis de correspondencia.", 45)
            context = {"institucion": getattr(getattr(evidence, "university", None), "name", ""),
                       "numeral": evidence.indicator.code,
                       "requisito": getattr(evidence.indicator, "name", "") or str(number)}
            prior = next((c.get('evidencias', []) for c in (previous or {}).get('criterios', []) if c['id']=='verificables'), [])
            value, note, details = check_package_links(
                files, schema, context, bounded_fetch, previous=prior,
                progress_callback=progress_callback, ai_budget=ai_budget, sample_seed=sample_seed,
            )
            # La accesibilidad y correspondencia del enlace se comprueban de
            # forma directa; una falla independiente de la API del PNT no debe
            # convertir este criterio ya resuelto en PENDIENTE.
            by_key["verificables"].update(calificacion=value,
                sugerencia=value, observacion=note, evidencias=details)
        # Un reintento completa pendientes, no cambia criterios ya terminados.
        if previous and previous.get('version') == VERSION:
            for old in previous.get('criterios', []):
                if old.get('calificacion') is not None:
                    by_key[old['id']].update(deepcopy(old))
        for row in criteria:
            row["estado_verificacion"] = ("NO_APLICA" if not row["aplica"] else "VERIFICADO" if row["calificacion"] is not None
                                          else "PENDIENTE")
        checked_at = timezone.now().isoformat()
    else:
        checked_at = None
    report("Calculando calificación", "Consolidando los criterios CTA, ETA, RP y CI.", 90)
    return {"version": VERSION, "fuente": SOURCE, "criterios": criteria,
            "modo": "automatico" if check_online else "diagnostico_local", "verificado_en": checked_at,
            "unidad": f"{evidence.university_id}:{evidence.period_id}:{evidence.month}:{evidence.indicator_id}",
            "alcance": "Formato de difusión del artículo 19; evaluación del paquete de tres archivos.",
            "documentos_requeridos": sorted(required),
            "documentos_presentes": sorted(files), "documentos_faltantes": missing,
            "fecha_monitoreo": None, "revisado_por": None}


def review_rubric(rubric, payload, user_id, reviewed_at):
    """Validar antes de persistir; las sugerencias nunca se convierten solas en notas."""
    from datetime import date
    if not isinstance(payload, dict) or not isinstance(payload.get("criterios"), list):
        raise ValueError("Se requiere una lista de criterios.")
    try:
        date.fromisoformat(payload.get("fecha_monitoreo", ""))
    except (ValueError, TypeError):
        raise ValueError("Indique la fecha de monitoreo en formato AAAA-MM-DD.")
    updated = deepcopy(rubric)
    incoming = payload["criterios"]
    if any(not isinstance(c, dict) for c in incoming):
        raise ValueError("Criterios inválidos.")
    if len(incoming) != len(updated["criterios"]) or {c.get("id") for c in incoming} != {c["id"] for c in updated["criterios"]}:
        raise ValueError("Deben enviarse los seis criterios sin duplicados.")
    for criterion in updated["criterios"]:
        row = next(c for c in incoming if c["id"] == criterion["id"])
        value = row.get("calificacion")
        if not criterion["aplica"]:
            if value is not None:
                raise ValueError(f"{criterion['criterio']}: no aplica a este numeral.")
            continue
        if value is not None and (isinstance(value, bool) or value not in criterion["opciones"]):
            raise ValueError(f"Calificación inválida para {criterion['criterio']}.")
        observation = row.get("observacion")
        if not isinstance(observation, str) or not observation.strip() or len(observation) > 6000:
            raise ValueError("Cada criterio requiere una observación de hasta 6000 caracteres.")
        criterion.update(calificacion=value, observacion=observation.strip())
    updated.update(fecha_monitoreo=payload["fecha_monitoreo"], revisado_por=user_id, revisado_en=reviewed_at)
    return updated


LINK_DECISIONS = {
    "SI": "Revisión manual: el verificable es de libre acceso, corresponde a la información reportada y es legible.",
    "NO": "Revisión manual: el verificable no es de libre acceso, no corresponde a la información reportada o no es legible.",
}


def pending_links(rubric):
    """Comprobaciones de enlaces que el verificador automático dejó pendientes.

    Sólo cuando el criterio sigue pendiente: si otro enlace ya no cumple, la
    Tabla 6 da NO y revisar el resto no cambia la calificación.
    """
    criterion = next((c for c in rubric.get("criterios", []) if c["id"] == "verificables"), None)
    if not criterion or not criterion["aplica"] or criterion.get("calificacion") is not None:
        return []
    return [(index, item) for index, item in enumerate(criterion.get("evidencias", []))
            if item.get("status") == "PENDIENTE"]


def review_link(rubric, index, decision, observation, user_id, reviewed_at):
    """Resuelve un enlace pendiente y recalcula el estado de verificables (Tabla 6)."""
    from core.lotaip_engine.verificables import aggregate_link_statuses
    if decision not in LINK_DECISIONS:
        raise ValueError("La decisión debe ser SI o NO.")
    updated = deepcopy(rubric)
    criterion = next((c for c in updated.get("criterios", []) if c["id"] == "verificables"), None)
    items = criterion.get("evidencias", []) if criterion and criterion["aplica"] else []
    if not isinstance(index, int) or isinstance(index, bool) or not 0 <= index < len(items):
        raise ValueError("Enlace no encontrado en la rúbrica.")
    item = items[index]
    if item.get("status") != "PENDIENTE":
        raise ValueError("El enlace ya no está pendiente; vuelva a cargar la cola.")
    observation = (observation or "").strip() or LINK_DECISIONS[decision]
    if len(observation) > 2000:
        raise ValueError("La observación admite hasta 2000 caracteres.")
    item.update(status=decision, reason=observation,
                manual_review={"decision": decision, "observation": observation,
                               "reviewed_by": user_id, "reviewed_at": reviewed_at,
                               "automatic_status": "PENDIENTE", "automatic_reason": item.get("reason", "")})
    value = aggregate_link_statuses(row.get("status") for row in items)
    reviewed = sum(bool(row.get("manual_review")) for row in items)
    note = f" Revisión manual de enlaces: {reviewed} enlace(s) resueltos por un revisor; resultado={value or 'PENDIENTE'}."
    criterion.update(calificacion=value, sugerencia=value,
                     estado_verificacion="VERIFICADO" if value is not None else "PENDIENTE",
                     observacion=re.sub(r" Revisión manual de enlaces: .*$", "", criterion["observacion"], flags=re.S) + note)
    # Contrato v2 (``criteria``) que leen las vistas nuevas.
    if isinstance(updated.get("criteria"), dict) and "verificables" in updated["criteria"]:
        updated["criteria"]["verificables"].update(status=value or "PENDIENTE", score=None, reason=criterion["observacion"])
        updated["errores_tecnicos"] = [error for error in updated.get("errores_tecnicos", [])
                                       if value is None or error.get("criterion") != "verificables"]
    return updated


def summarize_rubrics(rubrics):
    """Promediar cada columna y luego CTA, ETA, RP y CI; excluir no aplicables.

    En v3, CI promedia comprobaciones cualitativas aplicables (Sí=1, No=0).
    NO APLICA con nota aclaratoria llega como SIN EVALUACIÓN (Tabla 6, nota 1)
    y se excluye del promedio. Sin CI, no hay SITA definitivo.
    """
    unique = {r["unidad"]: r for r in rubrics if r and r.get("criterios")}
    columns = {key: [] for key, *_ in DEFINITIONS}
    pending = 0
    for rubric in unique.values():
        for c in rubric["criterios"]:
            if not c["aplica"] or c["calificacion"] == "SIN EVALUACIÓN":
                continue
            value = c["calificacion"]
            if value is None:
                pending += 1
            else:
                columns[c["id"]].append(1 if value == "SI" else 0 if value == "NO" else value)
    means = {k: sum(v) / len(v) * 100 if v else None for k, v in columns.items()}
    qualitative = [means[k] for k in ("verificables", "vigencia", "validez") if means[k] is not None]
    components = {k.upper(): means[k] for k in ("cta", "eta", "rp")}
    quality_values = [value for key in ("verificables", "vigencia", "validez") for value in columns[key]]
    # v3: mismo promedio de comprobaciones aplicables en todas las salidas.
    is_v3 = any(r.get('version') == VERSION for r in unique.values())
    components["CI"] = (sum(quality_values) / len(quality_values) * 100 if quality_values else None) if is_v3 else (sum(qualitative) / len(qualitative) if qualitative else None)
    score = None
    if unique and pending == 0 and all(v is not None for v in components.values()):
        score = round(sum(components.values()) / 4, 2)
    available_components = [value for value in components.values() if value is not None]
    format_score = round(sum(available_components) / len(available_components), 2) if unique and pending == 0 and available_components else None
    automatic = {key: [] for key, *_ in DEFINITIONS}
    checked = unavailable = 0
    for rubric in unique.values():
        for c in rubric["criterios"]:
            if not c["aplica"]:
                continue
            value = c["calificacion"] if c["calificacion"] is not None else c.get("sugerencia")
            if value == "SIN EVALUACIÓN":
                continue
            if value is None:
                unavailable += 1
            else:
                checked += 1
                automatic[c["id"]].append(1 if value == "SI" else 0 if value == "NO" else value)
    auto_means = {k: sum(v) / len(v) * 100 for k, v in automatic.items() if v}
    auto_quality = [auto_means[k] for k in ("verificables", "vigencia", "validez") if k in auto_means]
    auto_components = [auto_means[k] for k in ("cta", "eta", "rp") if k in auto_means]
    if auto_quality:
        auto_values = [v for key in ("verificables", "vigencia", "validez") for v in automatic[key]]
        auto_components.append(sum(auto_values) / len(auto_values) * 100 if is_v3 else sum(auto_quality) / len(auto_quality))
    partial = round(sum(auto_components) / len(auto_components), 2) if auto_components else None
    return {"puntaje": score, "puntaje_formato": format_score, "componentes": components, "criterios_pendientes": pending,
            "resultado_automatico": {"puntaje": partial, "criterios_calculados": checked,
                "criterios_sin_datos": unavailable, "componentes_calculados": len(auto_components),
                "descripcion": "Resultado provisional de las comprobaciones disponibles; no es el SITA definitivo. Los criterios sin datos se excluyen de este promedio."},
            "formatos": len(unique), "formula": "SITA = (CTA + ETA + RP + CI) / 4",
            "alcance": "Formatos evaluados; no acredita cobertura de todas las obligaciones institucionales."}
