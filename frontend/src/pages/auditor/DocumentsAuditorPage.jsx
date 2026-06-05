import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import { ArrowLeftIcon, DownloadIcon, EyeIcon, FolderIcon } from '../../components/common/ActionIcons';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

const MEDIA_BASE = 'http://127.0.0.1:8000';
const FILE_ICONS = { PDF: '📄', XLSX: '📊', DOCX: '📝', CSV: '📋', URL: '🔗' };

const MONTHS = [
  { v: 1, l: 'Enero' }, { v: 2, l: 'Febrero' }, { v: 3, l: 'Marzo' },
  { v: 4, l: 'Abril' }, { v: 5, l: 'Mayo' },    { v: 6, l: 'Junio' },
  { v: 7, l: 'Julio' }, { v: 8, l: 'Agosto' },  { v: 9, l: 'Septiembre' },
  { v: 10, l: 'Octubre' }, { v: 11, l: 'Noviembre' }, { v: 12, l: 'Diciembre' },
];

function ComplianceBadge({ status }) {
  if (status === 'aprobado') return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
      color: 'var(--success)', background: 'var(--success-subtle)',
    }}>✅ Cumple</span>
  );
  if (status === 'rechazado') return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
      color: 'var(--danger)', background: 'var(--danger-subtle)',
    }}>✗ No cumple</span>
  );
  if (status === 'inconsistente') return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
      color: 'var(--warning)', background: 'var(--warning-subtle)',
    }}>⚠️ Inconsistente</span>
  );
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 12px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
      color: 'var(--text-main)', background: 'var(--bg-tertiary)',
    }}>⏳ Pendiente</span>
  );
}

