import { useMemo, useState } from 'react';
import TransparencyRadar from '../../components/charts/TransparencyRadar';
import { ScoreCard } from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import PeriodSelect, { SimulatedNotice } from '../../components/common/PeriodSelect';
import useDashboardStats from '../../hooks/useDashboardStats';
import { getScoreColor, getScoreLabel } from '../../utils/score';
import { getUniversityLogo } from '../../data/universityLogos';

const EMPTY_STATS = { ranking: [], available_periods: [] };
const LOTAIP_COMPONENTS = [['CTA', 'Información completa y actualizada'], ['ETA', 'Estructura de datos abiertos'],
  ['RP', 'Registro dentro del plazo'], ['CI', 'Calidad de la información']];
const round = (value) => Number(Number(value || 0).toFixed(2));

export default function ComparativesPage() {
  const { stats, loading, periodId, selectPeriod } = useDashboardStats(EMPTY_STATS);
  const rankings = stats.ranking || [];
  const [univA, setUnivA] = useState('');
  const [univB, setUnivB] = useState('');

  // Sin elección, se comparan las dos primeras del ranking del período.
  const uA = rankings.find((u) => String(u.id) === String(univA)) || rankings[0];
  const uB = rankings.find((u) => String(u.id) === String(univB)) || rankings[1] || rankings[0];

  const comparisonRows = useMemo(() => {
    if (!uA || !uB) return [];
    const rows = [
      { label: 'Índice final ITI', a: round(uA.integrated_transparency_score), b: round(uB.integrated_transparency_score) },
      { label: 'Índice nacional (SITA)', a: round(uA.transparency_score), b: round(uB.transparency_score) },
    ];
    LOTAIP_COMPONENTS.forEach(([code, name]) => rows.push({
      label: `LOTAIP ${code} · ${name}`, a: round(uA.lotaip_components?.[code]), b: round(uB.lotaip_components?.[code]),
    }));
    (uA.dimensions || []).forEach((dimension) => {
      const other = (uB.dimensions || []).find((d) => d.code === dimension.code);
      rows.push({ label: `${dimension.code} · ${dimension.name}`, a: round(dimension.score), b: round(other?.score) });
    });
    return rows;
  }, [uA, uB]);

  // El radar compara el perfil por las ocho dimensiones del modelo integrado.
  const radarFor = (u) => (u?.dimensions || []).map((d) => ({ subject: d.code, score: round(d.score) }));
  const radarA = radarFor(uA);
  const radarB = radarFor(uB);

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Análisis comparativo</h1>
          <p>Comparación por índice, componentes LOTAIP y dimensiones{stats.period ? ` · ${stats.period.name}` : ''}</p>
        </div>
        <div className="page-header-actions">
          <PeriodSelect stats={stats} value={periodId} onChange={selectPeriod} />
        </div>
      </div>
      <SimulatedNotice stats={stats} />

      {loading ? (
        <div className="card"><div className="empty-state" aria-busy="true"><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 12px' }} /><h4>Cargando comparativas...</h4></div></div>
      ) : rankings.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h4>Sin evaluaciones calculadas</h4>
            <p>Aún no hay universidades evaluadas en este período. Elige otro período o ejecuta la evaluación en «Evaluación de transparencia».</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid-2" style={{ marginBottom: 24 }}>
            {[[uA, univA, setUnivA, 'A'], [uB, univB, setUnivB, 'B']].map(([u, val, setter, label]) => {
              const logo = getUniversityLogo(u);
              return (
              <div key={label} className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: logo ? '#fff' : 'var(--primary-subtle)', border: logo ? '1px solid var(--border)' : '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--primary-light)', fontSize: '0.8125rem', flexShrink: 0, padding: logo ? 5 : 0 }}>
                    {logo ? (
                      <img src={logo} alt={`Logo ${u?.full_name || u?.name || label}`} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                    ) : (
                      u?.name || label
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{u?.name || 'N/A'}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{u?.full_name || 'Sin datos'}</div>
                  </div>
                  <ScoreCard score={u?.integrated_transparency_score || 0} size={60} />
                </div>
                <label className="form-label" htmlFor={`cmp-${label}`}>Universidad {label}</label>
                <select id={`cmp-${label}`} className="form-input" value={u?.id ? String(u.id) : val} onChange={(e) => setter(e.target.value)}>
                  {rankings.map((item) => <option key={item.id} value={item.id}>{item.name} - {item.full_name}</option>)}
                </select>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <Badge status={`${u?.evaluated_documents || 0} documentos`} />
                  <span className="tag" style={{ marginLeft: 'auto' }}>Nacional {u?.transparency_score || 0}%</span>
                </div>
              </div>
              );
            })}
          </div>

          <div className="grid-2" style={{ marginBottom: 24 }}>
            <div className="chart-card">
              <div className="chart-title">{uA?.name} - perfil por dimensión</div>
              <TransparencyRadar data={radarA} color="var(--primary)" height={260} />
            </div>
            <div className="chart-card">
              <div className="chart-title">{uB?.name} - perfil por dimensión</div>
              <TransparencyRadar data={radarB} color="var(--accent)" height={260} />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Comparativa detallada (valores en %)</span>
              <span className="tag">{uA?.name} vs {uB?.name}</span>
            </div>
            {uA?.id === uB?.id && (
              <div className="alert alert-info" style={{ marginBottom: 12 }}>Estás comparando la misma universidad. Elige otra en el selector «Universidad B».</div>
            )}
            {comparisonRows.map((row) => {
              const diff = Number((row.a - row.b).toFixed(2));
              return (
                <div key={row.label} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{row.label}</span>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: getScoreColor(row.a) }}>{row.a}%</span>
                      <span style={{ color: 'var(--text-subtle)' }}>vs</span>
                      <span style={{ fontWeight: 700, color: getScoreColor(row.b) }}>{row.b}%</span>
                      <span style={{ fontWeight: 700, color: diff > 0 ? 'var(--primary-light)' : diff < 0 ? 'var(--accent)' : 'var(--text-subtle)' }}>
                        {diff > 0 ? `+${diff} ${uA?.name}` : diff < 0 ? `${Math.abs(diff)} ${uB?.name}` : 'Empate'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--primary-light)', width: 54 }}>{uA?.name}</span>
                      <div className="progress-bar" style={{ flex: 1 }}>
                        <div style={{ height: '100%', borderRadius: 3, background: 'var(--primary)', width: `${Math.min(100, row.a)}%` }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, width: 42, textAlign: 'right' }}>{row.a}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent)', width: 54 }}>{uB?.name}</span>
                      <div className="progress-bar" style={{ flex: 1 }}>
                        <div style={{ height: '100%', borderRadius: 3, background: 'var(--accent)', width: `${Math.min(100, row.b)}%` }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, width: 42, textAlign: 'right' }}>{row.b}</span>
                    </div>
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'center', textAlign: 'center' }}>
              <div style={{ background: 'var(--primary-subtle)', borderRadius: 'var(--radius)', padding: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{uA?.full_name}</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: getScoreColor(uA?.integrated_transparency_score || 0) }}>{uA?.integrated_transparency_score || 0}</div>
                <Badge status={getScoreLabel(uA?.integrated_transparency_score || 0)} />
              </div>
              <div style={{ fontSize: '1.5rem', color: 'var(--text-subtle)' }}>vs</div>
              <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', padding: 12, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{uB?.full_name}</div>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: getScoreColor(uB?.integrated_transparency_score || 0) }}>{uB?.integrated_transparency_score || 0}</div>
                <Badge status={getScoreLabel(uB?.integrated_transparency_score || 0)} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
