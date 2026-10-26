"""Configuración normativa central para el artículo 19 de la LOTAIP.

Los campos físicos se obtienen de ``IndicatorTemplate`` porque los formatos pueden
cambiar. Esta matriz define únicamente aplicabilidad normativa y evaluador especial.
"""
from dataclasses import dataclass
from .schemas import schema_summary

ENGINE_VERSION = "LOTAIP-v5-OCR-IA"
CONTENT_POLICY_VERSION = "document-content-only-v19-bot-challenge-entity-fullocr"
LEGAL_SOURCE = "Resolución 053-DPE-CGAJ-2024, Registro Oficial 633, 30-08-2024"
LEGAL_URL = "https://www.registroficial.gob.ec/registro-oficial-no-633/"

NAMES = {
    1: "Estructura orgánica, base legal, metas y objetivos", 2: "Directorio y distributivo del personal",
    3: "Remuneraciones e ingresos adicionales", 4: "Licencias y comisiones",
    5: "Servicios, formularios y trámites", 6: "Presupuesto institucional",
    7: "Auditorías internas y gubernamentales", 8: "Contratación pública",
    9: "Incumplimiento de contratos", 10: "Planes y programas",
    11: "Contratos de crédito", 12: "Rendición de cuentas", 13: "Viáticos e informes de trabajo",
    14: "Responsables de acceso a información", 15: "Contratos colectivos",
    16: "Información clasificada como reservada", 17: "Audiencias y reuniones",
    18: "Convenios nacionales e internacionales", 19: "Donativos oficiales y protocolares",
    20: "Registro de activos de información", 21: "Políticas públicas para grupos específicos",
    22: "Formularios y formatos de servicios", 23: "Acciones afirmativas",
    24: "Información relevante para derechos y ODS",
}

@dataclass(frozen=True)
class NumeralRule:
    number: int
    name: str
    verifiables: bool
    vigencia: bool = False
    validez: bool = False
    specialized_evaluator: str | None = None

    def as_dict(self):
        return {
            "number": self.number, "name": self.name,
            "criteria": {"cta": True, "eta": True, "rp": True,
                         "verificables": self.verifiables, "vigencia": self.vigencia,
                         "validez": self.validez},
            "specialized_evaluator": self.specialized_evaluator,
            "schema": schema_summary(self.number),
            "special_rules": ([self.specialized_evaluator] if self.specialized_evaluator else []),
        }

NUMERAL_CONFIG = {
    n: NumeralRule(
        n, NAMES[n], n not in {2, 3, 4, 6, 23}, n in {16, 18}, n in {3, 6},
        {3: "remuneraciones", 6: "presupuesto", 16: "reserva", 18: "convenios"}.get(n),
    ) for n in range(1, 25)
}

CRITERIA = {
    "cta": {"name": "Información completa y actualizada", "options": [0, .5, 1], "reference": "6.2.1, Tabla 1"},
    "eta": {"name": "Estructura de datos abiertos", "options": [0, 1], "reference": "6.2.2, Tabla 2"},
    "rp": {"name": "Registro dentro del plazo", "options": [0, 1], "reference": "6.2.3, Tabla 3"},
    "verificables": {"name": "Estado de verificables", "options": ["SI", "NO", "SIN EVALUACIÓN"], "reference": "7.1.1, Tabla 6; muestra reproducible de 3 filas (nota 3); todos deben cumplir; NO APLICA = SIN EVALUACIÓN"},
    "vigencia": {"name": "Vigencia de la información", "options": ["SI", "NO", "SIN EVALUACIÓN"], "reference": "7.1.2, Tablas 4 y 7"},
    "validez": {"name": "Validez de la información", "options": ["SI", "NO", "SIN EVALUACIÓN"], "reference": "7.1.3, Tablas 5 y 7"},
}

def numeral_rule(number):
    return NUMERAL_CONFIG.get(number)
