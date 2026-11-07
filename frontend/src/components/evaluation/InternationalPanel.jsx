import { useMemo, useState } from 'react';
import { INDICATOR_STATUS, resultOrigin, scoreColor } from './evaluationUi';
import { FilterChips } from './widgets';

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
  const supporting = (meta.supporting_sources || []).filter((s) => s?.source_url && s.source_url !== indicator.source_url);
  if (!indicator.source_url) {
    return (
      <div className="eval-evidence">
        <span className="eval-item-sub" style={{ marginTop: 0 }}>Sin fuente publicada que acredite el indicador.</span>
        {indicator.search_query && <span className="eval-item-sub">Consulta realizada: {indicator.search_query}</span>}
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="eval-evidence">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(meta.selected_source_kind || meta.selected_source_domain) && (
            <span className={`badge ${meta.selected_source_official ? 'badge-success' : 'badge-info'}`}>
              {meta.selected_source_kind || (meta.selected_source_official ? 'Fuente oficial' : 'Fuente externa')}
              {meta.selected_source_domain ? ` · ${meta.selected_source_domain}` : ''}
            </span>
          )}
        </div>
        <a href={indicator.source_url} target="_blank" rel="noreferrer">
          {indicator.source_title && indicator.source_title !== 'Referencia documental' ? indicator.source_title : indicator.source_url}
        </a>
        {indicator.source_location && <span className="eval-item-sub" style={{ marginTop: 0 }}>{indicator.source_location}</span>}
        {indicator.evidence_excerpt && <blockquote>“{indicator.evidence_excerpt}”</blockquote>}
      </div>
      {supporting.map((source, index) => (
        <div key={`${source.source_url}-${index}`} className="eval-evidence">
          <a href={source.source_url} target="_blank" rel="noreferrer">{source.source_title || source.source_url}</a>
          {source.source_location && <span className="eval-item-sub" style={{ marginTop: 0 }}>{source.source_location}</span>}
          {source.evidence_excerpt && <blockquote>“{source.evidence_excerpt}”</blockquote>}
        </div>
      ))}
    </div>
  );
}

