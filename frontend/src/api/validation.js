/**
 * validation.js
 * API client for the LOTAIP document validation module.
 */
import client from './client';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

export const validationApi = {
  /** Validate a single approved document */
  validateDocument: (evidenceId) =>
    client.post(`/evaluacion/documentos/${evidenceId}/validar/`),

  /** Validate all approved documents for a university in a period (streaming) */
  validateAllStream: async (universityId, periodId, onProgress) => {
    const token = sessionStorage.getItem('auth_token');
    const resp = await fetch(
      `${API_BASE}/evaluacion/universidades/${universityId}/validar-todo/?periodo_id=${periodId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ periodo_id: periodId }),
      }
    );

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Error de conexión' }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastResult = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete last line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          lastResult = data;
          if (onProgress) onProgress(data);
        } catch { /* ignore parse errors */ }
      }
    }
    return lastResult;
  },

  /** Get validation result for a document */
  getResult: (evidenceId) =>
    client.get(`/evaluacion/documentos/${evidenceId}/resultado/`),

  /** Get compliance summary for a university in a period */
  getSummary: (universityId, periodId) =>
    client.get(`/evaluacion/universidades/${universityId}/resumen/`, {
      params: { periodo_id: periodId },
    }),

  /** Get observations for a university in a period */
  getObservations: (universityId, periodId) =>
    client.get(`/evaluacion/universidades/${universityId}/observaciones/`, {
      params: { periodo_id: periodId },
    }),
};
