"""Motor LOTAIP independiente, versionado y sin dependencias del índice internacional."""

from .evaluator import evaluate_format, summarize_evaluations
from .rules import ENGINE_VERSION, LEGAL_SOURCE, NUMERAL_CONFIG

__all__ = ["ENGINE_VERSION", "LEGAL_SOURCE", "NUMERAL_CONFIG", "evaluate_format", "summarize_evaluations"]
