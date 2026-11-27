/**
 * EvaluationContext
 * Mantiene viva la evaluación en curso aunque el usuario cambie de pantalla:
 * el seguimiento del progreso vive aquí (no en ValidationPage), y la barra
 * superior muestra el porcentaje con un acceso directo de regreso.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { validationApi } from '../api/validation';
import { useAuth } from './AuthContext';
import { useToast } from './FeedbackContext';
import { SCOPE_LABEL } from '../utils/evaluationJob';

const STORAGE_KEY = 'sistransp.activeEvaluation';
const EMPTY_PROGRESS = { pct: 0, msg: '', phase: '', detail: '', activity: [] };

const saveActive = (value) => {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* almacenamiento no disponible */ }
};

const readActive = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
};

/* Acumula el avance que reporta el servidor (fase, detalle y últimos subprocesos). */
const mergeProgress = (current, data) => {
  const phase = data.phase || current.phase || 'Procesando evaluación';
  const detail = data.detail || current.detail || '';
  const activity = [...(current.activity || [])];
  const last = activity[activity.length - 1];
  if (!last || last.phase !== phase || last.detail !== detail) activity.push({ phase, detail });
  return {
    pct: data.pct ?? current.pct,
    msg: data.msg || current.msg,
    phase,
    detail,
    activity: activity.slice(-6),
  };
};

const EvaluationContext = createContext(null);

