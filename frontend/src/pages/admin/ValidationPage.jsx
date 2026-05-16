import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { validationApi } from '../../api/validation';

/* ── Mapa de estado → badge ───────────────────────────────────────── */
const STATUS_CONFIG = {
  CUMPLE:              { label: 'Cumple',              badge: 'badge-success', icon: '✅', color: 'var(--success)' },
  CUMPLE_PARCIALMENTE: { label: 'Cumple parcialmente', badge: 'badge-warning', icon: '⚠️', color: 'var(--warning)' },
  INCOMPLETO:          { label: 'Incompleto',          badge: 'badge-info',    icon: '📋', color: 'var(--info)' },
  NO_CUMPLE:           { label: 'No cumple',           badge: 'badge-danger',  icon: '❌', color: 'var(--danger)' },
  NO_PRESENTADO:       { label: 'No presentado',       badge: 'badge-subtle',  icon: '🔲', color: 'var(--text-subtle)' },
  ERROR_PROCESAMIENTO: { label: 'Error',               badge: 'badge-danger',  icon: '⛔', color: 'var(--danger)' },
};

function ScoreBar({ score, max = 100, color }) {
  const pct = Math.min(100, Math.round((score / max) * 100));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 120 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color || 'var(--primary)', transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: '0.8125rem', fontWeight: 700, minWidth: 36, textAlign: 'right', color: color || 'var(--text)' }}>{score}</span>
    </div>
  );
}

function TransparencyGauge({ value = 0 }) {
  const r = 58, stroke = 8, c = 2 * Math.PI * r;
  const offset = c - (value / 100) * c;
  const color = value >= 90 ? 'var(--success)' : value >= 70 ? 'var(--warning)' : value >= 40 ? 'var(--info)' : 'var(--danger)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width={140} height={140} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={70} cy={70} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle cx={70} cy={70} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease, stroke 0.5s ease' }} />
      </svg>
      <div style={{ position: 'absolute', marginTop: 42, textAlign: 'center' }}>
        <div style={{ fontSize: '2rem', fontWeight: 800, color }}>{Math.round(value)}%</div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--text-subtle)' }}>Índice General</div>
      </div>
    </div>
  );
}

