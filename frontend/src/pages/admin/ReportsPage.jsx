import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import ErrorNotice from '../../components/common/ErrorNotice';
import { useToast } from '../../context/FeedbackContext';
import { api } from '../../api/client';
import { validationApi } from '../../api/validation';
import { groupLotaipPackages } from '../../utils/lotaipPackages';
import { getScoreLabel } from '../../utils/score';
import transparencyLogo from '../../assets/transparency-logo.jpg';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/*
 * Tipos de reporte. `needsUniversity`: requiere elegir una universidad (detalle de su evaluación).
 * `usesMonth`: el filtro de mes aplica a este reporte.
 */
const REPORT_TYPES = [
  { id: 'ranking', group: 'Comparativos', title: 'Ranking ITI', desc: 'Posición, ITI, SITA con CTA/ETA/RP/CI y nota de las 8 dimensiones.', usesMonth: true },
  { id: 'dimensions', group: 'Comparativos', title: 'Cumplimiento por dimensión', desc: 'Nota de cada dimensión (D1–D8) por universidad, en formato de lista.', usesMonth: true },
  { id: 'lotaip', group: 'Por universidad', title: 'Evaluación LOTAIP por literal', desc: 'Estado, SITA y criterios CTA, ETA, RP y CI de cada literal.', needsUniversity: true, usesMonth: true },
  { id: 'international', group: 'Por universidad', title: 'Evaluación internacional', desc: 'Resultado de cada indicador mixto y complementario con su evidencia.', needsUniversity: true },
  { id: 'documents', group: 'Inventario', title: 'Documentos cargados', desc: 'Evidencias por universidad, literal, mes, estado y formato.', usesMonth: true },
  { id: 'indicators', group: 'Inventario', title: 'Catálogo de indicadores', desc: 'Documentos LOTAIP, indicadores mixtos y complementarios con su dimensión y peso.' },
];

const FORMATS = ['PDF', 'XLSX', 'CSV', 'JSON', 'HTML'];

const DOC_STATUS = { aprobado: 'Cumple', rechazado: 'No cumple', inconsistente: 'Inconsistente', pendiente: 'Pendiente' };
const PACKAGE_STATUS = {
  CUMPLE: 'Cumple', CUMPLE_PARCIALMENTE: 'Cumple parcialmente', NO_CUMPLE: 'No cumple', INCOMPLETO: 'Incompleto',
  NO_PRESENTADO: 'No presentado', PENDIENTE_REVISION: 'Pendiente de comprobación', NO_VERIFICABLE: 'No verificable', ERROR_PROCESAMIENTO: 'Error',
};
const INDICATOR_STATUS = {
  CUMPLE: 'Cumple', PARCIAL: 'Cumple parcialmente', NO_CUMPLE: 'No cumple', SIN_EVIDENCIA: 'Sin evidencia',
  NO_APLICA: 'No aplica', PENDIENTE: 'Pendiente', ERROR_TECNICO: 'Error técnico',
};
const CRITERIA = [['cta', 'CTA'], ['eta', 'ETA'], ['rp', 'RP'], ['verificables', 'CI']];

