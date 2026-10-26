/**
 * validation.js
 * API client for the LOTAIP document validation module.
 */
import client from './client';
import { freshSummaryParams } from '../utils/lotaipDashboard';

const waitForPoll = (milliseconds, signal) => new Promise((resolve, reject) => {
  const onAbort = () => {
    clearTimeout(timeout);
    reject(new DOMException('Evaluación detenida', 'AbortError'));
  };
  const timeout = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, milliseconds);
  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener('abort', onAbort, { once: true });
  }
});

const validationRequestError = (error) => {
  const data = error.response?.data || {};
  const requestError = new Error(data.error || error.message || 'Error de conexión');
  requestError.status = error.response?.status;
  requestError.runId = data.run_id || null;
  requestError.startedAt = data.started_at || null;
  requestError.canCancel = Boolean(data.can_cancel);
  return requestError;
};

export const validationApi = {
  getNumerals: () => client.get('/lotaip/config/numerales/'),
  getRun: (runId, options = {}) => client.get(`/lotaip/ejecuciones/${runId}/`, options),
  cancelRun: (runId) => client.post(`/lotaip/ejecuciones/${runId}/cancelar/`),
  getReviewQueue: (runId, params = {}) => client.get(`/lotaip/ejecuciones/${runId}/cola-revision/`, { params }),
  decideReviewItem: (itemId, payload) => client.post(`/lotaip/cola-revision/${itemId}/decidir/`, payload),
  manualReview: (evidenceId, payload) => client.post(`/evaluacion/documentos/${evidenceId}/revision-manual/`, payload),
  reviewCriteria: (evidenceId, payload) =>
    client.post(`/evaluacion/documentos/${evidenceId}/criterios/`, payload),
  /** Validate a single document */
  validateDocument: (evidenceId) =>
    client.post(`/evaluacion/documentos/${evidenceId}/validar/`, { reevaluate: true }, { timeout: 720000 }),
  retryPending: (evidenceId) =>
    client.post(`/evaluacion/documentos/${evidenceId}/validar/`, { retry_pending: true }, { timeout: 720000 }),

  /** Start validation in the backend and poll its persisted progress. */
  validateAllStream: async (universityId, periodId, month, onProgress, options = {}) => {
    const scope = options.scope || 'lotaip';
    const params = new URLSearchParams({ periodo_id: periodId });
    if (month) params.set('month', month);
    let started;
    try {
      const response = await client.post(
        `/evaluacion/universidades/${universityId}/validar-todo/?${params.toString()}`,
        {
          periodo_id: periodId,
          month: month || null,
          // El botón internacional debe rehacer búsqueda, descarga y dictamen;
          // de lo contrario los resultados definitivos se reutilizan por siete días.
          reevaluate: options.reevaluate ?? scope === 'international',
          scope,
        },
        { signal: options.signal },
      );
      started = response.data;
    } catch (error) {
      if (options.signal?.aborted) throw new DOMException('Evaluación detenida', 'AbortError');
      const data = error.response?.data || {};
      if (error.response?.status === 409 && data.run_id) {
        started = {
          status: 'run', run_id: data.run_id, resumed: true,
          message: 'Reconectado a la evaluación que ya estaba en proceso.',
        };
      } else {
        throw validationRequestError(error);
      }
    }

    const runId = started.run_id;
    if (!runId) throw new Error('El servidor no devolvió el identificador de la evaluación.');
    onProgress?.(started);
    let pollFailures = 0;

    while (true) {
      await waitForPoll(1000, options.signal);
      let run;
      try {
        run = (await validationApi.getRun(runId, { signal: options.signal })).data;
        pollFailures = 0;
      } catch (error) {
        if (options.signal?.aborted) throw new DOMException('Evaluación detenida', 'AbortError');
        pollFailures += 1;
        if (pollFailures < 30) continue;
        throw validationRequestError(error);
      }

      if (run.status === 'PROCESANDO') {
        if (run.result?.status === 'progress') onProgress?.(run.result);
        continue;
      }
      if (run.status === 'CANCELADA') return { status: 'cancelled', run_id: runId };
      if (run.status === 'ERROR') throw new Error(run.error || 'La evaluación terminó con error.');
      if (['COMPLETADA', 'COMPLETADA_CON_REVISIONES'].includes(run.status)) {
        return run.result;
      }
    }
  },

  /** Get validation result for a document */
  getResult: (evidenceId) =>
    client.get(`/evaluacion/documentos/${evidenceId}/resultado/`),

  /** Get compliance summary for a university in a period */
  getSummary: (universityId, periodId, month) =>
    client.get(`/evaluacion/universidades/${universityId}/resumen/`, {
      params: freshSummaryParams(periodId, month),
    }),

  retryInternationalIndicator: (universityId, indicatorCode, periodId, month) =>
    client.post(
      `/evaluacion/universidades/${universityId}/internacionales/${indicatorCode}/reintentar/`,
      { period_id: periodId, month: month || null },
      { timeout: 180000 },
    ),

  clearInternationalDimensionCache: (universityId, dimensionCode, periodId, month) =>
    client.post(
      `/evaluacion/universidades/${universityId}/internacionales/cache/${dimensionCode}/limpiar/`,
      { period_id: periodId, month: month || null },
    ),

  /** Get latest validated period for a university */
  getLatestPeriod: (universityId) =>
    client.get(`/evaluacion/universidades/${universityId}/ultimo-periodo/`),

  /** Get observations for a university in a period */
  getObservations: (universityId, periodId, month) =>
    client.get(`/evaluacion/universidades/${universityId}/observaciones/`, {
      params: { periodo_id: periodId, ...(month ? { month } : {}) },
    }),
};
