import { Fragment, useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import { validationApi } from '../../api/validation';
import { useAuth } from '../../context/AuthContext';
import LotaipCriteriaTable from '../../components/LotaipCriteriaTable';
import LotaipLinkReviewQueue from '../../components/LotaipLinkReviewQueue';
import { formatLotaipPercent, getLotaipDashboard } from '../../utils/lotaipDashboard';
import { groupLotaipPackages, pendingLotaipPackages } from '../../utils/lotaipPackages';

/* ── Mapa de estado → badge ───────────────────────────────────────── */
const STATUS_CONFIG = {
  PENDIENTE_REVISION: { label: 'Pendiente de comprobación', badge: 'badge-warning', icon: '◷', color: 'var(--warning)' },
  NO_VERIFICABLE:     { label: 'No verificable automáticamente', badge: 'badge-warning', icon: '◷', color: 'var(--warning)' },
  CUMPLE:              { label: 'Cumple',              badge: 'badge-success', icon: '✅', color: 'var(--success)' },
  CUMPLE_PARCIALMENTE: { label: 'Cumple parcialmente', badge: 'badge-warning', icon: '⚠️', color: 'var(--warning)' },
  INCOMPLETO:          { label: 'Incompleto',          badge: 'badge-info',    icon: '📋', color: 'var(--info)' },
  NO_CUMPLE:           { label: 'No cumple',           badge: 'badge-danger',  icon: '❌', color: 'var(--danger)' },
  NO_PRESENTADO:       { label: 'No presentado',       badge: 'badge-subtle',  icon: '🔲', color: 'var(--text-subtle)' },
  ERROR_PROCESAMIENTO: { label: 'Error',               badge: 'badge-danger',  icon: '⛔', color: 'var(--danger)' },
};

const INTEGRATED_STATUS = {
  CUMPLE: { label: 'Cumple', badge: 'badge-success' },
  PARCIAL: { label: 'Cumple parcialmente', badge: 'badge-warning' },
  NO_CUMPLE: { label: 'No cumple', badge: 'badge-danger' },
  NO_APLICA: { label: 'No aplica', badge: 'badge-subtle' },
  SIN_EVIDENCIA: { label: 'Sin evidencia verificable', badge: 'badge-warning' },
  PENDIENTE: { label: 'Pendiente', badge: 'badge-warning' },
  ERROR_TECNICO: { label: 'Error técnico', badge: 'badge-danger' },
};

function ScoreBar({ score, max = 100, color }) {
  if (score == null) return <span>No verificable con los datos disponibles</span>;
  const pct = Math.min(100, Math.round((score / max) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color || 'var(--primary)', transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: '0.8125rem', fontWeight: 700, minWidth: 36, textAlign: 'right', color: color || 'var(--text)' }}>{score}</span>
    </div>
  );
}

function TransparencyGauge({ value = 0, label = 'Indice' }) {
  if (value == null) return <div style={{ textAlign: 'center' }}><strong>{label} pendiente</strong><p>Completa la evaluación correspondiente para obtener esta calificación.</p></div>;
  const r = 58, stroke = 8, c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 90 ? 'var(--success)' : value >= 70 ? 'var(--warning)' : value >= 40 ? 'var(--info)' : 'var(--danger)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={140} height={140} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={70} cy={70} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={70} cy={70} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }} />
      </svg>
      <div style={{ position: 'absolute', marginTop: 42, textAlign: 'center' }}>
        <div style={{ fontSize: '1.75rem', fontWeight: 800, color }}>{formatLotaipPercent(value)}</div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--text-subtle)' }}>{label}</div>
      </div>
    </div>
  );
}