export default function DocumentsAuditorPage() {
  const [docs, setDocs]           = useState([]);
  const [universities, setUniversities] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [filterUniv, setFilterUniv] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [tab, setTab]             = useState('all');
  const [folderPath, setFolderPath] = useState([]);

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterUniv)  params.university_id = filterUniv;
      if (filterMonth) params.month         = filterMonth;
      const res = await api.evidences.list(params);
      setDocs(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterUniv, filterMonth]);

  useEffect(() => {
    loadDocs();
    api.universities.list().then(r => setUniversities(r.data)).catch(() => {});
  }, [loadDocs]);

  const displayed = tab === 'all'
    ? docs
    : tab === 'cumple'
      ? docs.filter(d => d.validation_status === 'aprobado')
      : tab === 'no_cumple'
        ? docs.filter(d => d.validation_status === 'rechazado')
        : tab === 'inconsistente'
          ? docs.filter(d => d.validation_status === 'inconsistente')
          : docs.filter(d => d.validation_status === 'pendiente');

  const counts = {
    all:       docs.length,
    cumple:    docs.filter(d => d.validation_status === 'aprobado').length,
    no_cumple: docs.filter(d => d.validation_status === 'rechazado').length,
    inconsistente: docs.filter(d => d.validation_status === 'inconsistente').length,
    pendiente: docs.filter(d => d.validation_status === 'pendiente').length,
  };

  // % cumplimiento
  const totalReviewed = counts.cumple + counts.no_cumple;
  const compliancePct = totalReviewed > 0
    ? Math.round((counts.cumple / totalReviewed) * 100)
    : 0;

  const getYear = (doc) => doc.year ? String(doc.year) : 'Sin periodo';
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
  if (folderPath.length > 0) currentDocs = currentDocs.filter(d => (d.university_name || 'Universidad') === folderPath[0]);
  if (folderPath.length > 1) currentDocs = currentDocs.filter(d => getYear(d) === folderPath[1]);
  if (folderPath.length > 2) currentDocs = currentDocs.filter(d => getMonthName(d) === folderPath[2]);
  if (folderPath.length > 3) currentDocs = currentDocs.filter(d => getLiteralFolderName(d) === folderPath[3]);

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
    itemsToRender = Object.keys(groups).sort().map(k => ({ type: 'folder', name: k, count: groups[k].length }));
  } else if (viewType === 'years') {
    const groups = {};
    currentDocs.forEach(d => {
      const key = getYear(d);
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    itemsToRender = Object.keys(groups).sort((a, b) => Number(b) - Number(a)).map(k => ({ type: 'folder', name: k, count: groups[k].length }));
  } else if (viewType === 'months') {
    const groups = {};
    currentDocs.forEach(d => {
      const key = getMonthName(d);
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    itemsToRender = Object.keys(groups).map(k => ({ type: 'folder', name: k, count: groups[k].length }));
  } else if (viewType === 'literals') {
    const groups = {};
    currentDocs.forEach(d => {
      const key = getLiteralFolderName(d);
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    });
    itemsToRender = Object.keys(groups).sort().map(k => ({ type: 'folder', name: k, count: groups[k].length }));
  } else {
    itemsToRender = currentDocs.map(d => ({ type: 'doc', ...d }));
  }

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
          <h1>Documentos de Transparencia</h1>
          <p>Lista de evidencias LOTAIP — estado de cumplimiento por indicador</p>
        </div>
      </div>

      {/* Stats de cumplimiento */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card" style={{ '--color': 'var(--primary)' }}>
          <div className="stat-icon-wrap">📁</div>
          <div className="stat-value">{counts.all}</div>
          <div className="stat-label">Total Documentos</div>
        </div>
        <div className="stat-card" style={{ '--color': 'var(--success)' }}>
          <div className="stat-icon-wrap">✅</div>
          <div className="stat-value">{counts.cumple}</div>
          <div className="stat-label">Cumplen</div>
        </div>
        <div className="stat-card" style={{ '--color': 'var(--danger)' }}>
          <div className="stat-icon-wrap">✗</div>
          <div className="stat-value">{counts.no_cumple}</div>
          <div className="stat-label">No Cumplen</div>
        </div>
        <div className="stat-card" style={{ '--color': 'var(--warning)' }}>
          <div className="stat-icon-wrap">⚠️</div>
          <div className="stat-value">{counts.inconsistente}</div>
          <div className="stat-label">Inconsistentes</div>
        </div>
        <div className="stat-card" style={{ '--color': compliancePct >= 70 ? 'var(--success)' : 'var(--warning)' }}>
          <div className="stat-icon-wrap">📊</div>
          <div className="stat-value">{compliancePct}%</div>
          <div className="stat-label">Cumplimiento</div>
        </div>
      </div>

      {/* Barra de progreso de cumplimiento */}
      {false && totalReviewed > 0 && (
        <div style={{
          background: 'var(--surface-elevated)', borderRadius: 12,
          padding: '16px 20px', marginBottom: 20,
          border: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.85rem' }}>
            <span style={{ fontWeight: 600 }}>Índice de Transparencia LOTAIP</span>
            <span style={{ fontWeight: 700, color: compliancePct >= 70 ? 'var(--success)' : 'var(--warning)' }}>
              {compliancePct}%
            </span>
          </div>
          <div style={{ height: 12, background: 'var(--border-subtle)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 6,
              background: compliancePct >= 70
                ? 'linear-gradient(90deg, var(--success), #22c55e)'
                : 'linear-gradient(90deg, var(--warning), #f59e0b)',
              width: `${compliancePct}%`,
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
            <span>{counts.cumple} cumplen</span>
            <span>{counts.no_cumple} no cumplen</span>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-input" style={{ maxWidth: 220, flex: 1 }}
          value={filterUniv} onChange={e => { setFilterUniv(e.target.value); setFolderPath([]); }}>
          <option value="">Todas las universidades</option>
          {universities.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <select className="form-input" style={{ maxWidth: 180, flex: 1 }}
          value={filterMonth} onChange={e => { setFilterMonth(e.target.value); setFolderPath([]); }}>
          <option value="">Todos los meses</option>
          {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={loadDocs}>🔍 Filtrar</button>
        <button className="btn btn-secondary" onClick={() => { setFilterUniv(''); setFilterMonth(''); }}>✕ Limpiar</button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          ['all',       `Todos (${counts.all})`],
          ['cumple',    `✅ Cumplen (${counts.cumple})`],
          ['no_cumple', `✗ No Cumplen (${counts.no_cumple})`],
          ['inconsistente', `⚠️ Inconsistentes (${counts.inconsistente})`],
          ['pendiente', `⏳ Pendientes (${counts.pendiente})`],
        ].map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); setFolderPath([]); }}>
            {l}
          </button>
        ))}
      </div>

      {folderPath.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-elevated)', padding: '10px 16px', borderRadius: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setFolderPath(p => p.slice(0, -1))}>
            <ArrowLeftIcon /> Volver
          </button>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
        ? <div className="empty-state"><div className="empty-icon">⏳</div><p>Cargando documentos...</p></div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {itemsToRender.map((item, idx) => {
              if (item.type === 'folder') {
                return (
                  <div key={`folder-${idx}`} className="doc-status-row" style={{ cursor: 'pointer' }} onClick={() => setFolderPath(p => [...p, item.name])}>
                    <div className="doc-icon" title="Carpeta"><FolderIcon /></div>
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
                  </div>
                  {doc.observations && (
                    <div style={{
                      marginTop: 4, fontSize: '0.75rem', color: 'var(--text-subtle)',
                      background: 'var(--surface-elevated)', padding: '3px 8px',
                      borderRadius: 4, display: 'inline-block',
                    }}>
                      💬 {doc.observations}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <ComplianceBadge status={doc.validation_status} />
                  <button className="btn btn-secondary btn-sm" title="Vista previa"
                    onClick={() => openPreview(doc)}><EyeIcon /></button>
                  <button className="btn btn-secondary btn-sm" title="Descargar"
                    onClick={() => handleDownload(doc)}><DownloadIcon /></button>
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
                  <p style={{ color: 'var(--text-subtle)', marginBottom: 20 }}>
                    Documento externo (enlace al portal universitario)
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
                     <button className="btn btn-primary" onClick={() => handleDownload(previewDoc)}><DownloadIcon /> Descargar archivo</button>
                   </div>
                )
              ) : (
                <div style={{ padding: 32, textAlign: 'center' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 8 }}>{FILE_ICONS[previewDoc.file_type]}</div>
                  <p>Vista previa no disponible para este tipo de archivo.</p>
                  <button className="btn btn-primary" style={{ marginTop: 16 }}
                    onClick={() => handleDownload(previewDoc)}><DownloadIcon /> Descargar</button>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ComplianceBadge status={previewDoc.validation_status} />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                  {previewDoc.indicator_code} · {previewDoc.university_name}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {previewDoc.indicator_template_url && (
                  <a href={`${MEDIA_BASE}${previewDoc.indicator_template_url}`} target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ background: 'var(--info)', border: 'none' }}>
                    📥 Descargar Documento Base
                  </a>
                )}
                <button className="btn btn-secondary" onClick={() => handleDownload(previewDoc)}><DownloadIcon /> Descargar</button>
                <button className="btn btn-secondary" onClick={() => setPreviewDoc(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

