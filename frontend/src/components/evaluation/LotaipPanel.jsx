import { useMemo, useRef, useState } from 'react';
import LotaipCriteriaTable from '../LotaipCriteriaTable';
import { PACKAGE_STATUS, scoreColor, scoreInk } from './evaluationUi';
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

/* Las observaciones "Criterio: texto" repiten lo que ya muestra cada criterio; solo se listan las demás. */
function extraObservations(item) {
  const names = (item.rubrica_lotaip?.criterios || []).map((c) => String(c.criterio).toLowerCase());
  return (item.observaciones || []).filter((text) => {
    const clean = cleanObservation(text).toLowerCase();
    return !names.some((name) => clean.startsWith(`${name}:`));
  });
}

/* "[Septiembre] 1.Conjunto de datos - Numeral 1.1 (Estructura orgánica)" → "Numeral 1.1 (Estructura orgánica)". */
function documentTitle(name = '') {
  const withoutMonth = String(name).replace(/^\[[^\]]+\]\s*/, '');
  const parts = withoutMonth.split(/\s+-\s+/);
  return parts.length > 1 ? parts.slice(1).join(' - ') : withoutMonth;
}

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
    <article className={`eval-item${open ? ' open' : ''}`} style={{ '--item-color': score == null ? status.color : scoreColor(score) }}>
      <button type="button" className="eval-item-head lotaip" onClick={onToggle} aria-expanded={open}>
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
          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: scoreInk(score) }}>
            {score == null ? 'Sin nota' : `SITA ${Number(score).toFixed(2)}`}
          </span>
        </span>
        <span className="eval-status-cell eval-hide-sm"><span className={`badge ${status.badge}`}>{statusLabel}</span></span>
        <span className="eval-chevron" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></span>
      </button>
      {open && (
        <div className="eval-item-body">
          <LotaipCriteriaTable result={item} canReview={canReview} onSaved={onSaved} />
          <div className="pkg-docs">
            <div className="pkg-docs-head">
              <span className="pkg-label">Documentos evaluados</span>
            </div>
            <ul className="pkg-doc-list">
              {item.documents.map((d) => (
                <li key={d.evidence_id}>
                  <span className="pkg-doc-kind">{documentKind(d.documento)}</span>
                  <span className="pkg-doc-name" title={d.documento}>{documentTitle(d.documento)}</span>
                  {d.file_type && <span className="pkg-doc-type">{d.file_type}</span>}
                </li>
              ))}
              {(item.rubrica_lotaip?.documentos_faltantes || []).map((name) => (
                <li key={`missing-${name}`} className="missing">
                  <span className="pkg-doc-kind">{name}</span>
                  <span className="pkg-doc-name">No se encontró en el paquete</span>
                </li>
              ))}
            </ul>
            <div className="pkg-foot">
              <span className="pkg-note">El diccionario solo explica las variables; no recibe nota propia.</span>
              {!readOnly && (
                <button type="button" className="btn btn-sm btn-primary pkg-retry" onClick={() => onValidateOne(item.evidence_id)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
                  Volver a evaluar este literal
                </button>
              )}
            </div>
          </div>

          {extraObservations(item).length > 0 && (
            <div className="pkg-obs">
              <span className="pkg-label">Otras observaciones</span>
              <ul>
                {extraObservations(item).map((text, index) => {
                  const kind = observationKind(text);
                  return (
                    <li key={index} style={{ '--obs-color': kind.color }}>
                      <span className="pkg-obs-kind">{kind.label}</span>
                      <span>{cleanObservation(text)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function LotaipPanel({ packages, numerals, readOnly, canReview, onValidateOne, onSaved, emptyText }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [numeralFilter, setNumeralFilter] = useState(null);
  const [openKey, setOpenKey] = useState(null);
  const detailRef = useRef(null);

  const byNumeral = useMemo(() => {
    const groups = {};
    packages.forEach((item) => {
      const number = numeralOf(item.literal);
      (groups[number] ||= []).push(item);
    });
    return groups;
  }, [packages]);

  // Siempre hay un numeral activo: el elegido o, por defecto, el primero con literales (numeral 1).
  const firstWithItems = (numerals || []).find((n) => (byNumeral[n.number] || []).length)?.number ?? null;
  const activeNumeral = numeralFilter != null && (byNumeral[numeralFilter] || []).length ? numeralFilter : firstWithItems;
  const activeInfo = (numerals || []).find((n) => n.number === activeNumeral) || null;
  const numeralItems = useMemo(() => byNumeral[activeNumeral] || [], [byNumeral, activeNumeral]);

  // Los contadores de estado se refieren al numeral activo.
  const counts = useMemo(() => {
    const c = { all: numeralItems.length, CUMPLE: 0, parcial: 0, NO_CUMPLE: 0, pendiente: 0 };
    numeralItems.forEach((item) => {
      const s = item.estado_cumplimiento;
      if (s === 'CUMPLE') c.CUMPLE += 1;
      else if (s === 'CUMPLE_PARCIALMENTE' || s === 'INCOMPLETO') c.parcial += 1;
      else if (s === 'NO_CUMPLE') c.NO_CUMPLE += 1;
      else c.pendiente += 1;
    });
    return c;
  }, [numeralItems]);

  const selectNumeral = (number) => {
    setNumeralFilter(number);
    setOpenKey(null);
    // Lleva al usuario al detalle por literal del numeral elegido.
    setTimeout(() => {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      detailRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }, 0);
  };

  const visible = numeralItems.filter((item) => {
    const s = item.estado_cumplimiento;
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'parcial' ? ['CUMPLE_PARCIALMENTE', 'INCOMPLETO'].includes(s)
        : statusFilter === 'pendiente' ? !['CUMPLE', 'CUMPLE_PARCIALMENTE', 'INCOMPLETO', 'NO_CUMPLE'].includes(s)
          : s === statusFilter);
    const text = `${item.literal} ${item.literal_name}`.toLowerCase();
    return matchesStatus && text.includes(query.trim().toLowerCase());
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
            <div className="eval-section-title">Cobertura de los 24 numerales</div>
            <div className="eval-section-sub">El color indica la nota del numeral; selecciona uno para ver el detalle de sus literales.</div>
          </div>
        </div>
        <div className="eval-numerals">
          {numerals.map((numeral) => {
            const items = byNumeral[numeral.number] || [];
            const scores = items.map(packageScore).filter((v) => v != null);
            const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
            return (
              <button key={numeral.number} type="button"
                className={`eval-numeral${items.length ? '' : ' missing'}${activeNumeral === numeral.number ? ' active' : ''}`}
                style={{ '--numeral-color': items.length ? scoreColor(avg) : 'var(--border)' }}
                onClick={() => items.length && selectNumeral(numeral.number)}
                aria-pressed={activeNumeral === numeral.number}
                disabled={!items.length} title={numeral.name}>
                <div className="eval-numeral-number">Numeral {numeral.number}</div>
                <div className="eval-numeral-name">{numeral.name}</div>
                <div className="eval-numeral-score" style={{ color: items.length ? scoreInk(avg) : 'var(--text-subtle)' }}>
                  {items.length ? (avg == null ? 'Sin nota' : `SITA ${avg.toFixed(1)}`) : 'No publicado'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="eval-section eval-detail-anchor" ref={detailRef}>
        <div className="eval-section-head">
          <div>
            <div className="eval-section-title">
              Detalle por literal{activeInfo ? ` · Numeral ${activeInfo.number}` : ''}
            </div>
            <div className="eval-section-sub">
              {activeInfo?.name ? `${activeInfo.name}. ` : ''}Abre un literal para ver sus criterios, comprobaciones, documentos y observaciones.
            </div>
          </div>
          <span className="tag">{visible.length} de {numeralItems.length} paquetes</span>
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
          {!visible.length && <div className="card"><div className="empty-state"><h4>Ningún literal del numeral {activeNumeral} coincide con el filtro</h4></div></div>}
        </div>
      </div>
    </>
  );
}
