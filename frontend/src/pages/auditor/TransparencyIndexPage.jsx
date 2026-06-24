import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScoreCard } from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import { api } from '../../api/client';
import { validationApi } from '../../api/validation';
import { getScoreColor, getScoreLabel } from '../../utils/score';
import { getUniversityLogo } from '../../data/universityLogos';
import {
  Bar,
  BarChart,
  Cell,
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
          <strong>{Number(item.value || 0).toFixed(2)}%</strong>
        </div>
      ))}
    </div>
  );
}

function InternationalTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0].value || 0);
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>{label}</div>
      <div style={{ color: getScoreColor(value), fontSize: '0.8125rem' }}>
        Cumplimiento: <strong>{value.toFixed(2)}%</strong>
      </div>
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
      setSelectedPeriod('');
      setEvolutionResults([]);
      return;
    }

    let cancelled = false;
    setEvolutionLoading(true);
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
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedPeriod('');
          setEvolutionResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setEvolutionLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedId]);

  const selected = rankings.find((u) => String(u.id) === String(selectedId)) || rankings[0];
  const selectedUniversity = universities.find((u) => String(u.id) === String(selectedId)) || selected || {};
  const national = selected?.transparency_score || 0;
  const integrated = selected?.integrated_transparency_score || 0;
  const evaluatedDocs = selected?.evaluated_documents || 0;
  const institutionName = selectedUniversity.full_name || selected?.full_name || selected?.name || 'Universidad';
  const institutionAcronym = selectedUniversity.name || selected?.name || 'UNIV';
  const institutionWebsite = selectedUniversity.website || '';
  const institutionTransparencyUrl = selectedUniversity.transparency_url || '';
  const institutionLocation = [selectedUniversity.city, selectedUniversity.province].filter(Boolean).join(', ');
  const institutionLogo = getUniversityLogo(selectedUniversity);

  const evolutionData = useMemo(() => {
    const grouped = evolutionResults.reduce((acc, result) => {
      const label = result.periodo || 'Sin periodo';
      if (!acc[label]) {
        acc[label] = {
          periodo: label,
          nacionalTotal: 0,
          integradoTotal: 0,
          documentos: 0,
        };
      }
      acc[label].nacionalTotal += Number(result.puntaje_total || 0);
      acc[label].integradoTotal += Number(result.evaluacion_internacional?.indice_nacional_internacional || result.puntaje_total || 0);
      acc[label].documentos += 1;
      return acc;
    }, {});

    return Object.values(grouped)
      .map((item) => {
        const [monthName = '', year = ''] = String(item.periodo).toLowerCase().split(' ');
        return {
          periodo: item.periodo,
          sort: Number(year) * 100 + (MONTH_ORDER[monthName] || 0),
          nacional: Number((item.nacionalTotal / item.documentos).toFixed(2)),
          integrado: Number((item.integradoTotal / item.documentos).toFixed(2)),
          documentos: item.documentos,
        };
      })
      .sort((a, b) => a.sort - b.sort);
  }, [evolutionResults]);

  const internationalRadarData = useMemo(() => {
    const standards = [
      { key: 'ogp', subject: 'OGP' },
      { key: 'ocde', subject: 'OCDE' },
      { key: 'ods', subject: 'ODS 16' },
    ];

    const rows = standards.map((standard) => {
      const values = evolutionResults
        .map((result) => result.evaluacion_internacional?.[standard.key]?.porcentaje)
        .filter((value) => value !== undefined && value !== null)
        .map(Number);

      const score = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;

      return {
        subject: standard.subject,
        score: Number(score.toFixed(2)),
      };
    });

    const promedio = rows.length
      ? rows.reduce((sum, row) => sum + row.score, 0) / rows.length
      : 0;

    return [
      { subject: 'LOTAIP', score: Number(Number(national || 0).toFixed(2)) },
      ...rows,
      { subject: 'Promedio internacional', score: Number(promedio.toFixed(2)) },
    ];
  }, [evolutionResults, national]);

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Indice de Transparencia Institucional</h1>
          <p>Valores reales calculados desde las validaciones LOTAIP e internacionales</p>
        </div>
        <div className="page-header-actions">
          <select
            className="form-input"
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setSearchParams({ university_id: e.target.value });
            }}
            disabled={!rankings.length}
          >
            {rankings.map((u) => (
              <option key={u.id} value={u.id}>{u.name} - {u.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="empty-state"><h4>Cargando indices...</h4></div></div>
      ) : !selected ? (
        <div className="card">
          <div className="empty-state">
            <h4>Sin evaluaciones calculadas</h4>
            <p>Ejecuta la evaluacion LOTAIP para generar indices reales.</p>
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
                  {evaluatedDocs} documentos evaluados
                </p>
              </div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                <ScoreCard score={national} size={90} label="Indice nacional" />
                <ScoreCard score={integrated} size={90} label="Nacional + internacional" />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: getScoreColor(integrated), lineHeight: 1 }}>
                    {getScoreLabel(integrated)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: 4 }}>Clasificacion integrada</div>
                </div>
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
                  <div style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text)', textTransform: 'uppercase', marginBottom: 4 }}>Pagina web</div>
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
                  <div style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text)', textTransform: 'uppercase', marginBottom: 4 }}>Ubicacion</div>
                  <div style={{ color: institutionLocation ? 'var(--text)' : 'var(--text-subtle)', fontWeight: 700 }}>
                    {institutionLocation || 'No registrada'}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text)', textTransform: 'uppercase', marginBottom: 8 }}>Indicadores actuales</div>
                  {[
                    { label: 'Indice nacional', score: national },
                    { label: 'Nacional + internacional', score: integrated },
                  ].map((item) => (
                    <div key={item.label} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 10 }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{item.label}</span>
                        <span style={{ fontWeight: 900, color: getScoreColor(item.score) }}>{item.score}%</span>
                      </div>
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${item.score}%`, background: getScoreColor(item.score) }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)' }}>{evaluatedDocs}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', fontWeight: 700 }}>Documentos evaluados</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 900, color: getScoreColor(integrated) }}>{getScoreLabel(integrated)}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', fontWeight: 700 }}>Clasificacion</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="chart-card">
              <div className="chart-title">Evolucion de calificacion de documentos</div>
              {evolutionLoading ? (
                <div className="empty-state" style={{ minHeight: 300 }}>
                  <h4>Cargando evolucion...</h4>
                </div>
              ) : evolutionData.length === 0 ? (
                <div className="empty-state" style={{ minHeight: 300 }}>
                  <h4>Sin datos de evolucion</h4>
                  <p>No hay documentos validados para construir la serie temporal.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={evolutionData} margin={{ top: 18, right: 24, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
                    <XAxis dataKey="periodo" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-subtle)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<EvolutionTooltip />} />
                    <Legend wrapperStyle={{ paddingTop: 12, fontSize: '0.8125rem' }} />
                    <Line name="Indice nacional" type="monotone" dataKey="nacional" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, strokeWidth: 0, fill: 'var(--primary)' }} activeDot={{ r: 6 }} />
                    <Line name="Nacional + internacional" type="monotone" dataKey="integrado" stroke="var(--success)" strokeWidth={2.4} dot={{ r: 4, strokeWidth: 0, fill: 'var(--success)' }} activeDot={{ r: 6 }} />
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

          <div className="grid-21" style={{ marginBottom: 24 }}>
            <div className="chart-card">
              <div className="chart-title">Evaluacion por estandares internacionales</div>
              {evolutionLoading ? (
                <div className="empty-state" style={{ minHeight: 300 }}>
                  <h4>Cargando evaluacion internacional...</h4>
                </div>
              ) : evolutionResults.length === 0 ? (
                <div className="empty-state" style={{ minHeight: 300 }}>
                  <h4>Sin evaluacion internacional</h4>
                  <p>No hay resultados validados para construir el perfil internacional.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={internationalRadarData} layout="vertical" margin={{ top: 8, right: 34, bottom: 8, left: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-light)" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-subtle)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="subject" width={138} tick={{ fill: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<InternationalTooltip />} />
                    <Bar dataKey="score" radius={[0, 8, 8, 0]} barSize={28}>
                      {internationalRadarData.map((item) => (
                        <Cell key={item.subject} fill={getScoreColor(item.score)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Marcos internacionales</div>
              {internationalRadarData.map((item) => (
                <div key={item.subject} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, gap: 12 }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{item.subject}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 800, color: getScoreColor(item.score) }}>{item.score}%</span>
                      <Badge status={getScoreLabel(item.score)} />
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${item.score}%`, background: getScoreColor(item.score) }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Detalle institucional</span>
              <span className="tag">{evaluatedDocs} documentos evaluados</span>
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
                    <td><span style={{ fontWeight: 800, color: getScoreColor(national) }}>{national}%</span></td>
                    <td><Badge status={getScoreLabel(national)} /></td>
                  </tr>
                  <tr>
                    <td>Transparencia nacional + internacional</td>
                    <td><span style={{ fontWeight: 800, color: getScoreColor(integrated) }}>{integrated}%</span></td>
                    <td><Badge status={getScoreLabel(integrated)} /></td>
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
