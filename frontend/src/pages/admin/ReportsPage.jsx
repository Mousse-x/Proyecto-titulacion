import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { api } from '../../api/client';
import transparencyLogo from '../../assets/transparency-logo.jpg';

const REPORT_TYPES = [
  { id: 'executive', title: 'Resumen ejecutivo', desc: 'Indicadores generales, indices y ranking institucional.' },
  { id: 'ranking', title: 'Ranking de transparencia', desc: 'Comparativo nacional por indice nacional e integrado.' },
  { id: 'documents', title: 'Cumplimiento documental', desc: 'Evidencias por universidad, literal, estado y periodo.' },
  { id: 'indicators', title: 'Indicadores LOTAIP', desc: 'Catalogo real de indicadores activos y configuracion.' },
];

const FORMATS = ['PDF', 'CSV', 'XLSX', 'JSON', 'HTML'];

const STATUS_LABELS = {
  aprobado: 'Cumple',
  rechazado: 'No cumple',
  inconsistente: 'Inconsistente',
  pendiente: 'Pendiente',
};

function valueOrDash(value) {
  return value === null || value === undefined || value === '' ? '-' : value;
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
  return [
    headers.join(';'),
    ...rows.map((row) => headers.map((header) => escapeCell(row[header])).join(';')),
  ].join('\n');
}

