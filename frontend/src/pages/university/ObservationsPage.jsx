import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { validationApi } from '../../api/validation';
import { useAuth } from '../../context/AuthContext';

/*
 * Guía de correcciones: muestra lo que la evaluación automática encontró en los
 * documentos LOTAIP de la universidad y qué corregir. Es de solo lectura; las
 * correcciones se hacen en «Documentos LOTAIP» y luego se vuelve a evaluar.
 */

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/* Estado de cumplimiento → etiqueta, prioridad de corrección y color. */
const STATUS = {
  NO_CUMPLE: { label: 'No cumple', priority: 'alta' },
  ERROR_PROCESAMIENTO: { label: 'Error técnico', priority: 'alta' },
  INCOMPLETO: { label: 'Incompleto', priority: 'media' },
  NO_PRESENTADO: { label: 'No presentado', priority: 'media' },
  CUMPLE_PARCIALMENTE: { label: 'Cumple parcialmente', priority: 'baja' },
  CUMPLE: { label: 'Cumple', priority: 'ok' },
};
const statusInfo = (estado) => STATUS[estado] || { label: estado || 'Sin estado', priority: 'baja' };

const PRIORITY = {
  alta: { label: 'Prioridad alta', kind: 'danger', color: 'var(--danger)' },
  media: { label: 'Prioridad media', kind: 'warning', color: 'var(--warning)' },
  baja: { label: 'Prioridad baja', kind: 'info', color: 'var(--info)' },
  ok: { label: 'Cumple', kind: 'success', color: 'var(--success)' },
};
const PRIORITY_ORDER = { alta: 0, media: 1, baja: 2, ok: 3 };

const FILTERS = [
  ['pendientes', 'Por corregir'],
  ['alta', 'Prioridad alta'],
  ['media', 'Prioridad media'],
  ['baja', 'Prioridad baja'],
  ['ok', 'Cumplen'],
];

const periodKey = (p) => `${p.period_id}:${p.month || ''}`;
const periodLabel = (p) => `${p.month ? `${MONTHS[p.month - 1]} ` : ''}${p.year || ''}`.trim() || `Período ${p.period_id}`;

