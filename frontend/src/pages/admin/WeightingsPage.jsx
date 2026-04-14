import { useState } from 'react';
import DonutChart from '../../components/charts/DonutChart';
import { mockWeightings } from '../../data/mockData';

export default function WeightingsPage() {
  const [cats, setCats]   = useState(mockWeightings.categories);
  const [fws, setFws]     = useState(mockWeightings.frameworks);
  const [tab, setTab]     = useState('categories');
  const [saved, setSaved] = useState(false);

  const totalCat = cats.reduce((s,c)=>s+c.weight,0);
  const totalFw  = fws.reduce((s,f)=>s+f.weight,0);

  const updateCat = (i, val) => {
    setCats(prev => prev.map((c,idx) => idx===i ? {...c, weight:Math.max(0,Math.min(100,Number(val)))} : c));
    setSaved(false);
  };
  const updateFw = (i, val) => {
    setFws(prev => prev.map((f,idx) => idx===i ? {...f, weight:Math.max(0,Math.min(100,Number(val)))} : f));
    setSaved(false);
  };

  const handleSave = () => { setSaved(true); setTimeout(()=>setSaved(false),3000); };

  return (
    <div style={{ animation:'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Ponderaciones del Índice</h1>
          <p>Configure el peso relativo de cada categoría y marco normativo</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={handleSave}>💾 Guardar cambios</button>
        </div>
      </div>

      {saved && <div className="alert alert-success" style={{ marginBottom:20 }}>✅ Ponderaciones guardadas exitosamente.</div>}

      <div className="tabs">
        {['categories','frameworks'].map(t => (
          <button key={t} className={`tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
            {t==='categories' ? '📊 Por Categoría' : '🌐 Por Marco Normativo'}
          </button>
        ))}
      </div>

      {tab === 'categories' && (
        <div className="grid-21">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Pesos por Categoría</span>
              <span style={{ fontSize:'0.875rem', fontWeight:700, color: totalCat===100?'var(--success)':'var(--danger)' }}>
                Total: {totalCat}% {totalCat!==100 && '⚠️ debe ser 100%'}
              </span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {cats.map((cat,i) => (
                <div key={cat.name} style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:14, height:14, borderRadius:3, background:cat.color, flexShrink:0 }} />
                  <span style={{ flex:1, fontSize:'0.875rem', fontWeight:500, color:'var(--text)' }}>{cat.name}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <input
                      type="range" min={0} max={30} step={0.5}
                      value={cat.weight}
                      onChange={e=>updateCat(i,e.target.value)}
                      style={{ width:120, accentColor:cat.color }}
                    />
                    <div style={{ position:'relative' }}>
                      <input
                        type="number" min={0} max={30} step={0.5}
                        value={cat.weight}
                        onChange={e=>updateCat(i,e.target.value)}
                        className="form-input"
                        style={{ width:70, textAlign:'center', fontWeight:700 }}
                      />
                      <span style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', fontSize:'0.8125rem', color:'var(--text-subtle)', pointerEvents:'none' }}>%</span>
                    </div>
                  </div>
                  <div className="progress-bar" style={{ width:80 }}>
                    <div className="progress-fill" style={{ width:`${cat.weight*100/30}%`, background:cat.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="chart-card">
            <div className="chart-title">Distribución actual</div>
            <DonutChart data={cats} />
            <div style={{ marginTop:16, padding:'12px 14px', background: totalCat===100?'var(--success-subtle)':'var(--danger-subtle)', borderRadius:'var(--radius)', border:`1px solid ${totalCat===100?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)'}`, textAlign:'center' }}>
              <div style={{ fontSize:'0.75rem', color: totalCat===100?'var(--success)':'var(--danger)' }}>
                {totalCat===100 ? '✅ Distribución válida — suma 100%' : `⚠️ Suma actual: ${totalCat}% (necesita 100%)`}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'frameworks' && (
        <div className="grid-21">
          <div className="card">
            <div className="card-header">
              <span className="card-title">Pesos por Marco Normativo</span>
              <span style={{ fontSize:'0.875rem', fontWeight:700, color: totalFw===100?'var(--success)':'var(--danger)' }}>
                Total: {totalFw}%
              </span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {fws.map((fw,i) => (
                <div key={fw.name} style={{ padding:'16px', background:'var(--bg-tertiary)', borderRadius:'var(--radius)', border:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <div>
                      <div style={{ fontWeight:700, color:'var(--text)' }}>{fw.name}</div>
                      <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)' }}>{fw.description}</div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <input
                        type="number" min={0} max={60} step={5}
                        value={fw.weight}
                        onChange={e=>updateFw(i,e.target.value)}
                        className="form-input"
                        style={{ width:70, textAlign:'center', fontWeight:700 }}
                      />
                      <span style={{ color:'var(--text-subtle)' }}>%</span>
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width:`${fw.weight}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="card-title" style={{ marginBottom:16 }}>📋 Descripción de marcos</div>
            {[
              { name:'LOTAIP', icon:'🇪🇨', desc:'Ley Orgánica de Transparencia y Acceso a la Información Pública del Ecuador. Marco obligatorio principal.' },
              { name:'OGP', icon:'🌐', desc:'Open Government Partnership — criterios internacionales de gobierno abierto y datos públicos.' },
              { name:'OCDE', icon:'🏛️', desc:'Estándares OCDE para integridad, rendición de cuentas e instituciones efectivas.' },
              { name:'ODS', icon:'🎯', desc:'Objetivos de Desarrollo Sostenible ONU — Meta 16.6 y 16.10 sobre transparencia.' },
            ].map(fw=>(
              <div key={fw.name} style={{ padding:'12px', background:'var(--bg-tertiary)', borderRadius:'var(--radius)', marginBottom:10, border:'1px solid var(--border)' }}>
                <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                  <span style={{ fontSize:'1.5rem' }}>{fw.icon}</span>
                  <div>
                    <div style={{ fontWeight:700, color:'var(--text)', marginBottom:4 }}>{fw.name}</div>
                    <div style={{ fontSize:'0.8125rem', color:'var(--text-muted)', lineHeight:1.5 }}>{fw.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
