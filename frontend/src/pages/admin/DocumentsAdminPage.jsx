import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, API_BASE, MEDIA_BASE } from '../../api/client';
import { ArrowLeftIcon, DownloadIcon, EditIcon, EyeIcon, FolderIcon, TrashIcon } from '../../components/common/ActionIcons';
import ErrorNotice from '../../components/common/ErrorNotice';
import EditDocumentModal from '../../components/documents/EditDocumentModal';
import { useConfirm, useToast } from '../../context/FeedbackContext';
import { describeError } from '../../utils/errors';
import UniversityLogo from '../../components/common/UniversityLogo';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';


const FILE_ICONS = { PDF: '📄', XLSX: '📊', DOCX: '📝', CSV: '📋', URL: '🔗' };

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

  const toast = useToast();
  const confirmAction = useConfirm();
  const [searchParams] = useSearchParams();
  const [pageError, setPageError] = useState(null);
  const [editingDoc, setEditingDoc] = useState(null);
  const [replacingDoc, setReplacingDoc] = useState(null);
  const [touchedUpload, setTouchedUpload] = useState(false);

  // Filtros
  const [filterUniv, setFilterUniv] = useState(searchParams.get('university_id') || '');
  const [filterMonth, setFilterMonth]   = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [folderPath, setFolderPath] = useState([]);
  const fileRef = useRef();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const params = {};
      if (filterUniv)   params.university_id = filterUniv;
      if (filterMonth)  params.month         = filterMonth;
      const res = await api.evidences.list(params);
      setDocs(res.data);
    } catch (err) { setPageError(err); }
    finally  { setLoading(false); setSelectedDocs([]); }
  }, [filterUniv, filterMonth]);

  useEffect(() => {
    loadDocs();
    api.universities.list().then(r => setUniversities(r.data)).catch(() => {});
    api.indicators.list().then(r => setIndicators(r.data)).catch(() => {});
  }, [loadDocs]);

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

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('es');
  const displayed = normalizedSearch
    ? docs.filter((doc) => [
      doc.title,
      doc.indicator_code,
      doc.indicator_name,
      doc.university_name,
      doc.file_type,
      getPeriodYear(doc),
      getMonthName(doc),
    ].some((value) => String(value || '').toLocaleLowerCase('es').includes(normalizedSearch)))
    : docs;

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
    itemsToRender = Object.keys(groups).map(k => {
      const university = universities.find(u => String(u.id) === String(groups[k][0]?.university_id))
        || universities.find(u => u.name === k || u.full_name === k)
        || { name: k, logo_initials: k };
      return { type: 'folder', name: k, count: groups[k].length, nextPath: k, university };
    });
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

  // ── Selección masiva ───────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedDocs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleSelectAll = (docList) => {
    if (selectedDocs.length === docList.length) setSelectedDocs([]);
    else setSelectedDocs(docList.map(d => d.id));
  };

  const handleBulkDelete = async () => {
    if (!selectedDocs.length) return;
    const count = selectedDocs.length;
    const ok = await confirmAction({
      title: 'Eliminar documentos',
      message: `¿Eliminar ${count} documento(s) seleccionado(s)? También se borrarán sus archivos y las evaluaciones asociadas.`,
      confirmLabel: `Eliminar ${count} documento(s)`,
      danger: true,
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.evidences.bulkDelete({
        evidence_ids: selectedDocs,
        _reviewer_id: user.id
      });
      toast.success({ title: 'Documentos eliminados', message: `Se eliminaron ${count} documento(s).` });
      await loadDocs();
      setSelectedDocs([]);
    } catch (e) {
      toast.apiError(e, 'No se pudieron eliminar los documentos seleccionados.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (doc) => {
    const ok = await confirmAction({
      title: 'Eliminar documento',
      message: `¿Eliminar «${doc.title}»? También se borrará su archivo y la evaluación asociada.`,
      details: `${doc.university_name || ''} · ${doc.indicator_code || ''} · ${doc.year || ''}`,
      confirmLabel: 'Eliminar documento',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.evidences.remove(doc.id);
      toast.success({ title: 'Documento eliminado', message: doc.title });
      await loadDocs();
    } catch (e) {
      toast.apiError(e, 'No se pudo eliminar el documento.');
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
    try {
      if (doc.file_type === 'URL') {
        const res = await api.evidences.download(doc.id);
        window.open(res.data.redirect_url, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = `${MEDIA_BASE}${doc.file_url}`;
        a.download = doc.title; a.target = '_blank'; a.click();
      }
    } catch (err) {
      toast.apiError(err, 'No se pudo descargar el documento.', () => handleDownload(doc));
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
    setReplacingDoc(null);
    setTouchedUpload(false);
  };

  const openUpload = () => {
    setError('');
    setReplacingDoc(null);
    setTouchedUpload(false);
    setUploadForm(prev => ({
      ...prev,
      university_id: filterUniv || prev.university_id || '',
    }));
    setUploadModal(true);
  };

  // Reemplazar: abre el formulario precargado con los datos del documento original.
  const openReplace = (doc) => {
    setError('');
    setSelectedFile(null);
    setTouchedUpload(false);
    setReplacingDoc(doc);
    setUploadForm({
      university_id: doc.university_id ? String(doc.university_id) : '',
      indicator_id: doc.indicator_id ? String(doc.indicator_id) : '',
      title: doc.title || '',
      year: doc.year ? String(doc.year) : String(currentYear),
      month: doc.month ? String(doc.month) : '',
    });
    setUploadModal(true);
  };

  const closeUpload = async () => {
    if (uploading) return;
    const dirty = selectedFile || (!replacingDoc && (uploadForm.title || uploadForm.indicator_id || uploadForm.month));
    if (dirty) {
      const ok = await confirmAction({
        title: 'Descartar carga',
        message: 'Los datos y el archivo seleccionados no se han subido todavía. Si cierras ahora se perderán.',
        confirmLabel: 'Descartar',
        cancelLabel: 'Seguir editando',
      });
      if (!ok) return;
    }
    setUploadModal(false);
    resetUploadForm();
  };

  const uploadErrors = {};
  if (!uploadForm.university_id) uploadErrors.university_id = 'Selecciona la universidad a la que pertenece el documento.';
  if (!uploadForm.indicator_id) uploadErrors.indicator_id = 'Selecciona el literal LOTAIP que respalda el documento.';
  if (!uploadForm.year) uploadErrors.year = 'Indica el año.';
  else if (Number(uploadForm.year) < 2000 || Number(uploadForm.year) > currentYear) uploadErrors.year = `El año debe estar entre 2000 y ${currentYear}.`;
  if (!uploadForm.month) uploadErrors.month = 'Selecciona el mes.';
  else if (Number(uploadForm.year) === currentYear && Number(uploadForm.month) > currentMonth) uploadErrors.month = 'No se puede cargar un mes posterior al actual.';
  if (!uploadForm.title.trim()) uploadErrors.title = 'Escribe un título para identificar el documento.';
  if (!selectedFile) uploadErrors.file = 'Selecciona o arrastra el archivo.';
  const showUploadError = (key) => touchedUpload && uploadErrors[key];

  const handleFileSelect = (file) => {
    if (!file) return;
    const allowed = ['pdf', 'xlsx', 'xls', 'docx', 'doc', 'csv'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!allowed.includes(ext)) {
      setError(`Formato no permitido (.${ext}). Solo se aceptan PDF, XLSX, XLS, DOCX, DOC o CSV. Convierte el archivo y vuelve a seleccionarlo.`);
      return;
    }
    if (file.size === 0) {
      setError('El archivo está vacío (0 KB). Verifica que se haya guardado correctamente.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setError(`El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es 50 MB. Divídelo o comprímelo.`);
      return;
    }
    setError('');
    setSelectedFile(file);
    if (!uploadForm.title) {
      setUploadForm(prev => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, '') }));
    }
  };

  const handleUpload = async () => {
    setTouchedUpload(true);
    if (Object.keys(uploadErrors).length) {
      setError('Revisa los campos marcados en rojo antes de subir el documento.');
      return;
    }
    setError('');

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
      const replaced = replacingDoc;
      if (replaced) {
        try {
          await api.evidences.remove(replaced.id);
        } catch (removeErr) {
          toast.apiError(removeErr, `El nuevo archivo se cargó, pero no se pudo eliminar la versión anterior «${replaced.title}». Elimínala manualmente.`);
        }
      }
      toast.success({
        title: replaced ? 'Documento reemplazado' : 'Documento cargado',
        message: `«${uploadForm.title.trim()}» quedó en estado Pendiente hasta su evaluación.`,
      });
      setUploadModal(false);
      resetUploadForm();
      await loadDocs();
    } catch (e) {
      const d = describeError(e, 'No se pudo subir el documento.');
      setError(`${d.message} ${d.hint}`);
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
      const response = await fetch(`${API_BASE}/scraper/espoch/`, {
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
              toast.success({ title: 'Importación completada', message: `Documentos creados: ${data.stats?.created ?? 0} · omitidos: ${data.stats?.skipped ?? 0}.` });
              await loadDocs();
            } else if (data.status === 'error') {
              setScrapeResult({ error: data.error || data.message || 'El portal DPE devolvió un error durante la importación.' });
            }
          } catch (parseError) {
            console.error('Error parsing scraper response', parseError);
          }
        }
      }
    } catch (e) {
      const d = describeError(e, 'No se pudo completar la importación desde el portal DPE.');
      setScrapeResult({ error: `${d.message} ${d.hint}` });
    } finally {
      setScrapeLoading(false);
    }
  };

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>

      {/* Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>Documentos LOTAIP</h1>
          <p>Gestiona los documentos por universidad, año, mes y literal</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={openScraper} title="Descarga automáticamente los literales publicados en el Portal Nacional de Transparencia">
            🌐 Importar desde portal DPE
          </button>
          <button className="btn btn-primary" onClick={openUpload}>
            📤 Subir documento
          </button>
        </div>
      </div>

      {pageError && <ErrorNotice error={pageError} fallback="No se pudieron cargar los documentos." onRetry={loadDocs} />}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ minWidth: 240, flex: 2 }}
          type="search"
          aria-label="Buscar documentos"
          placeholder="Buscar por documento, literal, universidad o período"
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setFolderPath([]); }}
        />
        <select className="form-input" style={{ maxWidth: 200, flex: 1 }} aria-label="Filtrar por universidad"
          value={filterUniv} onChange={e => { setFilterUniv(e.target.value); setFolderPath([]); }}>
          <option value="">Todas las universidades</option>
          {universities.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="form-input" style={{ maxWidth: 180, flex: 1 }} aria-label="Filtrar por mes"
          value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setFolderPath([]); }}>
          <option value="">Todos los meses</option>
          {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={loadDocs}>↻ Actualizar</button>
        <button className="btn btn-secondary" onClick={() => { setSearchTerm(''); setFilterUniv(''); setFilterMonth(''); setFolderPath([]); }}
          disabled={!searchTerm && !filterUniv && !filterMonth && !folderPath.length}>
          ✕ Limpiar filtros
        </button>
      </div>

      {/* ─── Navegación Carpetas ─────────────────────────────── */}
      {folderPath.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-elevated)', padding: '10px 16px', borderRadius: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setFolderPath(p => p.slice(0, -1))}>
            <ArrowLeftIcon /> Volver
          </button>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <button type="button" className="link-crumb" onClick={() => setFolderPath([])}>Todas las universidades</button>
            {folderPath.map((path, idx) => (
              <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--text-subtle)' }}>/</span>
                {idx === folderPath.length - 1
                  ? <span aria-current="location">{path}</span>
                  : <button type="button" className="link-crumb" onClick={() => setFolderPath(p => p.slice(0, idx + 1))}>{path}</button>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lista */}
      {loading
        ? <div className="empty-state" aria-busy="true"><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 12px' }} /><p>Cargando documentos...</p></div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {viewType === 'docs' && itemsToRender.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--bg-tertiary)', borderRadius: 8, marginBottom: 8 }}>
                <input type="checkbox" id="select-all-docs"
                  checked={selectedDocs.length > 0 && selectedDocs.length === itemsToRender.length}
                  onChange={() => toggleSelectAll(itemsToRender)}
                />
                <label htmlFor="select-all-docs" style={{ fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>Seleccionar todos ({itemsToRender.length})</label>
                {selectedDocs.length > 0 && (
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={handleBulkDelete} disabled={saving} style={{ color: 'var(--danger)', borderColor: 'var(--danger-subtle)' }}>
                      <TrashIcon /> Eliminar ({selectedDocs.length})
                    </button>
                  </div>
                )}
              </div>
            )}
            {itemsToRender.map((item, idx) => {
              if (item.type === 'folder') {
                return (
                  <div key={`folder-${idx}`} className="doc-status-row" style={{ cursor: 'pointer' }} onClick={() => setFolderPath(p => [...p, item.name])}>
                    {viewType === 'universities'
                      ? <UniversityLogo university={item.university} name={item.name} />
                      : <div className="doc-icon" title="Carpeta"><FolderIcon /></div>}
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
                    <input type="checkbox" checked={selectedDocs.includes(doc.id)} onChange={() => toggleSelect(doc.id)} aria-label={`Seleccionar ${doc.title}`} />
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
                    <button className="btn btn-secondary btn-sm" title="Vista previa" aria-label={`Vista previa de ${doc.title}`}
                      onClick={() => openPreview(doc)}><EyeIcon /></button>
                    <button className="btn btn-secondary btn-sm" title="Descargar" aria-label={`Descargar ${doc.title}`}
                      onClick={() => handleDownload(doc)}><DownloadIcon /></button>
                    <button className="btn btn-secondary btn-sm" title="Editar o reemplazar" aria-label={`Editar ${doc.title}`}
                      onClick={() => setEditingDoc(doc)}><EditIcon /></button>
                    <button className="btn btn-secondary btn-sm" title="Eliminar" aria-label={`Eliminar ${doc.title}`}
                      onClick={() => handleDelete(doc)} style={{ color: 'var(--danger)' }}><TrashIcon /></button>
                  </div>
                </div>
              );
            })}
            {itemsToRender.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <h4>Sin documentos</h4>
                <p>{searchTerm || filterUniv || filterMonth
                  ? 'No hay documentos que coincidan con la búsqueda o los filtros. Pulsa «Limpiar filtros».'
                  : 'Aún no hay documentos. Usa «Subir documento» o «Importar desde portal DPE».'}</p>
              </div>
            )}
          </div>
        )}

      {/* ═══ MODAL — Vista Previa ══════════════════════════════ */}
      {uploadModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeUpload()}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={replacingDoc ? 'Reemplazar documento' : 'Subir documento'} onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3>{replacingDoc ? 'Reemplazar documento' : 'Subir documento'}</h3>
              <button className="modal-close" onClick={closeUpload} disabled={uploading} aria-label="Cerrar">✕</button>
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
                  {error && <div className="alert alert-danger" role="alert">⚠️ {error}</div>}
                  {replacingDoc && (
                    <div className="alert alert-info">
                      Vas a reemplazar <strong>«{replacingDoc.title}»</strong>. Corrige los datos si es necesario y selecciona el archivo correcto; la versión anterior se eliminará al terminar la carga.
                    </div>
                  )}
                  <p className="form-legend">Los campos marcados con <span className="required-mark">*</span> son obligatorios.</p>

                  <div className="form-group">
                    <label className="form-label" htmlFor="up-univ">Universidad<span className="required-mark" aria-hidden="true">*</span></label>
                    <select id="up-univ" className={`form-input${showUploadError('university_id') ? ' is-invalid' : ''}`} value={uploadForm.university_id} onChange={e => setUploadForm(p => ({ ...p, university_id: e.target.value }))}>
                      <option value="">— Seleccione una universidad —</option>
                      {universities.map(u => (
                        <option key={u.id} value={u.id}>{u.name} - {u.full_name || u.city || 'Universidad'}</option>
                      ))}
                    </select>
                    {showUploadError('university_id') && <div className="field-error">{uploadErrors.university_id}</div>}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="up-ind">Literal LOTAIP<span className="required-mark" aria-hidden="true">*</span></label>
                    <select id="up-ind" className={`form-input${showUploadError('indicator_id') ? ' is-invalid' : ''}`} value={uploadForm.indicator_id} onChange={e => setUploadForm(p => ({ ...p, indicator_id: e.target.value }))}>
                      <option value="">— Seleccione un literal —</option>
                      {indicators.map(i => (
                        <option key={i.id} value={i.id}>{i.code} - {i.name}</option>
                      ))}
                    </select>
                    {showUploadError('indicator_id')
                      ? <div className="field-error">{uploadErrors.indicator_id}</div>
                      : <div className="field-hint">Obligación del art. 19 de la LOTAIP que respalda el documento.</div>}
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" htmlFor="up-year">Año<span className="required-mark" aria-hidden="true">*</span></label>
                      <input
                        id="up-year"
                        type="number"
                        className={`form-input${showUploadError('year') ? ' is-invalid' : ''}`}
                        min="2000"
                        max={currentYear}
                        value={uploadForm.year}
                        onChange={e => {
                          const y = parseInt(e.target.value, 10);
                          if (y > currentYear) return;
                          setUploadForm(p => ({ ...p, year: e.target.value, month: '' }));
                        }}
                      />
                      {showUploadError('year') && <div className="field-error">{uploadErrors.year}</div>}
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" htmlFor="up-month">Mes<span className="required-mark" aria-hidden="true">*</span></label>
                      <select id="up-month" className={`form-input${showUploadError('month') ? ' is-invalid' : ''}`} value={uploadForm.month} onChange={e => setUploadForm(p => ({ ...p, month: e.target.value }))}>
                        <option value="">— Seleccione —</option>
                        {MONTHS.map(m => {
                          const isFuture = parseInt(uploadForm.year, 10) === currentYear && m.v > currentMonth;
                          return (
                            <option key={m.v} value={m.v} disabled={isFuture}>
                              {m.l}{isFuture ? ' (No disponible)' : ''}
                            </option>
                          );
                        })}
                      </select>
                      {showUploadError('month') && <div className="field-error">{uploadErrors.month}</div>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="up-title">Título del documento<span className="required-mark" aria-hidden="true">*</span></label>
                    <input id="up-title" className={`form-input${showUploadError('title') ? ' is-invalid' : ''}`} value={uploadForm.title} onChange={e => setUploadForm(p => ({ ...p, title: e.target.value }))} placeholder="Ej: Presupuesto institucional enero 2025" />
                    {showUploadError('title') && <div className="field-error">{uploadErrors.title}</div>}
                  </div>

                  <div
                    className={`upload-zone ${dragging ? 'dragging' : ''} ${selectedFile ? 'has-file' : ''}`}
                    onDragOver={e => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => { e.preventDefault(); setDragging(false); handleFileSelect(e.dataTransfer.files[0]); }}
                    onClick={() => fileRef.current?.click()}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    aria-label="Seleccionar archivo para cargar"
                    style={{ cursor: 'pointer', ...(showUploadError('file') ? { borderColor: 'var(--danger)' } : {}) }}
                  >
                    {selectedFile ? (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
                        <strong>{selectedFile.name}</strong>
                        <p style={{ fontSize: '0.8rem', marginTop: 4, color: 'var(--text-subtle)' }}>
                          {(selectedFile.size / 1024).toFixed(1)} KB · haz clic para cambiar
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="upload-icon">📂</div>
                        <h4>Arrastra tu archivo aquí</h4>
                        <p>o haz clic para seleccionar</p>
                        <p style={{ fontSize: '0.75rem', marginTop: 6 }}>PDF, XLSX, XLS, DOCX, DOC o CSV · máximo 50 MB</p>
                      </>
                    )}
                    <input ref={fileRef} type="file" style={{ display: 'none' }} accept=".pdf,.xlsx,.xls,.docx,.doc,.csv" onChange={e => { handleFileSelect(e.target.files[0]); e.target.value = ''; }} />
                  </div>
                  {showUploadError('file') && <div className="field-error" style={{ marginTop: -6 }}>{uploadErrors.file}</div>}

                  <div className="alert alert-info">
                    El documento quedará en estado <strong>Pendiente</strong> hasta su revisión.
                  </div>
                </div>
              )}
            </div>
            {!uploading && (
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeUpload}>
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={handleUpload}>
                  📤 {replacingDoc ? 'Reemplazar documento' : 'Subir documento'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {scraperModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !scrapeLoading && setScraperModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Importar desde portal DPE" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Importar desde portal DPE</h3>
              <button className="modal-close" onClick={() => !scrapeLoading && setScraperModal(false)} disabled={scrapeLoading} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-subtle)', marginBottom: 16, lineHeight: 1.5 }}>
                Selecciona la universidad y el período para descargar automáticamente los documentos (conjunto de datos, metadatos y diccionario) publicados en el Portal Nacional de Transparencia de la Defensoría del Pueblo.
              </p>

              {!scrapeLoading && !scrapeResult && (
                <div style={{ display: 'grid', gap: 14 }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="sc-univ">Universidad<span className="required-mark" aria-hidden="true">*</span></label>
                    <select
                      id="sc-univ"
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
                      <label className="form-label" htmlFor="sc-year">Año<span className="required-mark" aria-hidden="true">*</span></label>
                      <input
                        id="sc-year"
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
                      <label className="form-label" htmlFor="sc-month">Mes<span className="required-mark" aria-hidden="true">*</span></label>
                      <select
                        id="sc-month"
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
                      <div className="field-hint">Solo se pueden importar meses ya cerrados.</div>
                    </div>
                  </div>
                </div>
              )}

              {scrapeLoading && (!scrapeResult || !scrapeResult.isProgress) && (
                <div style={{ textAlign: 'center', padding: '18px 0' }} aria-live="polite">
                  <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
                  <p>Conectando con el portal DPE…</p>
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
                <div className="alert alert-danger" role="alert">
                  <strong>La importación falló.</strong> {scrapeResult.error}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setScraperModal(false)} disabled={scrapeLoading}>
                Cerrar
              </button>
              {scrapeResult?.error && (
                <button className="btn btn-secondary" onClick={() => setScrapeResult(null)}>Cambiar datos</button>
              )}
              {scrapeResult?.error && (
                <button className="btn btn-primary" onClick={handleScrape}>↻ Reintentar</button>
              )}
              {!scrapeResult && (
                <button
                  className="btn btn-primary"
                  onClick={handleScrape}
                  disabled={scrapeLoading || !scrapeForm.university_id || !scrapeForm.year || !scrapeForm.month}
                  title={!scrapeForm.university_id || !scrapeForm.month ? 'Selecciona universidad, año y mes' : undefined}
                >
                  {scrapeLoading ? 'Importando...' : 'Iniciar importación'}
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
                    Abrir en el portal de origen
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
                     <p>No se pudo generar la vista previa de este archivo (puede estar dañado o tener un formato no compatible). Descárgalo para abrirlo con su programa.</p>
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
              <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                {previewDoc.indicator_code} · {previewDoc.university_name}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => handleDownload(previewDoc)}><DownloadIcon /> Descargar</button>
                <button className="btn btn-secondary" onClick={() => setPreviewDoc(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <EditDocumentModal doc={editingDoc} onClose={() => setEditingDoc(null)} onSaved={loadDocs}
        onReplace={openReplace} reviewerId={user.id} />
    </div>
  );
}