export default function ObservationsPage() {
  const { user } = useAuth();
  const universityId = user?.university_id;
  const [periods, setPeriods] = useState([]);
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState('pendientes');
  const [loadingPeriods, setLoadingPeriods] = useState(Boolean(universityId));
  const [periodError, setPeriodError] = useState('');
  // Resultado de la última consulta, etiquetado con el mes al que corresponde.
  const [result, setResult] = useState({ key: '', rows: [], error: '' });

  // Meses con documentos cargados, del más reciente al más antiguo.
  useEffect(() => {
    if (!universityId) return undefined;
    let cancelled = false;
    api.evidences.list({ university_id: universityId })
      .then((res) => {
        if (cancelled) return;
        const unique = new Map();
        (res.data || []).filter((ev) => ev.period_id).forEach((ev) => {
          const p = { period_id: ev.period_id, month: ev.month || null, year: ev.year };
          unique.set(periodKey(p), p);
        });
        const list = [...unique.values()].sort((a, b) => (b.year || 0) - (a.year || 0) || (b.month || 0) - (a.month || 0));
        setPeriods(list);
        setSelected(list[0] ? periodKey(list[0]) : '');
      })
      .catch(() => { if (!cancelled) setPeriodError('No se pudieron cargar los períodos de tus documentos.'); })
      .finally(() => { if (!cancelled) setLoadingPeriods(false); });
    return () => { cancelled = true; };
  }, [universityId]);

  // Observaciones del mes elegido.
  useEffect(() => {
    const period = periods.find((p) => periodKey(p) === selected);
    if (!universityId || !period) return undefined;
    let cancelled = false;
    validationApi.getObservations(universityId, period.period_id, period.month)
      .then((res) => {
        if (cancelled) return;
        const rows = (res.data.observations || []).map((item, index) => {
          const info = statusInfo(item.estado);
          return {
            id: `${item.literal}-${item.documento}-${index}`,
            code: item.literal,
            name: item.literal_name,
            document: item.documento,
            score: Number(item.puntaje_total || 0),
            statusLabel: info.label,
            priority: info.priority,
            messages: (item.observaciones || []).filter(Boolean),
          };
        });
        rows.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || String(a.code).localeCompare(String(b.code), 'es', { numeric: true }));
        setResult({ key: selected, rows, error: '' });
      })
      .catch(() => { if (!cancelled) setResult({ key: selected, rows: [], error: 'No se pudieron cargar las observaciones. Intenta de nuevo.' }); });
    return () => { cancelled = true; };
  }, [universityId, periods, selected]);

  const items = useMemo(() => (result.key === selected ? result.rows : []), [result, selected]);
  const loading = Boolean(selected) && result.key !== selected;
  const error = periodError || (result.key === selected ? result.error : '');

  const counts = useMemo(() => {
    const c = { alta: 0, media: 0, baja: 0, ok: 0 };
    items.forEach((i) => { c[i.priority] += 1; });
    return { ...c, pendientes: c.alta + c.media + c.baja };
  }, [items]);

  const visible = items.filter((i) => (filter === 'pendientes' ? i.priority !== 'ok' : i.priority === filter));
  const busy = loadingPeriods || loading;

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Observaciones de la evaluación</h1>
          <p>Lo que la evaluación automática encontró en tus documentos LOTAIP y qué debes corregir.</p>
        </div>
        <div className="page-header-actions">
          {periods.length > 0 && (
            <label className="obs-period">
              <span>Mes evaluado</span>
              <select className="form-input" value={selected} onChange={(e) => setSelected(e.target.value)}>
                {periods.map((p) => <option key={periodKey(p)} value={periodKey(p)}>{periodLabel(p)}</option>)}
              </select>
            </label>
          )}
          <Link className="btn btn-primary" to="/university/documents">Ir a Documentos LOTAIP</Link>
        </div>
      </div>

      <ol className="obs-howto">
        <li><span>1</span><div><strong>Revisa</strong> lo que la evaluación encontró en cada documento.</div></li>
        <li><span>2</span><div><strong>Corrige o reemplaza</strong> el archivo en «Documentos LOTAIP».</div></li>
        <li><span>3</span><div><strong>Vuelve a evaluar</strong> en «Evaluación de transparencia» para actualizar tu nota.</div></li>
      </ol>

      {error && <div className="alert alert-danger" role="alert" style={{ marginBottom: 16 }}>{error}</div>}

      {busy ? (
        <div className="card"><div className="empty-state" aria-busy="true"><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 12px' }} /><h4>Cargando observaciones…</h4></div></div>
      ) : !periods.length ? (
        <div className="card"><div className="empty-state">
          <h4>Aún no hay documentos evaluados</h4>
          <p>Carga tus documentos en «Documentos LOTAIP» y ejecuta la evaluación para ver aquí qué corregir.</p>
        </div></div>
      ) : (
        <>
          <div className="obs-summary">
            {['alta', 'media', 'baja', 'ok'].map((key) => (
              <button key={key} type="button" className={`obs-stat obs-stat-${PRIORITY[key].kind}${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>
                <strong>{counts[key]}</strong>
                <span>{PRIORITY[key].label}</span>
              </button>
            ))}
          </div>

          <div className="tabs" style={{ marginBottom: 16 }}>
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" className={`tab ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
                {label} ({counts[key]})
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <div className="card"><div className="empty-state">
              <h4>{filter === 'ok' ? 'Ningún documento cumple todavía' : 'Nada por corregir aquí'}</h4>
              <p>{filter === 'pendientes' ? 'Todos los documentos evaluados de este mes cumplen. ¡Bien hecho!' : 'Prueba con otro filtro o elige otro mes.'}</p>
            </div></div>
          ) : (
            <div className="obs-list">
              {visible.map((o) => {
                const p = PRIORITY[o.priority];
                return (
                  <article key={o.id} className="card obs-item" style={{ borderLeftColor: p.color }}>
                    <header className="obs-item-head">
                      <span className="obs-code">{o.code}</span>
                      <div className="obs-item-title">
                        <strong>{o.name}</strong>
                        <small>{o.document}</small>
                      </div>
                      <span className={`badge badge-${p.kind}`}>{o.statusLabel}</span>
                      <span className="obs-score" title="Puntaje obtenido">{o.score}%</span>
                    </header>
                    {o.messages.length > 0 ? (
                      <ul className="obs-messages">
                        {o.messages.map((m, i) => <li key={`${i}-${m}`}>{m}</li>)}
                      </ul>
                    ) : (
                      <p className="obs-empty">{o.priority === 'ok' ? 'Sin observaciones: el documento cumple.' : 'La evaluación no dejó detalles para este documento.'}</p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