function EvaluationProgressPanel({ scope, progress, activeRunId, stopping, onStop }) {
  const scopeLabel = scope === 'international' ? 'Evaluación internacional' : 'Evaluación nacional LOTAIP';
  const pct = Math.max(0, Math.min(100, Number(progress.pct || 0)));
  return (
    <div className="card evaluation-progress-card" style={{ marginBottom: 16 }} aria-live="polite" aria-busy="true">
      <div className="evaluation-progress-heading" style={{ justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="spinner evaluation-progress-spinner" aria-hidden="true" />
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{scopeLabel}</div>
            <div className="evaluation-progress-phase">{progress.phase || 'Procesando evaluación'}</div>
            <div className="evaluation-progress-message">{progress.msg}</div>
          </div>
        </div>
        <button className="btn btn-danger" onClick={onStop} disabled={!activeRunId || stopping}
          title={activeRunId ? 'Detiene esta evaluación de forma segura' : 'Esperando el identificador de la ejecución'}>
          {stopping ? '⏳ Deteniendo...' : '⏹ Detener evaluación'}
        </button>
      </div>
      <div className="progress-bar" style={{ height: 8 }}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="evaluation-progress-meta">
        <span>{progress.detail || 'La evaluación continúa; este proceso puede tardar varios minutos.'}</span>
        <strong>{Math.round(pct)}%</strong>
      </div>
      {progress.activity?.length > 0 && (
        <div className="evaluation-activity" aria-label={`Subprocesos de ${scopeLabel}`}>
          {progress.activity.map((item, index) => {
            const active = index === progress.activity.length - 1;
            return (
              <div className={`evaluation-activity-item${active ? ' active' : ''}`} key={`${item.phase}-${item.detail}-${index}`}>
                <span className={active ? 'evaluation-activity-dot active' : 'evaluation-activity-dot'} aria-hidden="true" />
                <div>
                  <strong>{item.phase}</strong>
                  {item.detail && <span>{item.detail}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ValidationPage({ readOnly = false }) {
  const { user } = useAuth();
  const lockUniversitySelect = false;
  const [universities, setUniversities] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [selectedUniv, setSelectedUniv] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationScope, setValidationScope] = useState(null);
  const [activeRunId, setActiveRunId] = useState(null);
  const [stopping, setStopping] = useState(false);
  const validationController = useRef(null);
  const [progress, setProgress] = useState({ pct: 0, msg: '', phase: '', detail: '', activity: [] });
  const [summary, setSummary] = useState(null);
  const [results, setResults] = useState([]);
  const [numerals, setNumerals] = useState([]);
  const [expandedRow, setExpandedRow] = useState(null);
  const [activeTab, setActiveTab] = useState('lotaip');
  const [expandedInternationalFolders, setExpandedInternationalFolders] = useState({});
  const [retryingIndicator, setRetryingIndicator] = useState(null);
  const [clearingDimension, setClearingDimension] = useState(null);
  const [error, setError] = useState(null);
  const [documentCount, setDocumentCount] = useState(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const lotaip = getLotaipDashboard(summary);

  const MONTHS = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ];

  // Load universities and periods
  useEffect(() => {
    api.universities.list().then(r => {
      setUniversities(r.data || []);
    }).catch(() => {});

    api.evidences.list().then(r => {
      const periodMap = {};
      r.data.forEach(ev => {
        if (ev.period_id && ev.year) {
          periodMap[ev.period_id] = { id: ev.period_id, year: ev.year };
        }
      });
      setPeriods(Object.values(periodMap).sort((a, b) => b.year - a.year));
    }).catch(() => {});
  }, []);


  // Load existing results when university/period/month change
  useEffect(() => {
    if (!selectedUniv || !selectedPeriod) {
      setSummary(null);
      setResults([]);
      return;
    }
    loadResults();
  }, [selectedUniv, selectedPeriod, selectedMonth]);

  useEffect(() => {
    if (!selectedUniv || !selectedPeriod) {
      setDocumentCount(null);
      return;
    }

    let cancelled = false;
    setDocumentsLoading(true);
    const params = { university_id: selectedUniv, periodo_id: selectedPeriod };
    if (selectedMonth) params.month = selectedMonth;

    api.evidences.list(params)
      .then((res) => {
        if (cancelled) return;
        const payload = res.data;
        setDocumentCount(Array.isArray(payload) ? payload.length : Number(payload?.count || payload?.results?.length || 0));
      })
      .catch(() => {
        if (!cancelled) setDocumentCount(0);
      })
      .finally(() => {
        if (!cancelled) setDocumentsLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedUniv, selectedPeriod, selectedMonth]);

  const loadResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await validationApi.getSummary(selectedUniv, selectedPeriod, selectedMonth);
      setSummary(res.data.summary);
      setResults(res.data.results || []);
      setNumerals(res.data.numerals || []);
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudieron cargar las evaluaciones.');
      setSummary(null);
      setResults([]);
      setNumerals([]);
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async (scope) => {
    if (!selectedUniv || !selectedPeriod) return;
    if (scope === 'lotaip' && documentCount === 0) {
      setError('No hay documentos para la universidad, periodo o mes seleccionado. No se puede realizar la evaluacion.');
      return;
    }
    setActiveTab(scope === 'international' ? 'international' : 'lotaip');
    setValidating(true);
    setValidationScope(scope);
    setActiveRunId(null);
    setStopping(false);
    validationController.current = new AbortController();
    setProgress({
      pct: 0,
      msg: scope === 'international' ? 'Iniciando evaluación internacional...' : 'Iniciando evaluación LOTAIP...',
      phase: scope === 'international' ? 'Preparando búsqueda web' : 'Preparando evaluación LOTAIP',
      detail: scope === 'international' ? 'Agrupando indicadores por dimensión.' : 'Creando la ejecución y organizando los documentos seleccionados.',
      activity: [],
    });
    setError(null);
    let attachedToExistingRun = false;

    try {
      const final = await validationApi.validateAllStream(selectedUniv, selectedPeriod, selectedMonth, (data) => {
        if (data.status === 'run') {
          setActiveRunId(data.run_id);
        }
        if (data.status === 'progress') {
          setProgress((current) => {
            const phase = data.phase || current.phase || 'Procesando evaluación';
            const detail = data.detail || current.detail || '';
            const nextActivity = [...(current.activity || [])];
            const last = nextActivity[nextActivity.length - 1];
            if (!last || last.phase !== phase || last.detail !== detail) {
              nextActivity.push({ phase, detail });
            }
            return {
              pct: data.pct ?? current.pct,
              msg: data.msg || current.msg,
              phase,
              detail,
              activity: nextActivity.slice(-6),
            };
          });
        }
        if (data.status === 'cancelled') {
          setProgress((current) => ({ ...current, msg: '⏹ Evaluación detenida' }));
        }
      }, { signal: validationController.current.signal, scope });
      if (final?.status === 'cancelled') {
        setProgress((current) => ({ ...current, msg: '⏹ Evaluación detenida' }));
        return;
      }
      setProgress({ pct: 100, msg: scope === 'international' ? '✅ Evaluación internacional completada' : '✅ Evaluación LOTAIP completada', phase: 'Completada', detail: '', activity: [] });
      await loadResults();
    } catch (e) {
      if (e.name !== 'AbortError') {
        if (e.status === 409 && e.runId) {
          attachedToExistingRun = true;
          setActiveRunId(e.runId);
          setProgress({
            pct: 0,
            msg: `Ejecución activa #${e.runId}`,
            phase: 'Evaluación existente en proceso',
            detail: 'Puedes esperar a que termine o detenerla para iniciar una evaluación nueva.',
            activity: [{
              phase: 'Ejecución recuperada',
              detail: e.startedAt ? `Iniciada: ${new Date(e.startedAt).toLocaleString()}` : 'La hora de inicio no está disponible.',
            }],
          });
          setError(`${e.message} Usa “Detener evaluación” si la ejecución anterior ya no continúa.`);
        } else {
          setError(e.message || 'Error durante la validación');
        }
      }
    } finally {
      if (!attachedToExistingRun) {
        setValidating(false);
        setActiveRunId(null);
        setStopping(false);
        setValidationScope(null);
        validationController.current = null;
      }
    }
  };

  const handleStopValidation = async () => {
    if (!activeRunId || stopping) return;
    setStopping(true);
    setError(null);
    setProgress((current) => ({ ...current, msg: 'Deteniendo evaluación...' }));
    try {
      await validationApi.cancelRun(activeRunId);
      setProgress((current) => ({ ...current, msg: '⏹ Evaluación detenida' }));
      validationController.current?.abort();
      setValidating(false);
      setActiveRunId(null);
      setStopping(false);
      setValidationScope(null);
      validationController.current = null;
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo detener la evaluación.');
      setStopping(false);
    }
  };

  const handleRetryInternational = async (indicatorCode) => {
    if (retryingIndicator || !selectedUniv || !selectedPeriod) return;
    setRetryingIndicator(indicatorCode);
    setError(null);
    try {
      await validationApi.retryInternationalIndicator(
        selectedUniv, indicatorCode, selectedPeriod, selectedMonth,
      );
      await loadResults();
    } catch (e) {
      setError(e.response?.data?.error || `No se pudo reevaluar ${indicatorCode}.`);
    } finally {
      setRetryingIndicator(null);
    }
  };

  const handleClearInternationalCache = async (dimensionCode) => {
    if (clearingDimension || !selectedUniv || !selectedPeriod) return;
    setClearingDimension(dimensionCode);
    setError(null);
    try {
      await validationApi.clearInternationalDimensionCache(
        selectedUniv, dimensionCode, selectedPeriod, selectedMonth,
      );
      await loadResults();
    } catch (e) {
      setError(e.response?.data?.error || `No se pudo invalidar la caché de ${dimensionCode}.`);
    } finally {
      setClearingDimension(null);
    }
  };

  const handleValidateOne = async (evidenceId) => {
    try {
      await validationApi.validateDocument(evidenceId);
      await loadResults();
    } catch (e) {
      setError(e.response?.data?.message || e.response?.data?.error || 'Error al validar documento');
    }
  };

  const handleRetryPending = async () => {
    const pending = pendingLotaipPackages(results);
    if (validating || !pending.length) return;
    setValidating(true);
    setError(null);
    let failures = 0;
    try {
      for (const [index, result] of pending.entries()) {
        setProgress({ pct: Math.round(index / pending.length * 100),
          msg: `Recalculando pendientes ${index + 1}/${pending.length}: ${result.literal}`,
          phase: 'Reintentando comprobaciones pendientes',
          detail: 'Volviendo a consultar enlaces, extracción e IA para este literal.',
          activity: [],
        });
        try {
          await validationApi.retryPending(result.evidence_id);
        } catch {
          failures += 1;
        }
      }
      await loadResults();
      setProgress({ pct: 100, msg: 'Reintento finalizado. Los casos no resueltos permanecen pendientes.',
        phase: 'Reintento finalizado', detail: '', activity: [] });
      if (failures) setError(`No se pudo completar el reintento de ${failures} literal(es). Puedes volver a intentarlo.`);
    } finally {
      setValidating(false);
    }
  };

  const getStatusConfig = (status) => STATUS_CONFIG[status] || STATUS_CONFIG.NO_PRESENTADO;
  const getScoreColor = (score) => score >= 90 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : score >= 40 ? 'var(--info)' : 'var(--danger)';
  const getObservationConfig = (observation = '') => {
    const text = String(observation);
    if (text.startsWith('✅')) return { label: 'Correcto', color: 'var(--success)', bg: 'var(--success-subtle)' };
    if (text.startsWith('⚠️') || text.startsWith('⚠')) return { label: 'Revisar', color: 'var(--warning)', bg: 'var(--warning-subtle)' };
    if (text.startsWith('❌')) return { label: 'Falta', color: 'var(--danger)', bg: 'var(--danger-subtle)' };
    if (text.startsWith('📋')) return { label: 'Detalle', color: 'var(--info)', bg: 'var(--info-subtle)' };
    return { label: 'Info', color: 'var(--primary)', bg: 'var(--primary-subtle)' };
  };
  const cleanObservation = (observation = '') =>
    String(observation).replace(/^(✅|⚠️|⚠|❌|📋)\s*/u, '');
  const getDocumentKind = (documento = '') => {
    const lower = documento.toLowerCase();
    if (lower.includes('conjunto')) return 'Conjunto de datos';
    if (lower.includes('metadato')) return 'Metadatos';
    if (lower.includes('diccionario')) return 'Diccionario';
    return 'Documento';
  };
  const toggleInternationalFolder = (literal) => {
    setExpandedInternationalFolders((prev) => ({
      ...prev,
      [literal]: !(prev[literal] ?? true),
    }));
  };
  const lotaipPackages = groupLotaipPackages(results);
  const pendingPackages = pendingLotaipPackages(results);
  const integrated = summary?.integrated || null;
  const componentScores = integrated?.component_scores || {};
  const nationalComponent = componentScores.national || null;
  const internationalComponent = componentScores.international || null;
  const webIndicators = (integrated?.indicators || []).filter((indicator) => indicator.classification !== 'NACIONAL');
  const internationalGroups = Object.values(
    webIndicators.reduce((acc, indicator) => {
      const key = indicator.dimension || 'SIN_DIMENSION';
      if (!acc[key]) {
        acc[key] = {
          code: key,
          name: indicator.dimension_name,
          indicators: [],
        };
      }
      acc[key].indicators.push(indicator);
      return acc;
    }, {})
  );

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>🔍 Evaluación de transparencia</h1>
          <p>{readOnly ? 'Consulta separada de resultados nacionales e internacionales' : 'Evalúa por separado LOTAIP y los complementos internacionales antes de calcular el ITI'}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="search-bar">
        <select className="form-input" style={{ maxWidth: 280 }}
          value={selectedUniv} onChange={e => setSelectedUniv(e.target.value)} disabled={lockUniversitySelect || validating}>
          <option value="">Seleccionar universidad...</option>
          {universities.map(u => (
            <option key={u.id} value={u.id}>{u.name} — {u.full_name}</option>
          ))}
        </select>
        <select className="form-input" style={{ maxWidth: 200 }}
          value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} disabled={validating}>
          <option value="">Seleccionar período...</option>
          {periods.map(p => (
            <option key={p.id} value={p.id}>{p.year}</option>
          ))}
        </select>
        <select className="form-input" style={{ maxWidth: 200 }}
          value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} disabled={validating}>
          <option value="">Todos los meses</option>
          {MONTHS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
        {selectedUniv && selectedPeriod && (
          <span className="tag" style={{ alignSelf: 'center' }}>
            {documentsLoading ? 'Verificando documentos...' : `${documentCount || 0} documentos disponibles`}
          </span>
        )}
        {results.length > 0 && (
          <button className="btn btn-secondary" onClick={loadResults} disabled={loading}>
            🔄 Actualizar
          </button>
        )}
      </div>


      {activeTab === 'lotaip' && selectedUniv && selectedPeriod && !documentsLoading && documentCount === 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 24, padding: '12px 16px', borderRadius: 'var(--radius)' }}>
          No hay documentos para la universidad, periodo o mes seleccionado. No se puede realizar la evaluacion.
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 24, padding: '12px 16px', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius)', color: 'var(--danger)' }}>
          ⚠️ {error}
        </div>
      )}

      {/* No selection state */}
      {!selectedUniv || !selectedPeriod ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🏛️</div>
            <h4>Selecciona una universidad y período</h4>
            <p>Elige una universidad y un período de evaluación para ver o ejecutar la validación de documentos LOTAIP.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon" style={{ animation: 'spin 1s linear infinite' }}>⏳</div>
            <h4>Cargando resultados...</h4>
          </div>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 24 }}>
              {/* Calificacion oficial del Motor LOTAIP */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', paddingTop: 32, paddingBottom: 32 }}>
                <TransparencyGauge value={lotaip?.sita ?? null} label="SITA LOTAIP" />
                {lotaip && <>
                  <div className={lotaip.isProvisional ? 'badge badge-warning' : 'badge badge-success'} style={{ marginTop: 58 }}>{lotaip.status}</div>
                  <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Motor: {lotaip.engineVersion}</div>
                  <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 16 }}>
                    {[['CTA', lotaip.cta], ['ETA', lotaip.eta], ['RP', lotaip.rp], ['CI', lotaip.ci]].map(([label, value]) => (
                      <div key={label} style={{ padding: '8px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                        <strong>{label}</strong> {formatLotaipPercent(value)}{label === 'CI' && lotaip.isProvisional ? ' — PROVISIONAL' : ''}
                      </div>
                    ))}
                  </div>
                  {lotaip.isProvisional && <p style={{ textAlign: 'center', fontSize: '0.8125rem', marginBottom: 0 }}>Resultado histórico provisional. Ejecuta nuevamente la evaluación automática.</p>}
                  {lotaip.sitaMin != null && lotaip.sitaMax != null && <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Rango provisional: {formatLotaipPercent(lotaip.sitaMin)} – {formatLotaipPercent(lotaip.sitaMax)}</div>}
                </>}
                <div style={{ marginTop: 20, width: '100%', display: 'grid', gap: 8 }}>
                  <div style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    {results.length} documentos disponibles · {lotaip?.formats ?? summary.sita?.formatos ?? 0} formatos
                  </div>
                  {nationalComponent?.score != null && <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Componente nacional normalizado del ITI: {Number(nationalComponent.score).toFixed(2)}%</div>}
                </div>
              </div>

              <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', paddingTop: 32, paddingBottom: 32 }}>
                <TransparencyGauge value={internationalComponent?.score ?? null} label="Componente internacional" />
                <div className={internationalComponent?.is_provisional ? 'badge badge-warning' : 'badge badge-success'} style={{ marginTop: internationalComponent?.score == null ? 18 : 58 }}>
                  {internationalComponent?.is_provisional ? 'PENDIENTE' : 'DEFINITIVO'}
                </div>
                <div style={{ marginTop: 12, textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {internationalComponent?.resolved || 0}/{internationalComponent?.total || 34} indicadores internacionales resueltos
                </div>
                {integrated?.international_year && <div style={{ marginTop: 4, textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Evaluación anual {integrated.international_year}</div>}
                {!!internationalComponent?.technical_errors && <div style={{ marginTop: 6, color: 'var(--danger)', fontSize: '0.75rem' }}>{internationalComponent.technical_errors} errores técnicos</div>}
                {!!internationalComponent?.no_evidence && <div style={{ marginTop: 6, color: 'var(--warning)', fontSize: '0.75rem' }}>{internationalComponent.no_evidence} sin evidencia publicada (puntúan 0 en la nota)</div>}
              </div>

              <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', paddingTop: 32, paddingBottom: 32 }}>
                <TransparencyGauge value={integrated?.index_percent ?? null} label="Índice final ITI" />
                <div className={integrated?.is_provisional ? 'badge badge-warning' : 'badge badge-success'} style={{ marginTop: integrated?.index_percent == null ? 18 : 58 }}>
                  {integrated?.is_provisional ? 'ESPERANDO AMBAS EVALUACIONES' : 'ITI DEFINITIVO'}
                </div>
                <div style={{ marginTop: 12, textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {integrated?.coverage?.resolved || 0}/{integrated?.coverage?.total || 58} indicadores totales resueltos
                </div>
              </div>

              {/* Counters */}
              <div className="card" style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: 4 }}>📄 Estado de documentos</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>Estadísticas documentales; no modifican el SITA LOTAIP.</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Cumple', val: summary.indicators_compliant, color: 'var(--success)', bg: 'var(--success-subtle)' },
                    { label: 'Parcial', val: summary.indicators_partial, color: 'var(--warning)', bg: 'var(--warning-subtle)' },
                    { label: 'Incompleto', val: summary.indicators_incomplete, color: 'var(--info)', bg: 'var(--info-subtle)' },
                    { label: 'No cumple', val: summary.indicators_non_compliant, color: 'var(--danger)', bg: 'var(--danger-subtle)' },
                    { label: 'Con datos no verificables', val: results.filter((r) => ['PENDIENTE_REVISION', 'NO_VERIFICABLE'].includes(r.estado_cumplimiento)).length, color: 'var(--warning)', bg: 'var(--warning-subtle)' },
                    { label: 'No presentado', val: summary.indicators_not_presented, color: 'var(--text-subtle)', bg: 'var(--bg-tertiary)' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '14px 16px', borderRadius: 'var(--radius)', background: item.bg, border: `1px solid ${item.color}22`, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: item.color }}>{item.val}</div>
                      <div style={{ fontSize: '0.75rem', color: item.color, fontWeight: 500 }}>{item.label}</div>
                    </div>
                  ))}
                </div>

                {/* General observations */}
                {summary.general_observations?.length > 0 && (
                  <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Observaciones generales:</div>
                    {summary.general_observations.map((o, i) => (
                      <div key={i} style={{ fontSize: '0.8125rem', color: 'var(--text)', marginBottom: 4 }}>{o}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedUniv && selectedPeriod && (
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'lotaip' ? 'active' : ''}`}
                onClick={() => { setActiveTab('lotaip'); setExpandedRow(null); }}
              >
                Nacionales · LOTAIP
              </button>
              <button
                className={`tab ${activeTab === 'international' ? 'active' : ''}`}
                onClick={() => { setActiveTab('international'); setExpandedRow(null); }}
              >
                Internacionales
              </button>
            </div>
          )}

          {!readOnly && activeTab === 'lotaip' && (
            <Fragment>
              <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>Evaluación nacional LOTAIP</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>Evalúa únicamente los documentos y criterios nacionales; no consume créditos de búsqueda internacional.</div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" onClick={handleRetryPending}
                    disabled={!selectedUniv || !selectedPeriod || validating || loading || documentsLoading || !pendingPackages.length}>
                    Actualizar pendientes ({pendingPackages.length})
                  </button>
                  <button className="btn btn-primary" onClick={() => handleValidate('lotaip')}
                    disabled={!selectedUniv || !selectedPeriod || validating || documentsLoading || documentCount === 0}>
                    {validating && validationScope === 'lotaip' ? '⏳ Evaluando LOTAIP...' : '📄 Evaluar solo LOTAIP'}
                  </button>
                </div>
              </div>
              {validating && validationScope === 'lotaip' && <EvaluationProgressPanel
                scope="lotaip" progress={progress} activeRunId={activeRunId}
                stopping={stopping} onStop={handleStopValidation}
              />}
              {!validating && [1, 4].includes(Number(user?.role_id)) && <LotaipLinkReviewQueue
                universityId={selectedUniv} periodId={selectedPeriod} month={selectedMonth}
                refreshKey={results} onDecided={loadResults}
              />}
            </Fragment>
          )}

          {!readOnly && activeTab === 'international' && (
            <Fragment>
              <div className="card" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>Evaluación internacional anual{integrated?.international_year ? ` ${integrated.international_year}` : ''}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>Evalúa una vez por año los 22 complementos mixtos y 12 indicadores internacionales mediante evidencia web verificable. El resultado se aplica a todos los meses del año.</div>
                </div>
                <button className="btn btn-primary" onClick={() => handleValidate('international')}
                  disabled={!selectedUniv || !selectedPeriod || validating}>
                  {validating && validationScope === 'international' ? '⏳ Evaluando internacionales...' : '🌐 Evaluar solo internacionales'}
                </button>
              </div>
              {validating && validationScope === 'international' && <EvaluationProgressPanel
                scope="international" progress={progress} activeRunId={activeRunId}
                stopping={stopping} onStop={handleStopValidation}
              />}
            </Fragment>
          )}

          {/* Results Table */}
          {results.length === 0 && activeTab === 'lotaip' ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">📄</div>
                <h4>Sin resultados nacionales</h4>
                <p>{readOnly ? 'No hay resultados LOTAIP para la selección actual.' : 'Haz clic en “Evaluar solo LOTAIP” para ejecutar la evaluación nacional.'}</p>
              </div>
            </div>
          ) : results.length > 0 && activeTab === 'lotaip' && (
            <>
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>Cobertura de los 24 numerales</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
                {numerals.map((item) => <div key={item.number} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                  <strong>{item.number}. {item.name}</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: 4 }}>
                    {item.formats.length ? `${item.formats.length} archivo(s) · evaluado` : 'Sin formato evaluado para este período'}
                  </div>
                </div>)}
              </div>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>📋 Detalle por Literal LOTAIP</span>
                <span className="tag">{lotaipPackages.length} paquetes evaluados</span>
              </div>
              <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Literal</th>
                      <th>Requisito</th>
                      <th>Documentos del literal</th>
                      <th>Formato</th>
                      <th>Período</th>
                      <th>SITA del literal</th>
                      <th>Estado</th>
                      <th style={{ display: readOnly ? 'none' : undefined }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotaipPackages.map((r, idx) => {
                      const sc = getStatusConfig(r.estado_cumplimiento);
                      const isExpanded = expandedRow === idx;

                      return (
                        <Fragment key={r.packageKey}>
                          <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => setExpandedRow(isExpanded ? null : idx)}>
                            <td>
                              <span style={{ fontWeight: 700, color: 'var(--primary-light)' }}>{r.literal}</span>
                            </td>
                            <td>
                              <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                                {r.literal_name}
                              </div>
                            </td>
                            <td>
                              <div style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                                {r.rubrica_lotaip?.documentos_presentes?.join(', ') || r.documents.map(d => getDocumentKind(d.documento)).join(', ')}
                              </div>
                            </td>
                            <td><span className="tag">{[...new Set(r.documents.map(d => d.file_type))].join(', ')}</span></td>
                            <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{r.periodo}</td>
                            <td>
                              <ScoreBar score={r.puntaje_total ?? r.sita?.resultado_automatico?.puntaje} color={getScoreColor(r.puntaje_total ?? r.sita?.resultado_automatico?.puntaje)} />
                              {r.puntaje_total == null && r.sita?.resultado_automatico?.puntaje != null && <small>Automático provisional</small>}
                            </td>
                            <td>
                              <span className={`badge ${sc.badge}`}>{r.requiere_revalidacion ? 'Histórica: revalidar' : r.puntaje_total == null && r.sita?.resultado_automatico?.puntaje != null ? 'Evaluada · resultado parcial' : `${sc.icon} ${sc.label}`}</span>
                            </td>
                            <td style={{ display: readOnly ? 'none' : undefined }}>
                              <button className="btn btn-sm btn-secondary" style={{ display: readOnly ? 'none' : undefined }} onClick={(e) => { e.stopPropagation(); handleValidateOne(r.evidence_id); }}
                                title="Consultar o evaluar el paquete completo del literal">
                                🔄
                              </button>
                            </td>
                          </tr>
                          {/* Expanded detail row */}
                          {isExpanded && (
                            <tr key={`detail-${idx}`}>
                              <td colSpan={8} style={{ padding: 0, background: 'var(--bg-tertiary)' }}>
                                <div style={{ padding: '16px 20px' }}>
                                  <p>Una sola nota SITA para el literal y mes. El diccionario se usa únicamente para interpretar variables y notas aclaratorias; no recibe una evaluación propia.</p>
                                  <ul>{r.documents.map(d => <li key={d.evidence_id}>{d.documento}</li>)}</ul>
                                  {!!r.rubrica_lotaip?.documentos_faltantes?.length && <p>Faltan: {r.rubrica_lotaip.documentos_faltantes.join(', ')}.</p>}
                                  <LotaipCriteriaTable result={r} canReview={[1, 4].includes(Number(user?.role_id))} onSaved={loadResults} />

                                  {/* Observations */}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                                    <div>
                                      <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--text)' }}>
                                        Observaciones
                                      </div>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                                        Hallazgos de la validacion automatica
                                      </div>
                                    </div>
                                    <span className="tag">{(r.observaciones || []).length} registros</span>
                                  </div>
                                  <div style={{ display: 'grid', gap: 8 }}>
                                    {(r.observaciones || []).map((obs, oi) => {
                                      const config = getObservationConfig(obs);
                                      return (
                                        <div key={oi} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 12, alignItems: 'start', padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `4px solid ${config.color}`, borderRadius: 8 }}>
                                          <span style={{ justifySelf: 'start', padding: '3px 9px', borderRadius: 999, background: config.bg, color: config.color, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase' }}>
                                            {config.label}
                                          </span>
                                          <div style={{ fontSize: '0.8125rem', color: 'var(--text)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                                            {cleanObservation(obs)}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}

          {activeTab === 'international' && integrated && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                {(internationalComponent?.dimensions || []).map((item) => (
                  <div key={item.code} className="card-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginBottom: 4 }}>{item.code} · {item.name}</div>
                        <div style={{ fontSize: '1.375rem', fontWeight: 800, color: item.score == null ? 'var(--warning)' : getScoreColor(item.score) }}>
                          {item.score == null ? 'Pendiente' : `${Number(item.score).toFixed(2)}%`}
                        </div>
                      </div>
                      <span className="tag">{item.indicator_count} indicadores</span>
                    </div>
                    <div style={{ marginTop: 8, fontSize: '0.7rem', color: 'var(--text-subtle)' }}>{item.pending || 0} pendientes de {item.indicator_count}</div>
                  </div>
                ))}
              </div>

              {webIndicators.length === 0 ? (
                <div className="card">
                  <div className="empty-state">
                    <div className="empty-icon">🌐</div>
                    <h4>Sin resultados internacionales</h4>
                    <p>{readOnly ? 'No hay indicadores internacionales evaluados para esta selección.' : 'Haz clic en “Evaluar solo internacionales” para buscar y verificar evidencia web.'}</p>
                  </div>
                </div>
              ) : <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>Evidencia web de indicadores mixtos e internacionales</span>
                  <span className="tag">{webIndicators.length} indicadores</span>
                </div>
                <div style={{ display: 'grid', gap: 10, padding: 14, background: 'var(--bg-secondary)' }}>
                  {internationalGroups.map((group) => {
                    const isOpen = expandedInternationalFolders[group.code] ?? true;
                    return (
                      <div key={group.code} style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)', overflow: 'hidden' }}>
                        <button
                          type="button"
                          onClick={() => toggleInternationalFolder(group.code)}
                          style={{
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            padding: '14px 18px',
                            display: 'grid',
                            gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
                            gap: 12,
                            alignItems: 'center',
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontSize: '1.1rem', color: 'var(--primary-light)' }}>{isOpen ? '▾' : '▸'}</span>
                          <span>
                            <span style={{ display: 'block', fontWeight: 800, color: 'var(--primary-light)' }}>{group.code} · {group.name}</span>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              Complementos comprobados en la web institucional
                            </span>
                          </span>
                          <span className="tag">{group.indicators.length} indicadores</span>
                          <span className="tag">{group.indicators.filter((item) => item.status === 'CUMPLE').length} cumplen</span>
                        </button>

                        {isOpen && (
                          <div style={{ display: 'grid', gap: 12, padding: '0 14px 14px' }}>
                            {!readOnly && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={clearingDimension === group.code || validating}
                                  onClick={() => handleClearInternationalCache(group.code)}
                                  title="Elimina las búsquedas y páginas guardadas de esta dimensión; la próxima evaluación consultará nuevamente la web."
                                >
                                  {clearingDimension === group.code ? '⏳ Invalidando...' : `↻ Invalidar caché de ${group.code}`}
                                </button>
                              </div>
                            )}
                            {group.indicators.map((indicator) => {
                              const status = INTEGRATED_STATUS[indicator.status] || INTEGRATED_STATUS.PENDIENTE;
                              const scorePercent = indicator.score == null ? null : indicator.score * 100;
                              const supportingSources = (indicator.metadata?.supporting_sources || [])
                                .filter((source) => source?.source_url && source.source_url !== indicator.source_url);
                              return (
                                <div key={indicator.code} style={{ border: '1px solid var(--border-light)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-primary)' }}>
                                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-light)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 12, alignItems: 'center' }}>
                                    <div>
                                      <div style={{ fontWeight: 800, color: 'var(--text)' }}>{indicator.code} · {indicator.statement}</div>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: 4 }}>{indicator.family_code} · {indicator.family_name}</div>
                                    </div>
                                    <span className="tag">{indicator.classification_label}</span>
                                    <span className={`badge ${status.badge}`}>{status.label}{scorePercent == null ? '' : ` · ${scorePercent}%`}</span>
                                  </div>
                                  <div style={{ display: 'grid', gap: 10, padding: 14 }}>
                                    <div>
                                      <strong style={{ fontSize: '0.75rem' }}>Por qué {indicator.status === 'CUMPLE' ? 'cumple' : 'se asignó este resultado'}</strong>
                                      <div style={{ marginTop: 4, fontSize: '0.8125rem', lineHeight: 1.5 }}>{indicator.justification || 'Todavía no existe una justificación verificable.'}</div>
                                    </div>
                                    {!!indicator.metadata?.covered_elements?.length && (
                                      <div style={{ fontSize: '0.78rem' }}>
                                        <strong>Elementos comprobados:</strong> {indicator.metadata.covered_elements.join(' · ')}
                                      </div>
                                    )}
                                    {!!indicator.metadata?.missing_elements?.length && (
                                      <div style={{ fontSize: '0.78rem', color: 'var(--warning)' }}>
                                        <strong>Elementos pendientes:</strong> {indicator.metadata.missing_elements.join(' · ')}
                                      </div>
                                    )}
                                    {indicator.source_url ? (
                                      <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8, border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 800, marginBottom: 5 }}>Ubicación exacta en la web</div>
                                        <span className={`badge ${indicator.metadata?.selected_source_official ? 'badge-success' : 'badge-info'}`} style={{ marginBottom: 8 }}>
                                          {indicator.metadata?.selected_source_kind || (indicator.metadata?.selected_source_official ? 'Fuente oficial' : 'Fuente externa')}
                                          {indicator.metadata?.selected_source_domain ? ` · ${indicator.metadata.selected_source_domain}` : ''}
                                        </span>
                                        <a href={indicator.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-light)', overflowWrap: 'anywhere', fontWeight: 700 }}>{indicator.source_title || indicator.source_url}</a>
                                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 6 }}>{indicator.source_location || 'La fuente no indicó una sección exacta.'}</div>
                                        {indicator.evidence_excerpt && <blockquote style={{ margin: '10px 0 0', padding: '8px 12px', borderLeft: '3px solid var(--primary)', color: 'var(--text)', background: 'var(--bg-card)', fontSize: '0.8125rem' }}>“{indicator.evidence_excerpt}”</blockquote>}
                                      </div>
                                    ) : (
                                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-subtle)' }}>Sin fuente web confirmada. Consulta realizada: {indicator.search_query || 'no disponible'}.</div>
                                    )}
                                    {!!supportingSources.length && (
                                      <div style={{ display: 'grid', gap: 8 }}>
                                        <strong style={{ fontSize: '0.75rem' }}>Otras fuentes verificadas</strong>
                                        {supportingSources.map((source, index) => (
                                          <div key={`${source.source_url}-${index}`} style={{ padding: 10, border: '1px solid var(--border-light)', borderRadius: 8 }}>
                                            <a href={source.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-light)', overflowWrap: 'anywhere', fontWeight: 700, fontSize: '0.78rem' }}>
                                              {source.source_title || source.source_url}
                                            </a>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{source.source_location}</div>
                                            {source.evidence_excerpt && <blockquote style={{ margin: '7px 0 0', padding: '7px 10px', borderLeft: '3px solid var(--primary)', fontSize: '0.75rem' }}>“{source.evidence_excerpt}”</blockquote>}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {indicator.classification === 'MIXTO' && <div style={{ fontSize: '0.72rem', color: 'var(--warning)' }}>Este resultado califica únicamente el complemento internacional; la parte LOTAIP se mantiene en la evaluación nacional.</div>}
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
                                      <span className="tag">IA: {indicator.metadata?.evaluation_mode || 'sin dato'}</span>
                                      <span className="tag">Documentos: {indicator.metadata?.documents_analyzed ?? 0}</span>
                                      <span className="tag">Oficiales: {indicator.metadata?.official_documents ?? 0}</span>
                                      <span className="tag">Externos: {indicator.metadata?.external_documents ?? 0}</span>
                                      <span className="tag">Caché web: {indicator.metadata?.evidence_cache_hits ?? 0}</span>
                                      {(indicator.metadata?.search_engines || []).map((engine) => <span className="tag" key={engine}>Motor: {engine}</span>)}
                                      {indicator.metadata?.source_fetched_at && <span>Fuente descargada: {new Date(indicator.metadata.source_fetched_at).toLocaleString()}</span>}
                                    </div>
                                    {!readOnly && (
                                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button
                                          type="button"
                                          className="btn btn-secondary"
                                          disabled={Boolean(retryingIndicator) || validating}
                                          onClick={() => handleRetryInternational(indicator.code)}
                                        >
                                          {retryingIndicator === indicator.code ? '⏳ Reevaluando...' : '↻ Reevaluar indicador'}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
