import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ScoreCard } from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import { api } from '../../api/client';
import { validationApi } from '../../api/validation';
import { getScoreColor, getScoreInk, getScoreLabel } from '../../utils/score';
import { getUniversityLogo } from '../../data/universityLogos';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const MONTH_ORDER = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

function EvolutionTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{label}</div>
      {payload.map((item) => (
        <div key={item.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 18, color: item.color, fontSize: '0.8125rem', marginBottom: 2 }}>
          <span>{item.name}</span>
          <strong>{item.value == null ? 'Pendiente' : `${Number(item.value).toFixed(2)}%`}</strong>
        </div>
      ))}
    </div>
  );
}

export default function TransparencyIndexPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedUniversityId = searchParams.get('university_id');
  const [rankings, setRankings] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [evolutionResults, setEvolutionResults] = useState([]);
  const [integratedResult, setIntegratedResult] = useState(null);
  const [monthlyIntegrated, setMonthlyIntegrated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [evolutionLoading, setEvolutionLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.stats(), api.universities.list()])
      .then(([statsRes, universitiesRes]) => {
        const rows = statsRes.data.ranking || [];
        setRankings(rows);
        setUniversities(universitiesRes.data || []);
        const exists = rows.some((row) => String(row.id) === String(requestedUniversityId));
        setSelectedId(exists ? String(requestedUniversityId) : (rows[0]?.id ? String(rows[0].id) : ''));
      })
      .catch(() => {
        setRankings([]);
        setUniversities([]);
        setSelectedId('');
      })
      .finally(() => setLoading(false));
  }, [requestedUniversityId]);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setEvolutionLoading(true);
    });
    validationApi.getLatestPeriod(selectedId)
      .then((res) => {
        const period = res.data?.period;
        if (!period?.id) {
          if (!cancelled) {
            setSelectedPeriod('');
            setEvolutionResults([]);
          }
          return null;
        }

        if (!cancelled) setSelectedPeriod(String(period.id));
        return validationApi.getSummary(selectedId, period.id);
      })
      .then((res) => {
        if (!cancelled && res) {
          setEvolutionResults(res.data.results || []);
          setIntegratedResult(res.data.summary?.integrated || null);
          setMonthlyIntegrated(res.data.summary?.monthly_integrated || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedPeriod('');
          setEvolutionResults([]);
          setIntegratedResult(null);
          setMonthlyIntegrated([]);
        }
      })
      .finally(() => {
        if (!cancelled) setEvolutionLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedId]);

  const { pathname } = useLocation();
  const rolePrefix = pathname.startsWith('/auditor') ? '/auditor' : '/university';
  const selected = rankings.find((u) => String(u.id) === String(selectedId)) || rankings[0];
  const internationalScore = integratedResult?.component_scores?.international?.score ?? null;
  const breakdownUrl = `${rolePrefix}/validation?university_id=${selected?.id || selectedId}${selectedPeriod ? `&period_id=${selectedPeriod}` : ''}`;
  const selectedUniversity = universities.find((u) => String(u.id) === String(selectedId)) || selected || {};
  const national = selected?.transparency_score || 0;
  const integrated = integratedResult?.index_percent ?? selected?.integrated_transparency_score ?? null;
  const evaluatedDocs = selected?.evaluated_documents || 0;
  const institutionName = selectedUniversity.full_name || selected?.full_name || selected?.name || 'Universidad';
  const institutionAcronym = selectedUniversity.name || selected?.name || 'UNIV';
  const institutionWebsite = selectedUniversity.website || '';
  const institutionTransparencyUrl = selectedUniversity.transparency_url || '';
  const institutionLocation = [selectedUniversity.city, selectedUniversity.province].filter(Boolean).join(', ');
  const institutionLogo = getUniversityLogo(selectedUniversity);

  const evolutionData = useMemo(() => {
    const byMonth = Object.fromEntries(monthlyIntegrated.map((row) => [row.month, row]));
    const annualInternational = internationalScore == null ? null : Number(internationalScore);
    const grouped = evolutionResults.reduce((acc, result) => {
      const label = result.periodo || 'Sin periodo';
      if (!acc[label]) {
        acc[label] = {
          periodo: label,
          nacionalTotal: 0,
          documentos: 0,
        };
      }
      acc[label].nacionalTotal += Number(result.puntaje_total || 0);
      acc[label].documentos += 1;
      return acc;
    }, {});

    return Object.values(grouped)
      .map((item) => {
        const [monthName = '', year = ''] = String(item.periodo).toLowerCase().split(' ');
        const monthly = byMonth[MONTH_ORDER[monthName]] || {};
        return {
          periodo: item.periodo,
          sort: Number(year) * 100 + (MONTH_ORDER[monthName] || 0),
          nacional: Number((item.nacionalTotal / item.documentos).toFixed(2)),
          internacional: monthly.international ?? annualInternational,
          iti: monthly.index_percent ?? null,
          documentos: item.documentos,
        };
      })
      .sort((a, b) => a.sort - b.sort);
  }, [evolutionResults, monthlyIntegrated, internationalScore]);

  const dimensionData = useMemo(() => (integratedResult?.dimension_scores || []).map((dimension) => ({
    code: dimension.code,
    name: dimension.name,
    subject: `${dimension.code} · ${dimension.name}`,
    score: dimension.score == null ? 0 : Number(dimension.score),
    pending: dimension.pending || 0,
    weight: dimension.weight,
  })), [integratedResult]);

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Índice de Transparencia Institucional</h1>
          <p>Un único resultado ponderado a partir de LOTAIP y los complementos internacionales verificables
            <Link to="/ayuda#indice" className="info-button" title="¿Cómo se calcula el ITI?" aria-label="Ayuda: cómo se calcula el ITI">?</Link>
          </p>
        </div>
        <div className="page-header-actions" style={{ alignItems: 'flex-end' }}>
          <div className="filter-field period-picker">
            <label htmlFor="index-univ">Universidad</label>
            <div className="period-picker-box">
              <svg className="period-picker-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 9.5 12 4l9 5.5" />
                <path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8" />
                <path d="M3 20.5h18" />
              </svg>
              <select
                id="index-univ"
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setSearchParams({ university_id: e.target.value });
                }}
                disabled={!rankings.length}
                title={rankings.length > 1 ? `Hay ${rankings.length} universidades disponibles` : undefined}
              >
                {rankings.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} - {u.full_name}</option>
                ))}
              </select>
              <svg className="period-picker-chevron" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="empty-state" aria-busy="true"><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 12px' }} /><h4>Cargando índices...</h4></div></div>
      ) : !selected ? (
        <div className="card">
          <div className="empty-state">
            <h4>Sin evaluaciones calculadas</h4>
            <p>Aún no hay resultados. El administrador debe ejecutar la evaluación LOTAIP en «Evaluación de transparencia» para generar los índices.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ width: 60, height: 60, borderRadius: 14, background: institutionLogo ? '#fff' : 'var(--primary-subtle)', border: institutionLogo ? '1px solid var(--border)' : '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: 'var(--primary-light)', fontSize: '1rem', flexShrink: 0, padding: institutionLogo ? 6 : 0 }}>
                {institutionLogo ? <img src={institutionLogo} alt={`Logo ${selected.full_name || selected.name}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : selected.name}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0 }}>{selected.full_name}</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  {evaluatedDocs} documentos evaluados{selectedPeriod && integratedResult?.international_year ? ` · Año ${integratedResult.international_year}` : ''}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                <ScoreCard score={national} size={90} label="Nacional (LOTAIP)" />
                {internationalScore == null ? (
                  <div style={{ width: 110, textAlign: 'center', color: 'var(--warning)', fontWeight: 800 }}>
                    <div style={{ fontSize: '1rem' }}>Pendiente</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: 4 }}>Internacional</div>
                  </div>
                ) : <ScoreCard score={Number(internationalScore)} size={90} label="Internacional" />}
                {integrated == null ? (
                  <div style={{ width: 110, textAlign: 'center', color: 'var(--warning)', fontWeight: 800 }}>
                    <div style={{ fontSize: '1rem' }}>Pendiente</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: 4 }}>Índice final ITI</div>
                  </div>
                ) : <ScoreCard score={integrated} size={90} label="Índice final ITI" />}
              </div>
            </div>
          </div>

          <div
            className="grid-21"
            style={{
              marginBottom: 24,
              gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)',
              alignItems: 'stretch',
            }}
          >
            <div className="card" style={{ display: 'grid', alignContent: 'start', gap: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 62, height: 62, borderRadius: 8, background: institutionLogo ? '#fff' : 'var(--primary-subtle)', border: institutionLogo ? '1px solid var(--border)' : '1px solid #b7d9f5', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem', fontWeight: 900, flexShrink: 0, padding: institutionLogo ? 6 : 0 }}>
                  {institutionLogo ? <img src={institutionLogo} alt={`Logo ${institutionName}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : institutionAcronym.slice(0, 5)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '1.35rem', lineHeight: 1.1, fontWeight: 900, color: 'var(--text)' }}>{institutionAcronym}</div>
                  <div style={{ marginTop: 4, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.25 }}>{institutionName}</div>
                </div>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text)', textTransform: 'uppercase', marginBottom: 4 }}>Página web</div>
                  {institutionWebsite ? (
                    <a href={institutionWebsite} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none', overflowWrap: 'anywhere' }}>
                      {institutionWebsite.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    <span style={{ color: 'var(--text-subtle)' }}>No registrada</span>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text)', textTransform: 'uppercase', marginBottom: 4 }}>Portal DPE</div>
                  {institutionTransparencyUrl ? (
                    <a href={institutionTransparencyUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none', overflowWrap: 'anywhere' }}>
                      {institutionTransparencyUrl.replace(/^https?:\/\//, '')}
                    </a>
                  ) : (
                    <span style={{ color: 'var(--text-subtle)' }}>No registrado</span>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text)', textTransform: 'uppercase', marginBottom: 4 }}>Ubicación</div>
                  <div style={{ color: institutionLocation ? 'var(--text)' : 'var(--text-subtle)', fontWeight: 700 }}>
                    {institutionLocation || 'No registrada'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)' }}>{evaluatedDocs}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', fontWeight: 700 }}>Documentos evaluados</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: integrated == null ? 'var(--warning)' : getScoreInk(integrated) }}>{integrated == null ? 'Pendiente' : getScoreLabel(integrated)}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', fontWeight: 700 }}>Clasificación</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="chart-card">
              <div className="chart-title">Evolución de la calificación: nacional, internacional e ITI</div>
              {evolutionLoading ? (
                <div className="empty-state" style={{ minHeight: 300 }}>
                  <h4>Cargando evolución...</h4>
                </div>
              ) : evolutionData.length === 0 ? (
                <div className="empty-state" style={{ minHeight: 300 }}>
                  <h4>Sin datos de evolución</h4>
                  <p>No hay documentos validados para construir la serie temporal.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={evolutionData} margin={{ top: 18, right: 24, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" stroke="var(--text-subtle)" strokeOpacity={0.45} vertical horizontal />
                    <XAxis dataKey="periodo" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={{ stroke: 'var(--text-subtle)' }} tickLine={{ stroke: 'var(--text-subtle)' }} />
                    <YAxis domain={[0, 100]} ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={{ stroke: 'var(--text-subtle)' }} tickLine={{ stroke: 'var(--text-subtle)' }} />
                    <Tooltip content={<EvolutionTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: 12, fontSize: '0.8125rem' }} />
                    <Line name="Índice nacional" type="monotone" dataKey="nacional" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, strokeWidth: 0, fill: 'var(--primary)' }} activeDot={{ r: 6 }} />
                    <Line name="Internacional" type="monotone" dataKey="internacional" stroke="#0f9f8f" strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3.5, strokeWidth: 0, fill: '#0f9f8f' }} activeDot={{ r: 6 }} connectNulls />
                    <Line name="Índice final ITI" type="monotone" dataKey="iti" stroke="#e08a00" strokeWidth={3} dot={{ r: 4, strokeWidth: 0, fill: '#e08a00' }} activeDot={{ r: 6 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              )}
              {selectedPeriod && (
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--text-subtle)', fontSize: '0.75rem' }}>
                  <span>Promedio por mes de los documentos validados</span>
                  <span>{evolutionResults.length} documentos en la serie</span>
                </div>
              )}
            </div>
          </div>

          <div className="transparency-dimensions" style={{ marginBottom: 24 }}>
            <div className="chart-card transparency-dimension-chart">
              <div className="chart-title" style={{ marginBottom: 4 }}>Resultado por dimensión integrada</div>
              <p className="transparency-chart-description">
                Puntaje obtenido en cada dimensión del Índice de Transparencia Institucional (0–100 %). Pasa el cursor sobre una barra para ver su valor y peso.
                {' '}<Link to="/ayuda#dimensiones">¿Qué mide cada dimensión?</Link>
              </p>
              {evolutionLoading ? (
                <div className="empty-state" style={{ minHeight: 360 }}>
                  <h4>Cargando dimensiones…</h4>
                </div>
              ) : dimensionData.length === 0 ? (
                <div className="empty-state" style={{ minHeight: 360 }}>
                  <h4>Sin resultado integrado</h4>
                  <p>Ejecuta la evaluación para calcular las ocho dimensiones.</p>
                </div>
              ) : (
                <div className="dimension-bars" role="list" aria-label="Puntajes por dimensión integrada">
                  <div className="dimension-scale" aria-hidden="true">
                    <span />
                    <div><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
                    <span />
                  </div>
                  {dimensionData.map((item) => (
                    <div className="dimension-bar-row" role="listitem" key={item.subject}>
                      <div className="dimension-bar-label">
                        <strong>{item.code}</strong>
                        <span>{item.name}</span>
                      </div>
                      <div className="dimension-bar-track" title={`${item.subject}: ${item.score}%${item.weight != null ? ` · peso ${item.weight}% en el ITI` : ''}${item.pending ? ` · ${item.pending} indicador(es) pendiente(s)` : ''}`}>
                        <div
                          className="dimension-bar-fill"
                          style={{ width: `${Math.max(0, Math.min(item.score, 100))}%`, background: getScoreColor(item.score) }}
                        />
                      </div>
                      <strong className="dimension-bar-score" style={{ color: getScoreInk(item.score) }}>
                        {Number(item.score).toFixed(1).replace('.0', '')}%
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Detalle institucional</span>
              <Link to={breakdownUrl} className="btn btn-secondary btn-sm link-button">Ver indicadores y evidencias →</Link>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Componente</th>
                    <th>Puntaje</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Transparencia nacional LOTAIP</td>
                    <td><span style={{ fontWeight: 800, color: getScoreInk(national) }}>{national}%</span></td>
                    <td><Badge status={getScoreLabel(national)} /></td>
                  </tr>
                  <tr>
                    <td>Componente complementario internacional</td>
                    <td><span style={{ fontWeight: 800, color: internationalScore == null ? 'var(--warning)' : getScoreInk(internationalScore) }}>{internationalScore == null ? 'Pendiente' : `${Number(internationalScore).toFixed(2)}%`}</span></td>
                    <td><Badge status={internationalScore == null ? 'Pendiente' : getScoreLabel(internationalScore)} /></td>
                  </tr>
                  <tr>
                    <td><strong>Índice de Transparencia Institucional (resultado único)</strong></td>
                    <td><span style={{ fontWeight: 800, color: integrated == null ? 'var(--warning)' : getScoreInk(integrated) }}>{integrated == null ? 'Pendiente' : `${integrated}%`}</span></td>
                    <td><Badge status={integrated == null ? 'Provisional' : getScoreLabel(integrated)} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