function IndicatorCard({ indicator, open, onToggle, readOnly, retrying, validating, onRetry }) {
  const status = INDICATOR_STATUS[indicator.status] || INDICATOR_STATUS.PENDIENTE;
  const meta = indicator.metadata || {};
  const origin = resultOrigin(meta);
  const percent = indicator.score == null ? null : Number(indicator.score) * 100;
  const justification = String(indicator.justification || '').replace(/^\[(Referencia documental|Dato simulado)\]\s*/, '');
  return (
    <article className={`eval-item${open ? ' open' : ''}`} style={{ '--item-color': status.color }}>
      <button type="button" className="eval-item-head" onClick={onToggle} aria-expanded={open}
        style={{ gridTemplateColumns: 'auto minmax(0, 1fr) auto auto auto' }}>
        <span className="eval-code">{indicator.code}</span>
        <span style={{ minWidth: 0 }}>
          <span className="eval-item-title" style={{ display: 'block' }}>{indicator.statement}</span>
          <span className="eval-item-sub" style={{ display: 'block' }}>
            {indicator.family_code} · {indicator.family_name} · {indicator.classification_label}
          </span>
        </span>
        <span className={`badge ${origin.badge} eval-hide-sm`} title={origin.hint}>{origin.label}</span>
        <span className={`badge ${status.badge}`}>{status.label}{percent == null ? '' : ` · ${percent.toFixed(0)}%`}</span>
        <span className="eval-chevron" aria-hidden="true">▸</span>
      </button>
      {open && (
        <div className="eval-item-body">
          <div className="eval-split">
            <div>
              <div className="eval-panel-label">Por qué tiene este resultado</div>
              <div className="eval-text">{justification || 'Todavía no existe una justificación verificable.'}</div>
              {(meta.covered_elements?.length > 0 || meta.missing_elements?.length > 0) && (
                <div className="eval-elements">
                  {(meta.covered_elements || []).map((e) => <span key={`ok-${e}`} className="eval-element ok">✓ {e}</span>)}
                  {(meta.missing_elements || []).map((e) => <span key={`no-${e}`} className="eval-element missing">✗ {e}</span>)}
                </div>
              )}
              {meta.also_valid?.length > 0 && (
                <div className="eval-item-sub">Estado alternativo también defendible: {meta.also_valid.map((s) => INDICATOR_STATUS[s]?.label || s).join(', ')}.</div>
              )}
              {indicator.classification === 'MIXTO' && (
                <div className="eval-item-sub" style={{ color: 'var(--warning)' }}>
                  Califica solo el complemento internacional; la parte LOTAIP se evalúa en el componente nacional.
                </div>
              )}
            </div>
            <div>
              <div className="eval-panel-label">Evidencia</div>
              <Evidence indicator={indicator} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <details className="eval-tech">
              <summary>Detalles técnicos</summary>
              <div className="eval-tech-tags">
                <span className="tag" title={origin.hint}>Origen: {origin.label}</span>
                {meta.reference_file && <span className="tag">Archivo: {meta.reference_file}</span>}
                {meta.method && <span className="tag">{meta.method}</span>}
                {meta.pass_rate != null && <span className="tag">Reglas cumplidas: {(meta.pass_rate * 100).toFixed(0)}%</span>}
                {meta.documents_analyzed != null && <span className="tag">Documentos analizados: {meta.documents_analyzed}</span>}
                {meta.official_documents != null && <span className="tag">Oficiales: {meta.official_documents}</span>}
                {meta.external_documents != null && <span className="tag">Externos: {meta.external_documents}</span>}
                {(meta.search_engines || []).map((engine) => <span className="tag" key={engine}>Motor: {engine}</span>)}
                {meta.period_cutoff && <span className="tag">Corte: {meta.period_cutoff}</span>}
                {indicator.evaluated_at && <span className="tag">Evaluado: {new Date(indicator.evaluated_at).toLocaleString('es-EC')}</span>}
              </div>
            </details>
            {!readOnly && (
              <button type="button" className="btn btn-sm btn-secondary" disabled={Boolean(retrying) || validating}
                onClick={() => onRetry(indicator.code)}>
                {retrying === indicator.code ? '⏳ Reevaluando…' : '↻ Reevaluar indicador'}
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

  const counts = useMemo(() => {
    const c = { all: indicators.length };
    STATUS_FILTERS.forEach(([key]) => { c[key] = 0; });
    indicators.forEach((i) => { c[isPendingStatus(i.status) ? 'PENDIENTE' : i.status] = (c[isPendingStatus(i.status) ? 'PENDIENTE' : i.status] || 0) + 1; });
    return c;
  }, [indicators]);

  if (!indicators.length) {
    return (
      <div className="card"><div className="empty-state">
        <div className="empty-icon">🌐</div>
        <h4>Sin resultados internacionales</h4>
        <p>{emptyText}</p>
      </div></div>
    );
  }

  const visible = indicators.filter((i) => {
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'PENDIENTE' ? isPendingStatus(i.status) : i.status === statusFilter);
    const text = `${i.code} ${i.statement} ${i.family_name}`.toLowerCase();
    return matchesStatus && text.includes(query.trim().toLowerCase()) && (!dimensionFilter || i.dimension === dimensionFilter);
  });
  const groups = (dimensions || []).map((d) => ({ ...d, items: visible.filter((i) => i.dimension === d.code) }))
    .filter((g) => g.items.length);

  return (
    <>
      <div className="card eval-section">
        <div className="eval-section-head">
          <div>
            <div className="eval-section-title">Resultado por dimensión</div>
            <div className="eval-section-sub">Selecciona una dimensión para ver solo sus indicadores.</div>
          </div>
          {dimensionFilter && <button type="button" className="btn btn-sm btn-secondary" onClick={() => setDimensionFilter(null)}>Ver todas</button>}
        </div>
        <div className="eval-dimensions">
          {(dimensions || []).map((d) => {
            const items = indicators.filter((i) => i.dimension === d.code);
            const met = items.filter((i) => i.status === 'CUMPLE').length;
            return (
              <button key={d.code} type="button" className={`eval-dimension${dimensionFilter === d.code ? ' active' : ''}`}
                onClick={() => setDimensionFilter(dimensionFilter === d.code ? null : d.code)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="eval-code">{d.code}</span>
                  <span className="eval-dimension-meta">{met}/{items.length} cumplen</span>
                </div>
                <div className="eval-dimension-name">{d.name}</div>
                <div className="eval-dimension-score" style={{ color: d.score == null ? 'var(--warning)' : scoreColor(d.score) }}>
                  {d.score == null ? 'Pendiente' : `${Number(d.score).toFixed(1)}%`}
                </div>
                <div className="progress-bar"><div className="progress-fill" style={{ width: `${d.score ?? 0}%`, background: scoreColor(d.score) }} /></div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="eval-toolbar">
        <input className="form-input" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar indicador…" aria-label="Buscar indicador" />
        <FilterChips value={statusFilter} onChange={setStatusFilter} options={[
          { value: 'all', label: 'Todos', count: counts.all },
          ...STATUS_FILTERS.map(([value, label, color]) => ({ value, label, color, count: counts[value] || 0 })),
        ]} />
      </div>

      {groups.map((group) => (
        <section key={group.code}>
          <div className="eval-group-title">
            <h3>{group.code} · {group.name}</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="tag">{group.items.length} indicadores</span>
              {!readOnly && (
                <button type="button" className="btn btn-sm btn-secondary" disabled={clearingDimension === group.code || validating}
                  onClick={() => onClearCache(group.code)}
                  title="Elimina las búsquedas y páginas guardadas de esta dimensión; la próxima evaluación consultará nuevamente la web.">
                  {clearingDimension === group.code ? '⏳ Invalidando…' : '↻ Invalidar caché'}
                </button>
              )}
            </div>
          </div>
          <div className="eval-list">
            {group.items.map((indicator) => (
              <IndicatorCard key={indicator.code} indicator={indicator} open={openCode === indicator.code}
                onToggle={() => setOpenCode(openCode === indicator.code ? null : indicator.code)}
                readOnly={readOnly} retrying={retrying} validating={validating} onRetry={onRetry} />
            ))}
          </div>
        </section>
      ))}
      {!groups.length && <div className="card"><div className="empty-state"><h4>Ningún indicador coincide con el filtro</h4></div></div>}
    </>
  );
}
