import { Fragment, useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import ErrorNotice from '../../components/common/ErrorNotice';
import { useConfirm, useToast } from '../../context/FeedbackContext';
import { validationApi } from '../../api/validation';
import { useAuth } from '../../context/AuthContext';
import LotaipLinkReviewQueue from '../../components/LotaipLinkReviewQueue';
import IndexSummary from '../../components/evaluation/IndexSummary';
import DimensionBars from '../../components/evaluation/DimensionBars';
import { SCORE_SCALE } from '../../utils/score';
import UniversityLogo from '../../components/common/UniversityLogo';
import LotaipPanel from '../../components/evaluation/LotaipPanel';
import InternationalPanel from '../../components/evaluation/InternationalPanel';
import '../../components/evaluation/evaluation.css';
import { getLotaipDashboard } from '../../utils/lotaipDashboard';
import { groupLotaipPackages, pendingLotaipPackages } from '../../utils/lotaipPackages';

const SCOPE_LABEL = { lotaip: 'Evaluación nacional LOTAIP', international: 'Evaluación internacional', pending: 'Reintento de comprobaciones pendientes' };

/* Resultado del último proceso: permanece visible hasta que el usuario lo oculta (H1.1, H1.3, H9.2). */
function RunStatusBanner({ run, onRetry, onDismiss }) {
  if (!run) return null;
  const map = {
    completed: { cls: 'alert-success', icon: '✅', title: 'completada' },
    cancelled: { cls: 'alert-warning', icon: '⏹', title: 'detenida' },
    failed: { cls: 'alert-danger', icon: '⚠️', title: 'fallida' },
  };
  const meta = map[run.status];
  return (
    <div className={`alert ${meta.cls} run-status`} role={run.status === 'failed' ? 'alert' : 'status'}>
      <span aria-hidden="true" style={{ fontSize: '1.3rem' }}>{meta.icon}</span>
      <div className="run-status-text">
        <strong>{SCOPE_LABEL[run.scope] || 'Evaluación'} {meta.title}</strong>
        <span>{run.message}</span>
        {run.hint && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>¿Qué hacer? {run.hint}</span>}
        <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{run.context} · {run.at.toLocaleTimeString('es-EC')}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {run.status !== 'completed' && onRetry && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>↻ {run.status === 'failed' ? 'Reintentar' : 'Volver a ejecutar'}</button>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDismiss}>Ocultar</button>
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
            <div className="evaluation-progress-phase">
              <span className="badge badge-info" style={{ marginRight: 8 }}>En curso</span>
              {progress.phase || 'Procesando evaluación'}
            </div>
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
  const toast = useToast();
  const confirmAction = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const lockUniversitySelect = false;
  const [universities, setUniversities] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [selectedUniv, setSelectedUniv] = useState(searchParams.get('university_id') || '');
  const [selectedPeriod, setSelectedPeriod] = useState(searchParams.get('period_id') || '');
  const [selectedMonth, setSelectedMonth] = useState(searchParams.get('month') || '');
  const [lastRun, setLastRun] = useState(null);
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
  const [activeTab, setActiveTab] = useState('lotaip');
  const tabsRef = useRef(null);
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
      const list = Object.values(periodMap).sort((a, b) => b.year - a.year);
      setPeriods(list);
      // Si se llega desde un índice o ranking sin período, se preselecciona el más reciente.
      setSelectedPeriod((current) => current || (searchParams.get('university_id') && list[0] ? String(list[0].id) : current));
    }).catch((err) => toast.apiError(err, 'No se pudieron cargar los períodos disponibles.'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // La selección se refleja en la URL: se puede volver, recargar o compartir el enlace sin perderla (H3.1, H7.2).
  useEffect(() => {
    const next = {};
    if (selectedUniv) next.university_id = selectedUniv;
    if (selectedPeriod) next.period_id = selectedPeriod;
    if (selectedMonth) next.month = selectedMonth;
    setSearchParams(next, { replace: true });
  }, [selectedUniv, selectedPeriod, selectedMonth, setSearchParams]);

  const selectedUniversity = universities.find((u) => String(u.id) === String(selectedUniv));
  const selectedPeriodObj = periods.find((p) => String(p.id) === String(selectedPeriod));
  const contextLabel = [
    selectedUniversity ? `${selectedUniversity.name} — ${selectedUniversity.full_name}` : null,
    selectedPeriodObj ? `Año ${selectedPeriodObj.year}` : null,
    selectedMonth ? MONTHS.find((m) => String(m.value) === String(selectedMonth))?.label : (selectedPeriod ? 'Todos los meses' : null),
  ].filter(Boolean).join(' · ');

  const loadResults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await validationApi.getSummary(selectedUniv, selectedPeriod, selectedMonth);
      setSummary(res.data.summary);
      setResults(res.data.results || []);
      setNumerals(res.data.numerals || []);
    } catch (e) {
      setError(e);
      setSummary(null);
      setResults([]);
      setNumerals([]);
    } finally {
      setLoading(false);
    }
  }, [selectedUniv, selectedPeriod, selectedMonth]);

  // Load existing results when university/period/month change
  useEffect(() => {
    if (!selectedUniv || !selectedPeriod) {
      setSummary(null);
      setResults([]);
      return;
    }
    loadResults();
  }, [selectedUniv, selectedPeriod, loadResults]);

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


  const handleValidate = async (scope) => {
    if (!selectedUniv || !selectedPeriod) return;
    if (scope === 'lotaip' && documentCount === 0) {
      setError('No hay documentos para la universidad, período o mes seleccionado. Carga o importa los documentos en «Documentos LOTAIP» antes de evaluar.');
      return;
    }
    setLastRun(null);
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
        setLastRun({ status: 'cancelled', scope, at: new Date(), context: contextLabel,
          message: 'La evaluación se detuvo antes de terminar. Los resultados anteriores se conservan.' });
        return;
      }
      setProgress({ pct: 100, msg: scope === 'international' ? '✅ Evaluación internacional completada' : '✅ Evaluación LOTAIP completada', phase: 'Completada', detail: '', activity: [] });
      await loadResults();
      setLastRun({ status: 'completed', scope, at: new Date(), context: contextLabel,
        message: 'Los resultados y el Índice de Transparencia Institucional se actualizaron. Revisa el detalle en las pestañas inferiores.' });
      toast.success({ title: `${SCOPE_LABEL[scope]} completada`, message: contextLabel });
    } catch (e) {
      if (e.name === 'AbortError') {
        setLastRun({ status: 'cancelled', scope, at: new Date(), context: contextLabel,
          message: 'La evaluación se detuvo antes de terminar. Los resultados anteriores se conservan.' });
      } else {
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
          const technical = !e.status || e.status >= 500;
          setLastRun({
            status: 'failed', scope, at: new Date(), context: contextLabel,
            message: e.message || 'La evaluación se interrumpió por un error.',
            hint: technical
              ? 'Es un error técnico de procesamiento (conexión, portal externo o servicio de IA), no un incumplimiento de la universidad. Pulsa «Reintentar».'
              : 'Revisa la selección de universidad, período y documentos y vuelve a intentarlo.',
          });
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
    const ok = await confirmAction({
      title: 'Detener evaluación',
      message: 'Se detendrá la evaluación en curso. Los resultados ya guardados se conservan y podrás volver a ejecutarla cuando quieras.',
      confirmLabel: 'Detener evaluación',
      cancelLabel: 'Continuar evaluando',
    });
    if (!ok) return;
    setStopping(true);
    setError(null);
    setProgress((current) => ({ ...current, msg: 'Deteniendo evaluación...' }));
    try {
      await validationApi.cancelRun(activeRunId);
      setProgress((current) => ({ ...current, msg: '⏹ Evaluación detenida' }));
      setLastRun({ status: 'cancelled', scope: validationScope || 'lotaip', at: new Date(), context: contextLabel,
        message: 'Detuviste la evaluación. Los resultados anteriores se conservan.' });
      validationController.current?.abort();
      setValidating(false);
      setActiveRunId(null);
      setStopping(false);
      setValidationScope(null);
      validationController.current = null;
    } catch (e) {
      toast.apiError(e, 'No se pudo detener la evaluación.', handleStopValidation);
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
      toast.success({ title: 'Indicador reevaluado', message: `${indicatorCode} se volvió a evaluar.` });
    } catch (e) {
      toast.apiError(e, `No se pudo reevaluar ${indicatorCode}.`, () => handleRetryInternational(indicatorCode));
    } finally {
      setRetryingIndicator(null);
    }
  };

  const handleClearInternationalCache = async (dimensionCode) => {
    if (clearingDimension || !selectedUniv || !selectedPeriod) return;
    const ok = await confirmAction({
      title: `Invalidar caché de ${dimensionCode}`,
      message: `Se descartará la evidencia web guardada de ${dimensionCode}; la próxima evaluación internacional volverá a buscarla (consume créditos de búsqueda).`,
      confirmLabel: 'Invalidar caché',
    });
    if (!ok) return;
    setClearingDimension(dimensionCode);
    setError(null);
    try {
      await validationApi.clearInternationalDimensionCache(
        selectedUniv, dimensionCode, selectedPeriod, selectedMonth,
      );
      await loadResults();
      toast.success({ title: 'Caché invalidada', message: `La próxima evaluación volverá a buscar evidencia para ${dimensionCode}.` });
    } catch (e) {
      toast.apiError(e, `No se pudo invalidar la caché de ${dimensionCode}.`);
    } finally {
      setClearingDimension(null);
    }
  };

  const handleValidateOne = async (evidenceId) => {
    try {
      await validationApi.validateDocument(evidenceId);
      await loadResults();
      toast.success({ title: 'Documento evaluado', message: 'El resultado del literal se actualizó.' });
    } catch (e) {
      toast.apiError(e, 'No se pudo evaluar el documento.', () => handleValidateOne(evidenceId));
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
      setLastRun(failures
        ? { status: 'failed', scope: 'pending', at: new Date(), context: contextLabel,
          message: `No se pudo completar el reintento de ${failures} de ${pending.length} literal(es).`,
          hint: 'Suele deberse a enlaces caídos o servicios externos no disponibles (error técnico). Pulsa «Reintentar» más tarde.' }
        : { status: 'completed', scope: 'pending', at: new Date(), context: contextLabel,
          message: `Se reintentaron ${pending.length} literal(es). Los casos que no pudieron confirmarse siguen como «Pendiente de comprobación».` });
    } finally {
      setValidating(false);
    }
  };

  const lotaipPackages = groupLotaipPackages(results);
  const pendingPackages = pendingLotaipPackages(results);
  const integrated = summary?.integrated || null;
  const componentScores = integrated?.component_scores || {};
  const internationalComponent = componentScores.international || null;
  const webIndicators = (integrated?.indicators || []).filter((indicator) => indicator.classification !== 'NACIONAL');
  const canReview = [1, 4].includes(Number(user?.role_id));

  /* Desde las tarjetas de índice: abre la pestaña y desplaza hasta ella. */
  const selectTabAndScroll = (tab) => {
    setActiveTab(tab);
    setTimeout(() => {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      tabsRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }, 0);
  };

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>EVALUACIÓN DE TRANSPARENCIA</h1>
        </div>
      </div>

      {/* Filters */}
      <div className="eval-filters">
        <div className="filter-field eval-filter-univ">
          <label htmlFor="val-univ">Universidad</label>
          <select id="val-univ" className="form-input"
            value={selectedUniv} onChange={e => setSelectedUniv(e.target.value)} disabled={lockUniversitySelect || validating}>
            <option value="">Selecciona una universidad</option>
            {universities.map(u => (
              <option key={u.id} value={u.id}>{u.name} — {u.full_name}</option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="val-period">Año</label>
          <select id="val-period" className="form-input"
            value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)} disabled={validating}>
            <option value="">Selecciona</option>
            {periods.map(p => (
              <option key={p.id} value={p.id}>{p.year}</option>
            ))}
          </select>
        </div>
        <div className="filter-field">
          <label htmlFor="val-month">Mes</label>
          <select id="val-month" className="form-input"
            value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} disabled={validating}>
            <option value="">Todo el año</option>
            {MONTHS.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="eval-filters-side">
          {selectedUniv && selectedPeriod && (
            <span className={`eval-doc-pill${documentCount === 0 && !documentsLoading ? ' empty' : ''}`} aria-live="polite">
              <span className="eval-doc-dot" aria-hidden="true" />
              {documentsLoading
                ? 'Verificando…'
                : <><strong>{(documentCount || 0).toLocaleString('es-EC')}</strong> documentos</>}
            </span>
          )}
        </div>
        {validating && <div className="field-hint eval-filters-hint">Los filtros se bloquean mientras la evaluación está en curso.</div>}
      </div>

      {selectedUniv && selectedPeriod && (
        <div className="eval-uni-header">
          <UniversityLogo university={selectedUniversity || {}} size={84} />
          <div style={{ minWidth: 0, flex: '1 1 280px' }}>
            <h2>{selectedUniversity?.full_name || selectedUniversity?.name || 'Universidad'}</h2>
            <div className="eval-uni-sub">
              <span>
                {[selectedUniversity?.name,
                  selectedPeriodObj ? `Año ${selectedPeriodObj.year}` : null,
                  selectedMonth ? MONTHS.find((m) => String(m.value) === String(selectedMonth))?.label : 'Todos los meses',
                ].filter(Boolean).join(' · ')}
              </span>
              <Link to={`${user?.role_id === 1 ? '/admin' : user?.role_id === 4 ? '/auditor' : '/university'}/documents?university_id=${selectedUniv}`}
                style={{ fontWeight: 600 }}>
                Ver documentos de esta universidad →
              </Link>
            </div>
          </div>
        </div>
      )}

      <RunStatusBanner run={!validating ? lastRun : null} onDismiss={() => setLastRun(null)}
        onRetry={lastRun?.scope === 'pending' ? handleRetryPending : (lastRun && !readOnly ? () => handleValidate(lastRun.scope) : null)} />

      {activeTab === 'lotaip' && selectedUniv && selectedPeriod && !documentsLoading && documentCount === 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 24, padding: '12px 16px', borderRadius: 'var(--radius)' }}>
          <strong>Sin evidencias:</strong> no hay documentos para la universidad, período o mes seleccionado, por lo que no se puede ejecutar la evaluación LOTAIP.
          {!readOnly && <> Cárgalos o impórtalos en <Link to={`${user?.role_id === 1 ? '/admin' : '/university'}/documents?university_id=${selectedUniv}`}>Documentos LOTAIP</Link>.</>}
        </div>
      )}

      <ErrorNotice error={error} fallback="No se pudieron cargar las evaluaciones."
        onRetry={typeof error === 'string' ? null : loadResults} onDismiss={() => setError(null)} style={{ marginBottom: 24 }} />

      {!selectedUniv || !selectedPeriod ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🏛️</div>
            <h4>Selecciona una universidad y un período</h4>
            <p>Elige la universidad y el año en los filtros superiores para {readOnly ? 'consultar' : 'consultar o ejecutar'} su evaluación nacional (LOTAIP) e internacional.</p>
            <p style={{ fontSize: '0.8rem' }}>Consejo: pulsa <kbd>Ctrl</kbd> + <kbd>K</kbd> para buscar una universidad por nombre o siglas.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="card">
          <div className="empty-state">
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} aria-hidden="true" />
            <h4>Cargando resultados de {contextLabel}…</h4>
          </div>
        </div>
      ) : (
        <>
          {summary && (
            <IndexSummary lotaip={lotaip} international={internationalComponent} integrated={integrated}
              activeTab={activeTab} onSelect={selectTabAndScroll} />
          )}

          <div className="eval-tabs-row" ref={tabsRef}>
            <div className="tabs">
              <button className={`tab ${activeTab === 'lotaip' ? 'active' : ''}`} onClick={() => setActiveTab('lotaip')} aria-pressed={activeTab === 'lotaip'}
                title="Componente nacional: 24 numerales del art. 19 de la LOTAIP">
                Nacional · LOTAIP<span className="eval-tab-count">{lotaipPackages.length}</span>
              </button>
              <button className={`tab ${activeTab === 'international' ? 'active' : ''}`} onClick={() => setActiveTab('international')} aria-pressed={activeTab === 'international'}
                title="Componente complementario: indicadores de referentes internacionales">
                Internacional<span className="eval-tab-count">{webIndicators.length}</span>
              </button>
              <button className={`tab ${activeTab === 'combined' ? 'active' : ''}`} onClick={() => setActiveTab('combined')} aria-pressed={activeTab === 'combined'}
                title="Índice de Transparencia Integrado: cumplimiento de las 8 dimensiones">
                Combinado · ITI<span className="eval-tab-count">{integrated?.dimension_scores?.length || 0}</span>
              </button>
            </div>
          </div>

          {activeTab === 'lotaip' && (
            <Fragment>
              {!readOnly && (
                <div className="card eval-section eval-action-bar">
                  <div>
                    <div className="eval-section-title">Evaluación nacional LOTAIP</div>
                    <div className="eval-section-sub">Evalúa únicamente los documentos y criterios nacionales; no consume créditos de búsqueda internacional.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" onClick={handleRetryPending}
                      title={!pendingPackages.length ? 'No hay literales pendientes de comprobación' : 'Vuelve a consultar enlaces, extracción e IA de los literales pendientes'}
                      disabled={!selectedUniv || !selectedPeriod || validating || loading || documentsLoading || !pendingPackages.length}>
                      Actualizar pendientes ({pendingPackages.length})
                    </button>
                    <button className="btn btn-primary" onClick={() => handleValidate('lotaip')}
                      title={documentCount === 0 ? 'No hay documentos para evaluar en esta selección' : validating ? 'Ya hay una evaluación en curso' : undefined}
                      disabled={!selectedUniv || !selectedPeriod || validating || documentsLoading || documentCount === 0}>
                      {validating && validationScope === 'lotaip' ? 'EVALUANDO LOTAIP…' : 'EVALUAR LOTAIP'}
                    </button>
                  </div>
                </div>
              )}
              {!readOnly && validating && validationScope === 'lotaip' && <EvaluationProgressPanel
                scope="lotaip" progress={progress} activeRunId={activeRunId}
                stopping={stopping} onStop={handleStopValidation}
              />}
              {!readOnly && !validating && canReview && <LotaipLinkReviewQueue
                universityId={selectedUniv} periodId={selectedPeriod} month={selectedMonth}
                refreshKey={results} onDecided={loadResults}
              />}
              <LotaipPanel packages={lotaipPackages} numerals={numerals} readOnly={readOnly}
                canReview={canReview} onValidateOne={handleValidateOne} onSaved={loadResults}
                emptyText={readOnly ? 'No hay resultados LOTAIP para la selección actual.' : 'Haz clic en “Evaluar LOTAIP” para ejecutar la evaluación nacional.'} />
            </Fragment>
          )}

          {activeTab === 'international' && (
            <Fragment>
              {!readOnly && (
                <div className="card eval-section eval-action-bar">
                  <div>
                    <div className="eval-section-title">Evaluación internacional anual{integrated?.international_year ? ` ${integrated.international_year}` : ''}</div>
                    <div className="eval-section-sub">22 complementos mixtos y 12 indicadores internacionales con evidencia verificable; el resultado se aplica a todos los meses del año.</div>
                  </div>
                  <button className="btn btn-primary" onClick={() => handleValidate('international')}
                    title={validating ? 'Ya hay una evaluación en curso' : 'Busca y verifica evidencia web con apoyo de IA (puede tardar varios minutos)'}
                    disabled={!selectedUniv || !selectedPeriod || validating}>
                    {validating && validationScope === 'international' ? 'EVALUANDO INTERNACIONALES…' : 'EVALUAR INTERNACIONALES'}
                  </button>
                </div>
              )}
              {!readOnly && validating && validationScope === 'international' && <EvaluationProgressPanel
                scope="international" progress={progress} activeRunId={activeRunId}
                stopping={stopping} onStop={handleStopValidation}
              />}
              <InternationalPanel indicators={webIndicators} dimensions={internationalComponent?.dimensions}
                readOnly={readOnly} retrying={retryingIndicator} validating={validating}
                clearingDimension={clearingDimension} onRetry={handleRetryInternational} onClearCache={handleClearInternationalCache}
                emptyText={readOnly ? 'No hay indicadores internacionales evaluados para esta selección.' : 'Haz clic en “Evaluar internacionales” para buscar y verificar evidencia web.'} />
            </Fragment>
          )}

          {activeTab === 'combined' && (
            <div className="card eval-section">
              <div className="eval-iti-head">
                <div>
                  <div className="eval-section-title">Cumplimiento por dimensión</div>
                  <div className="eval-iti-score">
                    <strong>{integrated?.index_percent != null ? `${Number(integrated.index_percent).toLocaleString('es-EC', { maximumFractionDigits: 1 })} %` : '—'}</strong>
                    <span>ITI{integrated?.is_provisional ? ' · provisional' : ''}</span>
                  </div>
                </div>
              </div>
              <DimensionBars dimensions={integrated?.dimension_scores || []} />
              <div className="eval-iti-legend" aria-label="Escala de cumplimiento">
                {SCORE_SCALE.map((level) => (
                  <span key={level.grade}><i style={{ background: level.color }} />{level.grade} · {level.label}{Number.isFinite(level.min) ? ` (≥ ${level.min})` : ' (< 20)'}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
