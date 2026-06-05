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

function TransparencyGauge({ value = 0, label = 'Indice' }) {
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
        <div style={{ fontSize: '0.6875rem', color: 'var(--text-subtle)' }}>{label}</div>
      </div>
    </div>
  );
}

export default function ValidationPage({ readOnly = false }) {
  const [universities, setUniversities] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [selectedUniv, setSelectedUniv] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, msg: '' });
  const [summary, setSummary] = useState(null);
  const [results, setResults] = useState([]);
  const [expandedRow, setExpandedRow] = useState(null);
  const [activeTab, setActiveTab] = useState('lotaip');
  const [expandedInternationalFolders, setExpandedInternationalFolders] = useState({});
  const [error, setError] = useState(null);

  const MONTHS = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
  ];

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

  // Load existing results when university/period/month change
  useEffect(() => {
    if (!selectedUniv || !selectedPeriod) {
      setSummary(null);
      setResults([]);
      return;
    }
    loadResults();
  }, [selectedUniv, selectedPeriod, selectedMonth]);

  const loadResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await validationApi.getSummary(selectedUniv, selectedPeriod, selectedMonth);
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
      await validationApi.validateAllStream(selectedUniv, selectedPeriod, selectedMonth, (data) => {
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
  const getCriterionStatus = (score, max) => {
    const pct = max ? (score / max) * 100 : 0;
    if (pct >= 99) return { label: 'Cumple', badge: 'badge-success' };
    if (pct > 0) return { label: 'Parcial', badge: 'badge-warning' };
    return { label: 'No cumple', badge: 'badge-danger' };
  };
  const getObservationConfig = (observation = '') => {
    const text = String(observation);
    if (text.startsWith('✅')) return { label: 'Correcto', color: 'var(--success)', bg: 'var(--success-subtle)' };
    if (text.startsWith('⚠️') || text.startsWith('⚠')) return { label: 'Revisar', color: 'var(--warning)', bg: 'var(--warning-subtle)' };
    if (text.startsWith('❌')) return { label: 'Falta', color: 'var(--danger)', bg: 'var(--danger-subtle)' };
    if (text.startsWith('📋')) return { label: 'Detalle', color: 'var(--info)', bg: 'var(--info-subtle)' };
    return { label: 'Info', color: 'var(--primary)', bg: 'var(--primary-subtle)' };
  };
  const cleanObservation = (observation = '') =>
    String(observation).replace(/^(✅|⚠️|⚠|❌|📋)\s*/u, '');
  const getLiteralSortValue = (literal = '') => {
    const match = literal.match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  };
  const getDocumentKind = (documento = '') => {
    const lower = documento.toLowerCase();
    if (lower.includes('conjunto')) return 'Conjunto de datos';
    if (lower.includes('metadato')) return 'Metadatos';
    if (lower.includes('diccionario')) return 'Diccionario';
    return 'Documento';
  };
  const toggleInternationalFolder = (literal) => {
    setExpandedInternationalFolders((prev) => ({
      ...prev,
      [literal]: !(prev[literal] ?? true),
    }));
  };
  const internationalKeys = ['ogp', 'ocde', 'ods'];
  const internationalRows = results.flatMap((r) =>
    internationalKeys
      .map((key) => {
        const standard = r.evaluacion_internacional?.[key];
        return standard ? { result: r, key, standard } : null;
      })
      .filter(Boolean)
  );
  const internationalSummary = internationalKeys.map((key) => {
    const standards = results.map((r) => r.evaluacion_internacional?.[key]).filter(Boolean);
    const total = standards.reduce((sum, item) => sum + (item.puntaje || 0), 0);
    const max = standards[0]?.puntaje_maximo || 0;
    const avg = standards.length ? total / standards.length : 0;
    return {
      key,
      name: standards[0]?.nombre || key.toUpperCase(),
      score: Number(avg.toFixed(2)),
      max,
      pct: max ? Number(((avg / max) * 100).toFixed(2)) : 0,
    };
  });
  const internationalGroups = Object.values(
    results.reduce((acc, result) => {
      const key = result.literal || 'Sin literal';
      if (!acc[key]) {
        acc[key] = {
          literal: key,
          literal_name: result.literal_name,
          documents: [],
        };
      }
      acc[key].documents.push(result);
      return acc;
    }, {})
  ).sort((a, b) => getLiteralSortValue(a.literal) - getLiteralSortValue(b.literal));

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>🔍 Evaluación LOTAIP</h1>
          <p>{readOnly ? 'Consulta detallada de literales, observaciones y estandares internacionales' : 'Validación automática de documentos de transparencia contra plantillas oficiales'}</p>
        </div>
        <div className="page-header-actions" style={{ display: readOnly ? 'none' : undefined }}>
          <button className="btn btn-primary btn-lg" onClick={handleValidateAll}
            disabled={!selectedUniv || !selectedPeriod || validating}>
            {validating ? '⏳ Validando...' : '🚀 Validar documentos'}
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
        <select className="form-input" style={{ maxWidth: 200 }}
          value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
          <option value="">Todos los meses</option>
          {MONTHS.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
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
                <TransparencyGauge value={summary.national_index ?? summary.total_index} label="Indice nacional" />
                <div style={{ marginTop: 64, width: '100%', display: 'grid', gap: 8 }}>
                  <div style={{ padding: '10px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: getScoreColor(summary.integrated_index ?? summary.total_index) }}>
                      {Math.round(summary.integrated_index ?? summary.total_index)}%
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nacional + internacional</div>
                  </div>
                  {summary.international_index !== undefined && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textAlign: 'center' }}>
                      Internacional: {Math.round(summary.international_index)}% ({summary.international_average_score}/{summary.international_max_score})
                    </div>
                  )}
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

          {results.length > 0 && (
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'lotaip' ? 'active' : ''}`}
                onClick={() => { setActiveTab('lotaip'); setExpandedRow(null); }}
              >
                LOTAIP
              </button>
              <button
                className={`tab ${activeTab === 'international' ? 'active' : ''}`}
                onClick={() => { setActiveTab('international'); setExpandedRow(null); }}
              >
                Evaluacion internacional
              </button>
            </div>
          )}

          {/* Results Table */}
          {results.length === 0 && !summary ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">📄</div>
                <h4>Sin resultados de validación</h4>
                <p>{readOnly ? 'No hay resultados de evaluacion disponibles para la seleccion actual.' : 'Haz clic en "Validar documentos" para ejecutar la validación automática.'}</p>
              </div>
            </div>
          ) : results.length > 0 && activeTab === 'lotaip' && (
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
                      <th style={{ display: readOnly ? 'none' : undefined }}>Acción</th>
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
                            <td style={{ display: readOnly ? 'none' : undefined }}>
                              <button className="btn btn-sm btn-secondary" style={{ display: readOnly ? 'none' : undefined }} onClick={(e) => { e.stopPropagation(); handleValidateOne(r.evidence_id); }}
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
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                                    <div>
                                      <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--text)' }}>
                                        Observaciones
                                      </div>
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                                        Hallazgos de la validacion automatica
                                      </div>
                                    </div>
                                    <span className="tag">{(r.observaciones || []).length} registros</span>
                                  </div>
                                  <div style={{ display: 'grid', gap: 8 }}>
                                    {(r.observaciones || []).map((obs, oi) => {
                                      const config = getObservationConfig(obs);
                                      return (
                                        <div key={oi} style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: 12, alignItems: 'start', padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `4px solid ${config.color}`, borderRadius: 8 }}>
                                          <span style={{ justifySelf: 'start', padding: '3px 9px', borderRadius: 999, background: config.bg, color: config.color, fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase' }}>
                                            {config.label}
                                          </span>
                                          <div style={{ fontSize: '0.8125rem', color: 'var(--text)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                                            {cleanObservation(obs)}
                                          </div>
                                        </div>
                                      );
                                    })}
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

          {results.length > 0 && activeTab === 'international' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                {internationalSummary.map((item) => (
                  <div key={item.key} className="card-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginBottom: 4 }}>{item.name}</div>
                        <div style={{ fontSize: '1.375rem', fontWeight: 800, color: getScoreColor(item.pct) }}>
                          {item.score}/{item.max}
                        </div>
                      </div>
                      <div style={{ minWidth: 96 }}>
                        <ScoreBar score={item.pct} color={getScoreColor(item.pct)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600 }}>Detalle de evaluacion internacional</span>
                  <span className="tag">{internationalRows.length} evaluaciones</span>
                </div>
                <div style={{ display: 'grid', gap: 10, padding: 14, background: 'var(--bg-secondary)' }}>
                  {internationalGroups.map((group) => {
                    const isOpen = expandedInternationalFolders[group.literal] ?? false;
                    return (
                      <div key={group.literal} style={{ border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)', overflow: 'hidden' }}>
                        <button
                          type="button"
                          onClick={() => toggleInternationalFolder(group.literal)}
                          style={{
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            padding: '14px 18px',
                            display: 'grid',
                            gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
                            gap: 12,
                            alignItems: 'center',
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontSize: '1.1rem', color: 'var(--primary-light)' }}>{isOpen ? '▾' : '▸'}</span>
                          <span>
                            <span style={{ display: 'block', fontWeight: 800, color: 'var(--primary-light)' }}>{group.literal}</span>
                            <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {group.literal_name}
                            </span>
                          </span>
                          <span className="tag">{group.documents.length} archivos</span>
                          <span className="tag">{group.documents.length * internationalKeys.length} evaluaciones</span>
                        </button>

                        {isOpen && (
                          <div style={{ display: 'grid', gap: 12, padding: '0 14px 14px' }}>
                            {group.documents.map((result) => (
                              <div key={result.evidence_id} style={{ border: '1px solid var(--border-light)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-primary)' }}>
                                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-light)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
                                  <div>
                                    <div style={{ fontWeight: 700, color: 'var(--text)' }}>{getDocumentKind(result.documento)}</div>
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {result.documento}
                                    </div>
                                  </div>
                                  <span className="tag">Archivo</span>
                                </div>

                                <div style={{ display: 'grid' }}>
                                  {internationalKeys.map((key) => {
                                    const standard = result.evaluacion_internacional?.[key];
                                    if (!standard) return null;
                                    return (
                                      <div key={`${result.evidence_id}-${key}`} style={{ display: 'grid', gridTemplateColumns: '170px 160px minmax(0, 1fr)', gap: 18, padding: '14px', borderBottom: '1px solid var(--border-light)', alignItems: 'start' }}>
                                        <div>
                                          <div style={{ fontWeight: 800 }}>{standard.nombre}</div>
                                          <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{Math.round(standard.porcentaje)}%</div>
                                        </div>
                                        <ScoreBar score={standard.puntaje} max={standard.puntaje_maximo} color={getScoreColor(standard.porcentaje)} />
                                        <div style={{ display: 'grid', gap: 8 }}>
                                          {(standard.criterios || []).map((criterion) => {
                                            const status = getCriterionStatus(criterion.puntaje, criterion.puntaje_maximo);
                                            return (
                                              <div key={criterion.criterio} style={{ display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) auto auto', gap: 10, alignItems: 'center', paddingBottom: 8, borderBottom: '1px solid var(--border-light)' }}>
                                                <div>
                                                  <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{criterion.criterio}</div>
                                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{criterion.observacion}</div>
                                                </div>
                                                <span className={`badge ${status.badge}`}>{status.label}</span>
                                                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: getScoreColor((criterion.puntaje / criterion.puntaje_maximo) * 100), minWidth: 48, textAlign: 'right' }}>
                                                  {criterion.puntaje}/{criterion.puntaje_maximo}
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
