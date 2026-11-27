import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEvaluation } from '../../context/EvaluationContext';
import { SCOPE_LABEL } from '../../utils/evaluationJob';

const HINT_KEY = 'sistransp.evaluationHintClosed';

const SHORT_LABEL = { lotaip: 'LOTAIP', international: 'Internacional', pending: 'Pendientes' };

/*
 * Indicador de la barra superior: aparece cuando hay una evaluación en curso y el
 * usuario está en otra pantalla. Al pulsarlo vuelve a la evaluación (misma selección).
 */
export default function EvaluationIndicator() {
  const { job, lastRun, markSeen } = useEvaluation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Aviso explicativo: se muestra una vez por evaluación hasta que el usuario lo cierra.
  const [closedHint, setClosedHint] = useState(() => {
    try { return sessionStorage.getItem(HINT_KEY); } catch { return null; }
  });
  const closeHint = (key) => {
    setClosedHint(key);
    try { sessionStorage.setItem(HINT_KEY, key); } catch { /* sin almacenamiento */ }
  };

  const onEvaluationPage = (path) => Boolean(path) && path.split('?')[0] === pathname;

  if (job) {
    if (onEvaluationPage(job.returnPath)) return null;
    const pct = Math.max(0, Math.min(100, Math.round(Number(job.progress?.pct || 0))));
    const label = SCOPE_LABEL[job.scope] || 'Evaluación';
    const ring = 2 * Math.PI * 9;
    const hintKey = String(job.startedAt || job.runId || '');
    const showHint = closedHint !== hintKey;
    return (
      <div className="eval-indicator-wrap">
        <button type="button" className="eval-indicator" onClick={() => navigate(job.returnPath)}
          title={`${label} en curso · ${job.contextLabel || ''}
${job.progress?.phase || ''}
Pulsa para volver a la evaluación.`}
          aria-label={`${label} en curso, ${pct} por ciento. Volver a la evaluación`}>
          <svg className="eval-indicator-ring" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <circle cx="12" cy="12" r="9" className="eval-indicator-track" />
            <circle cx="12" cy="12" r="9" className="eval-indicator-fill"
              strokeDasharray={ring} strokeDashoffset={ring * (1 - pct / 100)} />
          </svg>
          <span className="eval-indicator-text">
            <span className="eval-indicator-scope">{SHORT_LABEL[job.scope] || 'Evaluación'}</span>
            <strong>{pct}%</strong>
          </span>
        </button>
        {showHint && (
          <div className="eval-indicator-hint" role="status">
            <button type="button" className="eval-indicator-hint-close" onClick={() => closeHint(hintKey)}
              aria-label="Cerrar aviso" title="Cerrar aviso">✕</button>
            <strong>La evaluación sigue en curso</strong>
            <p>
              {label}{job.contextLabel ? ` · ${job.contextLabel}` : ''} se sigue realizando aunque cambies de pantalla.
              Aquí verás su avance; pulsa el indicador para volver a la evaluación.
            </p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => closeHint(hintKey)}>Entendido</button>
          </div>
        )}
      </div>
    );
  }

  if (lastRun?.unseen && !onEvaluationPage(lastRun.returnPath)) {
    const ok = lastRun.status === 'completed';
    const text = ok ? 'Lista' : lastRun.status === 'failed' ? 'Con error' : 'Detenida';
    return (
      <button type="button" className={`eval-indicator ${ok ? 'done' : 'failed'}`}
        onClick={() => { markSeen(); navigate(lastRun.returnPath); }}
        title={`${SCOPE_LABEL[lastRun.scope] || 'Evaluación'} · ${lastRun.context || ''}\nPulsa para ver los resultados.`}
        aria-label={`${SCOPE_LABEL[lastRun.scope] || 'Evaluación'} ${text.toLowerCase()}. Ver resultados`}>
        <span className="eval-indicator-icon" aria-hidden="true">{ok ? '✓' : '!'}</span>
        <span className="eval-indicator-text">
          <span className="eval-indicator-scope">{SHORT_LABEL[lastRun.scope] || 'Evaluación'}</span>
          <strong>{text}</strong>
        </span>
      </button>
    );
  }

  return null;
}
