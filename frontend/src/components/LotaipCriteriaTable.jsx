import { useState } from 'react';
import { validationApi } from '../api/validation';
import { CHECK_STATUS, criterionGrade } from './evaluation/evaluationUi';

const PREVIEW_CHARS = 240;

/* Las observaciones del motor pueden ser extensas: se muestra un resumen y el resto bajo demanda. */
function LongText({ text = '' }) {
  const [expanded, setExpanded] = useState(false);
  const value = String(text || '');
  if (value.length <= PREVIEW_CHARS) return <div className="eval-criterion-text">{value}</div>;
  return (
    <div className="eval-criterion-text">
      {expanded ? value : `${value.slice(0, PREVIEW_CHARS).trimEnd()}…`}
      <button type="button" className="eval-link-button" onClick={() => setExpanded(!expanded)}>
        {expanded ? 'Ver menos' : 'Ver más'}
      </button>
    </div>
  );
}

function CheckItem({ item }) {
  const status = CHECK_STATUS[item.status] || { label: item.status, badge: 'badge-subtle' };
  return (
    <div className="eval-check">
      <span className={`badge ${status.badge}`}>{status.label}</span>
      <div>
        <div><strong>{item.document}</strong>{item.row != null ? `, fila ${item.row}` : ''} · {item.field}</div>
        {item.url && <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a>}
        <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{item.reason}</div>
        {item.archived_copy && (
          <div style={{ color: 'var(--text-subtle)', marginTop: 2 }}>
            Comprobado con la copia de Wayback Machine del {item.archived_copy.captured_at}.
          </div>
        )}
      </div>
    </div>
  );
}

export default function LotaipCriteriaTable({ result, onSaved }) {
  const rubric = result.rubrica_lotaip;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!rubric) return <div className="alert alert-warning">Evaluación histórica. Revalida el documento para obtener una calificación automática definitiva.</div>;

  const hasPending = rubric.criterios.some((criterion) => criterion.aplica && criterion.calificacion == null);
  const retry = async () => {
    setBusy(true);
    setError('');
    try {
      await validationApi.validateDocument(result.evidence_id);
      await onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo completar la evaluación automática.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Criterios de evaluación LOTAIP">
      <div className="eval-section-head" style={{ marginBottom: 8 }}>
        <div>
          <div className="eval-panel-label" style={{ marginBottom: 0 }}>Criterios de la rúbrica · SITA = (CTA + ETA + RP + CI) / 4</div>
          <div className="eval-item-sub">
            Motor {result.engine_version || rubric.engine_version || rubric.version}
            {rubric.verificado_en && ` · comprobado el ${new Date(rubric.verificado_en).toLocaleString('es-EC')}`}
            {rubric.fuente && <> · <a href={rubric.fuente} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-light)' }}>instructivo de referencia</a></>}
          </div>
        </div>
        {hasPending && (
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={retry}>
            {busy ? 'Evaluando…' : 'Completar criterios pendientes'}
          </button>
        )}
      </div>
      {error && <div role="alert" className="alert alert-danger">{error}</div>}
      <div className="eval-criteria">
        {rubric.criterios.map((criterion) => {
          const grade = criterionGrade(criterion);
          return (
            <article key={criterion.id} className="eval-criterion">
              <div className="eval-criterion-head">
                <div>
                  <div className="eval-criterion-name">{criterion.criterio}</div>
                  <div className="eval-criterion-rule">{criterion.referencia}</div>
                </div>
                <span className={`badge ${grade.badge}`} style={{ whiteSpace: 'nowrap' }}>{grade.label}</span>
              </div>
              {criterion.aplica && <div className="eval-criterion-rule">{criterion.regla}</div>}
              <LongText text={criterion.observacion} />
              {criterion.evidencias?.length > 0 && (
                <details>
                  <summary>Ver comprobaciones ({criterion.evidencias.length})</summary>
                  <div className="eval-checks">
                    {criterion.evidencias.map((item, index) => <CheckItem key={index} item={item} />)}
                  </div>
                </details>
              )}
            </article>
          );
        })}
      </div>
      <p className="eval-item-sub" style={{ marginTop: 10 }}>
        Los enlaces se comprueban en una muestra reproducible de 3 filas y todos deben cumplir (Tabla 6). NO APLICA justificado
        y los enlaces no verificables automáticamente quedan «Sin evaluación» y no entran en el promedio.
      </p>
    </section>
  );
}
