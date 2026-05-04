import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

const MEDIA_BASE = 'http://127.0.0.1:8000';

const STATUS_CONFIG = {
  pendiente:  { label: 'Pendiente',  color: 'var(--warning)',  bg: 'var(--warning-subtle)',  icon: '⏳' },
  aprobado:   { label: 'Aprobado',   color: 'var(--success)',  bg: 'var(--success-subtle)',  icon: '✅' },
  rechazado:  { label: 'Rechazado',  color: 'var(--danger)',   bg: 'var(--danger-subtle)',   icon: '❌' },
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

export default function DocumentsPage() {
  const user = JSON.parse(sessionStorage.getItem('auth_user') || '{}');

  const [docs, setDocs]           = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState('all');
  const [uploadModal, setUploadModal] = useState(false);
  const [previewDoc, setPreviewDoc]   = useState(null);   // doc seleccionado para preview
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scraperModal, setScraperModal] = useState(false);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeResult, setScrapeResult]   = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [dragging, setDragging]   = useState(false);
  const [form, setForm]           = useState({ indicator_id: '', title: '', month: '' });
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError]         = useState('');
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [saving, setSaving]       = useState(false);
  const fileRef = useRef();

  const [folderPath, setFolderPath] = useState([]);
  const [universities, setUniversities] = useState([]);

  const months = [
    { v: 1, l: 'Enero' }, { v: 2, l: 'Febrero' }, { v: 3, l: 'Marzo' },
    { v: 4, l: 'Abril' }, { v: 5, l: 'Mayo' },    { v: 6, l: 'Junio' },
    { v: 7, l: 'Julio' }, { v: 8, l: 'Agosto' },  { v: 9, l: 'Septiembre' },
    { v: 10, l: 'Octubre' }, { v: 11, l: 'Noviembre' }, { v: 12, l: 'Diciembre' },
  ];

  const loadDocs = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (user.university_id) params.university_id = user.university_id;
      const res = await api.evidences.list(params);
      setDocs(res.data);
    } catch {
      setError('No se pudieron cargar los documentos');
    } finally {
      setLoading(false);
      setSelectedDocs([]);
    }
  }, [user.university_id]);

  useEffect(() => {
    loadDocs();
    api.indicators.list().then(r => setIndicators(r.data)).catch(() => {});
    api.universities.list().then(r => setUniversities(r.data)).catch(() => {});
  }, [loadDocs]);

  const filtered = tab === 'all'
    ? docs
    : docs.filter(d => d.validation_status === tab);

  const counts = {
    all:       docs.length,
    pendiente: docs.filter(d => d.validation_status === 'pendiente').length,
    aprobado:  docs.filter(d => d.validation_status === 'aprobado').length,
    rechazado: docs.filter(d => d.validation_status === 'rechazado').length,
  };

  const getYear = (doc) => doc.uploaded_at ? doc.uploaded_at.split('-')[0] : 'Sin Año';
  const getMonthName = (doc) => {
    const m = doc.month || (doc.uploaded_at ? parseInt(doc.uploaded_at.split('-')[1], 10) : null);
    const found = months.find(x => x.v === m);
    return found ? found.l : 'Sin Mes';
  };

  let currentDocs = filtered;
  if (folderPath.length > 0) {
    currentDocs = currentDocs.filter(d => (d.university_name || 'Universidad') === folderPath[0]);
  }
  if (folderPath.length > 1) {
    currentDocs = currentDocs.filter(d => getYear(d) === folderPath[1]);
  }
  if (folderPath.length > 2) {
    currentDocs = currentDocs.filter(d => getMonthName(d) === folderPath[2]);
  }

  let viewType = 'docs';
  if (folderPath.length === 0) viewType = 'universities';
  else if (folderPath.length === 1) viewType = 'years';
  else if (folderPath.length === 2) viewType = 'months';

  let itemsToRender = [];
  if (viewType === 'universities') {
    const groups = {};
    currentDocs.forEach(d => {
      const key = d.university_name || 'Universidad';
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    itemsToRender = Object.keys(groups).map(k => ({ type: 'folder', name: k, count: groups[k].length, nextPath: k }));
  } else if (viewType === 'years') {
    const groups = {};
    currentDocs.forEach(d => {
      const key = getYear(d);
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    itemsToRender = Object.keys(groups).map(k => ({ type: 'folder', name: k, count: groups[k].length, nextPath: k }));
  } else if (viewType === 'months') {
    const groups = {};
    currentDocs.forEach(d => {
      const key = getMonthName(d);
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    itemsToRender = Object.keys(groups).map(k => ({ type: 'folder', name: k, count: groups[k].length, nextPath: k }));
  } else {
    itemsToRender = currentDocs.map(d => ({ type: 'doc', ...d }));
  }

  // ── Selección Masiva ────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedDocs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = (docList) => {
    if (selectedDocs.length === docList.length) setSelectedDocs([]);
    else setSelectedDocs(docList.map(d => d.id));
  };
  const handleBulkApprove = async () => {
    if (!selectedDocs.length) return;
    setSaving(true);
    try {
      await api.evidences.bulkUpdate({
        evidence_ids: selectedDocs,
        validation_status: 'aprobado',
        _reviewer_id: user.id
      });
      await loadDocs();
      setSelectedDocs([]);
    } catch (e) {
      setError(e.response?.data?.error || 'Error en validación masiva');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedDocs.length) return;
    if (!window.confirm(`¿Estás seguro que deseas eliminar ${selectedDocs.length} documento(s)?\nEsta acción no se puede deshacer.`)) return;
    setSaving(true);
    try {
      await api.evidences.bulkDelete({
        evidence_ids: selectedDocs,
        _reviewer_id: user.id
      });
      await loadDocs();
      setSelectedDocs([]);
    } catch (e) {
      setError(e.response?.data?.error || 'Error al eliminar documentos');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('¿Estás seguro que deseas eliminar este documento?')) return;
    try {
      await api.evidences.remove(docId);
      await loadDocs();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al eliminar documento');
    }
  };

  // ── Vista Previa Avanzada ──────────────────────────────────
  const openPreview = async (doc) => {
    setPreviewDoc(doc);
    setPreviewHtml(null);
    if (!doc.file_url) return;

    if (doc.file_type === 'XLSX' || doc.file_type === 'CSV') {
      setPreviewLoading(true);
      try {
        const res = await fetch(`${MEDIA_BASE}${doc.file_url}`);
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const html = XLSX.utils.sheet_to_html(ws);
        setPreviewHtml(html);
      } catch (e) {
        console.error('Error Excel preview', e);
      } finally { setPreviewLoading(false); }
    } else if (doc.file_type === 'DOCX') {
      setPreviewLoading(true);
      try {
        const res = await fetch(`${MEDIA_BASE}${doc.file_url}`);
        const buf = await res.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: buf });
        setPreviewHtml(result.value);
      } catch (e) {
        console.error('Error Word preview', e);
      } finally { setPreviewLoading(false); }
    }
  };

  // ── Upload ──────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!form.indicator_id || !form.title || !selectedFile || !form.month || !form.year || !form.university_id) {
      setError('Por favor, complete todos los campos obligatorios');
      return;
    }
    setUploading(true);
    setProgress(0);
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('indicator_id', form.indicator_id);
      fd.append('university_id', form.university_id);
      fd.append('uploaded_by_user_id', user.id);
      fd.append('period_id', 1); // Por defecto
      fd.append('year', form.year);
      fd.append('month', form.month);
      fd.append('file', selectedFile);

      await api.evidences.upload(fd, pct => setProgress(pct));
      await loadDocs();
      setUploadModal(false);
      resetForm();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al subir el documento');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setForm({ indicator_id: '', title: '', month: '', year: new Date().getFullYear().toString(), university_id: user.university_id || '' });
    setSelectedFile(null);
    setProgress(0);
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    setSelectedFile(file);
    if (!form.title) setForm(p => ({ ...p, title: file.name.replace(/\.[^.]+$/, '') }));
  };

  // ── Descarga ────────────────────────────────────────────────
  const handleDownload = async (doc) => {
    try {
      if (doc.file_type === 'URL') {
        // Obtener redirect_url del backend
        const res = await api.evidences.download(doc.id);
        window.open(res.data.redirect_url, '_blank');
        return;
      }
      // Archivo en disco — link directo a media
      const url = `${MEDIA_BASE}${doc.file_url}`;
      const a = document.createElement('a');
      a.href = url; a.download = doc.title; a.target = '_blank';
      a.click();
    } catch { setError('Error al descargar el documento'); }
  };

  // ── Scraper ─────────────────────────────────────────────────
  const handleScrape = async () => {
    setScrapeLoading(true);
    setScrapeResult(null);
    try {
      const res = await api.scraper.espoch({
        portal_url: 'https://www.espoch.edu.ec/2026-2/',
        period_id: 1,
        user_id: user.id,
      });
      setScrapeResult(res.data);
      await loadDocs();
    } catch (e) {
      setScrapeResult({ error: e.response?.data?.error || 'Error en el scraping' });
    } finally {
      setScrapeLoading(false);
    }
  };

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>

      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>Carga Documental LOTAIP</h1>
          <p>Gestión de evidencias de transparencia institucional</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setScraperModal(true)}>
            🤖 Cargar ESPOCH
          </button>
          <button className="btn btn-primary" onClick={() => { setUploadModal(true); setError(''); }}>
            📤 Subir Documento
          </button>
        </div>
      </div>

      {/* ─── Stats ───────────────────────────────────────────── */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { label: 'Total',      count: counts.all,       icon: '📁', color: 'var(--primary)', key: 'all' },
          { label: 'Aprobados',  count: counts.aprobado,  icon: '✅', color: 'var(--success)', key: 'aprobado' },
          { label: 'Pendientes', count: counts.pendiente, icon: '⏳', color: 'var(--warning)', key: 'pendiente' },
          { label: 'Rechazados', count: counts.rechazado, icon: '❌', color: 'var(--danger)',  key: 'rechazado' },
        ].map(s => (
          <div key={s.key} className="stat-card"
            style={{ '--color': s.color, cursor: 'pointer' }}
            onClick={() => setTab(s.key)}>
            <div className="stat-icon-wrap">{s.icon}</div>
            <div className="stat-value">{s.count}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ─── Tabs ────────────────────────────────────────────── */}
      <div className="tabs">
        {[['all', 'Todos'], ['aprobado', 'Aprobados'], ['pendiente', 'Pendientes'], ['rechazado', 'Rechazados']].map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {l} ({counts[k]})
          </button>
        ))}
      </div>

      {/* ─── Navegación Carpetas ─────────────────────────────── */}
      {folderPath.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-elevated)', padding: '10px 16px', borderRadius: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setFolderPath(p => p.slice(0, -1))}>
            ⬅ Volver
          </button>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => setFolderPath([])}>Inicio</span>
            {folderPath.map((path, idx) => (
              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--text-subtle)' }}>/</span>
                <span 
                  style={{ cursor: idx === folderPath.length - 1 ? 'default' : 'pointer', color: idx === folderPath.length - 1 ? 'inherit' : 'var(--primary)' }}
                  onClick={() => setFolderPath(p => p.slice(0, idx + 1))}
                >
                  {path}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ─── Lista ───────────────────────────────────────────── */}
      {loading
        ? <div className="empty-state"><div className="empty-icon">⏳</div><p>Cargando documentos...</p></div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {viewType === 'docs' && itemsToRender.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg-tertiary)', borderRadius: 8, marginBottom: 8 }}>
                <input type="checkbox"
                  checked={selectedDocs.length > 0 && selectedDocs.length === itemsToRender.length}
                  onChange={() => toggleSelectAll(itemsToRender)}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Seleccionar Todos</span>
                {selectedDocs.length > 0 && (
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={handleBulkDelete} disabled={saving} style={{ color: 'var(--danger)', borderColor: 'var(--danger-subtle)' }}>
                      🗑️ Eliminar ({selectedDocs.length})
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleBulkApprove} disabled={saving} style={{ background: 'var(--success)' }}>
                      ✅ Aprobar ({selectedDocs.length})
                    </button>
                  </div>
                )}
              </div>
            )}
            {itemsToRender.map((item, idx) => {
              if (item.type === 'folder') {
                return (
                  <div key={`folder-${idx}`} className="doc-status-row" style={{ cursor: 'pointer' }} onClick={() => setFolderPath(p => [...p, item.name])}>
                    <div className="doc-icon">📁</div>
                    <div className="doc-info">
                      <div className="doc-name">{item.name}</div>
                      <div className="doc-meta">
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{item.count} documento(s)</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button className="btn btn-secondary btn-sm">Abrir</button>
                    </div>
                  </div>
                );
              }

              const doc = item;
              return (
                <div key={doc.id} className="doc-status-row">
                  <div style={{ display: 'flex', alignItems: 'center', marginRight: 12 }}>
                    <input type="checkbox" checked={selectedDocs.includes(doc.id)} onChange={() => toggleSelect(doc.id)} />
                  </div>
                  <div className="doc-icon">{FILE_ICONS[doc.file_type] || '📁'}</div>
                  <div className="doc-info">
                    <div className="doc-name">{doc.title}</div>
                    <div className="doc-meta">
                      <span className="tag" style={{ fontSize: '0.675rem', marginRight: 6 }}>
                        {doc.indicator_code}
                      </span>
                      {doc.month && <span style={{ marginRight: 6, fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                        {months.find(m => m.v === doc.month)?.l}
                      </span>}
                      {doc.uploaded_at?.split('T')[0]}
                      {doc.file_size && ` · ${(doc.file_size / 1024).toFixed(1)} KB`}
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
                      onClick={() => openPreview(doc)}>👁️</button>
                    <button className="btn btn-secondary btn-sm" title="Descargar"
                      onClick={() => handleDownload(doc)}>⬇️</button>
                    {doc.validation_status === 'rechazado' && (
                      <button className="btn btn-primary btn-sm"
                        onClick={() => { setUploadModal(true); setForm(p => ({ ...p, indicator_id: String(doc.indicator_id), title: doc.title, university_id: doc.university_id || user.university_id })); }}>
                        🔄 Resubir
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm" title="Eliminar"
                      onClick={() => handleDelete(doc.id)} style={{ color: 'var(--danger)' }}>🗑️</button>
                  </div>
                </div>
              );
            })}
            {itemsToRender.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <h4>Sin documentos</h4>
                <p>No hay documentos en esta categoría</p>
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
            <div className="modal-body" style={{ padding: 0, overflow: 'hidden' }}>
              {previewDoc.file_type === 'URL' ? (
                <div style={{ padding: '32px', textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔗</div>
                  <p style={{ marginBottom: 20, color: 'var(--text-subtle)' }}>
                    Este documento es un enlace externo
                  </p>
                  <a href={previewDoc.source_url} target="_blank" rel="noopener noreferrer"
                    className="btn btn-primary">
                    Abrir en portal original
                  </a>
                </div>
              ) : previewDoc.file_type === 'PDF' && previewDoc.file_url ? (
                <iframe
                  src={`${MEDIA_BASE}${previewDoc.file_url}`}
                  title={previewDoc.title}
                  style={{ width: '100%', height: '70vh', border: 'none' }}
                />
              ) : (previewDoc.file_type === 'XLSX' || previewDoc.file_type === 'CSV' || previewDoc.file_type === 'DOCX') && previewDoc.file_url ? (
                previewLoading ? (
                   <div style={{ padding: 48, textAlign: 'center' }}>
                     <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
                     Cargando previsualización...
                   </div>
                ) : previewHtml ? (
                   <div className="file-preview-html" style={{ padding: 24, overflow: 'auto', maxHeight: '70vh', background: '#fff', color: '#000', fontSize: '0.85rem' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
                ) : (
                   <div style={{ padding: 32, textAlign: 'center' }}>
                     <p>Error al generar previsualización.</p>
                     <button className="btn btn-primary" onClick={() => handleDownload(previewDoc)}>⬇️ Descargar archivo</button>
                   </div>
                )
              ) : (
                <div style={{ padding: '32px', textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 16 }}>{FILE_ICONS[previewDoc.file_type]}</div>
                  <p>Vista previa no disponible para este tipo de archivo.</p>
                  <button className="btn btn-primary" style={{ marginTop: 16 }}
                    onClick={() => { handleDownload(previewDoc); setPreviewDoc(null); }}>
                    ⬇️ Descargar archivo
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <StatusBadge status={previewDoc.validation_status} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                  {previewDoc.indicator_code} · {previewDoc.uploaded_at?.split('T')[0]}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => handleDownload(previewDoc)}>
                  ⬇️ Descargar
                </button>
                <button className="btn btn-secondary" onClick={() => setPreviewDoc(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL — Upload ════════════════════════════════════ */}
      {uploadModal && (
        <div className="modal-overlay" onClick={() => !uploading && setUploadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h3>📤 Subir Documento</h3>
              <button className="modal-close" onClick={() => !uploading && setUploadModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {uploading ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📤</div>
                  <p style={{ marginBottom: 16 }}>Subiendo documento...</p>
                  <div className="progress-bar" style={{ height: 8, marginBottom: 8 }}>
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-subtle)' }}>{progress}%</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {error && <div className="alert alert-danger">⚠️ {error}</div>}

                  <div className="form-group">
                    <label className="form-label">Universidad *</label>
                    <select className="form-input" value={form.university_id}
                      onChange={e => setForm(p => ({ ...p, university_id: e.target.value }))}
                      disabled={!!user.university_id}>
                      <option value="">— Seleccione una universidad —</option>
                      {universities.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Indicador LOTAIP (Literal) *</label>
                    <select className="form-input" value={form.indicator_id}
                      onChange={e => setForm(p => ({ ...p, indicator_id: e.target.value }))}>
                      <option value="">— Seleccione un indicador —</option>
                      {indicators.map(i => (
                        <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 16 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Año *</label>
                      <input type="number" className="form-input" value={form.year}
                        onChange={e => setForm(p => ({ ...p, year: e.target.value }))}
                        min="2000" max="2100" />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Mes *</label>
                      <select className="form-input" value={form.month}
                        onChange={e => setForm(p => ({ ...p, month: e.target.value }))}>
                        <option value="">— Seleccione —</option>
                        {months.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Título del documento *</label>
                    <input className="form-input" value={form.title}
                      onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                      placeholder="Ej: Presupuesto 2026 — ESPOCH" />
                  </div>

                  {/* Drop Zone */}
                  <div
                    className={`upload-zone ${dragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files[0]); }}
                    onClick={() => fileRef.current?.click()}
                    style={{ cursor: 'pointer' }}
                  >
                    {selectedFile ? (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
                        <strong>{selectedFile.name}</strong>
                        <p style={{ fontSize: '0.8rem', marginTop: 4, color: 'var(--text-subtle)' }}>
                          {(selectedFile.size / 1024).toFixed(1)} KB · Haz clic para cambiar
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="upload-icon">📂</div>
                        <h4>Arrastra tu archivo aquí</h4>
                        <p>o haz clic para seleccionar</p>
                        <p style={{ fontSize: '0.75rem', marginTop: 6 }}>PDF, XLSX, DOCX · Máximo 50 MB</p>
                      </>
                    )}
                    <input ref={fileRef} type="file" style={{ display: 'none' }}
                      accept=".pdf,.xlsx,.xls,.docx,.doc,.csv"
                      onChange={e => handleFileSelect(e.target.files[0])} />
                  </div>

                  <div className="alert alert-info">
                    ℹ️ El documento quedará en estado <strong>Pendiente</strong> hasta ser revisado.
                  </div>
                </div>
              )}
            </div>
            {!uploading && (
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setUploadModal(false); resetForm(); }}>
                  Cancelar
                </button>
                <button className="btn btn-primary"
                  disabled={!form.indicator_id || !form.title || !selectedFile || !form.year || !form.month || !form.university_id}
                  onClick={handleUpload}>
                  📤 Subir archivo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ MODAL — Scraper ESPOCH ════════════════════════════ */}
      {scraperModal && (
        <div className="modal-overlay" onClick={() => !scrapeLoading && setScraperModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🤖 Carga Automatizada ESPOCH</h3>
              <button className="modal-close" onClick={() => !scrapeLoading && setScraperModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16, color: 'var(--text-subtle)' }}>
                Este proceso extrae automáticamente los literales LOTAIP del portal de transparencia
                de la ESPOCH y los registra como evidencias pendientes de revisión.
              </p>
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                🔗 <strong>Portal:</strong> https://www.espoch.edu.ec/2026-2/<br/>
                📅 <strong>Período:</strong> Evaluación Marzo 2026
              </div>

              {scrapeLoading && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>⏳</div>
                  <p>Extrayendo documentos del portal ESPOCH...</p>
                </div>
              )}

              {scrapeResult && !scrapeResult.error && (
                <div className="alert alert-success" style={{ marginBottom: 0 }}>
                  ✅ <strong>{scrapeResult.message}</strong><br/>
                  Creados: <strong>{scrapeResult.stats?.created}</strong> ·
                  Omitidos: {scrapeResult.stats?.skipped} ·
                  Errores: {scrapeResult.stats?.errors}
                  {scrapeResult.items?.length > 0 && (
                    <div style={{ marginTop: 10, maxHeight: 200, overflowY: 'auto' }}>
                      {scrapeResult.items.slice(0, 10).map((item, i) => (
                        <div key={i} style={{ fontSize: '0.75rem', padding: '2px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                          [{item.letter?.toUpperCase()}] {item.title?.slice(0, 60)}...
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {scrapeResult?.error && (
                <div className="alert alert-danger">⚠️ {scrapeResult.error}</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setScraperModal(false)}>
                Cerrar
              </button>
              {!scrapeResult && (
                <button className="btn btn-primary" onClick={handleScrape} disabled={scrapeLoading}>
                  {scrapeLoading ? '⏳ Procesando...' : '🚀 Iniciar Extracción'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
