import { useEffect, useState } from 'react';
import { ScoreCard } from '../../components/common/StatCard';
import RankingBar from '../../components/charts/RankingBar';
import Badge from '../../components/common/Badge';
import { api } from '../../api/client';
import { getScoreColor, getScoreLabel } from '../../data/mockData';
import { getUniversityLogo } from '../../data/universityLogos';

export default function RankingsPage() {
  const [selected, setSelected] = useState(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stats()
      .then((res) => {
        const realRankings = (res.data.ranking || []).map((u) => ({
          ...u,
          logo_initials: u.name,
          color: 'var(--primary)',
        }));
        setRankings(realRankings);
        setSelected(realRankings[0] || null);
      })
      .catch(() => {
        setRankings([]);
        setSelected(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedLogo = selected ? getUniversityLogo(selected) : null;

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Rankings Nacionales</h1>
          <p>Clasificacion de universidades por indices reales de transparencia</p>
        </div>
        <div className="page-header-actions">
          <select className="form-input" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)}>
            {['2022', '2023', '2024', '2025', '2026'].map((item) => <option key={item}>{item}</option>)}
          </select>
          <button className="btn btn-secondary">Exportar PDF</button>
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="empty-state"><h4>Cargando ranking...</h4></div></div>
      ) : rankings.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h4>Sin evaluaciones calculadas</h4>
            <p>Ejecuta la evaluacion LOTAIP para generar rankings reales.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid-21" style={{ marginBottom: 24 }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Tabla de clasificacion {year}</span>
              </div>
              {rankings.map((u, i) => {
                const logo = getUniversityLogo(u);
                return (
                  <div
                    key={u.id}
                    className="doc-status-row"
                    style={{ cursor: 'pointer', border: selected?.id === u.id ? '1px solid var(--primary)' : '1px solid var(--border)', background: selected?.id === u.id ? 'var(--primary-subtle)' : undefined }}
                    onClick={() => setSelected(u)}
                  >
                    <div className={`rank-number rank-${i < 3 ? i + 1 : 'n'}`}>{i + 1}</div>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: logo ? '#fff' : `${u.color}22`, border: logo ? '1px solid var(--border)' : `1px solid ${u.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 800, color: u.color, padding: logo ? 4 : 0 }}>
                      {logo ? <img src={logo} alt={`Logo ${u.full_name || u.name}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : u.logo_initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9375rem' }}>{u.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{u.full_name}</div>
                      <div className="progress-bar" style={{ marginTop: 6 }}>
                        <div className="progress-fill" style={{ width: `${u.transparency_score}%`, background: getScoreColor(u.transparency_score) }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: getScoreColor(u.transparency_score) }}>{u.transparency_score}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Integrado: {u.integrated_transparency_score || 0}%</div>
                      <Badge status={getScoreLabel(u.transparency_score)} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card">
                {selected && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 12, background: selectedLogo ? '#fff' : `${selected.color}22`, border: selectedLogo ? '1px solid var(--border)' : `2px solid ${selected.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: selected.color, fontSize: '0.875rem', padding: selectedLogo ? 5 : 0 }}>
                        {selectedLogo ? <img src={selectedLogo} alt={`Logo ${selected.full_name || selected.name}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : selected.logo_initials}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--text)' }}>{selected.name}</div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-subtle)' }}>{selected.full_name}</div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <ScoreCard score={selected.transparency_score || 0} size={82} label="Nacional" />
                      <ScoreCard score={selected.integrated_transparency_score || 0} size={82} label="Nacional + internacional" />
                    </div>
                    <div style={{ marginTop: 14, textAlign: 'center', color: 'var(--text-subtle)', fontSize: '0.8125rem' }}>
                      {selected.evaluated_documents || 0} documentos evaluados
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="chart-card">
              <div className="chart-title">Indice nacional {year}</div>
              <RankingBar data={rankings.map((u) => ({ name: u.name, transparency_score: u.transparency_score }))} height={260} />
            </div>
            <div className="chart-card">
              <div className="chart-title">Indice nacional + internacional {year}</div>
              <RankingBar data={rankings.map((u) => ({ name: u.name, transparency_score: u.integrated_transparency_score || 0 }))} height={260} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
