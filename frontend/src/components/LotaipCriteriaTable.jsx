import { useState } from 'react';
import { validationApi } from '../api/validation';
import { CHECK_STATUS, criterionGrade } from './evaluation/evaluationUi';

/* Sigla que acompaña a cada criterio (las cuatro primeras forman el SITA). */
const ABBR = { cta: 'CTA', eta: 'ETA', rp: 'RP', verificables: 'CI' };

/* Explicación en lenguaje llano según el criterio y su resultado. */
const PLAIN = {
  cta: {
    ok: 'La información está publicada, completa y al día.',
    partial: 'Está publicada, pero incompleta o desactualizada.',
    fail: 'No está publicada o no se puede acceder a ella.',
  },
  eta: {
    ok: 'Los datos están en formato abierto (CSV ordenado y reutilizable).',
    fail: 'Los datos no están en un formato abierto y estructurado (CSV).',
  },
  rp: {
    ok: 'Se registró a tiempo en el portal (hasta el día 15 del mes siguiente).',
    fail: 'Se registró fuera del plazo en el portal.',
  },
  verificables: {
    ok: 'Los enlaces revisados funcionan y muestran el documento correcto.',
    fail: 'Al menos un enlace revisado no funciona o no corresponde.',
  },
  vigencia: {
    ok: 'La información sigue vigente.',
    fail: 'La información publicada ya no está vigente.',
  },
  validez: {
    ok: 'La información es válida y está respaldada.',
    fail: 'La información no tiene validez o respaldo suficiente.',
  },
};

/* Tono visual a partir de la calificación: ok, partial, fail, pending o na. */
function toneOf(criterion) {
  if (!criterion.aplica) return 'na';
  const value = criterion.calificacion;
  if (value === 'NO APLICA') return 'na';
  if (value == null || value === 'SIN EVALUACIÓN') return 'pending';
  if (value === 'SI' || Number(value) === 1) return 'ok';
  if (value === 'NO' || Number(value) === 0) return 'fail';
  return 'partial';
}

const ICON = { ok: '✓', partial: '½', fail: '✕', pending: '…', na: '–' };

function plainSummary(criterion, tone) {
  if (tone === 'pending') return 'Todavía no se ha podido comprobar automáticamente.';
  if (tone === 'na') return 'No aplica en este caso (justificado en el diccionario de datos).';
  const text = PLAIN[criterion.id]?.[tone] || PLAIN[criterion.id]?.[tone === 'partial' ? 'fail' : tone];
  if (text) return text;
  // Respaldo: primera frase de la observación del motor.
  const first = String(criterion.observacion || '').split(/(?<=\.)\s/)[0];
  return first.length > 140 ? `${first.slice(0, 139)}…` : first;
}

function CheckItem({ item }) {
  const status = CHECK_STATUS[item.status] || { label: item.status, badge: 'badge-subtle' };
  return (
    <li className="crit-check">
      <span className={`badge ${status.badge}`}>{status.label}</span>
      <div>
        <div><strong>{item.document}</strong>{item.row != null ? `, fila ${item.row}` : ''} · {item.field}</div>
        {item.url && <a href={item.url} target="_blank" rel="noreferrer">{item.url}</a>}
        {item.reason && <div className="crit-muted">{item.reason}</div>}
        {item.archived_copy && (
          <div className="crit-muted">Comprobado con la copia de Wayback Machine del {item.archived_copy.captured_at}.</div>
        )}
      </div>
    </li>
  );
}

function CriterionRow({ criterion, open, onToggle }) {
  const tone = toneOf(criterion);
  const grade = criterionGrade(criterion);
  const abbr = ABBR[criterion.id];
  return (
    <li className={`crit-row tone-${tone}${open ? ' open' : ''}`}>
      <button type="button" className="crit-head" onClick={onToggle} aria-expanded={open}>
        <span className="crit-icon" aria-hidden="true">{ICON[tone]}</span>
        <span className="crit-main">
          <span className="crit-name">
            {criterion.criterio}
            {abbr && <span className="crit-abbr">{abbr}</span>}
          </span>
          <span className="crit-summary">{plainSummary(criterion, tone)}</span>
        </span>
        <span className={`badge ${grade.badge} crit-badge`}>{grade.label}</span>
        <span className="crit-chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="crit-body">
          <dl className="crit-facts">
            <div>
              <dt>Qué se exige</dt>
              <dd>{criterion.regla}</dd>
            </div>
            <div>
              <dt>Qué encontró el sistema</dt>
              <dd>{criterion.observacion || 'Sin observaciones.'}</dd>
            </div>
            {criterion.referencia && (
              <div>
                <dt>Referencia del instructivo</dt>
                <dd>{criterion.referencia}</dd>
              </div>
            )}
          </dl>
          {criterion.evidencias?.length > 0 && (
            <>
              <div className="crit-subtitle">Enlaces comprobados ({criterion.evidencias.length})</div>
              <ul className="crit-checks">
                {criterion.evidencias.map((item, index) => <CheckItem key={index} item={item} />)}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export default function LotaipCriteriaTable({ result, onSaved }) {
  const rubric = result.rubrica_lotaip;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  if (!rubric) return <div className="alert alert-warning">Evaluación histórica. Revalida el documento para obtener una calificación automática definitiva.</div>;

  const applicable = rubric.criterios.filter((c) => c.aplica);
  const notApplicable = rubric.criterios.filter((c) => !c.aplica);
  const tally = applicable.reduce((acc, c) => { const t = toneOf(c); acc[t] = (acc[t] || 0) + 1; return acc; }, {});
  const hasPending = applicable.some((criterion) => criterion.calificacion == null);

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
    <section aria-label="Criterios de evaluación LOTAIP" className="crit">
      <div className="crit-top">
        <div>
          <div className="crit-title">Criterios de evaluación</div>
          <div className="crit-tally">
            {tally.ok > 0 && <span className="tone-ok">{tally.ok} cumple{tally.ok > 1 ? 'n' : ''}</span>}
            {tally.partial > 0 && <span className="tone-partial">{tally.partial} parcial{tally.partial > 1 ? 'es' : ''}</span>}
            {tally.fail > 0 && <span className="tone-fail">{tally.fail} no cumple{tally.fail > 1 ? 'n' : ''}</span>}
            {tally.pending > 0 && <span className="tone-pending">{tally.pending} pendiente{tally.pending > 1 ? 's' : ''}</span>}
            <span className="crit-muted">de {applicable.length} que aplican</span>
          </div>
        </div>
        {hasPending && (
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={retry}>
            {busy ? 'Evaluando…' : 'Completar criterios pendientes'}
          </button>
        )}
      </div>
      {error && <div role="alert" className="alert alert-danger">{error}</div>}

      <ul className="crit-list">
        {applicable.map((criterion) => (
          <CriterionRow key={criterion.id} criterion={criterion} open={openId === criterion.id}
            onToggle={() => setOpenId(openId === criterion.id ? null : criterion.id)} />
        ))}
      </ul>

      {notApplicable.length > 0 && (
        <div className="crit-na">
          No aplican a este numeral: {notApplicable.map((c) => c.criterio).join(', ')}.
        </div>
      )}

      <div className="crit-foot">
        El SITA es el promedio de CTA, ETA, RP y CI. Pulsa un criterio para ver el detalle.
        {' '}Motor {result.engine_version || rubric.engine_version || rubric.version}
        {rubric.verificado_en && ` · comprobado el ${new Date(rubric.verificado_en).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}`}
        {rubric.fuente && <> · <a href={rubric.fuente} target="_blank" rel="noreferrer">instructivo de referencia</a></>}
      </div>
    </section>
  );
}
