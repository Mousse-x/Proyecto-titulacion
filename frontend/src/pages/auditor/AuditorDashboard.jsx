import StatCard from '../../components/common/StatCard';
import RankingBar from '../../components/charts/RankingBar';
import TrendLine from '../../components/charts/TrendLine';
import Badge from '../../components/common/Badge';
import { mockSystemStats, mockRankings, mockHistoricalScores, mockObservations, mockDocuments, getScoreColor, getScoreLabel } from '../../data/mockData';

export default function AuditorDashboard() {
  return (
    <div style={{ animation:'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Panel del Auditor</h1>
          <p>Vista consolidada del sistema de transparencia institucional — Solo lectura</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <span className="badge badge-info" style={{ padding:'8px 14px', fontSize:'0.8125rem' }}>🔍 Modo Solo Lectura</span>
          <button className="btn btn-secondary">📥 Exportar vista</button>
        </div>
      </div>

      {/* System KPIs */}
      <div className="stat-grid" style={{ marginBottom:24 }}>
        <StatCard icon="🏛️" label="Universidades evaluadas" value={mockSystemStats.total_universities} color="var(--primary)" iconBg="var(--primary-subtle)" />
        <StatCard icon="📊" label="Promedio ITI nacional" value={mockSystemStats.avg_transparency} suffix="%" color="var(--accent)" iconBg="var(--accent-subtle)" change="+3.2 vs 2025" />
        <StatCard icon="📄" label="Documentos totales" value={mockSystemStats.total_documents} color="var(--info)" iconBg="var(--info-subtle)" />
        <StatCard icon="✅" label="Docs. aprobados" value={mockSystemStats.approved_docs} color="var(--success)" iconBg="var(--success-subtle)" />
        <StatCard icon="⏳" label="Pendientes validación" value={mockSystemStats.pending_reviews} color="var(--warning)" iconBg="var(--warning-subtle)" />
        <StatCard icon="💬" label="Obs. abiertas" value={mockSystemStats.observations_open} color="var(--danger)" iconBg="var(--danger-subtle)" />
      </div>

      {/* Charts */}
      <div className="grid-21" style={{ marginBottom:24 }}>
        <div className="chart-card">
          <div className="chart-title">📈 Evolución del ITI Nacional 2022–2026</div>
          <TrendLine data={mockHistoricalScores} height={280} />
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">🏆 Clasificación 2026</span>
          </div>
          {mockRankings.map((u,i)=>(
            <div key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border-light)' }}>
              <div className={`rank-number rank-${i<3?i+1:'n'}`}>{i+1}</div>
              <div style={{ width:38, height:38, borderRadius:8, background:`${u.color}22`, border:`1px solid ${u.color}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', fontWeight:800, color:u.color, flexShrink:0 }}>
                {u.logo_initials}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:'0.875rem', color:'var(--text)' }}>{u.name}</div>
                <div className="progress-bar" style={{ marginTop:4 }}>
                  <div className="progress-fill" style={{ width:`${u.transparency_score}%`, background:getScoreColor(u.transparency_score) }} />
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontWeight:800, color:getScoreColor(u.transparency_score) }}>{u.transparency_score}</div>
                <div style={{ fontSize:'0.6875rem', color:'var(--text-subtle)' }}>{getScoreLabel(u.transparency_score)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rankings bar + recent activity */}
      <div className="grid-2">
        <div className="chart-card">
          <div className="chart-title">📊 Índice por Universidad {new Date().getFullYear()}</div>
          <RankingBar data={mockRankings} height={250} />
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">📋 Documentos recientes</span>
          </div>
          {mockDocuments.slice(0,6).map(doc=>(
            <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid var(--border-light)' }}>
              <span style={{ fontSize:'1.125rem' }}>{doc.type==='PDF'?'📄':doc.type==='XLSX'?'📊':'🔗'}</span>
              <div style={{ flex:1, overflow:'hidden' }}>
                <div style={{ fontSize:'0.8125rem', fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{doc.title}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)' }}>{doc.uploaded_at} · {doc.indicator_code}</div>
              </div>
              <Badge status={doc.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