export function EvaluationProvider({ children }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  // job: la evaluación en curso (una sola a la vez en toda la aplicación).
  // Tras recargar el navegador se recupera la ejecución que seguía en curso.
  const [job, setJob] = useState(() => {
    const saved = readActive();
    if (!saved?.runId) return null;
    return {
      kind: 'run', scope: saved.scope, target: saved.target, contextLabel: saved.contextLabel,
      returnPath: saved.returnPath, runId: saved.runId, stopping: false, error: null,
      progress: { ...EMPTY_PROGRESS, msg: 'Reconectando con la evaluación en curso...', phase: 'Evaluación en proceso' },
    };
  });
  // lastRun: resultado de la última evaluación; `unseen` si terminó fuera de la pantalla.
  const [lastRun, setLastRun] = useState(null);
  // Cambia cada vez que termina una evaluación, para que la pantalla recargue resultados.
  const [resultsVersion, setResultsVersion] = useState(0);
  const controllerRef = useRef(null);
  const viewingRef = useRef(false);

  const patchJob = useCallback((patch) => {
    setJob((current) => (current ? { ...current, ...(typeof patch === 'function' ? patch(current) : patch) } : current));
  }, []);

  const finish = useCallback((meta, outcome) => {
    controllerRef.current = null;
    saveActive(null);
    setJob(null);
    setResultsVersion((v) => v + 1);
    const unseen = !viewingRef.current;
    setLastRun({
      ...outcome,
      scope: meta.scope,
      target: meta.target,
      context: meta.contextLabel,
      returnPath: meta.returnPath,
      at: new Date(),
      unseen,
    });
    if (outcome.status === 'completed') {
      toast.success({
        title: `${SCOPE_LABEL[meta.scope] || 'Evaluación'} completada`,
        message: meta.contextLabel,
        action: unseen ? { label: 'Ver resultados', onClick: () => navigate(meta.returnPath) } : undefined,
      });
    } else if (outcome.status === 'failed' && unseen) {
      toast.error({
        title: `${SCOPE_LABEL[meta.scope] || 'Evaluación'} fallida`,
        message: outcome.message,
        action: { label: 'Ver detalle', onClick: () => navigate(meta.returnPath) },
      });
    }
  }, [navigate, toast]);

  /* Sigue una ejecución del servidor (nueva o recuperada) hasta que termina. */
  const follow = useCallback(async (meta, runner) => {
    const controller = new AbortController();
    controllerRef.current = controller;
    const onProgress = (data) => {
      if (data.status === 'run' && data.run_id) {
        patchJob({ runId: data.run_id });
        saveActive({ ...meta, runId: data.run_id });
      }
      if (data.status === 'progress') patchJob((current) => ({ progress: mergeProgress(current.progress, data) }));
    };
    try {
      const final = await runner(onProgress, controller.signal);
      if (controllerRef.current !== controller) return;
      if (final?.status === 'cancelled') {
        finish(meta, { status: 'cancelled', message: 'La evaluación se detuvo antes de terminar. Los resultados anteriores se conservan.' });
        return;
      }
      finish(meta, { status: 'completed', message: 'Los resultados y el Índice de Transparencia Institucional se actualizaron. Revisa el detalle en las pestañas inferiores.' });
    } catch (e) {
      if (controllerRef.current !== controller) return;
      if (e.name === 'AbortError') {
        finish(meta, { status: 'cancelled', message: 'La evaluación se detuvo antes de terminar. Los resultados anteriores se conservan.' });
        return;
      }
      if (e.status === 409 && e.runId) {
        // Hay otra ejecución activa: se conserva para poder detenerla.
        patchJob({
          runId: e.runId,
          error: `${e.message} Usa “Detener evaluación” si la ejecución anterior ya no continúa.`,
          progress: {
            pct: 0,
            msg: `Ejecución activa #${e.runId}`,
            phase: 'Evaluación existente en proceso',
            detail: 'Puedes esperar a que termine o detenerla para iniciar una evaluación nueva.',
            activity: [{
              phase: 'Ejecución recuperada',
              detail: e.startedAt ? `Iniciada: ${new Date(e.startedAt).toLocaleString()}` : 'La hora de inicio no está disponible.',
            }],
          },
        });
        return;
      }
      const technical = !e.status || e.status >= 500;
      finish(meta, {
        status: 'failed',
        message: e.message || 'La evaluación se interrumpió por un error.',
        hint: technical
          ? 'Es un error técnico de procesamiento (conexión, portal externo o servicio de IA), no un incumplimiento de la universidad. Pulsa «Reintentar».'
          : 'Revisa la selección de universidad, período y documentos y vuelve a intentarlo.',
      });
    }
  }, [finish, patchJob]);

  const startValidation = useCallback(({ scope, target, contextLabel, returnPath }) => {
    if (controllerRef.current || job) return;
    const meta = { kind: 'run', scope, target, contextLabel, returnPath };
    setLastRun(null);
    setJob({
      ...meta,
      runId: null,
      stopping: false,
      error: null,
      progress: {
        pct: 0,
        msg: scope === 'international' ? 'Iniciando evaluación internacional...' : 'Iniciando evaluación LOTAIP...',
        phase: scope === 'international' ? 'Preparando búsqueda web' : 'Preparando evaluación LOTAIP',
        detail: scope === 'international' ? 'Agrupando indicadores por dimensión.' : 'Creando la ejecución y organizando los documentos seleccionados.',
        activity: [],
      },
    });
    follow(meta, (onProgress, signal) => validationApi.validateAllStream(
      target.universityId, target.periodId, target.month, onProgress, { signal, scope },
    ));
  }, [follow, job]);

  /* Reintento literal por literal de las comprobaciones pendientes (se hace desde el navegador). */
  const retryPending = useCallback(async ({ items, target, contextLabel, returnPath }) => {
    if (controllerRef.current || job || !items.length) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const meta = { kind: 'pending', scope: 'pending', target, contextLabel, returnPath };
    setLastRun(null);
    setJob({ ...meta, runId: null, stopping: false, error: null, progress: EMPTY_PROGRESS });
    let failures = 0;
    for (const [index, result] of items.entries()) {
      if (controller.signal.aborted) break;
      patchJob({
        progress: {
          pct: Math.round(index / items.length * 100),
          msg: `Recalculando pendientes ${index + 1}/${items.length}: ${result.literal}`,
          phase: 'Reintentando comprobaciones pendientes',
          detail: 'Volviendo a consultar enlaces, extracción e IA para este literal.',
          activity: [],
        },
      });
      try {
        await validationApi.retryPending(result.evidence_id);
      } catch {
        failures += 1;
      }
    }
    if (controllerRef.current !== controller) return;
    finish(meta, failures
      ? { status: 'failed', message: `No se pudo completar el reintento de ${failures} de ${items.length} literal(es).`,
        hint: 'Suele deberse a enlaces caídos o servicios externos no disponibles (error técnico). Pulsa «Reintentar» más tarde.' }
      : { status: 'completed', message: `Se reintentaron ${items.length} literal(es). Los casos que no pudieron confirmarse siguen como «Pendiente de comprobación».` });
  }, [finish, job, patchJob]);

  const stopValidation = useCallback(async () => {
    if (!job?.runId || job.stopping) return;
    patchJob((current) => ({ stopping: true, error: null, progress: { ...current.progress, msg: 'Deteniendo evaluación...' } }));
    try {
      await validationApi.cancelRun(job.runId);
      const controller = controllerRef.current;
      controllerRef.current = null;
      controller?.abort();
      saveActive(null);
      setJob(null);
      setResultsVersion((v) => v + 1);
      setLastRun({
        status: 'cancelled', scope: job.scope, target: job.target, context: job.contextLabel,
        returnPath: job.returnPath, at: new Date(), unseen: false,
        message: 'Detuviste la evaluación. Los resultados anteriores se conservan.',
      });
    } catch (e) {
      patchJob({ stopping: false });
      toast.apiError(e, 'No se pudo detener la evaluación.');
    }
  }, [job, patchJob, toast]);

  // Retoma el seguimiento de una ejecución recuperada al recargar (no hay nadie siguiéndola aún).
  useEffect(() => {
    if (!user || !job?.runId || job.kind !== 'run' || controllerRef.current) return;
    const meta = { kind: 'run', scope: job.scope, target: job.target, contextLabel: job.contextLabel, returnPath: job.returnPath };
    const runId = job.runId;
    // follow() sólo actualiza el estado después de cada consulta al servidor (asíncrono).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    follow(meta, (onProgress, signal) => validationApi.pollRun(runId, onProgress, { signal }));
  }, [follow, job, user]);

  // Al cerrar sesión se deja de seguir la evaluación (sigue corriendo en el servidor).
  if (!user && (job || lastRun)) {
    setJob(null);
    setLastRun(null);
  }
  useEffect(() => {
    if (user) return;
    const controller = controllerRef.current;
    controllerRef.current = null;
    controller?.abort();
    saveActive(null);
  }, [user]);

  /* La pantalla de evaluación avisa si está visible, para no mostrar el indicador sobre ella. */
  const setViewing = useCallback((viewing) => {
    viewingRef.current = viewing;
    if (viewing) setLastRun((current) => (current?.unseen ? { ...current, unseen: false } : current));
  }, []);

  const dismissLastRun = useCallback(() => setLastRun(null), []);
  const markSeen = useCallback(() => {
    setLastRun((current) => (current?.unseen ? { ...current, unseen: false } : current));
  }, []);

  const value = useMemo(() => ({
    job, lastRun, resultsVersion,
    startValidation, retryPending, stopValidation, dismissLastRun, markSeen, setViewing,
  }), [job, lastRun, resultsVersion, startValidation, retryPending, stopValidation, dismissLastRun, markSeen, setViewing]);

  return <EvaluationContext.Provider value={value}>{children}</EvaluationContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEvaluation() {
  const ctx = useContext(EvaluationContext);
  if (!ctx) throw new Error('useEvaluation debe usarse dentro de EvaluationProvider');
  return ctx;
}
