import { useMemo, useState } from 'react';
import { INDICATOR_STATUS, resultOrigin, scoreColor } from './evaluationUi';
import { FilterChips } from './widgets';
import DimensionRadar from './DimensionRadar';

const STATUS_FILTERS = [
  ['CUMPLE', 'Cumple', 'var(--success)'],
  ['PARCIAL', 'Parcial', 'var(--warning)'],
  ['NO_CUMPLE', 'No cumple', 'var(--danger)'],
  ['SIN_EVIDENCIA', 'Sin evidencia', 'var(--text-subtle)'],
  ['PENDIENTE', 'Pendiente o error', 'var(--warning)'],
];
const isPendingStatus = (status) => ['PENDIENTE', 'ERROR_TECNICO'].includes(status);

function Evidence({ indicator }) {
  const meta = indicator.metadata || {};
  const supporting = (meta.supporting_sources || []).filter((src) => src?.source_url && src.source_url !== indicator.source_url);
  if (!indicator.source_url) {
    return (
      <div className="eval-src-empty">
        Sin fuente publicada que acredite el indicador.
        {indicator.search_query && <div className="eval-src-meta">Consulta realizada: {indicator.search_query}</div>}
      </div>
    );
  }
  const main = {
    source_url: indicator.source_url,
    source_title: indicator.source_title !== 'Referencia documental' ? indicator.source_title : null,
    source_location: indicator.source_location,
    evidence_excerpt: indicator.evidence_excerpt,
    kind: meta.selected_source_kind || (meta.selected_source_domain ? (meta.selected_source_official ? 'Fuente oficial' : 'Fuente externa') : null),
  };
  return (
    <ul className="eval-src-list">
      {[main, ...supporting].map((src, index) => (
        <li key={`${src.source_url}-${index}`}>
          <a href={src.source_url} target="_blank" rel="noreferrer">{src.source_title || src.source_url}</a>
          {(src.kind || src.source_location) && (
            <div className="eval-src-meta">{[src.kind, src.source_location].filter(Boolean).join(' · ')}</div>
          )}
          {src.evidence_excerpt && <blockquote>“{src.evidence_excerpt}”</blockquote>}
        </li>
      ))}
    </ul>
  );
}

