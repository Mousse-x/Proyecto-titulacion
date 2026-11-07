import { useMemo, useState } from 'react';
import LotaipCriteriaTable from '../LotaipCriteriaTable';
import { PACKAGE_STATUS, scoreColor } from './evaluationUi';
import { FilterChips } from './widgets';

const OBSERVATION_KIND = [
  [/^✅/u, 'Correcto', 'var(--success)'],
  [/^⚠️?/u, 'Revisar', 'var(--warning)'],
  [/^❌/u, 'Falta', 'var(--danger)'],
  [/^📋/u, 'Detalle', 'var(--info)'],
];

function observationKind(text = '') {
  const match = OBSERVATION_KIND.find(([pattern]) => pattern.test(String(text)));
  return match ? { label: match[1], color: match[2] } : { label: 'Info', color: 'var(--primary)' };
}

const cleanObservation = (text = '') => String(text).replace(/^(✅|⚠️|⚠|❌|📋)\s*/u, '');

const packageScore = (item) => item.puntaje_total ?? item.sita?.resultado_automatico?.puntaje ?? null;
const numeralOf = (literal = '') => Number(String(literal).match(/LOTAIP-(\d+)/)?.[1]);

function documentKind(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('conjunto')) return 'Conjunto de datos';
  if (lower.includes('metadato')) return 'Metadatos';
  if (lower.includes('diccionario')) return 'Diccionario';
  return 'Documento';
}

