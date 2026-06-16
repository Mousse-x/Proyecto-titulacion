import { useEffect, useMemo, useState } from 'react';
import TransparencyRadar from '../../components/charts/TransparencyRadar';
import { ScoreCard } from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import { api } from '../../api/client';
import { getScoreColor, getScoreLabel } from '../../utils/score';
import { getUniversityLogo } from '../../data/universityLogos';

export default function ComparativesPage() {
  const [rankings, setRankings] = useState([]);
  const [univA, setUnivA] = useState('');
  const [univB, setUnivB] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stats()
      .then((res) => {
        const rows = res.data.ranking || [];
        setRankings(rows);
        setUnivA(rows[0]?.id ? String(rows[0].id) : '');
        setUnivB(rows[1]?.id ? String(rows[1].id) : rows[0]?.id ? String(rows[0].id) : '');
      })
      .catch(() => setRankings([]))
      .finally(() => setLoading(false));
  }, []);

  const uA = rankings.find((u) => String(u.id) === String(univA));
  const uB = rankings.find((u) => String(u.id) === String(univB));

  const comparisonRows = useMemo(() => {
    if (!uA || !uB) return [];
    return [
      {
        label: 'Indice nacional',
        a: uA.transparency_score || 0,
        b: uB.transparency_score || 0,
      },
      {
        label: 'Nacional + internacional',
        a: uA.integrated_transparency_score || 0,
        b: uB.integrated_transparency_score || 0,
      },
      {
        label: 'Documentos evaluados',
        a: uA.evaluated_documents || 0,
        b: uB.evaluated_documents || 0,
      },
    ];
  }, [uA, uB]);

  const radarA = comparisonRows.map((row) => ({ subject: row.label, score: row.label === 'Documentos evaluados' ? Math.min(100, row.a) : row.a }));
  const radarB = comparisonRows.map((row) => ({ subject: row.label, score: row.label === 'Documentos evaluados' ? Math.min(100, row.b) : row.b }));

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Analisis Comparativo</h1>
          <p>Comparacion con valores reales calculados desde las validaciones</p>
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="empty-state"><h4>Cargando comparativas...</h4></div></div>
      ) : rankings.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h4>Sin evaluaciones calculadas</h4>
            <p>Ejecuta la evaluacion LOTAIP para comparar instituciones.</p>
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
                  <ScoreCard score={u?.transparency_score || 0} size={60} />
                </div>
                <select className="form-input" value={val} onChange={(e) => setter(e.target.value)}>
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
              <div className="chart-title">{uA?.name} - perfil real</div>
              <TransparencyRadar data={radarA} color="var(--primary)" height={260} />
            </div>
            <div className="chart-card">
              <div className="chart-title">{uB?.name} - perfil real</div>
              <TransparencyRadar data={radarB} color="var(--accent)" height={260} />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Comparativa de indices reales</span>
            </div>
            {comparisonRows.map((row) => {
              const diff = Number((row.a - row.b).toFixed(2));
              return (
                <div key={row.label} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{row.label}</span>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, color: getScoreColor(row.a) }}>{row.a}</span>
                      <span style={{ color: 'var(--text-subtle)' }}>vs</span>
                      <span style={{ fontWeight: 700, color: getScoreColor(row.b) }}>{row.b}</span>
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
