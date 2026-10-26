"""Coincidencia entre la evaluación internacional automática y una referencia manual.

La referencia es un CSV revisado por una persona (``docs/referencia-internacional``)
con el estado esperado de cada indicador y, en casos límite, un estado alternativo
también aceptable. Sirve para medir si un cambio del motor mejora o empeora la
evaluación, y para reportar su validez (porcentaje de acuerdo y kappa de Cohen).
"""
import csv
from collections import Counter

STATUSES = ('CUMPLE', 'PARCIAL', 'NO_CUMPLE', 'SIN_EVIDENCIA')


def load_reference(path):
    with open(path, newline='', encoding='utf-8-sig') as handle:
        rows = list(csv.DictReader(handle))
    reference = {}
    for row in rows:
        code = (row.get('codigo') or '').strip()
        expected = (row.get('estado_esperado') or '').strip().upper()
        if not code:
            continue
        if expected not in STATUSES:
            raise ValueError(f'{code}: estado_esperado inválido ({expected!r}).')
        alternatives = {
            value.strip().upper() for value in (row.get('tambien_valido') or '').split('|') if value.strip()
        }
        if not alternatives <= set(STATUSES):
            raise ValueError(f'{code}: tambien_valido inválido ({sorted(alternatives)}).')
        reference[code] = {
            'expected': expected,
            'alternatives': alternatives,
            'url': (row.get('url_evidencia') or '').strip(),
            'note': (row.get('nota') or '').strip(),
        }
    return reference


def cohen_kappa(pairs, categories=STATUSES):
    """Kappa de Cohen sin ponderar para pares (esperado, obtenido)."""
    total = len(pairs)
    if not total:
        return None
    observed = sum(expected == actual for expected, actual in pairs) / total
    expected_counts = Counter(expected for expected, _ in pairs)
    actual_counts = Counter(actual for _, actual in pairs)
    chance = sum(expected_counts[c] * actual_counts[c] for c in categories) / (total * total)
    if chance == 1:
        return 1.0 if observed == 1 else 0.0
    return (observed - chance) / (1 - chance)


def compare(reference, actual_statuses):
    """Compara la referencia con ``{código: estado}`` de la app.

    Un estado alternativo aceptado cuenta como acuerdo y, para el kappa, se
    registra como el estado esperado.
    """
    rows = []
    pairs = []
    for code, item in sorted(reference.items()):
        actual = actual_statuses.get(code) or 'PENDIENTE'
        accepted = actual == item['expected'] or actual in item['alternatives']
        rows.append({'code': code, 'expected': item['expected'], 'actual': actual, 'agrees': accepted})
        if actual in STATUSES:
            pairs.append((item['expected'], item['expected'] if accepted else actual))
    agreed = sum(row['agrees'] for row in rows)
    return {
        'rows': rows,
        'total': len(rows),
        'agreed': agreed,
        'agreement': agreed / len(rows) if rows else None,
        'kappa': cohen_kappa(pairs),
        'confusion': Counter((expected, actual) for expected, actual in pairs),
    }
