import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';

const MEDIA_BASE = 'http://127.0.0.1:8000';

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'var(--warning)', bg: 'var(--warning-subtle)', icon: '⏳' },
  aprobado:  { label: 'Aprobado',  color: 'var(--success)', bg: 'var(--success-subtle)', icon: '✅' },
  rechazado: { label: 'Rechazado', color: 'var(--danger)',  bg: 'var(--danger-subtle)',  icon: '❌' },
};
const FILE_ICONS = { PDF: '📄', XLSX: '📊', DOCX: '📝', CSV: '📋', URL: '🔗' };

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pendiente;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

const MONTHS = [
  { v: 1, l: 'Enero' }, { v: 2, l: 'Febrero' }, { v: 3, l: 'Marzo' },
  { v: 4, l: 'Abril' }, { v: 5, l: 'Mayo' },    { v: 6, l: 'Junio' },
  { v: 7, l: 'Julio' }, { v: 8, l: 'Agosto' },  { v: 9, l: 'Septiembre' },
  { v: 10, l: 'Octubre' }, { v: 11, l: 'Noviembre' }, { v: 12, l: 'Diciembre' },
];

export default function DocumentsAdminPage() {
  const user = JSON.parse(sessionStorage.getItem('auth_user') || '{}');

  const [docs, setDocs]             = useState([]);
  const [universities, setUniversities] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [reviewDoc, setReviewDoc]   = useState(null);   // doc a revisar
  const [obsText, setObsText]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  // Filtros
  const [filterUniv, setFilterUniv] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMonth, setFilterMonth]   = useState('');
  const [tab, setTab]               = useState('all');

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterUniv)   params.university_id = filterUniv;
      if (filterStatus) params.status        = filterStatus;
      if (filterMonth)  params.month         = filterMonth;
      const res = await api.evidences.list(params);
      setDocs(res.data);
    } catch { setError('Error al cargar documentos'); }
    finally  { setLoading(false); }
  }, [filterUniv, filterStatus, filterMonth]);

  useEffect(() => {
    loadDocs();
    api.universities.list().then(r => setUniversities(r.data)).catch(() => {});
  }, [loadDocs]);

  const displayed = tab === 'all' ? docs : docs.filter(d => d.validation_status === tab);
  const counts = {
    all:       docs.length,
    pendiente: docs.filter(d => d.validation_status === 'pendiente').length,
    aprobado:  docs.filter(d => d.validation_status === 'aprobado').length,
    rechazado: docs.filter(d => d.validation_status === 'rechazado').length,
  };

  // ── Revisar (aprobar/rechazar) ───────────────────────────────
  const openReview = (doc) => {
    setReviewDoc(doc);
    setObsText(doc.observations || '');
    setError('');
  };

  const submitReview = async (newStatus) => {
    if (!reviewDoc) return;
    setSaving(true);
    try {
      await api.evidences.update(reviewDoc.id, {
        validation_status: newStatus,
        observations: obsText,
        _reviewer_id: user.id,
      });
      await loadDocs();
      setReviewDoc(null);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al actualizar');
    } finally { setSaving(false); }
  };

  // ── Descarga ─────────────────────────────────────────────────
  const handleDownload = async (doc) => {
    if (doc.file_type === 'URL') {
      const res = await api.evidences.download(doc.id);
      window.open(res.data.redirect_url, '_blank');
    } else {
      const a = document.createElement('a');
      a.href = `${MEDIA_BASE}${doc.file_url}`;
      a.download = doc.title; a.target = '_blank'; a.click();
    }
  };

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>Documentos — Vista Administrador</h1>
          <p>Revisión y validación de evidencias de transparencia universitaria</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { key: 'all',       label: 'Total',      icon: '📁', color: 'var(--primary)' },
          { key: 'aprobado',  label: 'Aprobados',  icon: '✅', color: 'var(--success)' },
          { key: 'pendiente', label: 'Pendientes', icon: '⏳', color: 'var(--warning)' },
          { key: 'rechazado', label: 'Rechazados', icon: '❌', color: 'var(--danger)'  },
        ].map(s => (
          <div key={s.key} className="stat-card" style={{ '--color': s.color, cursor: 'pointer' }}
            onClick={() => setTab(s.key)}>
            <div className="stat-icon-wrap">{s.icon}</div>
            <div className="stat-value">{counts[s.key]}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-input" style={{ maxWidth: 200, flex: 1 }}
          value={filterUniv} onChange={e => setFilterUniv(e.target.value)}>
          <option value="">Todas las universidades</option>
          {universities.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="form-input" style={{ maxWidth: 180, flex: 1 }}
          value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
          <option value="">Todos los meses</option>
          {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={loadDocs}>🔍 Filtrar</button>
        <button className="btn btn-secondary" onClick={() => { setFilterUniv(''); setFilterStatus(''); setFilterMonth(''); }}>
          ✕ Limpiar
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[['all', 'Todos'], ['aprobado', 'Aprobados'], ['pendiente', 'Pendientes'], ['rechazado', 'Rechazados']].map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {l} ({counts[k]})
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading
        ? <div className="empty-state"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {displayed.map(doc => (
              <div key={doc.id} className="doc-status-row">
                <div className="doc-icon">{FILE_ICONS[doc.file_type] || '📁'}</div>
                <div className="doc-info">
                  <div className="doc-name">{doc.title}</div>
                  <div className="doc-meta">
                    <span className="tag" style={{ fontSize: '0.675rem', marginRight: 6 }}>
                      {doc.indicator_code}
                    </span>
                    <span style={{ marginRight: 6, fontWeight: 600, fontSize: '0.75rem', color: 'var(--primary)' }}>
                      {doc.university_name}
                    </span>
                    {doc.month && `${MONTHS.find(m => m.v === doc.month)?.l} · `}
                    {doc.uploaded_at?.split('T')[0]}
                    {doc.uploaded_by && ` · ${doc.uploaded_by}`}
                  </div>
                  {doc.observations && (
                    <div style={{
                      marginTop: 4, fontSize: '0.75rem', color: 'var(--warning)',
                      background: 'var(--warning-subtle)', padding: '3px 8px',
                      borderRadius: 4, display: 'inline-block',
                    }}>
                      💬 {doc.observations}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <StatusBadge status={doc.validation_status} />
                  <button className="btn btn-secondary btn-sm" title="Vista previa"
                    onClick={() => setPreviewDoc(doc)}>👁️</button>
                  <button className="btn btn-secondary btn-sm" title="Descargar"
                    onClick={() => handleDownload(doc)}>⬇️</button>
                  {doc.validation_status === 'pendiente' && (
                    <button className="btn btn-primary btn-sm" onClick={() => openReview(doc)}>
                      📋 Revisar
                    </button>
                  )}
                  {doc.validation_status !== 'pendiente' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => openReview(doc)}>
                      ✏️ Editar
                    </button>
                  )}
                </div>
              </div>
            ))}
            {displayed.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <h4>Sin documentos</h4>
                <p>No hay documentos con estos filtros</p>
              </div>
            )}
          </div>
        )}

      {/* ═══ MODAL — Vista Previa ══════════════════════════════ */}
      {previewDoc && (
        <div className="modal-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="modal" style={{ maxWidth: 900, width: '95%', maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{FILE_ICONS[previewDoc.file_type]} {previewDoc.title}</h3>
              <button className="modal-close" onClick={() => setPreviewDoc(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              {previewDoc.file_type === 'URL' ? (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔗</div>
                  <p style={{ color: 'var(--text-subtle)', marginBottom: 20 }}>Documento externo (enlace)</p>
                  <a href={previewDoc.source_url} target="_blank" rel="noopener noreferrer"
                    className="btn btn-primary">
                    Abrir en portal ESPOCH
                  </a>
                </div>
              ) : previewDoc.file_type === 'PDF' && previewDoc.file_url ? (
                <iframe
                  src={`${MEDIA_BASE}${previewDoc.file_url}`}
                  title={previewDoc.title}
                  style={{ width: '100%', height: '70vh', border: 'none' }}
                />
              ) : (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <p>Vista previa no disponible. Descarga el archivo para visualizarlo.</p>
                  <button className="btn btn-primary" style={{ marginTop: 16 }}
                    onClick={() => handleDownload(previewDoc)}>
                    ⬇️ Descargar
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <StatusBadge status={previewDoc.validation_status} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => handleDownload(previewDoc)}>⬇️ Descargar</button>
                <button className="btn btn-secondary" onClick={() => setPreviewDoc(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL — Revisión ══════════════════════════════════ */}
      {reviewDoc && (
        <div className="modal-overlay" onClick={() => !saving && setReviewDoc(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📋 Revisar Documento</h3>
              <button className="modal-close" onClick={() => setReviewDoc(null)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>⚠️ {error}</div>}

              <div style={{ background: 'var(--surface-elevated)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{reviewDoc.title}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                  {reviewDoc.indicator_code} · {reviewDoc.university_name} ·
                  {reviewDoc.uploaded_at?.split('T')[0]}
                </div>
                <div style={{ marginTop: 8 }}>
                  <StatusBadge status={reviewDoc.validation_status} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Observaciones (opcional)</label>
                <textarea className="form-input" rows={4}
                  placeholder="Motivo de rechazo, sugerencias, comentarios..."
                  value={obsText}
                  onChange={e => setObsText(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                <button className="btn btn-sm" style={{ flex: 1, background: 'var(--success)', color: '#fff', border: 'none' }}
                  disabled={saving} onClick={() => submitReview('aprobado')}>
                  ✅ Aprobar
                </button>
                <button className="btn btn-sm" style={{ flex: 1, background: 'var(--danger)', color: '#fff', border: 'none' }}
                  disabled={saving} onClick={() => submitReview('rechazado')}>
                  ❌ Rechazar
                </button>
                <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}
                  disabled={saving} onClick={() => submitReview('pendiente')}>
                  ⏳ Pendiente
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setReviewDoc(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
