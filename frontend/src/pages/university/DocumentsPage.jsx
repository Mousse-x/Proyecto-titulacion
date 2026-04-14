import { useState, useRef } from 'react';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { mockDocuments, mockIndicators, getStatusClass } from '../../data/mockData';

const STATUS_COLORS = { 'Aprobado':'var(--success)', 'En revisión':'var(--warning)', 'Rechazado':'var(--danger)' };

export default function DocumentsPage() {
  const [docs, setDocs]       = useState(mockDocuments);
  const [uploadModal, setUpload] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [tab, setTab]          = useState('all');
  const [form, setForm]        = useState({ indicator_id:'', title:'', type:'PDF' });
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const fileRef = useRef();

  const filtered = tab==='all' ? docs : docs.filter(d=>d.status===({'pending':'En revisión','approved':'Aprobado','rejected':'Rechazado'}[tab]));

  const handleUpload = async () => {
    setUploading(true);
    setProgress(0);
    for (let p=0; p<=100; p+=10) {
      await new Promise(r=>setTimeout(r,80));
      setProgress(p);
    }
    const ind = mockIndicators.find(i=>i.id===Number(form.indicator_id));
    const newDoc = {
      id: Date.now(), indicator_id: Number(form.indicator_id),
      indicator_code: ind?.code||'—', title:form.title,
      type:form.type, size:'1.2 MB', status:'En revisión',
      uploaded_at: new Date().toISOString().split('T')[0],
      uploaded_by:'María Ortiz', validated_by:null, observations:null,
    };
    setDocs(p=>[newDoc,...p]);
    setUploading(false);
    setUpload(false);
    setForm({ indicator_id:'', title:'', type:'PDF' });
    setProgress(0);
  };

  const handleDragOver = e => { e.preventDefault(); setDragging(true); };
  const handleDragLeave= () => setDragging(false);
  const handleDrop     = e  => { e.preventDefault(); setDragging(false); };

  const tabCounts = {
    all:      docs.length,
    approved: docs.filter(d=>d.status==='Aprobado').length,
    pending:  docs.filter(d=>d.status==='En revisión').length,
    rejected: docs.filter(d=>d.status==='Rechazado').length,
  };

  return (
    <div style={{ animation:'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Carga Documental</h1>
          <p>Gestiona los documentos de evidencia por indicador LOTAIP</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={()=>setUpload(true)}>📤 Subir Documento</button>
        </div>
      </div>

      {/* Status summary */}
      <div className="stat-grid" style={{ marginBottom:20 }}>
        {[
          { label:'Total',       count:tabCounts.all,      icon:'📁', color:'var(--primary)'  },
          { label:'Aprobados',   count:tabCounts.approved,  icon:'✅', color:'var(--success)'  },
          { label:'En revisión', count:tabCounts.pending,   icon:'⏳', color:'var(--warning)'  },
          { label:'Rechazados',  count:tabCounts.rejected,  icon:'❌', color:'var(--danger)'   },
        ].map(s=>(
          <div key={s.label} className="stat-card" style={{ '--color':s.color, cursor:'pointer' }} onClick={()=>setTab({Total:'all',Aprobados:'approved','En revisión':'pending',Rechazados:'rejected'}[s.label])}>
            <div className="stat-icon-wrap">{s.icon}</div>
            <div className="stat-value">{s.count}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[['all','Todos'],['approved','Aprobados'],['pending','En revisión'],['rejected','Rechazados']].map(([k,l])=>(
          <button key={k} className={`tab ${tab===k?'active':''}`} onClick={()=>setTab(k)}>{l} ({tabCounts[k]})</button>
        ))}
      </div>

      {/* Doc list */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.map(doc => (
          <div key={doc.id} className="doc-status-row">
            <div className="doc-icon">
              {doc.type==='PDF'?'📄':doc.type==='XLSX'?'📊':doc.type==='URL'?'🔗':'📁'}
            </div>
            <div className="doc-info">
              <div className="doc-name">{doc.title}</div>
              <div className="doc-meta">
                <span className="tag" style={{ fontSize:'0.6875rem', marginRight:6 }}>{doc.indicator_code}</span>
                {doc.uploaded_at} · {doc.size} · {doc.uploaded_by}
              </div>
              {doc.observations && (
                <div style={{ marginTop:4, fontSize:'0.75rem', color:'var(--warning)', background:'var(--warning-subtle)', padding:'3px 8px', borderRadius:4, display:'inline-block' }}>
                  💬 {doc.observations}
                </div>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
              <Badge status={doc.status} />
              {doc.validated_by && <span style={{ fontSize:'0.75rem', color:'var(--text-subtle)' }}>✓ {doc.validated_by}</span>}
              <button className="btn btn-secondary btn-sm">👁️</button>
              {doc.status==='Rechazado' && <button className="btn btn-primary btn-sm">🔄 Resubir</button>}
            </div>
          </div>
        ))}
        {filtered.length===0 && (
          <div className="empty-state">
            <div className="empty-icon">📭</div>
            <h4>Sin documentos</h4>
            <p>No hay documentos en esta categoría</p>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={uploadModal}
        onClose={()=>!uploading&&setUpload(false)}
        title="📤 Subir Documento"
        footer={
          !uploading ? (
            <><button className="btn btn-secondary" onClick={()=>setUpload(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleUpload} disabled={!form.indicator_id||!form.title}>Subir archivo</button></>
          ) : null
        }
      >
        {uploading ? (
          <div style={{ textAlign:'center', padding:'20px 0' }}>
            <div style={{ fontSize:'2.5rem', marginBottom:16 }}>📤</div>
            <p style={{ marginBottom:16 }}>Subiendo documento...</p>
            <div className="progress-bar" style={{ height:8, marginBottom:8 }}>
              <div className="progress-fill" style={{ width:`${progress}%` }} />
            </div>
            <div style={{ fontSize:'0.875rem', color:'var(--text-subtle)' }}>{progress}%</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div className="form-group">
              <label className="form-label">Indicador asociado *</label>
              <select className="form-input" value={form.indicator_id} onChange={e=>setForm(p=>({...p,indicator_id:e.target.value}))}>
                <option value="">— Seleccione un indicador —</option>
                {mockIndicators.map(i=><option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Título del documento *</label>
              <input className="form-input" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="Ej: Presupuesto 2026 — ESPOCH" />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select className="form-input" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                {['PDF','XLSX','CSV','DOCX','URL'].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            {/* Drop zone */}
            <div
              className={`upload-zone ${dragging?'dragging':''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={()=>fileRef.current?.click()}
            >
              <div className="upload-icon">📂</div>
              <h4>Arrastra tu archivo aquí</h4>
              <p>o haz clic para seleccionar</p>
              <p style={{ fontSize:'0.75rem', marginTop:6 }}>PDF, XLSX, DOCX · Máximo 20 MB</p>
              <input ref={fileRef} type="file" style={{ display:'none' }} accept=".pdf,.xlsx,.docx,.csv" />
            </div>
            <div className="alert alert-info">
              ℹ️ El documento será enviado al auditor para validación. Recibirás notificación del resultado.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