const valueOrDash = (value) => (value === null || value === undefined || value === '' ? '-' : value);
const pct = (value) => (value == null || Number.isNaN(Number(value)) ? '-' : Number(Number(value).toFixed(2)));
const escapeHtml = (value) => String(valueOrDash(value)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Calificación de un criterio LOTAIP en texto legible. */
function criterionText(criterion) {
  if (!criterion) return '-';
  if (!criterion.aplica || criterion.calificacion === 'NO APLICA') return 'No aplica';
  const value = criterion.calificacion;
  if (value == null || value === 'SIN EVALUACIÓN') return 'Pendiente';
  if (value === 'SI' || Number(value) === 1) return 'Cumple';
  if (value === 'NO' || Number(value) === 0) return 'No cumple';
  return `Parcial (${value})`;
}

function buildFileName(type, format) {
  const stamp = new Date().toISOString().slice(0, 10);
  const ext = format === 'PDF' || format === 'HTML' ? 'html' : format.toLowerCase();
  return `reporte_${type}_${stamp}.${ext}`;
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escapeCell = (value) => {
    const text = String(valueOrDash(value));
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  // BOM para que Excel abra bien las tildes.
  const lines = [headers.join(';'), ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(';'))];
  return String.fromCharCode(0xfeff) + lines.join('\n');
}

function htmlReport({ title, filters, rows, logoUrl, autoPrint = false }) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const wide = headers.length > 9;
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 ${wide ? 'landscape' : 'portrait'}; margin: 12mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #102447; margin: 0; background: #ffffff; }
    .page { padding: 28px 32px; }
    .brand-bar { height: 8px; background: #cf2027; margin: 0 0 20px; }
    .header { display: flex; align-items: center; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #dbe4f0; }
    .logo { width: 56px; height: 56px; object-fit: cover; border-radius: 50%; background: #cf2027; }
    .institution { font-size: 11px; color: #48617f; text-transform: uppercase; font-weight: 700; }
    .title { font-size: 22px; font-weight: 800; margin: 4px 0; color: #102447; }
    .subtitle { color: #48617f; font-size: 12px; line-height: 1.45; }
    .meta { margin: 14px 0 18px; display: grid; grid-template-columns: repeat(${Math.min(filters.length, 4)}, 1fr); gap: 8px; }
    .meta div { border: 1px solid #dbe4f0; padding: 9px 10px; border-radius: 6px; background: #f8fbff; font-size: 10.5px; color: #48617f; }
    .meta strong { display: block; color: #102447; font-size: 13px; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; font-size: ${wide ? '9px' : '10.5px'}; }
    th, td { border: 1px solid #dbe4f0; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #f1f5fa; color: #102447; font-size: ${wide ? '8.5px' : '10px'}; text-transform: uppercase; }
    tr:nth-child(even) td { background: #fbfdff; }
    td a { color: #0b5cad; word-break: break-all; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; page-break-inside: avoid; }
    .signature { text-align: center; color: #48617f; font-size: 11px; }
    .line { border-top: 1px solid #102447; margin-bottom: 8px; }
    .footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #dbe4f0; color: #7d8ea8; font-size: 10px; display: flex; justify-content: space-between; }
    @media print { .page { padding: 0; } .brand-bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="brand-bar"></div>
  <div class="page">
  <div class="header">
    <img class="logo" src="${logoUrl}" alt="Logo institucional" />
    <div>
      <div class="institution">Escuela Superior Politécnica de Chimborazo - DTIC</div>
      <div class="title">${escapeHtml(title)}</div>
      <div class="subtitle">Sistema de Transparencia Institucional | LOTAIP, OGP, OCDE y ODS</div>
    </div>
  </div>
  <div class="meta">${filters.map(([label, value]) => `<div>${escapeHtml(label)}<strong>${escapeHtml(value)}</strong></div>`).join('')}</div>
  <table>
    <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${headers.map((h) => {
      const v = row[h];
      return `<td>${typeof v === 'string' && /^https?:\/\//.test(v) ? `<a href="${escapeHtml(v)}">${escapeHtml(v)}</a>` : escapeHtml(v)}</td>`;
    }).join('')}</tr>`).join('')}</tbody>
  </table>
  <div class="signatures">
    <div class="signature"><div class="line"></div>Responsable institucional</div>
    <div class="signature"><div class="line"></div>Auditor / Administrador del sistema</div>
  </div>
  <div class="footer"><span>Reporte generado automáticamente por SisTransp</span><span>ESPOCH - Transparencia institucional</span></div>
  </div>
  ${autoPrint ? '<script>window.addEventListener("load", function(){ setTimeout(function(){ window.print(); }, 250); });</script>' : ''}
</body>
</html>`;
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState('ranking');
  const [periodId, setPeriodId] = useState('');
  const [universityId, setUniversityId] = useState('all');
  const [month, setMonth] = useState('');
  const [format, setFormat] = useState('PDF');
  const [stats, setStats] = useState(null);
  const [universities, setUniversities] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [model, setModel] = useState(null);
  const [evidences, setEvidences] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const toast = useToast();

  const type = REPORT_TYPES.find((item) => item.id === reportType);
  const effectiveMonth = type?.usesMonth ? month : '';

  // Catálogos (una vez).
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.universities.list(), api.indicators.list(), api.transparencyModel.get()])
      .then(([universitiesRes, indicatorsRes, modelRes]) => {
        if (cancelled) return;
        setUniversities(universitiesRes.data || []);
        setIndicators(indicatorsRes.data || []);
        setModel(modelRes.data || null);
      })
      .catch((err) => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Ranking y períodos disponibles (dependen del período y del mes).
  useEffect(() => {
    let cancelled = false;
    const params = { force: true };
    if (periodId) params.periodo_id = periodId;
    if (effectiveMonth) params.month = effectiveMonth;
    Promise.resolve()
      .then(() => { if (!cancelled) setLoading(true); return api.stats(params); })
      .then((res) => {
        if (cancelled) return;
        const data = res.data || {};
        setStats(data);
        if (!periodId && data.period?.id) setPeriodId(String(data.period.id));
      })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [periodId, effectiveMonth, reloadKey]);

  // Documentos cargados.
  useEffect(() => {
    if (reportType !== 'documents') return undefined;
    let cancelled = false;
    const params = {};
    if (universityId !== 'all') params.university_id = universityId;
    if (effectiveMonth) params.month = effectiveMonth;
    if (periodId) params.period_id = periodId;
    Promise.resolve()
      .then(() => { if (cancelled) return null; setLoading(true); setError(''); return api.evidences.list(params); })
      .then((res) => { if (!cancelled && res) setEvidences(res.data || []); })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reportType, universityId, effectiveMonth, periodId, reloadKey]);

  // Detalle de la evaluación de una universidad (LOTAIP e internacional).
  useEffect(() => {
    if (!type?.needsUniversity || universityId === 'all' || !periodId) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => { if (cancelled) return null; setLoading(true); setError(''); return validationApi.getSummary(universityId, periodId, effectiveMonth); })
      .then((res) => { if (!cancelled && res) setEvaluation(res.data || null); })
      .catch((err) => { if (!cancelled) { setEvaluation(null); setError(err); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type, universityId, periodId, effectiveMonth, reloadKey]);

  const periods = stats?.available_periods || [];
  const periodObj = periods.find((p) => String(p.id) === String(periodId)) || stats?.period;
  const selectedUniversity = universities.find((item) => String(item.id) === String(universityId));
  const dimensionCodes = useMemo(() => (model?.dimensions || []).map((d) => d.code), [model]);
  const needsUniversityPick = type?.needsUniversity && universityId === 'all';

  const reportRows = useMemo(() => {
    const ranking = (stats?.ranking || []).filter((item) => universityId === 'all' || String(item.id) === String(universityId));

    if (reportType === 'ranking') {
      return ranking.map((item) => {
        const comps = item.lotaip_components || {};
        const dims = Object.fromEntries((item.dimensions || []).map((d) => [d.code, pct(d.score)]));
        return {
          Posición: item.rank ?? '-',
          Universidad: item.name,
          Nombre: item.full_name,
          'ITI %': pct(item.integrated_transparency_score),
          Nivel: getScoreLabel(item.integrated_transparency_score),
          'SITA %': pct(item.transparency_score),
          'CTA %': pct(comps.CTA), 'ETA %': pct(comps.ETA), 'RP %': pct(comps.RP), 'CI %': pct(comps.CI),
          ...Object.fromEntries(dimensionCodes.map((code) => [`${code} %`, dims[code] ?? '-'])),
          'Documentos evaluados': item.evaluated_documents,
        };
      });
    }

    if (reportType === 'dimensions') {
      const weights = Object.fromEntries((model?.dimensions || []).map((d) => [d.code, d.weight]));
      return ranking.flatMap((item) => (item.dimensions || []).map((d) => ({
        Universidad: item.name,
        Dimensión: d.code,
        Nombre: d.name,
        'Peso en el ITI %': pct(weights[d.code]),
        'Cumplimiento %': pct(d.score),
        Nivel: d.score == null ? 'Pendiente' : getScoreLabel(d.score),
        'Aporta al ITI (puntos)': d.score == null || weights[d.code] == null ? '-' : pct((Number(weights[d.code]) * d.score) / 100),
      })));
    }

    if (reportType === 'lotaip') {
      if (needsUniversityPick) return [];
      return groupLotaipPackages(evaluation?.results || []).map((item) => {
        const criteria = Object.fromEntries((item.rubrica_lotaip?.criterios || []).map((c) => [c.id, c]));
        const score = item.puntaje_total ?? item.sita?.resultado_automatico?.puntaje ?? null;
        return {
          Literal: item.literal,
          Nombre: item.literal_name,
          Periodo: item.periodo,
          Estado: item.requiere_revalidacion ? 'Histórica: revalidar' : (PACKAGE_STATUS[item.estado_cumplimiento] || item.estado_cumplimiento || '-'),
          'SITA %': pct(score),
          ...Object.fromEntries(CRITERIA.map(([id, label]) => [label, criterionText(criteria[id])])),
          'Documentos faltantes': (item.rubrica_lotaip?.documentos_faltantes || []).join(', '),
          Observaciones: (item.observaciones || []).map((t) => String(t).replace(/^(✅|⚠️|⚠|❌|📋)\s*/u, '')).join(' | '),
        };
      });
    }

    if (reportType === 'international') {
      if (needsUniversityPick) return [];
      return (evaluation?.summary?.integrated?.indicators || [])
        .filter((item) => item.classification !== 'NACIONAL')
        .map((item) => ({
          Dimensión: item.dimension,
          'Nombre de la dimensión': item.dimension_name,
          Código: item.code,
          Tipo: item.classification_label,
          Indicador: item.statement,
          Estado: INDICATOR_STATUS[item.status] || item.status,
          'Puntaje %': item.score == null ? '-' : pct(Number(item.score) * 100),
          Justificación: item.justification,
          Fuente: item.source_url,
          Evaluado: item.evaluated_at ? new Date(item.evaluated_at).toLocaleDateString('es-EC') : '-',
        }));
    }

    if (reportType === 'documents') {
      return evidences
        .filter((item) => universityId === 'all' || String(item.university_id || item.university?.id) === String(universityId))
        .filter((item) => !effectiveMonth || String(item.month) === String(effectiveMonth))
        .map((item) => ({
          Universidad: item.university_name || item.university || item.university_acronym,
          Literal: item.indicator_code || item.indicator,
          Título: item.title,
          Mes: MONTH_NAMES[(item.month || 0) - 1] || item.month,
          Periodo: item.period_name || item.period || item.year,
          Estado: DOC_STATUS[item.validation_status] || item.validation_status,
          Formato: item.file_type,
        }));
    }

    if (reportType === 'indicators') {
      const lotaipRows = indicators.map((item) => ({
        Tipo: 'Documento LOTAIP', Código: item.code, Indicador: item.name, Dimensión: '-', 'Peso en la dimensión %': '-',
        'Plantilla base': item.template_url ? 'Sí' : 'No', Activo: item.is_active ? 'Sí' : 'No',
      }));
      const modelRows = (model?.dimensions || []).flatMap((dimension) => (dimension.indicators || [])
        .filter((item) => item.classification !== 'NACIONAL')
        .map((item) => ({
          Tipo: item.classification === 'MIXTO' ? 'Mixto' : 'Complementario', Código: item.code, Indicador: item.statement,
          Dimensión: `${dimension.code} · ${dimension.name}`, 'Peso en la dimensión %': pct(item.weight),
          'Plantilla base': '-', Activo: item.is_active === false ? 'No' : 'Sí',
        })));
      return [...lotaipRows, ...modelRows];
    }
    return [];
  }, [reportType, stats, universityId, dimensionCodes, model, evaluation, needsUniversityPick, evidences, effectiveMonth, indicators]);

  const filterPairs = [
    ['Reporte', type?.title],
    ['Período', periodObj ? (periodObj.name || `Año ${periodObj.year}`) : '-'],
    ['Universidad', selectedUniversity ? `${selectedUniversity.acronym || ''} ${selectedUniversity.name || ''}`.trim() : 'Todas'],
    ['Mes', type?.usesMonth ? (month ? MONTH_NAMES[month - 1] : 'Todos') : 'No aplica'],
  ];
  const filterSummary = filterPairs.slice(1).map(([, v]) => v).join(' · ');

  const handleExport = () => {
    if (!reportRows.length) return;
    setExporting(true);
    try {
      const fileName = buildFileName(reportType, format);
      if (format === 'CSV') {
        downloadBlob(toCsv(reportRows), fileName, 'text/csv;charset=utf-8');
      } else if (format === 'JSON') {
        downloadBlob(JSON.stringify({ reporte: type?.title, filtros: Object.fromEntries(filterPairs), generado: new Date().toISOString(), filas: reportRows }, null, 2), fileName, 'application/json;charset=utf-8');
      } else if (format === 'XLSX') {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportRows), 'Reporte');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Filtro', 'Valor'], ...filterPairs, ['Generado', new Date().toLocaleString('es-EC')]]), 'Filtros');
        XLSX.writeFile(wb, fileName);
      } else {
        const html = htmlReport({
          title: type?.title || 'Reporte',
          filters: [...filterPairs.slice(1), ['Generado', new Date().toLocaleString('es-EC')]],
          rows: reportRows,
          logoUrl: transparencyLogo,
          autoPrint: format === 'PDF',
        });
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); win.focus(); } else downloadBlob(html, fileName, 'text/html;charset=utf-8');
      }
      api.auditEvent('EXPORTAR_REPORTE', `${type?.title} · ${format} · ${reportRows.length} filas · ${filterSummary}`);
      toast.success({
        title: 'Reporte generado',
        message: `${type?.title || 'Reporte'} · ${reportRows.length} filas · ${format}${format === 'PDF' ? ' (elige «Guardar como PDF» en el diálogo de impresión)' : ` · ${fileName}`}`,
      });
    } catch (err) {
      toast.apiError(err, 'No se pudo generar el archivo del reporte.', handleExport);
    } finally {
      setTimeout(() => setExporting(false), 400);
    }
  };

  const groups = [...new Set(REPORT_TYPES.map((t) => t.group))];

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Reportes</h1>
          <p>Elige el reporte, los filtros y el formato; revisa la vista previa y exporta.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)} disabled={loading} title="Vuelve a cargar los datos sin perder los filtros">ACTUALIZAR</button>
          <button className="btn btn-primary" onClick={handleExport} disabled={loading || exporting || reportRows.length === 0}
            title={reportRows.length === 0 ? 'No hay datos para los filtros seleccionados' : `Exportar ${type?.title} en ${format}`}>
            {exporting ? 'EXPORTANDO…' : `EXPORTAR ${format}`}
          </button>
        </div>
      </div>

      <ErrorNotice error={error} fallback="No se pudieron cargar los datos del reporte." onRetry={() => setReloadKey((k) => k + 1)} onDismiss={() => setError('')} />

      <div className="grid-12">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>1 · Configuración del reporte</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="rep-univ">Universidad{type?.needsUniversity ? ' *' : ''}</label>
              <select id="rep-univ" className="form-input" value={universityId} onChange={(e) => setUniversityId(e.target.value)}>
                <option value="all">{type?.needsUniversity ? 'Selecciona una universidad' : 'Todas las universidades'}</option>
                {universities.map((item) => <option key={item.id} value={item.id}>{item.acronym || item.name} - {item.name}</option>)}
              </select>
              {type?.needsUniversity && <div className="field-hint">Este reporte es el detalle de una universidad.</div>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="rep-period">Período</label>
              <select id="rep-period" className="form-input" value={periodId} onChange={(e) => setPeriodId(e.target.value)} disabled={!periods.length}>
                {!periods.length && <option value="">Sin períodos evaluados</option>}
                {periods.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="rep-month">Mes</label>
              <select id="rep-month" className="form-input" value={month} onChange={(e) => setMonth(e.target.value)}
                disabled={!type?.usesMonth} title={!type?.usesMonth ? 'Este reporte no se filtra por mes' : undefined}>
                <option value="">Todos los meses</option>
                {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
              </select>
              {!type?.usesMonth && <div className="field-hint">{reportType === 'international' ? 'La evaluación internacional es anual.' : 'Este reporte no se filtra por mes.'}</div>}
            </div>

            <div className="form-group">
              <span className="form-label" id="report-type-label">Tipo de reporte</span>
              <div className="rep-types" role="group" aria-labelledby="report-type-label">
                {groups.map((group) => (
                  <div key={group}>
                    <div className="rep-group">{group}</div>
                    {REPORT_TYPES.filter((t) => t.group === group).map((item) => (
                      <button key={item.id} type="button" aria-pressed={reportType === item.id}
                        className={`rep-type${reportType === item.id ? ' active' : ''}`} onClick={() => setReportType(item.id)}>
                        <strong>{item.title}</strong>
                        <span>{item.desc}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <span className="form-label" id="report-format-label">Formato de exportación</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} role="group" aria-labelledby="report-format-label">
                {FORMATS.map((item) => (
                  <button key={item} type="button" aria-pressed={format === item} className={`btn ${format === item ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setFormat(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ minWidth: 0 }}>
          <div className="card-header" style={{ marginBottom: 12 }}>
            <span className="card-title">2 · Vista previa · {type?.title}</span>
            <span className="tag">{reportRows.length} filas</span>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            {filterSummary} · Formato: <strong style={{ color: 'var(--text)' }}>{format}</strong>
          </div>

          {needsUniversityPick ? (
            <div className="empty-state"><h4>Selecciona una universidad</h4><p>«{type?.title}» muestra el detalle de la evaluación de una universidad.</p></div>
          ) : loading ? (
            <div className="empty-state" aria-busy="true"><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 12px' }} /><h4>Cargando datos del reporte…</h4></div>
          ) : reportRows.length === 0 ? (
            <div className="empty-state">
              <h4>Sin datos para los filtros seleccionados</h4>
              <p>No hay registros para {filterSummary}. Cambia el período, la universidad, el mes o el tipo de reporte.</p>
            </div>
          ) : (
            <div className="table-wrapper" style={{ maxHeight: 560, overflow: 'auto' }}>
              <table className="table">
                <thead><tr>{Object.keys(reportRows[0]).map((header) => <th key={header} style={{ whiteSpace: 'nowrap' }}>{header}</th>)}</tr></thead>
                <tbody>
                  {reportRows.slice(0, 25).map((row, index) => (
                    <tr key={index}>
                      {Object.keys(reportRows[0]).map((header) => {
                        const v = row[header];
                        return <td key={header} style={{ maxWidth: 360 }}>{typeof v === 'string' && /^https?:\/\//.test(v) ? <a href={v} target="_blank" rel="noreferrer">Abrir fuente</a> : valueOrDash(v)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {reportRows.length > 25 && !loading && (
            <div style={{ marginTop: 10, color: 'var(--text-subtle)', fontSize: '0.8125rem' }}>
              Mostrando 25 de {reportRows.length} filas. La exportación incluye todas.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
