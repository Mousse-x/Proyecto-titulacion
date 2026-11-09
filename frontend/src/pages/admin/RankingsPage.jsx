import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ScoreLegend from '../../components/common/ScoreLegend';
import { ScoreCard } from '../../components/common/StatCard';
import RankingBar from '../../components/charts/RankingBar';
import Badge from '../../components/common/Badge';
import PeriodSelect, { SimulatedNotice } from '../../components/common/PeriodSelect';
import useDashboardStats from '../../hooks/useDashboardStats';
import { getScoreColor, getScoreInk, getScoreLabel } from '../../utils/score';
import { getUniversityLogo } from '../../data/universityLogos';

const EMPTY_STATS = { ranking: [], available_periods: [] };

export default function RankingsPage() {
  const { stats, loading, periodId, selectPeriod } = useDashboardStats(EMPTY_STATS);
  const rankings = useMemo(() => (stats.ranking || []).map((u) => ({
    ...u,
    logo_initials: u.name,
    color: 'var(--primary)',
  })), [stats.ranking]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const { pathname } = useLocation();
  const rolePrefix = '/' + (pathname.split('/')[1] || 'admin');
  const normalizedQuery = query.trim().toLocaleLowerCase('es');
  const visibleRankings = normalizedQuery
    ? rankings.filter((u) => `${u.name} ${u.full_name}`.toLocaleLowerCase('es').includes(normalizedQuery))
    : rankings;
  const selected = rankings.find((u) => u.id === selectedId) || rankings[0] || null;
  const breakdownUrl = selected
    ? `${rolePrefix}/validation?university_id=${selected.id}${periodId ? `&period_id=${periodId}` : ''}`
    : '#';
  const setSelected = (u) => setSelectedId(u.id);
  const periodName = stats.period?.name || '';

  const selectedLogo = selected ? getUniversityLogo(selected) : null;

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Rankings nacionales</h1>
          <p>Clasificación de universidades por el Índice de Transparencia Institucional (ITI) del período</p>
        </div>
        <div className="page-header-actions">
          <PeriodSelect stats={stats} value={periodId} onChange={selectPeriod} />
        </div>
      </div>

      <SimulatedNotice stats={stats} />
      {loading ? (
        <div className="card"><div className="empty-state" aria-busy="true"><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 12px' }} /><h4>Cargando ranking...</h4></div></div>
      ) : rankings.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <h4>Sin evaluaciones calculadas</h4>
            <p>Aún no hay universidades evaluadas en este período. Ejecuta la evaluación en «Evaluación de transparencia» o elige otro período.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid-21" style={{ marginBottom: 24 }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Tabla de clasificación {periodName}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <input type="search" className="form-input" style={{ flex: 1, minWidth: 200 }} value={query}
                  onChange={(e) => setQuery(e.target.value)} placeholder="Buscar universidad por siglas o nombre"
                  aria-label="Buscar universidad en el ranking" />
                <ScoreLegend />
              </div>
              {visibleRankings.length === 0 && (
                <div className="empty-state" style={{ padding: 24 }}>
                  <h4>Sin resultados para «{query}»</h4>
                  <button className="btn btn-secondary btn-sm" onClick={() => setQuery('')}>✕ Limpiar búsqueda</button>
                </div>
              )}
              {visibleRankings.map((u) => {
                const i = rankings.indexOf(u);
                const logo = getUniversityLogo(u);
                return (
                  <div
                    key={u.id}
                    className="doc-status-row"
                    style={{ cursor: 'pointer', border: selected?.id === u.id ? '1px solid var(--primary)' : '1px solid var(--border)', background: selected?.id === u.id ? 'var(--primary-subtle)' : undefined }}
                    onClick={() => setSelected(u)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(u))}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected?.id === u.id}
                    aria-label={`Puesto ${i + 1}: ${u.name}, ITI ${Number(u.integrated_transparency_score).toFixed(2)} %`}
                  >
                    <div className={`rank-number rank-${i < 3 ? i + 1 : 'n'}`}>{i + 1}</div>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: logo ? '#fff' : `${u.color}22`, border: logo ? '1px solid var(--border)' : `1px solid ${u.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 800, color: u.color, padding: logo ? 4 : 0 }}>
                      {logo ? <img src={logo} alt={`Logo ${u.full_name || u.name}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : u.logo_initials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: '0.9375rem' }}>{u.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{u.full_name}</div>
                      <div className="progress-bar" style={{ marginTop: 6 }}>
                        <div className="progress-fill" style={{ width: `${u.integrated_transparency_score}%`, background: getScoreColor(u.integrated_transparency_score) }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: getScoreInk(u.integrated_transparency_score) }} title="Índice de Transparencia Institucional (ITI)">{Number(u.integrated_transparency_score).toFixed(2)}%</div>
                      <Badge status={getScoreLabel(u.integrated_transparency_score)} />
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
                      <ScoreCard score={selected.transparency_score || 0} size={82} label="SITA" />
                      <ScoreCard score={selected.integrated_transparency_score || 0} size={82} label="Índice final ITI" />
                    </div>
                    <div style={{ marginTop: 14, textAlign: 'center', color: 'var(--text-subtle)', fontSize: '0.8125rem' }}>
                      {selected.evaluated_documents || 0} documentos evaluados · {periodName}
                    </div>
                    <Link to={breakdownUrl} className="btn btn-primary link-button" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
                      title="Abre la evaluación con cada indicador, su calificación y su evidencia">
                      VER DESGLOSE DE INDICADORES Y EVIDENCIAS
                    </Link>
                    {selected.dimensions?.length > 0 && (
                      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {selected.dimensions.map((d) => (
                          <div key={d.code} title={d.name}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: 3 }}>
                              <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.code} · {d.name}</span>
                              <strong>{d.score == null ? '—' : `${Number(d.score).toFixed(1)}%`}</strong>
                            </div>
                            <div className="progress-bar"><div className="progress-fill" style={{ width: `${d.score || 0}%`, background: getScoreColor(d.score || 0) }} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid-2">
            <div className="chart-card">
              <div className="chart-title">SITA {periodName}</div>
              <RankingBar label="SITA por universidad" data={rankings.map((u) => ({ name: u.name, transparency_score: u.transparency_score }))} height={260} />
            </div>
            <div className="chart-card">
              <div className="chart-title">Índice final ITI (nacional + internacional) {periodName}</div>
              <RankingBar label="ITI por universidad" data={rankings.map((u) => ({ name: u.name, transparency_score: Number(Number(u.integrated_transparency_score || 0).toFixed(2)) }))} height={260} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
