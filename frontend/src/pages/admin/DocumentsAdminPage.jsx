import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/client';
import { ArrowLeftIcon, ClipboardIcon, DownloadIcon, EditIcon, EyeIcon, FolderIcon, TrashIcon } from '../../components/common/ActionIcons';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

const MEDIA_BASE = 'http://127.0.0.1:8000';

const STATUS_CONFIG = {
  pendiente: { label: 'Pendiente', color: 'var(--warning)', bg: 'var(--warning-subtle)', icon: '⏳' },
  aprobado:  { label: 'Aprobado',  color: 'var(--success)', bg: 'var(--success-subtle)', icon: '✅' },
  rechazado: { label: 'Rechazado', color: 'var(--danger)',  bg: 'var(--danger-subtle)',  icon: '❌' },
  inconsistente: { label: 'Inconsistente', color: 'var(--warning)', bg: 'var(--warning-subtle)', icon: '⚠️' },
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
  const [indicators, setIndicators] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [reviewDoc, setReviewDoc]   = useState(null);   // doc a revisar
  const [obsText, setObsText]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [previewHtml, setPreviewHtml]   = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadForm, setUploadForm] = useState({
    university_id: '',
    indicator_id: '',
    title: '',
    year: new Date().getFullYear().toString(),
    month: '',
  });
  const [scraperModal, setScraperModal] = useState(false);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);
  const [scrapeForm, setScrapeForm] = useState({
    university_id: '',
    year: new Date().getFullYear().toString(),
    month: '',
  });

  // Filtros
  const [filterUniv, setFilterUniv] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterMonth, setFilterMonth]   = useState('');
  const [tab, setTab]               = useState('all');

  const [folderPath, setFolderPath] = useState([]);
  const fileRef = useRef();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

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
    finally  { setLoading(false); setSelectedDocs([]); }
  }, [filterUniv, filterStatus, filterMonth]);

  useEffect(() => {
    loadDocs();
    api.universities.list().then(r => setUniversities(r.data)).catch(() => {});
    api.indicators.list().then(r => setIndicators(r.data)).catch(() => {});
  }, [loadDocs]);

  const displayed = tab === 'all' ? docs : docs.filter(d => d.validation_status === tab);
  const counts = {
    all:       docs.length,
    pendiente: docs.filter(d => d.validation_status === 'pendiente').length,
    aprobado:  docs.filter(d => d.validation_status === 'aprobado').length,
    rechazado: docs.filter(d => d.validation_status === 'rechazado').length,
    inconsistente: docs.filter(d => d.validation_status === 'inconsistente').length,
  };

  const getYear = (doc) => doc.uploaded_at ? doc.uploaded_at.split('-')[0] : 'Sin Año';
  const getPeriodYear = (doc) => doc.year ? String(doc.year) : 'Sin periodo';
  const getMonthName = (doc) => {
    const m = doc.month || (doc.uploaded_at ? parseInt(doc.uploaded_at.split('-')[1], 10) : null);
    const found = MONTHS.find(x => x.v === m);
    return found ? found.l : 'Sin Mes';
  };
  const getLiteralFolderName = (doc) => {
    const code = doc.indicator_code || 'Sin codigo';
    const name = doc.indicator_name || doc.title || 'Sin literal';
    return `${code} - ${name}`;
  };

  let currentDocs = displayed;
  if (folderPath.length > 0) {
    currentDocs = currentDocs.filter(d => (d.university_name || 'Universidad') === folderPath[0]);
  }
  if (folderPath.length > 1) {
    currentDocs = currentDocs.filter(d => getPeriodYear(d) === folderPath[1]);
  }
  if (folderPath.length > 2) {
    currentDocs = currentDocs.filter(d => getMonthName(d) === folderPath[2]);
  }
  if (folderPath.length > 3) {
    currentDocs = currentDocs.filter(d => getLiteralFolderName(d) === folderPath[3]);
  }

  let viewType = 'docs';
  if (folderPath.length === 0) viewType = 'universities';
  else if (folderPath.length === 1) viewType = 'years';
  else if (folderPath.length === 2) viewType = 'months';
  else if (folderPath.length === 3) viewType = 'literals';

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
      const key = getPeriodYear(d);
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
  } else if (viewType === 'literals') {
    const groups = {};
    currentDocs.forEach(d => {
      const key = getLiteralFolderName(d);
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    itemsToRender = Object.keys(groups).sort().map(k => ({ type: 'folder', name: k, count: groups[k].length, nextPath: k }));
  } else {
    itemsToRender = currentDocs.map(d => ({ type: 'doc', ...d }));
  }

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

  // ── Selección masiva ───────────────────────────────────────
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

  const resetUploadForm = () => {
    setUploadForm({
      university_id: '',
      indicator_id: '',
      title: '',
      year: new Date().getFullYear().toString(),
      month: '',
    });
    setSelectedFile(null);
    setUploadProgress(0);
    setError('');
  };

  const openUpload = () => {
    setError('');
    setUploadForm(prev => ({
      ...prev,
      university_id: filterUniv || prev.university_id || '',
    }));
    setUploadModal(true);
  };

  const handleFileSelect = (file) => {
    if (!file) return;
    const allowed = ['pdf', 'xlsx', 'xls', 'docx', 'doc', 'csv'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!allowed.includes(ext)) {
      setError('Formato no permitido. Use PDF, XLSX, DOCX o CSV.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError('El archivo no debe superar 50 MB.');
      return;
    }
    setError('');
    setSelectedFile(file);
    if (!uploadForm.title) {
      setUploadForm(prev => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, '') }));
    }
  };

  const handleUpload = async () => {
    if (!uploadForm.university_id || !uploadForm.indicator_id || !uploadForm.title || !uploadForm.year || !uploadForm.month || !selectedFile) {
      setError('Complete todos los campos obligatorios y seleccione un archivo.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append('university_id', uploadForm.university_id);
      fd.append('indicator_id', uploadForm.indicator_id);
      fd.append('title', uploadForm.title.trim());
      fd.append('year', uploadForm.year);
      fd.append('month', uploadForm.month);
      fd.append('uploaded_by_user_id', user.id || '');
      fd.append('file', selectedFile);

      await api.evidences.upload(fd, pct => setUploadProgress(pct));
      setUploadModal(false);
      resetUploadForm();
      await loadDocs();
    } catch (e) {
      setError(e.response?.data?.error || 'Error al subir el documento.');
    } finally {
      setUploading(false);
    }
  };

  const openScraper = () => {
    setScrapeResult(null);
    setScrapeForm(prev => ({
      ...prev,
      university_id: filterUniv || prev.university_id || '',
    }));
    setScraperModal(true);
  };

  const handleScrape = async () => {
    setScrapeLoading(true);
    setScrapeResult(null);
    try {
      const token = sessionStorage.getItem('auth_token');
      const response = await fetch('http://127.0.0.1:8000/api/scraper/espoch/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          period_id: 1,
          user_id: user.id,
          university_id: scrapeForm.university_id,
          year: scrapeForm.year,
          month: scrapeForm.month,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Error HTTP: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.status === 'progress') {
              setScrapeResult({ isProgress: true, message: data.msg, pct: data.pct || 0 });
            } else if (data.status === 'done') {
              setScrapeResult({ ...data, isProgress: false });
              await loadDocs();
            } else if (data.status === 'error') {
              setScrapeResult({ error: data.error || data.message || 'Error en el scraping' });
            }
          } catch (parseError) {
            console.error('Error parsing scraper response', parseError);
          }
        }
      }
    } catch (e) {
      setScrapeResult({ error: e.message || 'Error en el scraping' });
    } finally {
      setScrapeLoading(false);
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
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={openUpload}>
            Subir documento
          </button>
          <button className="btn btn-primary" onClick={openScraper}>
            Scrapear DPE
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        {[
          { key: 'all',       label: 'Total',      icon: '📁', color: 'var(--primary)' },
          { key: 'aprobado',  label: 'Aprobados',  icon: '✅', color: 'var(--success)' },
          { key: 'pendiente', label: 'Pendientes', icon: '⏳', color: 'var(--warning)' },
          { key: 'rechazado', label: 'Rechazados', icon: '❌', color: 'var(--danger)'  },
          { key: 'inconsistente', label: 'Inconsistentes', icon: '⚠️', color: 'var(--warning)' },
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
        {[['all', 'Todos'], ['aprobado', 'Aprobados'], ['pendiente', 'Pendientes'], ['rechazado', 'Rechazados'], ['inconsistente', 'Inconsistentes']].map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
            {l} ({counts[k]})
          </button>
        ))}
      </div>

      {/* ─── Navegación Carpetas ─────────────────────────────── */}
      {folderPath.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-elevated)', padding: '10px 16px', borderRadius: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setFolderPath(p => p.slice(0, -1))}>
            <ArrowLeftIcon /> Volver
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

      {/* Lista */}
      {loading
        ? <div className="empty-state"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
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
                      <TrashIcon /> Eliminar ({selectedDocs.length})
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
                    <div className="doc-icon"><FolderIcon /></div>
                    <div className="doc-info">
                      <div className="doc-name">{item.name}</div>
                      <div className="doc-meta">
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{item.count} documento(s)</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <button className="btn btn-secondary btn-sm"><FolderIcon /> Abrir</button>
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
                      <span style={{ marginRight: 6, fontWeight: 600, fontSize: '0.75rem', color: 'var(--primary)' }}>
                        {doc.university_name}
                      </span>
                      {doc.month && `${MONTHS.find(m => m.v === doc.month)?.l} · `}
                      {doc.uploaded_at?.split('T')[0]}
                      {doc.year && ` · Periodo ${doc.year}`}
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
                      onClick={() => openPreview(doc)}><EyeIcon /></button>
                    <button className="btn btn-secondary btn-sm" title="Descargar"
                      onClick={() => handleDownload(doc)}><DownloadIcon /></button>
                    {doc.validation_status === 'pendiente' && (
                      <button className="btn btn-primary btn-sm" onClick={() => openReview(doc)}>
                        <ClipboardIcon /> Revisar
                      </button>
                    )}
                    {doc.validation_status !== 'pendiente' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => openReview(doc)}>
                        <EditIcon /> Editar
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm" title="Eliminar"
                      onClick={() => handleDelete(doc.id)} style={{ color: 'var(--danger)' }}><TrashIcon /></button>
                  </div>
                </div>
              );
            })}
            {itemsToRender.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <h4>Sin documentos</h4>
                <p>No hay documentos con estos filtros</p>
              </div>
            )}
          </div>
        )}

      {/* ═══ MODAL — Vista Previa ══════════════════════════════ */}
      {uploadModal && (
        <div className="modal-overlay" onClick={() => !uploading && setUploadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>Subir documento manual</h3>
              <button className="modal-close" onClick={() => !uploading && setUploadModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {uploading ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
                  <p style={{ marginBottom: 14 }}>Subiendo documento...</p>
                  <div className="progress-bar" style={{ height: 8, marginBottom: 8 }}>
                    <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-subtle)' }}>{uploadProgress}%</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 14 }}>
                  {error && <div className="alert alert-danger">{error}</div>}

                  <div className="form-group">
                    <label className="form-label">Universidad *</label>
                    <select className="form-input" value={uploadForm.university_id} onChange={e => setUploadForm(p => ({ ...p, university_id: e.target.value }))}>
                      <option value="">Seleccione universidad</option>
                      {universities.map(u => (
                        <option key={u.id} value={u.id}>{u.name} - {u.full_name || u.city || 'Universidad'}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Indicador LOTAIP *</label>
                    <select className="form-input" value={uploadForm.indicator_id} onChange={e => setUploadForm(p => ({ ...p, indicator_id: e.target.value }))}>
                      <option value="">Seleccione indicador</option>
                      {indicators.map(i => (
                        <option key={i.id} value={i.id}>{i.code} - {i.name}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Año *</label>
                      <input
                        type="number"
                        className="form-input"
                        min="2000"
                        max={currentYear}
                        value={uploadForm.year}
                        onChange={e => {
                          const y = parseInt(e.target.value, 10);
                          if (y > currentYear) return;
                          setUploadForm(p => ({ ...p, year: e.target.value, month: '' }));
                        }}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Mes *</label>
                      <select className="form-input" value={uploadForm.month} onChange={e => setUploadForm(p => ({ ...p, month: e.target.value }))}>
                        <option value="">Seleccione mes</option>
                        {MONTHS.map(m => {
                          const isFuture = parseInt(uploadForm.year, 10) === currentYear && m.v > currentMonth;
                          return (
                            <option key={m.v} value={m.v} disabled={isFuture}>
                              {m.l}{isFuture ? ' (No disponible)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Título *</label>
                    <input className="form-input" value={uploadForm.title} onChange={e => setUploadForm(p => ({ ...p, title: e.target.value }))} placeholder="Ej: Presupuesto institucional enero 2025" />
                  </div>

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
                        <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>Archivo seleccionado</div>
                        <strong>{selectedFile.name}</strong>
                        <p style={{ fontSize: '0.8rem', marginTop: 4, color: 'var(--text-subtle)' }}>
                          {(selectedFile.size / 1024).toFixed(1)} KB · haz clic para cambiar
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="upload-icon">Archivo</div>
                        <h4>Arrastra tu archivo aquí</h4>
                        <p>o haz clic para seleccionar</p>
                        <p style={{ fontSize: '0.75rem', marginTop: 6 }}>PDF, XLSX, DOCX o CSV · máximo 50 MB</p>
                      </>
                    )}
                    <input ref={fileRef} type="file" style={{ display: 'none' }} accept=".pdf,.xlsx,.xls,.docx,.doc,.csv" onChange={e => handleFileSelect(e.target.files[0])} />
                  </div>

                  <div className="alert alert-info">
                    El documento quedará en estado <strong>Pendiente</strong> hasta su revisión.
                  </div>
                </div>
              )}
            </div>
            {!uploading && (
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => { setUploadModal(false); resetUploadForm(); }}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleUpload}
                  disabled={!uploadForm.university_id || !uploadForm.indicator_id || !uploadForm.title || !uploadForm.year || !uploadForm.month || !selectedFile}
                >
                  Subir archivo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {scraperModal && (
        <div className="modal-overlay" onClick={() => !scrapeLoading && setScraperModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Extraccion Automatizada DPE</h3>
              <button className="modal-close" onClick={() => !scrapeLoading && setScraperModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-subtle)', marginBottom: 16, lineHeight: 1.5 }}>
                Selecciona la universidad y el periodo para descargar automaticamente los documentos publicados en el portal de transparencia de la DPE.
              </p>

              {!scrapeLoading && !scrapeResult && (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div className="form-group">
                    <label className="form-label">Universidad *</label>
                    <select
                      className="form-input"
                      value={scrapeForm.university_id}
                      onChange={e => setScrapeForm(p => ({ ...p, university_id: e.target.value }))}
                    >
                      <option value="">Seleccione universidad</option>
                      {universities.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} - {u.full_name || u.city || 'Universidad'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Año *</label>
                      <input
                        type="number"
                        className="form-input"
                        min="2000"
                        max={currentYear}
                        value={scrapeForm.year}
                        onChange={e => {
                          const y = parseInt(e.target.value, 10);
                          if (y > currentYear) return;
                          setScrapeForm(p => ({ ...p, year: e.target.value, month: '' }));
                        }}
                      />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Mes *</label>
                      <select
                        className="form-input"
                        value={scrapeForm.month}
                        onChange={e => setScrapeForm(p => ({ ...p, month: e.target.value }))}
                      >
                        <option value="">Seleccione mes</option>
                        {MONTHS.map(m => {
                          const isFuture = parseInt(scrapeForm.year, 10) === currentYear && m.v >= currentMonth;
                          return (
                            <option key={m.v} value={m.v} disabled={isFuture}>
                              {m.l}{isFuture ? ' (No disponible)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {scrapeLoading && (!scrapeResult || !scrapeResult.isProgress) && (
                <div style={{ textAlign: 'center', padding: '18px 0' }}>
                  <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
                  <p>Iniciando extraccion...</p>
                </div>
              )}

              {scrapeResult?.isProgress && (
                <div style={{ padding: '20px 0' }}>
                  <div style={{ width: '100%', background: 'var(--border-subtle)', borderRadius: 10, height: 12, overflow: 'hidden', marginBottom: 12 }}>
                    <div style={{ width: `${scrapeResult.pct}%`, background: 'var(--primary)', height: '100%', transition: 'width 0.3s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-subtle)' }}>
                    <span>{scrapeResult.message}</span>
                    <span style={{ fontWeight: 600 }}>{scrapeResult.pct}%</span>
                  </div>
                </div>
              )}

              {scrapeResult && !scrapeResult.error && !scrapeResult.isProgress && (
                <div className="alert alert-success" style={{ marginBottom: 0 }}>
                  <strong>{scrapeResult.message}</strong><br />
                  Creados: <strong>{scrapeResult.stats?.created}</strong> ·
                  Omitidos: {scrapeResult.stats?.skipped} ·
                  Errores: {scrapeResult.stats?.errors}
                  {scrapeResult.items?.length > 0 && (
                    <div style={{ marginTop: 10, maxHeight: 180, overflowY: 'auto' }}>
                      {scrapeResult.items.slice(0, 10).map((item, i) => (
                        <div key={i} style={{ fontSize: '0.75rem', padding: '3px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                          [{item.letter?.toUpperCase()}] {item.title?.slice(0, 70)}...
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {scrapeResult?.error && (
                <div className="alert alert-danger">{scrapeResult.error}</div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setScraperModal(false)} disabled={scrapeLoading}>
                Cerrar
              </button>
              {!scrapeResult && (
                <button
                  className="btn btn-primary"
                  onClick={handleScrape}
                  disabled={scrapeLoading || !scrapeForm.university_id || !scrapeForm.year || !scrapeForm.month}
                >
                  {scrapeLoading ? 'Procesando...' : 'Iniciar Extraccion'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
                     <button className="btn btn-primary" onClick={() => handleDownload(previewDoc)}><DownloadIcon /> Descargar archivo</button>
                   </div>
                )
              ) : (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <p>Vista previa no disponible. Descarga el archivo para visualizarlo.</p>
                <button className="btn btn-primary" style={{ marginTop: 16 }}
                    onClick={() => handleDownload(previewDoc)}>
                    <DownloadIcon /> Descargar
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <StatusBadge status={previewDoc.validation_status} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => handleDownload(previewDoc)}><DownloadIcon /> Descargar</button>
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
              <h3><ClipboardIcon /> Revisar Documento</h3>
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
                <button className="btn btn-sm" style={{ flex: 1, background: 'var(--warning)', color: '#000', border: 'none' }}
                  disabled={saving} onClick={() => submitReview('inconsistente')}>
                  ⚠️ Inconsistente
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

