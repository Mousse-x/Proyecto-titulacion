import { useState, useRef, useEffect, useCallback } from 'react';
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

const DPE_SCRAPER_PRESETS = [
  {
    value: '__dpe_1126',
    label: 'UNL - Universidad Nacional de Loja',
    acronym: 'UNL',
    name: 'Universidad Nacional de Loja',
    transparency_url: 'https://transparencia.dpe.gob.ec/entidades/1126',
  },
];

const FILE_ICONS = { PDF: '📄', XLSX: '📊', DOCX: '📝', CSV: '📋', URL: '🔗' };

export default function DocumentsPage() {
  const user = JSON.parse(sessionStorage.getItem('auth_user') || '{}');

  const [docs, setDocs]           = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchParams] = useSearchParams();
  const [filterUniv, setFilterUniv] = useState(searchParams.get('university_id') || '');
  const [filterMonth, setFilterMonth] = useState('');
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
  const [scrapeForm, setScrapeForm] = useState({ year: new Date().getFullYear().toString(), month: '', university_id: '' });
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError]         = useState('');
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [saving, setSaving]       = useState(false);
  const fileRef = useRef();
  const toast = useToast();
  const confirmAction = useConfirm();
  const [pageError, setPageError] = useState(null);
  const [editingDoc, setEditingDoc] = useState(null);
  const [replacingDoc, setReplacingDoc] = useState(null);
  const [touchedUpload, setTouchedUpload] = useState(false);

  const [folderPath, setFolderPath] = useState([]);
  const [universities, setUniversities] = useState([]);

  const months = [
    { v: 1, l: 'Enero' }, { v: 2, l: 'Febrero' }, { v: 3, l: 'Marzo' },
    { v: 4, l: 'Abril' }, { v: 5, l: 'Mayo' },    { v: 6, l: 'Junio' },
    { v: 7, l: 'Julio' }, { v: 8, l: 'Agosto' },  { v: 9, l: 'Septiembre' },
    { v: 10, l: 'Octubre' }, { v: 11, l: 'Noviembre' }, { v: 12, l: 'Diciembre' },
  ];
  
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const loadDocs = useCallback(async () => {
    try {
      setLoading(true);
      setPageError(null);
      const res = await api.evidences.list();
      setDocs(res.data);
    } catch (err) {
      setPageError(err);
    } finally {
      setLoading(false);
      setSelectedDocs([]);
    }
  }, []);

  useEffect(() => {
    loadDocs();
    api.indicators.list().then(r => setIndicators(r.data)).catch(() => {});
    api.universities.list().then(r => setUniversities(r.data)).catch(() => {});
  }, [loadDocs]);

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('es');
  const filtered = docs.filter((doc) => {
    if (filterUniv && String(doc.university_id) !== filterUniv) return false;
    if (filterMonth && String(doc.month) !== filterMonth) return false;
    if (!normalizedSearch) return true;
    return [
      doc.title,
      doc.indicator_code,
      doc.indicator_name,
      doc.university_name,
      doc.file_type,
      doc.year,
      doc.uploaded_at,
    ].some((value) => String(value || '').toLocaleLowerCase('es').includes(normalizedSearch));
  });

  const getYear = (doc) => doc.year ? String(doc.year) : (doc.uploaded_at ? doc.uploaded_at.split('-')[0] : 'Sin Año');
  const getMonthName = (doc) => {
    const m = doc.month || (doc.uploaded_at ? parseInt(doc.uploaded_at.split('-')[1], 10) : null);
    const found = months.find(x => x.v === m);
    return found ? found.l : 'Sin Mes';
  };

  const LITERAL_FOLDERS = [
    "1.1 Estructura orgánica",
    "1.2 - 1.3 Base legal, regulaciones y procedimientos internos",
    "1.4 Metas y objetivos de unidades administrativas",
    "2.1 - 2.2 Directorio y distributivo del personal",
    "3 Remuneraciones e ingresos adicionales",
    "4 Licencias y comisiones",
    "5 Servicios",
    "6 Presupuesto",
    "7 Auditorías",
    "8 Contratación pública",
    "9 Contratistas incumplidos",
    "10 Planes y programas",
    "11 Contratos de crédito",
    "12 Rendición de cuentas",
    "13 Viáticos",
    "14 Responsables de acceso a información pública",
    "15 Contratos colectivos",
    "16 Índice de información reservada",
    "17 Audiencias y reuniones",
    "18 Convenios",
    "19 Donativos oficiales y protocolares",
    "20 Registro de activos de información",
    "21 Políticas públicas o información para grupos específicos",
    "22 Formularios y formatos de trámites",
    "23 Acciones afirmativas",
    "24 Información relevante / ODS"
  ];

  const getLiteralFolderName = (doc) => {
    if (!doc.indicator_name && !doc.indicator_code) return 'Sin Literal';
    
    if (doc.indicator_name) {
      const matched = LITERAL_FOLDERS.find(f => 
        doc.indicator_name.includes(f) || 
        f.toLowerCase().includes(doc.indicator_name.toLowerCase()) ||
        f.startsWith(doc.indicator_name.split(' ')[0])
      );
      if (matched) return matched;
    }
    
    if (doc.indicator_code) {
      const codePart = doc.indicator_code.split('-').pop().toLowerCase();
      if (codePart.length === 1) {
        const index = codePart.charCodeAt(0) - 97;
        if (index >= 0 && index < LITERAL_FOLDERS.length) return LITERAL_FOLDERS[index];
      }
    }

    return doc.indicator_name || 'Sin Literal';
  };

  const isSysadmin = true;

  let currentDocs = filtered;
  if (isSysadmin) {
    if (folderPath.length > 0) currentDocs = currentDocs.filter(d => (d.university_name || 'Universidad') === folderPath[0]);
    if (folderPath.length > 1) currentDocs = currentDocs.filter(d => getYear(d) === folderPath[1]);
    if (folderPath.length > 2) currentDocs = currentDocs.filter(d => getMonthName(d) === folderPath[2]);
    if (folderPath.length > 3) currentDocs = currentDocs.filter(d => getLiteralFolderName(d) === folderPath[3]);
  } else {
    if (folderPath.length > 0) currentDocs = currentDocs.filter(d => getYear(d) === folderPath[0]);
    if (folderPath.length > 1) currentDocs = currentDocs.filter(d => getMonthName(d) === folderPath[1]);
    if (folderPath.length > 2) currentDocs = currentDocs.filter(d => getLiteralFolderName(d) === folderPath[2]);
  }

  let viewType = 'docs';
  if (isSysadmin) {
    if (folderPath.length === 0) viewType = 'universities';
    else if (folderPath.length === 1) viewType = 'years';
    else if (folderPath.length === 2) viewType = 'months';
    else if (folderPath.length === 3) viewType = 'literals';
  } else {
    if (folderPath.length === 0) viewType = 'years';
    else if (folderPath.length === 1) viewType = 'months';
    else if (folderPath.length === 2) viewType = 'literals';
  }

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
  } else if (viewType === 'literals') {
    const groups = {};
    currentDocs.forEach(d => {
      const key = getLiteralFolderName(d);
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    
    // Ordenar las carpetas según el orden de LITERAL_FOLDERS
    itemsToRender = Object.keys(groups)
      .sort((a, b) => {
        const idxA = LITERAL_FOLDERS.indexOf(a);
        const idxB = LITERAL_FOLDERS.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
      })
      .map(k => ({ type: 'folder', name: k, count: groups[k].length, nextPath: k }));
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

  // ── Upload ──────────────────────────────────────────────────
  const uploadErrors = {};
  if (!form.university_id) uploadErrors.university_id = 'Selecciona la universidad a la que pertenece el documento.';
  if (!form.indicator_id) uploadErrors.indicator_id = 'Selecciona el literal LOTAIP que respalda el documento.';
  if (!form.year) uploadErrors.year = 'Indica el año.';
  else if (Number(form.year) < 2000 || Number(form.year) > currentYear) uploadErrors.year = `El año debe estar entre 2000 y ${currentYear}.`;
  if (!form.month) uploadErrors.month = 'Selecciona el mes.';
  else if (Number(form.year) === currentYear && Number(form.month) > currentMonth) uploadErrors.month = 'No se puede cargar un mes posterior al actual.';
  if (!(form.title || '').trim()) uploadErrors.title = 'Escribe un título para identificar el documento.';
  if (!selectedFile) uploadErrors.file = 'Selecciona o arrastra el archivo.';
  const showUploadError = (key) => touchedUpload && uploadErrors[key];

  const openUpload = () => {
    setError('');
    setReplacingDoc(null);
    setTouchedUpload(false);
    setForm(p => ({ ...p, year: p.year || String(currentYear), university_id: p.university_id || filterUniv || '' }));
    setUploadModal(true);
  };

  // Reemplazar: abre el formulario precargado con los datos del documento original.
  const openReplace = (doc) => {
    setError('');
    setSelectedFile(null);
    setTouchedUpload(false);
    setReplacingDoc(doc);
    setForm({
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
    const dirty = selectedFile || (!replacingDoc && (form.title || form.indicator_id || form.month));
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
    resetForm();
  };

  const handleUpload = async () => {
    setTouchedUpload(true);
    if (Object.keys(uploadErrors).length) {
      setError('Revisa los campos marcados en rojo antes de subir el documento.');
      return;
    }

    setUploading(true);
    setProgress(0);
    setError('');
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      fd.append('indicator_id', form.indicator_id);
      fd.append('university_id', form.university_id);
      fd.append('uploaded_by_user_id', user.id);
      fd.append('period_id', 1); // Por defecto
      fd.append('year', form.year);
      fd.append('month', form.month);
      fd.append('file', selectedFile);

      await api.evidences.upload(fd, pct => setProgress(pct));
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
        message: `«${form.title.trim()}» quedó en estado Pendiente hasta su evaluación.`,
      });
      setUploadModal(false);
      resetForm();
      await loadDocs();
    } catch (e) {
      const d = describeError(e, 'No se pudo subir el documento.');
      setError(`${d.message} ${d.hint}`);
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setForm({ indicator_id: '', title: '', month: '', year: new Date().getFullYear().toString(), university_id: '' });
    setSelectedFile(null);
    setProgress(0);
    setError('');
    setReplacingDoc(null);
    setTouchedUpload(false);
  };

  const handleFileSelect = (file) => {
    if (!file) return;

    const allowedExtensions = ['pdf', 'xlsx', 'xls', 'docx', 'doc', 'csv'];
    const fileExtension = file.name.split('.').pop().toLowerCase();
    
    if (!allowedExtensions.includes(fileExtension)) {
      setError(`Formato no permitido (.${fileExtension}). Solo se aceptan PDF, XLSX, XLS, DOCX, DOC o CSV. Convierte el archivo y vuelve a seleccionarlo.`);
      return;
    }
    if (file.size === 0) {
      setError('El archivo está vacío (0 KB). Verifica que se haya guardado correctamente.');
      return;
    }

    const maxSizeInBytes = 50 * 1024 * 1024; // 50 MB
    if (file.size > maxSizeInBytes) {
      setError(`El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es 50 MB. Divídelo o comprímelo.`);
      return;
    }

    setError(''); // Limpiar errores previos si el archivo es válido
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
    } catch (err) { toast.apiError(err, 'No se pudo descargar el documento.', () => handleDownload(doc)); }
  };

  // ── Scraper ─────────────────────────────────────────────────
  const handleScrape = async () => {
    setScrapeLoading(true);
    setScrapeResult(null);
    try {
      const token = sessionStorage.getItem('auth_token'); // o cookie
      const selectedPreset = DPE_SCRAPER_PRESETS.find((item) => item.value === scrapeForm.university_id);
      const scrapePayload = selectedPreset
        ? {
            period_id: 1,
            user_id: user.id,
            transparency_url: selectedPreset.transparency_url,
            university_name: selectedPreset.name,
            university_acronym: selectedPreset.acronym,
            year: scrapeForm.year,
            month: scrapeForm.month,
          }
        : {
            period_id: 1,
            user_id: user.id,
            university_id: scrapeForm.university_id,
            year: scrapeForm.year,
            month: scrapeForm.month,
          };
      // Usamos fetch nativo para leer el stream en tiempo real
      const response = await fetch(`${API_BASE}/scraper/espoch/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(scrapePayload)
      });

      if (!response.ok) {
        const err = new Error(`El servidor respondió con el código ${response.status}.`);
        err.status = response.status;
        throw err;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);
        
        for (let line of lines) {
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
          } catch (e) {
             console.error("Error parsing JSON line", e);
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

      {/* ─── Header ──────────────────────────────────────────── */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>Documentos LOTAIP</h1>
          <p>Gestiona los documentos por universidad, año, mes y literal</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => { setScrapeResult(null); setScrapeForm(p => ({ ...p, university_id: p.university_id || filterUniv || '' })); setScraperModal(true); }}
            title="Descarga automáticamente los literales publicados en el Portal Nacional de Transparencia">
            🌐 Importar desde portal DPE
          </button>
          <button className="btn btn-primary" onClick={openUpload}>
            📤 Subir documento
          </button>
        </div>
      </div>

      {pageError && <ErrorNotice error={pageError} fallback="No se pudieron cargar los documentos." onRetry={loadDocs} />}

      {/* ─── Búsqueda y filtros ──────────────────────────────── */}
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
        <select className="form-input" style={{ maxWidth: 220, flex: 1 }} aria-label="Filtrar por universidad"
          value={filterUniv} onChange={e => { setFilterUniv(e.target.value); setFolderPath([]); }}>
          <option value="">Todas las universidades</option>
          {universities.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="form-input" style={{ maxWidth: 180, flex: 1 }} aria-label="Filtrar por mes"
          value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setFolderPath([]); }}>
          <option value="">Todos los meses</option>
          {months.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={loadDocs}>↻ Actualizar</button>
        <button className="btn btn-secondary" disabled={!searchTerm && !filterUniv && !filterMonth && !folderPath.length} onClick={() => {
          setSearchTerm('');
          setFilterUniv('');
          setFilterMonth('');
          setFolderPath([]);
        }}>
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

      {/* ─── Lista ───────────────────────────────────────────── */}
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
                     <p>No se pudo generar la vista previa de este archivo (puede estar dañado o tener un formato no compatible). Descárgalo para abrirlo con su programa.</p>
                     <button className="btn btn-primary" onClick={() => handleDownload(previewDoc)}><DownloadIcon /> Descargar archivo</button>
                   </div>
                )
              ) : (
                <div style={{ padding: '32px', textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 16 }}>{FILE_ICONS[previewDoc.file_type]}</div>
                  <p>Vista previa no disponible para este tipo de archivo.</p>
                  <button className="btn btn-primary" style={{ marginTop: 16 }}
                    onClick={() => { handleDownload(previewDoc); setPreviewDoc(null); }}>
                    <DownloadIcon /> Descargar archivo
                  </button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                {previewDoc.indicator_code} · {previewDoc.uploaded_at?.split('T')[0]}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => handleDownload(previewDoc)}>
                  <DownloadIcon /> Descargar
                </button>
                <button className="btn btn-secondary" onClick={() => setPreviewDoc(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL — Upload ════════════════════════════════════ */}
      {uploadModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeUpload()}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={replacingDoc ? 'Reemplazar documento' : 'Subir documento'} onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3>{replacingDoc ? 'Reemplazar documento' : 'Subir documento'}</h3>
              <button className="modal-close" onClick={closeUpload} disabled={uploading} aria-label="Cerrar">✕</button>
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
                  {error && <div className="alert alert-danger" role="alert">⚠️ {error}</div>}
                  {replacingDoc && (
                    <div className="alert alert-info">
                      Vas a reemplazar <strong>«{replacingDoc.title}»</strong>. Corrige los datos si es necesario y selecciona el archivo correcto; la versión anterior se eliminará al terminar la carga.
                    </div>
                  )}
                  <p className="form-legend">Los campos marcados con <span className="required-mark">*</span> son obligatorios.</p>

                  <div className="form-group">
                    <label className="form-label" htmlFor="up-univ">Universidad<span className="required-mark" aria-hidden="true">*</span></label>
                    <select id="up-univ" className={`form-input${showUploadError('university_id') ? ' is-invalid' : ''}`} value={form.university_id || ''}
                      onChange={e => setForm(p => ({ ...p, university_id: e.target.value }))}
                      disabled={false}>
                      <option value="">— Seleccione una universidad —</option>
                      {DPE_SCRAPER_PRESETS
                        .filter((preset) => !universities.some((u) => u.transparency_url === preset.transparency_url))
                        .map((preset) => (
                          <option key={preset.value} value={preset.value}>{preset.label}</option>
                        ))}
                      {universities.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                    {showUploadError('university_id') && <div className="field-error">{uploadErrors.university_id}</div>}
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="up-ind">Literal LOTAIP<span className="required-mark" aria-hidden="true">*</span></label>
                    <select id="up-ind" className={`form-input${showUploadError('indicator_id') ? ' is-invalid' : ''}`} value={form.indicator_id}
                      onChange={e => setForm(p => ({ ...p, indicator_id: e.target.value }))}>
                      <option value="">— Seleccione un indicador —</option>
                      {indicators
                        .map(i => ({
                          ...i,
                          mappedName: getLiteralFolderName({ indicator_code: i.code, indicator_name: i.name })
                        }))
                        .sort((a, b) => {
                          const idxA = LITERAL_FOLDERS.indexOf(a.mappedName);
                          const idxB = LITERAL_FOLDERS.indexOf(b.mappedName);
                          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                          if (idxA !== -1) return -1;
                          if (idxB !== -1) return 1;
                          return a.mappedName.localeCompare(b.mappedName);
                        })
                        .map(i => (
                          <option key={i.id} value={i.id}>{i.mappedName}</option>
                      ))}
                    </select>
                    {showUploadError('indicator_id')
                      ? <div className="field-error">{uploadErrors.indicator_id}</div>
                      : <div className="field-hint">Obligación del art. 19 de la LOTAIP que respalda el documento.</div>}
                  </div>

                  <div style={{ display: 'flex', gap: 16 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" htmlFor="up-year">Año<span className="required-mark" aria-hidden="true">*</span></label>
                      <input id="up-year" type="number" className={`form-input${showUploadError('year') ? ' is-invalid' : ''}`} value={form.year || ''}
                        onChange={e => setForm(p => ({ ...p, year: e.target.value }))}
                        min="2000" max={currentYear} />
                      {showUploadError('year') && <div className="field-error">{uploadErrors.year}</div>}
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" htmlFor="up-month">Mes<span className="required-mark" aria-hidden="true">*</span></label>
                      <select id="up-month" className={`form-input${showUploadError('month') ? ' is-invalid' : ''}`} value={form.month}
                        onChange={e => setForm(p => ({ ...p, month: e.target.value }))}>
                        <option value="">— Seleccione —</option>
                        {months.map(m => {
                          const isFuture = parseInt(form.year, 10) === currentYear && m.v > currentMonth;
                          return <option key={m.v} value={m.v} disabled={isFuture}>{m.l}{isFuture ? ' (No disponible)' : ''}</option>;
                        })}
                      </select>
                      {showUploadError('month') && <div className="field-error">{uploadErrors.month}</div>}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="up-title">Título del documento<span className="required-mark" aria-hidden="true">*</span></label>
                    <input id="up-title" className={`form-input${showUploadError('title') ? ' is-invalid' : ''}`} value={form.title}
                      onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                      placeholder="Ej: Presupuesto 2026 — ESPOCH" />
                    {showUploadError('title') && <div className="field-error">{uploadErrors.title}</div>}
                  </div>

                  {/* Drop Zone */}
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
                          {(selectedFile.size / 1024).toFixed(1)} KB · Haz clic para cambiar
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
                    <input ref={fileRef} type="file" style={{ display: 'none' }}
                      accept=".pdf,.xlsx,.xls,.docx,.doc,.csv"
                      onChange={e => { handleFileSelect(e.target.files[0]); e.target.value = ''; }} />
                  </div>
                  {showUploadError('file') && <div className="field-error" style={{ marginTop: -6 }}>{uploadErrors.file}</div>}

                  <div className="alert alert-info">
                    ℹ️ El documento quedará en estado <strong>Pendiente</strong> hasta ser revisado.
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

      {/* ═══ MODAL — Scraper DPE ════════════════════════════ */}
      {scraperModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && !scrapeLoading && setScraperModal(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Importar desde portal DPE" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Importar desde portal DPE</h3>
              <button className="modal-close" onClick={() => !scrapeLoading && setScraperModal(false)} disabled={scrapeLoading} aria-label="Cerrar">✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16, color: 'var(--text-subtle)' }}>
                Selecciona la universidad y el período para descargar automáticamente los literales de transparencia activa (conjunto de datos, metadatos y diccionario) publicados en el Portal Nacional de Transparencia de la Defensoría del Pueblo.
              </p>
              
              {!scrapeLoading && !scrapeResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  <div className="form-group">
                    <label className="form-label" htmlFor="sc-univ">Universidad<span className="required-mark" aria-hidden="true">*</span></label>
                    <select id="sc-univ" className="form-input" value={scrapeForm.university_id}
                      onChange={e => setScrapeForm(p => ({ ...p, university_id: e.target.value }))}
                      disabled={false}>
                      <option value="">— Seleccione una universidad —</option>
                      {universities.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" htmlFor="sc-year">Año<span className="required-mark" aria-hidden="true">*</span></label>
                      <input id="sc-year" type="number" className="form-input" value={scrapeForm.year}
                        onChange={e => {
                          const y = parseInt(e.target.value);
                          if (y > currentYear) return; // Prevent future year
                          setScrapeForm(p => ({ ...p, year: e.target.value, month: '' })); // Reset month if year changes
                        }}
                        min="2000" max={currentYear} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label" htmlFor="sc-month">Mes<span className="required-mark" aria-hidden="true">*</span></label>
                      <select id="sc-month" className="form-input" value={scrapeForm.month}
                        onChange={e => setScrapeForm(p => ({ ...p, month: e.target.value }))}>
                        <option value="">— Seleccione —</option>
                        {months.map(m => {
                          const isFuture = parseInt(scrapeForm.year) === currentYear && m.v >= currentMonth;
                          return (
                            <option key={m.v} value={m.v} disabled={isFuture}>
                              {m.l} {isFuture ? '(No disponible)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {scrapeLoading && (!scrapeResult || !scrapeResult.isProgress) && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
                  <p>Conectando con el portal DPE…</p>
                </div>
              )}

              {scrapeResult?.isProgress && (
                <div style={{ padding: '20px 0' }}>
                  <div style={{
                    width: '100%', background: 'var(--border-subtle)',
                    borderRadius: 10, height: 12, overflow: 'hidden', marginBottom: 12
                  }}>
                    <div style={{
                      width: `${scrapeResult.pct}%`, background: 'var(--primary)',
                      height: '100%', transition: 'width 0.3s ease'
                    }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-subtle)' }}>
                    <span>{scrapeResult.message}</span>
                    <span style={{ fontWeight: 600 }}>{scrapeResult.pct}%</span>
                  </div>
                </div>
              )}

              {scrapeResult && !scrapeResult.error && !scrapeResult.isProgress && (
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
                <div className="alert alert-danger" role="alert"><strong>La importación falló.</strong> {scrapeResult.error}</div>
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
                <button className="btn btn-primary" onClick={handleScrape} disabled={scrapeLoading || !scrapeForm.university_id || !scrapeForm.year || !scrapeForm.month}
                  title={!scrapeForm.university_id || !scrapeForm.month ? 'Selecciona universidad, año y mes' : undefined}>
                  {scrapeLoading ? 'Importando...' : 'Iniciar importación'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <EditDocumentModal doc={editingDoc} onClose={() => setEditingDoc(null)} onSaved={loadDocs}
        onReplace={openReplace} reviewerId={user.id} />
    </div>
  );
}
