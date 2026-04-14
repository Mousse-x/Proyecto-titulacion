import StatCard, { ScoreCard } from '../../components/common/StatCard';
import TransparencyRadar from '../../components/charts/TransparencyRadar';
import Badge from '../../components/common/Badge';
import { useAuth } from '../../context/AuthContext';
import { mockUniversities, mockIndicators, mockDocuments, mockObservations, getRadarData, getScoreColor, getScoreLabel, mockScores } from '../../data/mockData';

export default function UnivDashboard() {
  const { user } = useAuth();
  const univ = mockUniversities.find(u => u.id === (user?.university_id || 1)) || mockUniversities[0];
  const radarData = getRadarData(univ.id);
  const scores = mockScores[univ.id] || {};

  const docStats = {
    total:    mockDocuments.length,
    approved: mockDocuments.filter(d=>d.status==='Aprobado').length,
    pending:  mockDocuments.filter(d=>d.status==='En revisión').length,
    rejected: mockDocuments.filter(d=>d.status==='Rechazado').length,
  };
  const pendingObs = mockObservations.filter(o=>o.university===univ.name && o.status!=='Resuelta');

  return (
    <div style={{ animation:'slideIn 0.3s ease' }}>
      {/* University banner */}
      <div className="card" style={{ marginBottom:24, background:`linear-gradient(135deg, ${univ.color}18, ${univ.color}08)`, borderColor:`${univ.color}30` }}>
        <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
          <div style={{ width:64, height:64, borderRadius:14, background:`${univ.color}22`, border:`2px solid ${univ.color}66`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, color:univ.color, fontSize:'1rem', flexShrink:0 }}>
            {univ.logo_initials}
          </div>
          <div style={{ flex:1 }}>
            <h2 style={{ margin:0, color:'var(--text)' }}>{univ.full_name}</h2>
            <p style={{ margin:'4px 0 0', fontSize:'0.875rem', color:'var(--text-muted)' }}>
              {univ.city} · {univ.province} · {univ.faculties} Facultades · {univ.students?.toLocaleString()} estudiantes
            </p>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <Badge status={univ.type} />
              <Badge status={`Acreditación ${univ.accreditation}`} />
              <span className="tag">Rec. Dr. {univ.rector?.split(' ').slice(-2).join(' ')}</span>
            </div>
          </div>
          <div style={{ textAlign:'center' }}>
            <ScoreCard score={univ.transparency_score} size={90} label="Índice ITI 2026" />
            <div style={{ marginTop:6 }}>
              <Badge status={getScoreLabel(univ.transparency_score)} />
              <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)', marginTop:4 }}>Rank #{univ.rank} Nacional</div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="stat-grid" style={{ marginBottom:24 }}>
        <StatCard icon="📄" label="Documentos cargados" value={docStats.total} color={univ.color} iconBg={`${univ.color}22`} />
        <StatCard icon="✅" label="Documentos aprobados" value={docStats.approved} color="var(--success)" iconBg="var(--success-subtle)" />
        <StatCard icon="⏳" label="En revisión" value={docStats.pending} color="var(--warning)" iconBg="var(--warning-subtle)" />
        <StatCard icon="❌" label="Rechazados" value={docStats.rejected} color="var(--danger)" iconBg="var(--danger-subtle)" />
        <StatCard icon="💬" label="Obs. pendientes" value={pendingObs.length} color="var(--danger)" iconBg="var(--danger-subtle)" />
        <StatCard icon="📋" label="Indicadores" value={mockIndicators.length} color="var(--primary)" iconBg="var(--primary-subtle)" />
      </div>

      {/* Radar + Indicators */}
      <div className="grid-21" style={{ marginBottom:24 }}>
        <div className="chart-card">
          <div className="chart-title">🕸️ Perfil de Transparencia por Categoría</div>
          <TransparencyRadar data={radarData} color={univ.color} height={300} />
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">📊 Indicadores por categoría</span>
          </div>
          {radarData.map(cat => (
            <div key={cat.subject} style={{ padding:'10px 0', borderBottom:'1px solid var(--border-light)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:'0.8125rem', fontWeight:500 }}>{cat.subject}</span>
                <span style={{ fontWeight:700, color:getScoreColor(cat.score) }}>{cat.score}</span>
              </div>
              <div className="progress-bar">
                <div className={`progress-fill ${cat.score>=80?'green':cat.score>=60?'yellow':'red'}`} style={{ width:`${cat.score}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending observations alert */}
      {pendingObs.length > 0 && (
        <div className="card" style={{ border:'1px solid rgba(239,68,68,0.3)', background:'var(--danger-subtle)' }}>
          <div className="card-header">
            <span className="card-title" style={{ color:'var(--danger)' }}>⚠️ Observaciones Pendientes</span>
            <Badge status={`${pendingObs.length} sin resolver`} />
          </div>
          {pendingObs.map(obs=>(
            <div key={obs.id} style={{ padding:'12px 0', borderBottom:'1px solid rgba(239,68,68,0.15)' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                <span style={{ fontFamily:'monospace', background:'var(--danger-subtle)', color:'var(--danger)', padding:'2px 8px', borderRadius:4, fontSize:'0.75rem', flexShrink:0 }}>{obs.indicator_code}</span>
                <div>
                  <div style={{ fontSize:'0.875rem', color:'var(--text)', fontWeight:500, marginBottom:3 }}>{obs.message}</div>
                  <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)' }}>
                    {obs.auditor || 'Sistema'} · {obs.date} · <Badge status={obs.severity} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
