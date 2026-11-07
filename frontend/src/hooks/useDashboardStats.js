import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * Estadísticas del período elegido. Sin selección, el backend usa el período
 * con más universidades evaluadas por completo.
 */
export default function useDashboardStats(emptyStats) {
  const [periodId, setPeriodId] = useState('');
  const [stats, setStats] = useState(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback((options = {}) => {
    setLoading(true);
    setError(null);
    return api.stats({ ...(periodId ? { periodo_id: periodId } : {}), ...options })
      .then((res) => setStats({ ...emptyStats, ...res.data }))
      .catch((err) => {
        setStats(emptyStats);
        setError(err.response?.data?.error || 'No se pudo conectar con el servidor.');
      })
      .finally(() => setLoading(false));
  }, [emptyStats, periodId]);

  useEffect(() => {
    let cancelled = false;
    api.stats(periodId ? { periodo_id: periodId } : {})
      .then((res) => { if (!cancelled) setStats({ ...emptyStats, ...res.data }); })
      .catch((err) => {
        if (cancelled) return;
        setStats(emptyStats);
        setError(err.response?.data?.error || 'No se pudo conectar con el servidor.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [emptyStats, periodId]);

  const selectPeriod = (value) => {
    setLoading(true);
    setError(null);
    setPeriodId(value);
  };

  return { stats, loading, error, periodId: periodId || String(stats.period?.id || ''), selectPeriod, reload: load };
}
