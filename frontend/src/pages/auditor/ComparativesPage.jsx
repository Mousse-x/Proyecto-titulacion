import { useState } from 'react';
import TransparencyRadar from '../../components/charts/TransparencyRadar';
import { ScoreCard } from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import { mockUniversities, getRadarData, getScoreColor, getScoreLabel, mockScores, mockIndicators } from '../../data/mockData';

export default function ComparativesPage() {
  const [univA, setUnivA] = useState(1); // ESPOCH
  const [univB, setUnivB] = useState(3); // UCE

  const uA = mockUniversities.find(u=>u.id===univA) || mockUniversities[0];
  const uB = mockUniversities.find(u=>u.id===univB) || mockUniversities[2];
  const radarA = getRadarData(univA);
  const radarB = getRadarData(univB);

  // Merged radar for comparison overlay
  const mergedRadar = radarA.map((item,i) => ({
    subject: item.subject,
    [uA.name]: item.score,
    [uB.name]: radarB[i]?.score || 0,
  }));

  // Category comparison
  const categories = radarA.map((item,i)=>({
    cat: item.subject,
    a: item.score,
    b: radarB[i]?.score||0,
  }));

  // Indicator-level comparison (top 10)
  const indicatorComp = mockIndicators.slice(0,10).map(ind=>({
    code: ind.code,
    name: ind.name,
    a: mockScores[univA]?.[ind.id]||0,
    b: mockScores[univB]?.[ind.id]||0,
  }));

  return (
    <div style={{ animation:'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Análisis Comparativo</h1>
          <p>Comparar el perfil de transparencia entre dos instituciones</p>
        </div>
      </div>

      {/* University selectors */}
      <div className="grid-2" style={{ marginBottom:24 }}>
        {[[uA,univA,setUnivA,'A'],[uB,univB,setUnivB,'B']].map(([u,val,setter,label])=>(
          <div key={label} className="card" style={{ border:`2px solid ${u.color}55`, background:`${u.color}06` }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
              <div style={{ width:44, height:44, borderRadius:10, background:`${u.color}22`, border:`2px solid ${u.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, color:u.color, fontSize:'0.8125rem', flexShrink:0 }}>
                {u.logo_initials}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:'var(--text)' }}>{u.name}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)' }}>{u.full_name}</div>
              </div>
              <ScoreCard score={u.transparency_score} size={60} />
            </div>
            <select className="form-input" value={val} onChange={e=>setter(Number(e.target.value))}>
              {mockUniversities.map(m=><option key={m.id} value={m.id}>{m.name} — {m.full_name}</option>)}
            </select>
            <div style={{ marginTop:12, display:'flex', gap:8 }}>
              <Badge status={u.type} />
              <Badge status={u.city} />
              <span className="tag" style={{ marginLeft:'auto' }}>Rank #{u.rank}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Radar comparison */}
      <div className="grid-2" style={{ marginBottom:24 }}>
        <div className="chart-card">
          <div className="chart-title">🕸️ {uA.name} — Perfil por categoría</div>
          <TransparencyRadar data={radarA} color={uA.color} height={260} />
        </div>
        <div className="chart-card">
          <div className="chart-title">🕸️ {uB.name} — Perfil por categoría</div>
          <TransparencyRadar data={radarB} color={uB.color} height={260} />
        </div>
      </div>

      {/* Category-by-category table */}
      <div className="card" style={{ marginBottom:24 }}>
        <div className="card-header">
          <span className="card-title">📊 Comparativa por Categoría</span>
          <div style={{ display:'flex', gap:14, fontSize:'0.8125rem' }}>
            <span style={{ color:uA.color, fontWeight:600 }}>● {uA.name}</span>
            <span style={{ color:uB.color, fontWeight:600 }}>● {uB.name}</span>
          </div>
        </div>
        {categories.map(c=>(
          <div key={c.cat} style={{ padding:'12px 0', borderBottom:'1px solid var(--border-light)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontWeight:600, fontSize:'0.875rem' }}>{c.cat}</span>
              <div style={{ display:'flex', gap:16 }}>
                <span style={{ fontWeight:700, color:getScoreColor(c.a) }}>{c.a}</span>
                <span style={{ color:'var(--text-subtle)' }}>vs</span>
                <span style={{ fontWeight:700, color:getScoreColor(c.b) }}>{c.b}</span>
                <span style={{ fontWeight:700, color: c.a>c.b?uA.color:c.b>c.a?uB.color:'var(--text-subtle)' }}>
                  {c.a>c.b?`+${c.a-c.b} ${uA.name}`:c.b>c.a?`+${c.b-c.a} ${uB.name}`:'Empate'}
                </span>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:'0.75rem', color:uA.color, width:44 }}>{uA.name}</span>
                <div className="progress-bar" style={{ flex:1 }}>
                  <div style={{ height:'100%', borderRadius:3, background:uA.color, width:`${c.a}%`, transition:'width 0.6s ease' }} />
                </div>
                <span style={{ fontSize:'0.75rem', fontWeight:700, color:uA.color, width:28, textAlign:'right' }}>{c.a}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:'0.75rem', color:uB.color, width:44 }}>{uB.name}</span>
                <div className="progress-bar" style={{ flex:1 }}>
                  <div style={{ height:'100%', borderRadius:3, background:uB.color, width:`${c.b}%`, transition:'width 0.6s ease' }} />
                </div>
                <span style={{ fontSize:'0.75rem', fontWeight:700, color:uB.color, width:28, textAlign:'right' }}>{c.b}</span>
              </div>
            </div>
          </div>
        ))}
        {/* Summary */}
        <div style={{ marginTop:16, display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:16, alignItems:'center', textAlign:'center' }}>
          <div style={{ background:`${uA.color}18`, borderRadius:'var(--radius)', padding:'12px', border:`1px solid ${uA.color}30` }}>
            <div style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>{uA.full_name}</div>
            <div style={{ fontSize:'2rem', fontWeight:900, color:uA.color }}>{uA.transparency_score}</div>
            <Badge status={getScoreLabel(uA.transparency_score)} />
          </div>
          <div style={{ fontSize:'1.5rem', color:'var(--text-subtle)' }}>vs</div>
          <div style={{ background:`${uB.color}18`, borderRadius:'var(--radius)', padding:'12px', border:`1px solid ${uB.color}30` }}>
            <div style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>{uB.full_name}</div>
            <div style={{ fontSize:'2rem', fontWeight:900, color:uB.color }}>{uB.transparency_score}</div>
            <Badge status={getScoreLabel(uB.transparency_score)} />
          </div>
        </div>
      </div>

      {/* Indicator comparison */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📋 Detalle por Indicador (Top 10)</span>
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Indicador</th>
                <th style={{ color:uA.color }}>{uA.name}</th>
                <th style={{ color:uB.color }}>{uB.name}</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {indicatorComp.map(ind=>{
                const diff = ind.a - ind.b;
                return (
                  <tr key={ind.code}>
                    <td><span style={{ fontFamily:'monospace', background:'var(--bg-tertiary)', padding:'2px 7px', borderRadius:4, fontSize:'0.8125rem', color:'var(--primary-light)' }}>{ind.code}</span></td>
                    <td style={{ fontSize:'0.8125rem', maxWidth:220 }}>{ind.name}</td>
                    <td><span style={{ fontWeight:700, color:getScoreColor(ind.a) }}>{ind.a}</span></td>
                    <td><span style={{ fontWeight:700, color:getScoreColor(ind.b) }}>{ind.b}</span></td>
                    <td>
                      <span style={{ fontWeight:700, color:diff>0?uA.color:diff<0?uB.color:'var(--text-subtle)' }}>
                        {diff>0?`+${diff}`:diff<0?diff:'—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
