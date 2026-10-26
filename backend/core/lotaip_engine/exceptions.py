class LotaipEngineError(Exception):
    """Error controlado del motor."""

class TechnicalVerificationError(LotaipEngineError):
    """La fuente no pudo comprobarse; nunca equivale a incumplimiento."""
