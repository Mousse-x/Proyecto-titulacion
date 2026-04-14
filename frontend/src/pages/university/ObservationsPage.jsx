import { useState } from 'react';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { mockObservations } from '../../data/mockData';

export default function ObservationsPage() {
  const [obs, setObs]   = useState(mockObservations.filter(o=>o.university==='ESPOCH'));
  const [detail, setDetail] = useState(null);
  const [reply, setReply]   = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = filter==='all' ? obs : obs.filter(o=>o.status.toLowerCase().includes(filter));

  const handleResolve = (id) => {
    setObs(prev=>prev.map(o=>o.id===id?{...o,status:'Resuelta'}:o));
    setDetail(null);
  };

  const severityIcon = { Alta:'🔴', Media:'🟡', Baja:'🟢' };

  return (
    <div style={{ animation:'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Observaciones del Auditor</h1>
          <p>{obs.filter(o=>o.status!=='Resuelta').length} observaciones pendientes · {obs.filter(o=>o.status==='Resuelta').length} resueltas</p>
        </div>
      </div>

      {/* Filters */}
      <div className="tabs">
        {[['all','Todas'],['pendiente','Pendientes'],['proceso','En proceso'],['resuelta','Resueltas']].map(([k,l])=>(
          <button key={k} className={`tab ${filter===k?'active':''}`} onClick={()=>setFilter(k)}>{l}</button>
        ))}
      </div>

      {/* Observation cards */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {filtered.map(o=>(
          <div key={o.id} className="card" style={{ borderLeft:`3px solid ${o.severity==='Alta'?'var(--danger)':o.severity==='Media'?'var(--warning)':'var(--info)'}`, cursor:'pointer' }} onClick={()=>setDetail(o)}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
              <span style={{ fontSize:'1.5rem', flexShrink:0 }}>{severityIcon[o.severity]}</span>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6, flexWrap:'wrap' }}>
                  <span className="tag" style={{ fontFamily:'monospace', fontSize:'0.8125rem' }}>{o.indicator_code}</span>
                  <Badge status={o.severity} />
                  <Badge status={o.status} />
                  <span style={{ fontSize:'0.75rem', color:'var(--text-subtle)', marginLeft:'auto' }}>{o.date}</span>
                </div>
                <p style={{ fontSize:'0.875rem', color:'var(--text-muted)', lineHeight:1.6, margin:0 }}>{o.message}</p>
                <div style={{ marginTop:8, fontSize:'0.75rem', color:'var(--text-subtle)' }}>
                  {o.auditor ? `Por: ${o.auditor}` : 'Sin auditor asignado'}
                </div>
              </div>
              {o.status !== 'Resuelta' && (
                <button className="btn btn-success btn-sm" onClick={e=>{e.stopPropagation();setDetail(o);}}>
                  Responder →
                </button>
              )}
            </div>
          </div>
        ))}
        {filtered.length===0 && (
          <div className="empty-state">
            <div className="empty-icon">✅</div>
            <h4>Sin observaciones</h4>
            <p>No hay observaciones en este estado</p>
          </div>
        )}
      </div>

      {/* Detail / Reply Modal */}
      {detail && (
        <Modal
          isOpen={!!detail}
          onClose={()=>setDetail(null)}
          title={`💬 Observación — ${detail.indicator_code}`}
          size="lg"
          footer={
            detail.status!=='Resuelta' ? (
              <>
                <button className="btn btn-secondary" onClick={()=>setDetail(null)}>Cerrar</button>
                <button className="btn btn-success" onClick={()=>handleResolve(detail.id)} disabled={!reply.trim()}>
                  ✅ Marcar como resuelta
                </button>
              </>
            ) : <button className="btn btn-secondary" onClick={()=>setDetail(null)}>Cerrar</button>
          }
        >
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <Badge status={detail.severity} /> <Badge status={detail.status} />
              <span className="tag">{detail.date}</span>
              {detail.auditor && <span className="tag">Auditor: {detail.auditor}</span>}
            </div>
            <div style={{ background:'var(--bg-tertiary)', borderRadius:'var(--radius)', padding:'14px 16px', borderLeft:'3px solid var(--warning)' }}>
              <div style={{ fontSize:'0.75rem', color:'var(--text-subtle)', marginBottom:6 }}>Observación del auditor:</div>
              <p style={{ fontSize:'0.9375rem', color:'var(--text)', lineHeight:1.7, margin:0 }}>{detail.message}</p>
            </div>
            {detail.status !== 'Resuelta' && (
              <div className="form-group">
                <label className="form-label">Su respuesta / acción tomada *</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={reply}
                  onChange={e=>setReply(e.target.value)}
                  placeholder="Describa las acciones tomadas para resolver esta observación..."
                />
              </div>
            )}
            {detail.status === 'Resuelta' && (
              <div className="alert alert-success">✅ Esta observación fue marcada como resuelta.</div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