function PackageCard({ item, open, onToggle, readOnly, canReview, onValidateOne, onSaved }) {
  const status = PACKAGE_STATUS[item.estado_cumplimiento] || PACKAGE_STATUS.NO_PRESENTADO;
  const score = packageScore(item);
  const documents = item.rubrica_lotaip?.documentos_presentes?.length
    ? item.rubrica_lotaip.documentos_presentes : item.documents.map((d) => documentKind(d.documento));
  const statusLabel = item.requiere_revalidacion ? 'Histórica: revalidar'
    : item.puntaje_total == null && score != null ? 'Resultado parcial' : status.label;
  return (
    <article className={`eval-item${open ? ' open' : ''}`} style={{ '--item-color': status.color }}>
      <button type="button" className="eval-item-head" onClick={onToggle} aria-expanded={open}>
        <span className="eval-code">{item.literal}</span>
        <span style={{ minWidth: 0 }}>
          <span className="eval-item-title" style={{ display: 'block' }}>{item.literal_name}</span>
          <span className="eval-item-sub" style={{ display: 'block' }}>
            {documents.join(' · ')} · {[...new Set(item.documents.map((d) => d.file_type))].join(', ')} · {item.periodo}
          </span>
        </span>
        <span className="eval-hide-sm" title="SITA del literal">
          <span className="progress-bar" style={{ display: 'block' }}>
            <span className="progress-fill" style={{ display: 'block', width: `${score ?? 0}%`, background: scoreColor(score) }} />
          </span>
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: scoreColor(score) }}>
            {score == null ? 'Sin nota' : `SITA ${Number(score).toFixed(2)}`}
          </span>
        </span>
        <span className={`badge ${status.badge} eval-hide-sm`}>{statusLabel}</span>
        <span className="eval-chevron" aria-hidden="true">▸</span>
      </button>
      {open && (
        <div className="eval-item-body">
          <LotaipCriteriaTable result={item} canReview={canReview} onSaved={onSaved} />
          <div className="eval-split">
            <div>
              <div className="eval-panel-label">Documentos del paquete</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8rem', lineHeight: 1.6 }}>
                {item.documents.map((d) => <li key={d.evidence_id}>{d.documento}</li>)}
              </ul>
              {!!item.rubrica_lotaip?.documentos_faltantes?.length && (
                <div className="eval-item-sub" style={{ color: 'var(--danger)' }}>
                  Faltan: {item.rubrica_lotaip.documentos_faltantes.join(', ')}.
                </div>
              )}
              <div className="eval-item-sub">El diccionario solo interpreta variables y notas aclaratorias; no recibe nota propia.</div>
              {!readOnly && (
                <button type="button" className="btn btn-sm btn-secondary" style={{ marginTop: 10 }}
                  onClick={() => onValidateOne(item.evidence_id)}>
                  🔄 Volver a evaluar este literal
                </button>
              )}
            </div>
            <div>
              <div className="eval-panel-label">Observaciones ({(item.observaciones || []).length})</div>
              <div className="eval-observations">
                {(item.observaciones || []).map((text, index) => {
                  const kind = observationKind(text);
                  return (
                    <div key={index} className="eval-observation" style={{ '--obs-color': kind.color }}>
                      <span className="eval-observation-kind">{kind.label}</span>
                      <span>{cleanObservation(text)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export default function LotaipPanel({ packages, numerals, summary, readOnly, canReview, onValidateOne, onSaved, emptyText }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [numeralFilter, setNumeralFilter] = useState(null);
  const [openKey, setOpenKey] = useState(null);

  const byNumeral = useMemo(() => {
    const groups = {};
    packages.forEach((item) => {
      const number = numeralOf(item.literal);
      (groups[number] ||= []).push(item);
    });
    return groups;
  }, [packages]);

  const counts = useMemo(() => {
    const c = { all: packages.length, CUMPLE: 0, parcial: 0, NO_CUMPLE: 0, pendiente: 0 };
    packages.forEach((item) => {
      const s = item.estado_cumplimiento;
      if (s === 'CUMPLE') c.CUMPLE += 1;
      else if (s === 'CUMPLE_PARCIALMENTE' || s === 'INCOMPLETO') c.parcial += 1;
      else if (s === 'NO_CUMPLE') c.NO_CUMPLE += 1;
      else c.pendiente += 1;
    });
    return c;
  }, [packages]);

  const visible = packages.filter((item) => {
    const s = item.estado_cumplimiento;
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'parcial' ? ['CUMPLE_PARCIALMENTE', 'INCOMPLETO'].includes(s)
        : statusFilter === 'pendiente' ? !['CUMPLE', 'CUMPLE_PARCIALMENTE', 'INCOMPLETO', 'NO_CUMPLE'].includes(s)
          : s === statusFilter);
    const text = `${item.literal} ${item.literal_name}`.toLowerCase();
    return matchesStatus && text.includes(query.trim().toLowerCase())
      && (numeralFilter == null || numeralOf(item.literal) === numeralFilter);
  });

  if (!packages.length) {
    return (
      <div className="card"><div className="empty-state">
        <div className="empty-icon">📄</div>
        <h4>Sin resultados nacionales</h4>
        <p>{emptyText}</p>
      </div></div>
    );
  }

  return (
    <>
      <div className="card eval-section">
        <div className="eval-section-head">
          <div>
            <div className="eval-section-title">Estado de los documentos</div>
            <div className="eval-section-sub">Clasificación de cada paquete; no modifica el SITA.</div>
          </div>
        </div>
        <div className="eval-stats">
          {[
            ['Cumple', summary?.indicators_compliant, 'var(--success)'],
            ['Parcial', summary?.indicators_partial, 'var(--warning)'],
            ['Incompleto', summary?.indicators_incomplete, 'var(--info)'],
            ['No cumple', summary?.indicators_non_compliant, 'var(--danger)'],
            ['No presentado', summary?.indicators_not_presented, 'var(--text-subtle)'],
          ].map(([label, value, color]) => (
            <div key={label} className="eval-stat">
              <div className="eval-stat-value" style={{ color }}>{value ?? 0}</div>
              <div className="eval-stat-label">{label}</div>
            </div>
          ))}
        </div>
        {summary?.general_observations?.length > 0 && (
          <details style={{ marginTop: 12 }}>
            <summary className="eval-tech" style={{ cursor: 'pointer', fontWeight: 700 }}>Observaciones generales ({summary.general_observations.length})</summary>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: '0.8rem', lineHeight: 1.6 }}>
              {summary.general_observations.map((text, index) => <li key={index}>{text}</li>)}
            </ul>
          </details>
        )}
      </div>

      <div className="card eval-section">
        <div className="eval-section-head">
          <div>
            <div className="eval-section-title">Cobertura de los 24 numerales</div>
            <div className="eval-section-sub">El color indica la nota del numeral; selecciona uno para ver solo sus literales.</div>
          </div>
          {numeralFilter != null && (
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setNumeralFilter(null)}>Ver todos</button>
          )}
        </div>
        <div className="eval-numerals">
          {numerals.map((numeral) => {
            const items = byNumeral[numeral.number] || [];
            const scores = items.map(packageScore).filter((v) => v != null);
            const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
            return (
              <button key={numeral.number} type="button"
                className={`eval-numeral${items.length ? '' : ' missing'}${numeralFilter === numeral.number ? ' active' : ''}`}
                style={{ '--numeral-color': items.length ? scoreColor(avg) : 'var(--border)' }}
                onClick={() => items.length && setNumeralFilter(numeralFilter === numeral.number ? null : numeral.number)}
                disabled={!items.length} title={numeral.name}>
                <div className="eval-numeral-number">Numeral {numeral.number}</div>
                <div className="eval-numeral-name">{numeral.name}</div>
                <div className="eval-numeral-score" style={{ color: items.length ? scoreColor(avg) : 'var(--text-subtle)' }}>
                  {items.length ? (avg == null ? 'Sin nota' : `SITA ${avg.toFixed(1)}`) : 'No publicado'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="eval-section">
        <div className="eval-section-head">
          <div>
            <div className="eval-section-title">Detalle por literal</div>
            <div className="eval-section-sub">Abre un literal para ver sus criterios, comprobaciones, documentos y observaciones.</div>
          </div>
          <span className="tag">{visible.length} de {packages.length} paquetes</span>
        </div>
        <div className="eval-toolbar">
          <input className="form-input" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar literal o requisito…" aria-label="Buscar literal" />
          <FilterChips value={statusFilter} onChange={setStatusFilter} options={[
            { value: 'all', label: 'Todos', count: counts.all },
            { value: 'CUMPLE', label: 'Cumple', count: counts.CUMPLE, color: 'var(--success)' },
            { value: 'parcial', label: 'Parcial', count: counts.parcial, color: 'var(--warning)' },
            { value: 'NO_CUMPLE', label: 'No cumple', count: counts.NO_CUMPLE, color: 'var(--danger)' },
            { value: 'pendiente', label: 'Pendiente', count: counts.pendiente, color: 'var(--text-subtle)' },
          ]} />
        </div>
        <div className="eval-list">
          {visible.map((item) => (
            <PackageCard key={item.packageKey} item={item} open={openKey === item.packageKey}
              onToggle={() => setOpenKey(openKey === item.packageKey ? null : item.packageKey)}
              readOnly={readOnly} canReview={canReview} onValidateOne={onValidateOne} onSaved={onSaved} />
          ))}
          {!visible.length && <div className="card"><div className="empty-state"><h4>Ningún literal coincide con el filtro</h4></div></div>}
        </div>
      </div>
    </>
  );
}
