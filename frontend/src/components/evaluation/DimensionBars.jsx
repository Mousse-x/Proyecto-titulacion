import { getScoreColor, getScoreGrade, getScoreLabel } from '../../utils/score';

const TICKS = [0, 20, 40, 60, 80, 100];
const fmt = (value) => Number(value).toLocaleString('es-EC', { maximumFractionDigits: 1 });

/*
 * Cumplimiento de cada dimensión del índice combinado (ITI) en barras horizontales.
 * Una sola serie: el color de cada barra sigue la escala A–E de la nota; el texto
 * va siempre en color de texto. Al pasar el mouse (o con el teclado) se ve el detalle.
 */
export default function DimensionBars({ dimensions = [] }) {
  if (!dimensions.length) {
    return <div className="empty-state"><h4>Sin datos por dimensión</h4><p>Evalúa LOTAIP e internacionales para calcular el índice combinado.</p></div>;
  }
  return (
    <div className="dimbars">
      <div className="dimbars-axis" aria-hidden="true">
        <span />
        <div className="dimbars-ticks">
          {TICKS.map((tick) => <span key={tick} style={{ left: `${tick}%` }}>{tick}</span>)}
        </div>
        <span />
      </div>
      <ul className="dimbars-list">
        {dimensions.map((dimension, index) => {
          const score = dimension.score;
          const ready = score != null;
          const contribution = ready ? (Number(dimension.weight || 0) * score) / 100 : null;
          return (
            <li key={dimension.code} className={`dimbars-row${index < 2 ? ' tip-below' : ''}`} tabIndex={0}
              aria-label={`${dimension.code} ${dimension.name}: ${ready ? `${fmt(score)} %` : 'pendiente'}`}>
              <div className="dimbars-label">
                <span className="dimbars-code">{dimension.code}</span>
                <span className="dimbars-name" title={dimension.name}>{dimension.name}</span>
              </div>
              <div className="dimbars-track">
                {TICKS.slice(1, -1).map((tick) => <span key={tick} className="dimbars-grid" style={{ left: `${tick}%` }} />)}
                {ready ? (
                  <span className="dimbars-bar"
                    style={{ width: `${Math.max(score, 0.8)}%`, background: getScoreColor(score), animationDelay: `${index * 70}ms` }} />
                ) : (
                  <span className="dimbars-bar pending" />
                )}
              </div>
              <div className="dimbars-value">
                {ready ? <><strong>{fmt(score)} %</strong><span className="dimbars-grade">{getScoreGrade(score)}</span></> : <span className="dimbars-pending">Pendiente</span>}
              </div>

              <div className="dimbars-tip" role="tooltip">
                <div className="dimbars-tip-title">{dimension.code} · {dimension.name}</div>
                <dl>
                  <div><dt>Cumplimiento</dt><dd>{ready ? `${fmt(score)} % · ${getScoreLabel(score)}` : 'Pendiente de evaluar'}</dd></div>
                  <div><dt>Peso en el ITI</dt><dd>{fmt(dimension.weight || 0)} %</dd></div>
                  {ready && <div><dt>Aporta al ITI</dt><dd>{fmt(contribution)} puntos</dd></div>}
                  <div><dt>Indicadores</dt><dd>{dimension.indicator_count ?? '—'}{dimension.pending ? ` · ${dimension.pending} pendiente${dimension.pending > 1 ? 's' : ''}` : ''}</dd></div>
                </dl>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