export default function ValidationPage() {
  const [universities, setUniversities] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [selectedUniv, setSelectedUniv] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, msg: '' });
  const [summary, setSummary] = useState(null);
  const [results, setResults] = useState([]);
  const [expandedRow, setExpandedRow] = useState(null);
  const [error, setError] = useState(null);

  // Load universities and periods
  useEffect(() => {
    api.universities.list().then(r => setUniversities(r.data)).catch(() => {});
    // Fetch periods from evidences API or a dedicated endpoint
    api.evidences.list().then(r => {
      const periodMap = {};
      r.data.forEach(ev => {
        if (ev.period_id && ev.year) {
          periodMap[ev.period_id] = { id: ev.period_id, year: ev.year };
        }
      });
      setPeriods(Object.values(periodMap).sort((a, b) => b.year - a.year));
    }).catch(() => {});
  }, []);

  // Load existing results when university/period change
  useEffect(() => {
    if (!selectedUniv || !selectedPeriod) {
      setSummary(null);
      setResults([]);
      return;
    }
    loadResults();
  }, [selectedUniv, selectedPeriod]);

  const loadResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await validationApi.getSummary(selectedUniv, selectedPeriod);
      setSummary(res.data.summary);
      setResults(res.data.results || []);
    } catch (e) {
      // No results yet is not an error
      setSummary(null);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleValidateAll = async () => {
    if (!selectedUniv || !selectedPeriod) return;
    setValidating(true);
    setProgress({ pct: 0, msg: 'Iniciando validación...' });
    setError(null);

    try {
      await validationApi.validateAllStream(selectedUniv, selectedPeriod, (data) => {
        if (data.status === 'progress') {
          setProgress({ pct: data.pct || 0, msg: data.msg || '' });
        }
      });
      setProgress({ pct: 100, msg: '✅ Validación completada' });
      await loadResults();
    } catch (e) {
      setError(e.message || 'Error durante la validación');
    } finally {
      setValidating(false);
    }
  };

  const handleValidateOne = async (evidenceId) => {
    try {
      await validationApi.validateDocument(evidenceId);
      await loadResults();
    } catch (e) {
      setError(e.response?.data?.message || e.response?.data?.error || 'Error al validar documento');
    }
  };

  const getStatusConfig = (status) => STATUS_CONFIG[status] || STATUS_CONFIG.NO_PRESENTADO;
  const getScoreColor = (score) => score >= 90 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : score >= 40 ? 'var(--info)' : 'var(--danger)';

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>🔍 Evaluación LOTAIP</h1>
          <p>Validación automática de documentos de transparencia contra plantillas oficiales</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary btn-lg" onClick={handleValidateAll}
            disabled={!selectedUniv || !selectedPeriod || validating}>
            {validating ? '⏳ Validando...' : '🚀 Validar todos los aprobados'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="search-bar">
        <select className="form-input" style={{ maxWidth: 280 }}
          value={selectedUniv} onChange={e => setSelectedUniv(e.target.value)}>
          <option value="">Seleccionar universidad...</option>
          {universities.map(u => (
            <option key={u.id} value={u.id}>{u.name} — {u.full_name}</option>
          ))}
        </select>
        <select className="form-input" style={{ maxWidth: 200 }}
          value={selectedPeriod} onChange={e => setSelectedPeriod(e.target.value)}>
          <option value="">Seleccionar período...</option>
          {periods.map(p => (
            <option key={p.id} value={p.id}>{p.year}</option>
          ))}
        </select>
        {results.length > 0 && (
          <button className="btn btn-secondary" onClick={loadResults} disabled={loading}>
            🔄 Actualizar
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 24, padding: '12px 16px', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius)', color: 'var(--danger)' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Progress bar during validation */}
      {validating && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ marginBottom: 12, fontSize: '0.875rem', color: 'var(--text-muted)' }}>{progress.msg}</div>
          <div className="progress-bar" style={{ height: 8 }}>
            <div className="progress-fill" style={{ width: `${progress.pct}%` }} />
          </div>
          <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-subtle)', textAlign: 'right' }}>{progress.pct}%</div>
        </div>
      )}

      {/* No selection state */}
      {!selectedUniv || !selectedPeriod ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🏛️</div>
            <h4>Selecciona una universidad y período</h4>
            <p>Elige una universidad y un período de evaluación para ver o ejecutar la validación de documentos LOTAIP.</p>
          </div>
        </div>
      ) : loading ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon" style={{ animation: 'spin 1s linear infinite' }}>⏳</div>
            <h4>Cargando resultados...</h4>
          </div>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, marginBottom: 24 }}>
              {/* Transparency Gauge */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', paddingTop: 32, paddingBottom: 32 }}>
                <TransparencyGauge value={summary.total_index} />
                <div style={{ marginTop: 64 }}>
                  <div style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    {summary.total_indicators} indicadores evaluados
                  </div>
                </div>
              </div>

              {/* Counters */}
              <div className="card">
                <div style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: 16 }}>📊 Resumen de Cumplimiento</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Cumple', val: summary.indicators_compliant, color: 'var(--success)', bg: 'var(--success-subtle)' },
                    { label: 'Parcial', val: summary.indicators_partial, color: 'var(--warning)', bg: 'var(--warning-subtle)' },
                    { label: 'Incompleto', val: summary.indicators_incomplete, color: 'var(--info)', bg: 'var(--info-subtle)' },
                    { label: 'No cumple', val: summary.indicators_non_compliant, color: 'var(--danger)', bg: 'var(--danger-subtle)' },
                    { label: 'No presentado', val: summary.indicators_not_presented, color: 'var(--text-subtle)', bg: 'var(--bg-tertiary)' },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: '14px 16px', borderRadius: 'var(--radius)', background: item.bg, border: `1px solid ${item.color}22`, textAlign: 'center' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 800, color: item.color }}>{item.val}</div>
                      <div style={{ fontSize: '0.75rem', color: item.color, fontWeight: 500 }}>{item.label}</div>
                    </div>
                  ))}
                </div>

                {/* General observations */}
                {summary.general_observations?.length > 0 && (
                  <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Observaciones generales:</div>
                    {summary.general_observations.map((o, i) => (
                      <div key={i} style={{ fontSize: '0.8125rem', color: 'var(--text)', marginBottom: 4 }}>{o}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Results Table */}
          {results.length === 0 && !summary ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">📄</div>
                <h4>Sin resultados de validación</h4>
                <p>Haz clic en "Validar todos los aprobados" para ejecutar la validación automática de los documentos.</p>
              </div>
            </div>
          ) : results.length > 0 && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600 }}>📋 Detalle por Literal LOTAIP</span>
                <span className="tag">{results.length} documentos evaluados</span>
              </div>
              <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Literal</th>
                      <th>Requisito</th>
                      <th>Documento</th>
                      <th>Formato</th>
                      <th>Período</th>
                      <th>Puntaje</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, idx) => {
                      const sc = getStatusConfig(r.estado_cumplimiento);
                      const isExpanded = expandedRow === idx;

                      return (
                        <>
                          <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => setExpandedRow(isExpanded ? null : idx)}>
                            <td>
                              <span style={{ fontWeight: 700, color: 'var(--primary-light)' }}>{r.literal}</span>
                            </td>
                            <td>
                              <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                                {r.literal_name}
                              </div>
                            </td>
                            <td>
                              <div style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                                {r.documento}
                              </div>
                            </td>
                            <td><span className="tag">{r.file_type}</span></td>
                            <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{r.periodo}</td>
                            <td>
                              <ScoreBar score={r.puntaje_total} color={getScoreColor(r.puntaje_total)} />
                            </td>
                            <td>
                              <span className={`badge ${sc.badge}`}>{sc.icon} {sc.label}</span>
                            </td>
                            <td>
                              <button className="btn btn-sm btn-secondary" onClick={(e) => { e.stopPropagation(); handleValidateOne(r.evidence_id); }}
                                title="Revalidar documento">
                                🔄
                              </button>
                            </td>
                          </tr>
                          {/* Expanded detail row */}
                          {isExpanded && (
                            <tr key={`detail-${idx}`}>
                              <td colSpan={8} style={{ padding: 0, background: 'var(--bg-tertiary)' }}>
                                <div style={{ padding: '16px 20px' }}>
                                  {/* Score breakdown */}
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 16 }}>
                                    {[
                                      { label: 'Existencia', score: r.puntaje_existencia, max: 20 },
                                      { label: 'Formato', score: r.puntaje_formato, max: 10 },
                                      { label: 'Período', score: r.puntaje_actualizacion, max: 20 },
                                      { label: 'Estructura', score: r.puntaje_estructura, max: 20 },
                                      { label: 'Contenido', score: r.puntaje_contenido, max: 20 },
                                      { label: 'Accesibilidad', score: r.puntaje_accesibilidad, max: 10 },
                                    ].map((item, i) => (
                                      <div key={i} style={{ textAlign: 'center', padding: '10px 8px', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '1.125rem', fontWeight: 800, color: getScoreColor((item.score / item.max) * 100) }}>
                                          {item.score}/{item.max}
                                        </div>
                                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-subtle)', marginTop: 2 }}>{item.label}</div>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Observations */}
                                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                                    Observaciones:
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {(r.observaciones || []).map((obs, oi) => (
                                      <div key={oi} style={{ fontSize: '0.8125rem', color: 'var(--text)', padding: '4px 0', borderBottom: '1px solid var(--border-light)' }}>
                                        {obs}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