function htmlReport({ title, subtitle, rows, stats, logoUrl, autoPrint = false }) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const statItems = [
    ['Universidades', stats.total_universities],
    ['Documentos', stats.total_documents],
    ['Evaluados', stats.evaluated_documents],
    ['Indice nacional', `${stats.avg_transparency || 0}%`],
    ['Nacional + internacional', `${stats.avg_transparency_integrated || 0}%`],
  ];

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #102447; margin: 0; background: #ffffff; }
    .page { padding: 30px 34px; }
    .brand-bar { height: 8px; background: #cf2027; margin: 0 0 22px; }
    .header { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 2px solid #dbe4f0; }
    .logo { width: 58px; height: 58px; object-fit: cover; border-radius: 50%; background: #cf2027; }
    .institution { font-size: 11px; color: #48617f; text-transform: uppercase; font-weight: 700; }
    .title { font-size: 24px; font-weight: 800; margin: 4px 0; color: #102447; }
    .subtitle { color: #48617f; font-size: 12px; line-height: 1.45; }
    .meta { margin: 16px 0 20px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .meta div, .stat { border: 1px solid #dbe4f0; padding: 10px; border-radius: 6px; background: #f8fbff; font-size: 11px; }
    .meta strong, .stat strong { display: block; color: #102447; font-size: 15px; margin-top: 3px; }
    .stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 20px; }
    .stat strong { font-size: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th, td { border: 1px solid #dbe4f0; padding: 7px; text-align: left; vertical-align: top; }
    th { background: #f1f5fa; color: #102447; font-size: 10px; text-transform: uppercase; }
    tr:nth-child(even) td { background: #fbfdff; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 42px; page-break-inside: avoid; }
    .signature { text-align: center; color: #48617f; font-size: 11px; }
    .line { border-top: 1px solid #102447; margin-bottom: 8px; }
    .footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #dbe4f0; color: #7d8ea8; font-size: 10px; display: flex; justify-content: space-between; }
    @media print {
      .page { padding: 0; }
      .brand-bar { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="brand-bar"></div>
  <div class="page">
  <div class="header">
    <img class="logo" src="${logoUrl}" alt="Logo institucional" />
    <div>
      <div class="institution">Escuela Superior Politecnica de Chimborazo - DTIC</div>
      <div class="title">${title}</div>
      <div class="subtitle">Sistema de Transparencia Institucional | LOTAIP, OGP, OCDE y ODS</div>
    </div>
  </div>
  <div class="meta">
    <div>Institucion<strong>ESPOCH</strong></div>
    <div>Unidad responsable<strong>Direccion de Tecnologias de la Informacion y Comunicacion</strong></div>
    <div>Fecha de generacion<strong>${new Date().toLocaleString('es-EC')}</strong></div>
  </div>
  <div class="subtitle" style="margin-bottom:16px">${subtitle}</div>
  <div class="stats">${statItems.map(([label, value]) => `<div class="stat">${label}<strong>${valueOrDash(value)}</strong></div>`).join('')}</div>
  <table>
    <thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((row) => `<tr>${headers.map((header) => `<td>${valueOrDash(row[header])}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
  <div class="signatures">
    <div class="signature"><div class="line"></div>Responsable institucional</div>
    <div class="signature"><div class="line"></div>Auditor / Administrador del sistema</div>
  </div>
  <div class="footer">
    <span>Reporte generado automaticamente por SisTransp</span>
    <span>ESPOCH - Transparencia institucional</span>
  </div>
  </div>
  ${autoPrint ? '<script>window.addEventListener("load", function(){ setTimeout(function(){ window.print(); }, 250); });</script>' : ''}
</body>
</html>`;
}

function StatBox({ label, value }) {
  return (
    <div className="stat-card" style={{ '--color': 'var(--primary)' }}>
      <div className="stat-value">{valueOrDash(value)}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState('executive');
  const [universityId, setUniversityId] = useState('all');
  const [month, setMonth] = useState('');
  const [format, setFormat] = useState('CSV');
  const [stats, setStats] = useState(null);
  const [universities, setUniversities] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [evidences, setEvidences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    Promise.all([
      api.stats(),
      api.universities.list(),
      api.indicators.list(),
      api.evidences.list(),
    ])
      .then(([statsRes, universitiesRes, indicatorsRes, evidencesRes]) => {
        if (cancelled) return;
        setStats(statsRes.data || {});
        setUniversities(universitiesRes.data || []);
        setIndicators(indicatorsRes.data || []);
        setEvidences(evidencesRes.data || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || 'No se pudieron cargar los datos reales del reporte.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const filteredEvidences = useMemo(() => evidences.filter((item) => {
    const matchesUniversity = universityId === 'all' || String(item.university_id || item.university?.id) === String(universityId);
    const matchesMonth = !month || String(item.month) === String(month);
    return matchesUniversity && matchesMonth;
  }), [evidences, universityId, month]);

  const reportRows = useMemo(() => {
    if (reportType === 'ranking') {
      return (stats?.ranking || [])
        .filter((item) => universityId === 'all' || String(item.id) === String(universityId))
        .map((item, index) => ({
          Posicion: index + 1,
          Universidad: item.name,
          Nombre: item.full_name,
          'Indice nacional': item.transparency_score,
          'Nacional + internacional': item.integrated_transparency_score,
          'Documentos evaluados': item.evaluated_documents,
        }));
    }

    if (reportType === 'documents') {
      return filteredEvidences.map((item) => ({
        Universidad: item.university_name || item.university || item.university_acronym,
        Indicador: item.indicator_code || item.indicator,
        Titulo: item.title,
        Mes: item.month,
        Periodo: item.period_name || item.period || item.year,
        Estado: STATUS_LABELS[item.validation_status] || item.validation_status,
        Formato: item.file_type,
        Observaciones: item.observations || item.validation_observations || '',
      }));
    }

    if (reportType === 'indicators') {
      return indicators.map((item) => ({
        Codigo: item.code,
        Indicador: item.name,
        Literal: item.article,
        Categoria: item.category,
        Peso: item.weight,
        Marco: item.framework,
        Activo: item.is_active ? 'Si' : 'No',
      }));
    }

    return [
      {
        Indicador: 'Universidades activas',
        Valor: stats?.total_universities || 0,
        Detalle: 'Instituciones registradas activas',
      },
      {
        Indicador: 'Documentos cargados',
        Valor: stats?.total_documents || 0,
        Detalle: 'Evidencias disponibles en el sistema',
      },
      {
        Indicador: 'Documentos evaluados',
        Valor: stats?.evaluated_documents || 0,
        Detalle: 'Evidencias con evaluacion LOTAIP',
      },
      {
        Indicador: 'Indice nacional promedio',
        Valor: `${stats?.avg_transparency || 0}%`,
        Detalle: 'Promedio de evaluacion nacional LOTAIP',
      },
      {
        Indicador: 'Indice nacional + internacional',
        Valor: `${stats?.avg_transparency_integrated || 0}%`,
        Detalle: 'Promedio integrado LOTAIP, OGP, OCDE y ODS',
      },
      {
        Indicador: 'Observaciones abiertas',
        Valor: stats?.observations_open || 0,
        Detalle: 'Resultados con observaciones registradas',
      },
    ];
  }, [filteredEvidences, indicators, reportType, stats, universityId]);

  const selectedType = REPORT_TYPES.find((item) => item.id === reportType);
  const selectedUniversity = universities.find((item) => String(item.id) === String(universityId));

  const handleExport = () => {
    if (!reportRows.length) return;
    setExporting(true);
    const fileName = buildFileName(reportType, format);
    const subtitle = [
      selectedUniversity ? `Universidad: ${selectedUniversity.name || selectedUniversity.acronym}` : 'Universidad: Todas',
      month ? `Mes: ${month}` : 'Mes: Todos',
      `Generado: ${new Date().toLocaleString('es-EC')}`,
    ].join(' | ');

    if (format === 'CSV') {
      downloadBlob(toCsv(reportRows), fileName, 'text/csv;charset=utf-8');
    } else if (format === 'JSON') {
      downloadBlob(JSON.stringify({ stats, rows: reportRows }, null, 2), fileName, 'application/json;charset=utf-8');
    } else if (format === 'XLSX') {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(reportRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
      XLSX.writeFile(wb, fileName);
    } else {
      const html = htmlReport({
        title: selectedType?.title || 'Reporte',
        subtitle,
        rows: reportRows,
        stats: stats || {},
        logoUrl: transparencyLogo,
        autoPrint: format === 'PDF',
      });
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        win.focus();
      } else {
        downloadBlob(html, fileName, 'text/html;charset=utf-8');
      }
    }
    setTimeout(() => setExporting(false), 400);
  };

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Reportes</h1>
          <p>Generacion y exportacion con datos reales del sistema</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => window.location.reload()} disabled={loading}>Actualizar</button>
          <button className="btn btn-primary" onClick={handleExport} disabled={loading || exporting || reportRows.length === 0}>
            {exporting ? 'Exportando...' : `Exportar ${format}`}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <StatBox label="Universidades" value={stats?.total_universities || 0} />
        <StatBox label="Documentos" value={stats?.total_documents || 0} />
        <StatBox label="Evaluados" value={stats?.evaluated_documents || 0} />
        <StatBox label="Indice nacional" value={`${stats?.avg_transparency || 0}%`} />
        <StatBox label="Nacional + internacional" value={`${stats?.avg_transparency_integrated || 0}%`} />
      </div>

      <div className="grid-12">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 14 }}>Configuracion del reporte</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Tipo de reporte</label>
              <div style={{ display: 'grid', gap: 8 }}>
                {REPORT_TYPES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`btn ${reportType === item.id ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setReportType(item.id)}
                    style={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', padding: '12px 14px' }}
                  >
                    <span>
                      <strong>{item.title}</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 400 }}>{item.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Universidad</label>
              <select className="form-input" value={universityId} onChange={(e) => setUniversityId(e.target.value)}>
                <option value="all">Todas las universidades</option>
                {universities.map((item) => (
                  <option key={item.id} value={item.id}>{item.acronym || item.name} - {item.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Mes</label>
              <select className="form-input" value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="">Todos los meses</option>
                {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Formato</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {FORMATS.map((item) => (
                  <button key={item} className={`btn ${format === item ? 'btn-primary' : 'btn-secondary'} btn-sm`} onClick={() => setFormat(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ marginBottom: 12 }}>
            <span className="card-title">Vista previa real</span>
            <span className="tag">{reportRows.length} filas</span>
          </div>

          {loading ? (
            <div className="empty-state"><h4>Cargando datos reales...</h4></div>
          ) : reportRows.length === 0 ? (
            <div className="empty-state">
              <h4>Sin datos para el filtro seleccionado</h4>
              <p>Cambia el tipo de reporte, universidad o mes.</p>
            </div>
          ) : (
            <div className="table-wrapper" style={{ maxHeight: 520, overflow: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    {Object.keys(reportRows[0]).map((header) => <th key={header}>{header}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {reportRows.slice(0, 25).map((row, index) => (
                    <tr key={index}>
                      {Object.keys(reportRows[0]).map((header) => <td key={header}>{valueOrDash(row[header])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {reportRows.length > 25 && (
            <div style={{ marginTop: 10, color: 'var(--text-subtle)', fontSize: '0.8125rem' }}>
              Mostrando 25 de {reportRows.length} filas. La exportacion incluye todo el resultado filtrado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
