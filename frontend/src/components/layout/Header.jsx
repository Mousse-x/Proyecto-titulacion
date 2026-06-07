import { useLocation } from 'react-router-dom';

const PAGE_META = {
  '/admin/dashboard': { title: 'Dashboard', sub: 'Administracion del Sistema' },
  '/admin/users': { title: 'Gestion de Usuarios', sub: 'Administrar cuentas y roles' },
  '/admin/universities': { title: 'Universidades', sub: 'Instituciones registradas' },
  '/admin/indicators': { title: 'Indicadores LOTAIP', sub: 'Marco de evaluacion' },
  '/admin/weightings': { title: 'Ponderaciones', sub: 'Configurar pesos por categoria' },
  '/admin/rankings': { title: 'Rankings Nacionales', sub: 'Indice de transparencia institucional' },
  '/admin/reports': { title: 'Reportes', sub: 'Generar y exportar informes' },
  '/admin/audit': { title: 'Auditoria', sub: 'Registros y trazabilidad del sistema' },
  '/admin/feedback': { title: 'Comentarios', sub: 'Feedback enviado por usuarios' },
  '/admin/documents': { title: 'Gestion Documental', sub: 'Administrar evidencias institucionales' },
  '/admin/validation': { title: 'Evaluacion LOTAIP', sub: 'Validacion nacional e internacional' },
  '/university/dashboard': { title: 'Mi Dashboard', sub: 'Estado de transparencia institucional' },
  '/university/documents': { title: 'Carga Documental', sub: 'Subir y gestionar evidencias' },
  '/university/observations': { title: 'Observaciones', sub: 'Observaciones del auditor' },
  '/auditor/dashboard': { title: 'Dashboard Auditor', sub: 'Vista general del sistema' },
  '/auditor/index': { title: 'Indice de Transparencia', sub: 'Calculo del indice institucional' },
  '/auditor/comparatives': { title: 'Analisis Comparativo', sub: 'Comparar universidades' },
  '/auditor/rankings': { title: 'Rankings', sub: 'Clasificacion nacional de transparencia' },
  '/auditor/reports': { title: 'Reportes', sub: 'Generar y exportar informes' },
  '/auditor/documents': { title: 'Lista de Cumplimiento', sub: 'Consulta de evidencias publicadas' },
  '/auditor/validation': { title: 'Evaluacion LOTAIP', sub: 'Consulta detallada de literales y observaciones' },
};

export default function Header() {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] || { title: 'SisTransp', sub: 'Plataforma de Transparencia' };
  const now = new Date().toLocaleDateString('es-EC', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">{meta.title}</span>
        <span className="topbar-breadcrumb">{meta.sub}</span>
      </div>
      <div className="topbar-right">
        <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginRight: 4 }}>{now}</span>
      </div>
    </header>
  );
}
