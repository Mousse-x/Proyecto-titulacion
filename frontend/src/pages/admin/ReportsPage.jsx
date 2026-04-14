import { useState } from 'react';
import { mockUniversities, mockRankings } from '../../data/mockData';

const REPORT_TYPES = [
  { id:'ranking',   icon:'🏆', title:'Ranking Nacional de Transparencia', desc:'Clasificación de universidades por ITI 2026' },
  { id:'university',icon:'🏛️', title:'Informe por Universidad',            desc:'Reporte detallado de cumplimiento individual' },
  { id:'indicator', icon:'📋', title:'Cumplimiento por Indicador',         desc:'Estado de cada indicador LOTAIP / Internacional' },
  { id:'timeline',  icon:'📈', title:'Evolución Histórica',                 desc:'Progresión del ITI 2022–2026' },
  { id:'executive', icon:'📄', title:'Resumen Ejecutivo',                   desc:'Reporte ejecutivo para autoridades' },
];

export default function ReportsPage() {
  const [selType, setSelType]   = useState('ranking');
  const [selUniv, setSelUniv]   = useState('all');
  const [selFormat, setFormat]  = useState('PDF');
  const [generating, setGen]    = useState(false);
  const [generated, setGenDone] = useState(false);

  const handleGenerate = async () => {
    setGen(true);
    setGenDone(false);
    await new Promise(r=>setTimeout(r,1800));
    setGen(false);
    setGenDone(true);
    setTimeout(()=>setGenDone(false),4000);
  };

  const rType = REPORT_TYPES.find(r=>r.id===selType);

  return (
    <div style={{ animation:'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Generador de Reportes</h1>
          <p>Crea y exporta informes de transparencia en distintos formatos</p>
        </div>
      </div>

      <div className="grid-12">
        {/* Config panel */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Type selector */}
          <div className="card">
            <div className="card-title" style={{ marginBottom:14 }}>1. Tipo de reporte</div>
            {REPORT_TYPES.map(r => (
              <div
                key={r.id}
                onClick={()=>setSelType(r.id)}
                style={{
                  display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
                  borderRadius:'var(--radius)', cursor:'pointer', marginBottom:6,
                  background: selType===r.id ? 'var(--primary-subtle)' : 'var(--bg-tertiary)',
                  border: `1px solid ${selType===r.id?'rgba(99,102,241,0.4)':'var(--border)'}`,
                  transition:'all var(--transition)',
                }}
              >
                <span style={{ fontSize:'1.375rem' }}>{r.icon}</span>
                <div>
                  <div style={{ fontWeight:600, fontSize:'0.875rem', color:'var(--text)' }}>{r.title}</div>
                  <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)' }}>{r.desc}</div>
                </div>
                {selType===r.id && <span style={{ marginLeft:'auto', color:'var(--primary-light)' }}>●</span>}
              </div>
            ))}
          </div>

          {/* Options */}
          <div className="card">
            <div className="card-title" style={{ marginBottom:14 }}>2. Opciones</div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              <div className="form-group">
                <label className="form-label">Universidad</label>
                <select className="form-input" value={selUniv} onChange={e=>setSelUniv(e.target.value)}>
                  <option value="all">Todas las universidades</option>
                  {mockUniversities.map(u=><option key={u.id} value={u.id}>{u.name} — {u.full_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Período</label>
                <select className="form-input" defaultValue="2026">
                  {['2022','2023','2024','2025','2026','2022-2026'].map(y=><option key={y}>{y}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Formato de exportación</label>
                <div style={{ display:'flex', gap:8 }}>
                  {['PDF','XLSX','CSV','HTML'].map(f=>(
                    <button
                      key={f}
                      className={`btn ${selFormat===f?'btn-primary':'btn-secondary'} btn-sm`}
                      onClick={()=>setFormat(f)}
                    >{f}</button>
                  ))}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {['Incluir gráficas','Incluir anexos','Resumen ejecutivo'].map(opt=>(
                  <label key={opt} style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.8125rem', color:'var(--text-muted)', cursor:'pointer' }}>
                    <input type="checkbox" defaultChecked style={{ accentColor:'var(--primary)' }} /> {opt}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Preview & Generate */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div className="card" style={{ flex:1 }}>
            <div className="card-title" style={{ marginBottom:14 }}>Vista previa del reporte</div>
            <div style={{ background:'var(--bg-tertiary)', borderRadius:'var(--radius)', padding:24, minHeight:380, display:'flex', flexDirection:'column', gap:16 }}>
              {/* Simulated report preview */}
              <div style={{ display:'flex', alignItems:'center', gap:14, paddingBottom:16, borderBottom:'2px solid var(--primary)' }}>
                <div style={{ fontSize:'2rem' }}>{rType?.icon}</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:'1rem', color:'var(--text)' }}>{rType?.title}</div>
                  <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)' }}>
                    Escuela Superior Politécnica de Chimborazo · Tesis de Grado
                  </div>
                  <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)' }}>
                    Período: 2026 · Generado: {new Date().toLocaleDateString('es-EC')}
                  </div>
                </div>
              </div>

              {/* Mini ranking table preview */}
              {mockRankings.map((u,i)=>(
                <div key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border-light)' }}>
                  <span style={{ width:20, fontWeight:700, color:'var(--text-muted)', fontSize:'0.8125rem' }}>{i+1}</span>
                  <span style={{ flex:1, fontWeight:600, color:'var(--text)', fontSize:'0.875rem' }}>{u.name}</span>
                  <span style={{ fontSize:'0.875rem' }}>{u.city}</span>
                  <div style={{ width:60 }}>
                    <div className="progress-bar" style={{ height:4 }}>
                      <div className="progress-fill" style={{ width:`${u.transparency_score}%` }} />
                    </div>
                  </div>
                  <span style={{ fontWeight:800, color:'var(--primary-light)', minWidth:36, textAlign:'right' }}>{u.transparency_score}</span>
                </div>
              ))}

              <div style={{ marginTop:'auto', padding:'10px 14px', background:'var(--bg-card)', borderRadius:'var(--radius)', fontSize:'0.75rem', color:'var(--text-subtle)', textAlign:'center' }}>
                📄 Vista previa — el reporte real incluirá gráficas, tablas detalladas y análisis estadístico
              </div>
            </div>
          </div>

          {/* Generate button */}
          <button
            className="btn btn-primary btn-lg"
            onClick={handleGenerate}
            disabled={generating}
            style={{ width:'100%', justifyContent:'center' }}
          >
            {generating ? (
              <><span className="spinner" /> Generando reporte...</>
            ) : (
              `📥 Generar y Descargar ${selFormat}`
            )}
          </button>

          {generated && (
            <div className="alert alert-success">
              ✅ <strong>Reporte generado.</strong> En un entorno real el archivo se descargaría automáticamente.
            </div>
          )}

          {/* Recent reports */}
          <div className="card">
            <div className="card-title" style={{ marginBottom:12 }}>📁 Reportes recientes</div>
            {[
              { name:'Ranking_Nacional_2026.pdf', date:'12/04/2026', size:'2.1 MB', icon:'📄' },
              { name:'ESPOCH_Informe_Q1.xlsx',    date:'05/04/2026', size:'890 KB', icon:'📊' },
              { name:'Indicadores_LOTAIP_2026.pdf',date:'28/03/2026', size:'3.4 MB', icon:'📋' },
            ].map(f=>(
              <div key={f.name} className="doc-status-row" style={{ marginBottom:6 }}>
                <span style={{ fontSize:'1.25rem' }}>{f.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text)' }}>{f.name}</div>
                  <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)' }}>{f.date} · {f.size}</div>
                </div>
                <button className="btn btn-secondary btn-sm">📥</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
