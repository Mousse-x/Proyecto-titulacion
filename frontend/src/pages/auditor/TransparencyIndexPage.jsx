import { useState } from 'react';
import { ScoreCard } from '../../components/common/StatCard';
import TransparencyRadar from '../../components/charts/TransparencyRadar';
import Badge from '../../components/common/Badge';
import { mockUniversities, mockIndicators, mockScores, mockWeightings, getRadarData, getScoreColor, getScoreLabel } from '../../data/mockData';

function calcIndex(univId) {
  const scores = mockScores[univId] || {};
  const totalWeight = mockIndicators.reduce((s,i)=>s+i.weight,0);
  const weighted = mockIndicators.reduce((s,ind)=>s+(ind.weight*(scores[ind.id]||0)/100),0);
  return Math.round((weighted/totalWeight)*100*10)/10;
}

export default function TransparencyIndexPage() {
  const [selUniv, setSelUniv] = useState(1);
  const univ = mockUniversities.find(u=>u.id===selUniv) || mockUniversities[0];
  const radarData = getRadarData(selUniv);
  const scores = mockScores[selUniv] || {};

  // Category scores
  const catScores = radarData.map(c=>({ ...c }));

  // Calculated index
  const calculatedIndex = calcIndex(selUniv);

  return (
    <div style={{ animation:'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Índice de Transparencia Institucional</h1>
          <p>Cálculo detallado del ITI según marcos LOTAIP · OGP · OCDE · ODS</p>
        </div>
        <div className="page-header-actions">
          <select className="form-input" value={selUniv} onChange={e=>setSelUniv(Number(e.target.value))}>
            {mockUniversities.map(u=><option key={u.id} value={u.id}>{u.name} — {u.full_name}</option>)}
          </select>
          <button className="btn btn-secondary">📥 Exportar</button>
        </div>
      </div>

      {/* University card + main score */}
      <div className="card" style={{ marginBottom:24, background:`linear-gradient(135deg,${univ.color}12,${univ.color}06)`, borderColor:`${univ.color}30` }}>
        <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
          <div style={{ width:60, height:60, borderRadius:14, background:`${univ.color}22`, border:`2px solid ${univ.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, color:univ.color, fontSize:'1rem', flexShrink:0 }}>
            {univ.logo_initials}
          </div>
          <div style={{ flex:1 }}>
            <h2 style={{ margin:0 }}>{univ.full_name}</h2>
            <p style={{ margin:'4px 0 0', fontSize:'0.875rem' }}>{univ.city} · Acreditación {univ.accreditation} · Rank #{univ.rank} Nacional</p>
          </div>
          {/* 3 score rings */}
          <div style={{ display:'flex', gap:20, alignItems:'center' }}>
            <ScoreCard score={calculatedIndex} size={90} label="ITI Calculado" />
            <div style={{ width:1, height:60, background:'var(--border)' }} />
            <ScoreCard score={univ.rank === 1 ? 100 : Math.max(10, 100 - univ.rank*15)} size={72} label="Ranking" />
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'2rem', fontWeight:900, color:getScoreColor(calculatedIndex), lineHeight:1 }}>
                {getScoreLabel(calculatedIndex)}
              </div>
              <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)', marginTop:4 }}>Clasificación</div>
            </div>
          </div>
        </div>
      </div>

      {/* Radar + Category breakdown */}
      <div className="grid-21" style={{ marginBottom:24 }}>
        <div className="chart-card">
          <div className="chart-title">🕸️ Perfil Multidimensional de Transparencia</div>
          <TransparencyRadar data={radarData} color={univ.color} height={300} />
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom:14 }}>📊 Score por Categoría</div>
          {catScores.map(c=>(
            <div key={c.subject} style={{ marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontSize:'0.8125rem', fontWeight:500, color:'var(--text)' }}>{c.subject}</span>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontWeight:700, color:getScoreColor(c.score) }}>{c.score}</span>
                  <Badge status={getScoreLabel(c.score)} />
                </div>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width:`${c.score}%`, background:getScoreColor(c.score) }} />
              </div>
            </div>
          ))}
          {/* Ponderación summary */}
          <div style={{ marginTop:16, padding:'12px 14px', background:'var(--bg-tertiary)', borderRadius:'var(--radius)', border:'1px solid var(--border)' }}>
            <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)', marginBottom:8 }}>Distribución de ponderación activa</div>
            {mockWeightings.frameworks.map(fw=>(
              <div key={fw.name} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:5 }}>
                <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', width:50 }}>{fw.name}</span>
                <div className="progress-bar" style={{ flex:1 }}>
                  <div className="progress-fill" style={{ width:`${fw.weight}%` }} />
                </div>
                <span style={{ fontSize:'0.75rem', fontWeight:700, color:'var(--primary-light)', width:28, textAlign:'right' }}>{fw.weight}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Indicator detail table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📋 Detalle por Indicador — {univ.name}</span>
          <span style={{ fontSize:'0.8125rem', color:'var(--text-subtle)' }}>{mockIndicators.length} indicadores evaluados</span>
        </div>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Indicador</th>
                <th>Marco</th>
                <th>Categoría</th>
                <th>Peso</th>
                <th>Puntaje</th>
                <th>Contribución</th>
              </tr>
            </thead>
            <tbody>
              {mockIndicators.map(ind=>{
                const score = scores[ind.id]||0;
                const contrib = (ind.weight*(score/100)).toFixed(2);
                return (
                  <tr key={ind.id}>
                    <td>
                      <span style={{ fontFamily:'monospace', background:'var(--bg-tertiary)', padding:'2px 7px', borderRadius:4, fontSize:'0.75rem', color:'var(--primary-light)' }}>{ind.code}</span>
                    </td>
                    <td style={{ maxWidth:220, fontSize:'0.8125rem' }}>{ind.name}</td>
                    <td><Badge status={ind.framework} /></td>
                    <td><span className="tag">{ind.category}</span></td>
                    <td><span style={{ fontWeight:600 }}>{ind.weight}%</span></td>
                    <td>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div className="progress-bar" style={{ width:48 }}>
                          <div className="progress-fill" style={{ width:`${score}%`, background:getScoreColor(score) }} />
                        </div>
                        <span style={{ fontWeight:700, color:getScoreColor(score) }}>{score}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight:700, color:'var(--primary-light)' }}>{contrib}</span>
                    </td>
                  </tr>
                );
              })}
              <tr style={{ background:'var(--bg-tertiary)', fontWeight:700 }}>
                <td colSpan={4} style={{ textAlign:'right', paddingRight:16 }}>ÍNDICE TOTAL CALCULADO</td>
                <td>{mockIndicators.reduce((s,i)=>s+i.weight,0).toFixed(1)}%</td>
                <td><span style={{ fontSize:'1.125rem', fontWeight:900, color:getScoreColor(calculatedIndex) }}>{calculatedIndex}</span></td>
                <td><span style={{ color:'var(--primary-light)', fontWeight:700 }}>{mockIndicators.reduce((s,ind)=>s+(ind.weight*(scores[ind.id]||0)/100),0).toFixed(2)}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
