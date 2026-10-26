export function getLotaipDashboard(summary) {
  const result = summary?.lotaip;
  if (!result) return null;

  return {
    sita: result.sita,
    cta: result.cta,
    eta: result.eta,
    rp: result.rp,
    ci: result.ci,
    status: result.status,
    isProvisional: result.is_provisional,
    engineVersion: result.engine_version,
    formats: result.formats,
    sitaMin: result.sita_min,
    sitaMax: result.sita_max,
  };
}

export function formatLotaipPercent(value) {
  if (value == null) return '—';
  return `${Number(value).toLocaleString('es-EC', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} %`;
}

export function freshSummaryParams(periodId, month, refreshToken = Date.now()) {
  return {
    periodo_id: periodId,
    ...(month ? { month } : {}),
    _refresh: refreshToken,
  };
}
