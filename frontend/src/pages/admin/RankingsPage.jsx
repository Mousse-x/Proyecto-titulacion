import { useState } from 'react';
import { ScoreCard } from '../../components/common/StatCard';
import RankingBar from '../../components/charts/RankingBar';
import TrendLine from '../../components/charts/TrendLine';
import TransparencyRadar from '../../components/charts/TransparencyRadar';
import Badge from '../../components/common/Badge';
import { mockRankings, mockHistoricalScores, getRadarData, getScoreColor, getScoreLabel } from '../../data/mockData';

export default function RankingsPage() {
  const [selected, setSelected] = useState(mockRankings[0]);
  const [year, setYear]         = useState('2026');

  const radarData = getRadarData(selected.id);

  return (
    <div style={{ animation:'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Rankings Nacionales 2026</h1>
          <p>Clasificación de universidades por Índice de Transparencia Institucional</p>
        </div>
        <div className="page-header-actions">
          <select className="form-input" style={{ width:'auto' }} value={year} onChange={e=>setYear(e.target.value)}>
            {['2022','2023','2024','2025','2026'].map(y=><option key={y}>{y}</option>)}
          </select>
          <button className="btn btn-secondary">📥 Exportar PDF</button>
        </div>
      </div>

      {/* Main ranking table */}
      <div className="grid-21" style={{ marginBottom:24 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">🏆 Tabla de Clasificación {year}</span>
          </div>
          {mockRankings.map((u,i) => (
            <div
              key={u.id}
              className={`doc-status-row`}
              style={{ cursor:'pointer', border: selected.id===u.id ? '1px solid var(--primary)':'1px solid var(--border)', background: selected.id===u.id?'var(--primary-subtle)':undefined }}
              onClick={()=>setSelected(u)}
            >
              <div className={`rank-number rank-${i<3?i+1:'n'}`}>{i+1}</div>
              <div style={{ width:40, height:40, borderRadius:8, background:`${u.color}22`, border:`1px solid ${u.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', fontWeight:800, color:u.color }}>
                {u.logo_initials}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:'var(--text)', fontSize:'0.9375rem' }}>{u.name}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)' }}>{u.full_name}</div>
                <div className="progress-bar" style={{ marginTop:6 }}>
                  <div className="progress-fill" style={{ width:`${u.transparency_score}%`, background:getScoreColor(u.transparency_score) }} />
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:'1.5rem', fontWeight:900, color:getScoreColor(u.transparency_score) }}>{u.transparency_score}</div>
                <Badge status={getScoreLabel(u.transparency_score)} />
              </div>
            </div>
          ))}
        </div>

        {/* Selected university detail */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card">
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
              <div style={{ width:52, height:52, borderRadius:12, background:`${selected.color}22`, border:`2px solid ${selected.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:selected.color, fontSize:'0.875rem' }}>
                {selected.logo_initials}
              </div>
              <div>
                <div style={{ fontWeight:700, fontSize:'1.125rem', color:'var(--text)' }}>{selected.name}</div>
                <div style={{ fontSize:'0.8125rem', color:'var(--text-subtle)' }}>{selected.city} · {selected.type}</div>
              </div>
              <ScoreCard score={selected.transparency_score} size={64} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {Object.entries(selected.categories || {}).map(([cat, score])=>(
                <div key={cat} style={{ background:'var(--bg-tertiary)', borderRadius:'var(--radius-sm)', padding:'8px 12px' }}>
                  <div style={{ fontSize:'0.6875rem', color:'var(--text-subtle)' }}>{cat}</div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:3 }}>
                    <span style={{ fontWeight:700, color:getScoreColor(score) }}>{score}</span>
                    <div className="progress-bar" style={{ width:45 }}>
                      <div className="progress-fill" style={{ width:`${score}%`, background:getScoreColor(score) }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-title">Perfil de Transparencia — {selected.name}</div>
            <TransparencyRadar data={radarData} color={selected.color} height={220} />
          </div>
        </div>
      </div>

      {/* Bar + Trend */}
      <div className="grid-2">
        <div className="chart-card">
          <div className="chart-title">📊 Comparativa de Índices {year}</div>
          <RankingBar data={mockRankings} height={260} />
        </div>
        <div className="chart-card">
          <div className="chart-title">📈 Evolución Histórica 2022–2026</div>
          <TrendLine data={mockHistoricalScores} height={260} />
        </div>
      </div>
    </div>
  );
}