function IndicatorCard({ indicator, open, onToggle, readOnly, retrying, validating, onRetry }) {
  const status = INDICATOR_STATUS[indicator.status] || INDICATOR_STATUS.PENDIENTE;
  const meta = indicator.metadata || {};
  const origin = resultOrigin(meta);
  const percent = indicator.score == null ? null : Number(indicator.score) * 100;
  const justification = String(indicator.justification || '').replace(/^\[(Referencia documental|Dato simulado)\]\s*/, '');
  return (
    <article className={`eval-item${open ? ' open' : ''}`} style={{ '--item-color': percent == null ? status.color : scoreColor(percent) }}>
      <button type="button" className="eval-item-head" onClick={onToggle} aria-expanded={open}
        style={{ gridTemplateColumns: 'auto minmax(0, 1fr) auto auto' }}>
        <span className="eval-code">{indicator.code}</span>
        <span style={{ minWidth: 0 }}>
          <span className="eval-item-title" style={{ display: 'block' }}>{indicator.statement}</span>
          <span className="eval-item-sub" style={{ display: 'block' }}>
            {indicator.family_code} · {indicator.family_name} · {indicator.classification_label}
          </span>
        </span>
        <span className={`badge ${status.badge}`}>{status.label}{percent == null ? '' : ` · ${percent.toFixed(0)}%`}</span>
        <span className="eval-chevron" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></span>
      </button>
      {open && (
        <div className="eval-item-body">
          <table className="eval-result-table">
            <thead>
              <tr>
                <th scope="col">Por qué tiene este resultado</th>
                <th scope="col">Evidencia</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="Por qué tiene este resultado">
                  <div className="eval-text">{justification || 'Todavía no existe una justificación verificable.'}</div>
                  {(meta.covered_elements?.length > 0 || meta.missing_elements?.length > 0) && (
                    <div className="eval-elements">
                      {(meta.covered_elements || []).map((e) => <span key={`ok-${e}`} className="eval-element ok">✓ {e}</span>)}
                      {(meta.missing_elements || []).map((e) => <span key={`no-${e}`} className="eval-element missing">✗ {e}</span>)}
                    </div>
                  )}
                  {meta.also_valid?.length > 0 && (
                    <div className="eval-item-sub">Estado alternativo también defendible: {meta.also_valid.map((st) => INDICATOR_STATUS[st]?.label || st).join(', ')}.</div>
                  )}
                  {indicator.classification === 'MIXTO' && (
                    <div className="eval-note">Califica solo el complemento internacional; la parte LOTAIP se evalúa en el componente nacional.</div>
                  )}
                </td>
                <td data-label="Evidencia"><Evidence indicator={indicator} /></td>
              </tr>
            </tbody>
          </table>

          <div className="eval-tech-line">
            <span title={origin.hint}>
              {[
                origin.label,
                meta.reference_file,
                meta.method,
                meta.pass_rate != null ? `${(meta.pass_rate * 100).toFixed(0)}% reglas cumplidas` : null,
                meta.documents_analyzed != null ? `${meta.documents_analyzed} documentos analizados` : null,
                meta.official_documents != null ? `${meta.official_documents} oficiales` : null,
                meta.external_documents != null ? `${meta.external_documents} externos` : null,
                ...(meta.search_engines || []),
                meta.period_cutoff ? `Corte ${meta.period_cutoff}` : null,
                indicator.evaluated_at ? `Evaluado ${new Date(indicator.evaluated_at).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}` : null,
              ].filter(Boolean).join(' · ')}
            </span>
            {!readOnly && (
              <button type="button" className="eval-link-btn" disabled={Boolean(retrying) || validating}
                onClick={() => onRetry(indicator.code)}>
                {retrying === indicator.code ? 'Reevaluando…' : '↻ Reevaluar'}
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export default function InternationalPanel({
  indicators, dimensions, readOnly, retrying, validating, clearingDimension, onRetry, onClearCache, emptyText,
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dimensionFilter, setDimensionFilter] = useState(null);
  const [openCode, setOpenCode] = useState(null);

  // Siempre hay una dimensión activa: la elegida o, por defecto, la primera (D1).
  const activeCode = (dimensions || []).some((d) => d.code === dimensionFilter)
    ? dimensionFilter
    : (dimensions?.[0]?.code ?? null);
  const activeDimension = (dimensions || []).find((d) => d.code === activeCode) || null;
  const dimensionItems = useMemo(
    () => indicators.filter((i) => !activeCode || i.dimension === activeCode),
    [indicators, activeCode],
  );

  // Los contadores de estado se refieren a la dimensión activa.
  const counts = useMemo(() => {
    const c = { all: dimensionItems.length };
    STATUS_FILTERS.forEach(([key]) => { c[key] = 0; });
    dimensionItems.forEach((i) => { c[isPendingStatus(i.status) ? 'PENDIENTE' : i.status] = (c[isPendingStatus(i.status) ? 'PENDIENTE' : i.status] || 0) + 1; });
    return c;
  }, [dimensionItems]);

  if (!indicators.length) {
    return (
      <div className="card"><div className="empty-state">
        <div className="empty-icon">🌐</div>
        <h4>Sin resultados internacionales</h4>
        <p>{emptyText}</p>
      </div></div>
    );
  }

  const visible = dimensionItems.filter((i) => {
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'PENDIENTE' ? isPendingStatus(i.status) : i.status === statusFilter);
    const text = `${i.code} ${i.statement} ${i.family_name}`.toLowerCase();
    return matchesStatus && text.includes(query.trim().toLowerCase());
  });

  return (
    <>
      <div className="card eval-section">
        <div className="eval-section-head">
          <div>
            <div className="eval-section-title">Resultado por dimensión</div>
            <div className="eval-section-sub">Pulsa una dimensión del gráfico o de la lista para ver sus indicadores debajo.</div>
          </div>
        </div>
        <DimensionRadar dimensions={dimensions} indicators={indicators}
          selected={activeCode} onSelect={(code) => { setDimensionFilter(code); setOpenCode(null); }} />
      </div>

      <div className="eval-toolbar">
        <input className="form-input" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar indicador…" aria-label="Buscar indicador" />
        <FilterChips value={statusFilter} onChange={setStatusFilter} options={[
          { value: 'all', label: 'Todos', count: counts.all },
          ...STATUS_FILTERS.map(([value, label, color]) => ({ value, label, color, count: counts[value] || 0 })),
        ]} />
      </div>

      {activeDimension && (
        <section key={activeDimension.code}>
          <div className="eval-group-title">
            <h3>{activeDimension.code} · {activeDimension.name}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="tag">{dimensionItems.length} indicadores</span>
              {!readOnly && (
                <button type="button" className="btn btn-sm btn-secondary" disabled={clearingDimension === activeDimension.code || validating}
                  onClick={() => onClearCache(activeDimension.code)}
                  title="Elimina las búsquedas y páginas guardadas de esta dimensión; la próxima evaluación consultará nuevamente la web.">
                  {clearingDimension === activeDimension.code ? '⏳ Invalidando…' : '↻ Invalidar caché'}
                </button>
              )}
            </div>
          </div>
          <div className="eval-list">
            {visible.map((indicator) => (
              <IndicatorCard key={indicator.code} indicator={indicator} open={openCode === indicator.code}
                onToggle={() => setOpenCode(openCode === indicator.code ? null : indicator.code)}
                readOnly={readOnly} retrying={retrying} validating={validating} onRetry={onRetry} />
            ))}
          </div>
          {!visible.length && <div className="card"><div className="empty-state"><h4>Ningún indicador de {activeDimension.code} coincide con el filtro</h4></div></div>}
        </section>
      )}
    </>
  );
}
