import { useLocation } from 'react-router-dom';

const PAGE_META = {
  '/admin/dashboard':    { title: 'Dashboard',                  sub: 'Administración del Sistema' },
  '/admin/users':        { title: 'Gestión de Usuarios',        sub: 'Administrar cuentas y roles' },
  '/admin/universities': { title: 'Universidades',              sub: 'Instituciones registradas' },
  '/admin/indicators':   { title: 'Indicadores LOTAIP',         sub: 'Marco de evaluación' },
  '/admin/weightings':   { title: 'Ponderaciones',              sub: 'Configurar pesos por categoría' },
  '/admin/rankings':     { title: 'Rankings Nacionales',        sub: 'Índice de transparencia institucional' },
  '/admin/reports':      { title: 'Reportes',                   sub: 'Generar y exportar informes' },
  '/university/dashboard':   { title: 'Mi Dashboard',           sub: 'Estado de transparencia institucional' },
  '/university/documents':   { title: 'Carga Documental',       sub: 'Subir y gestionar evidencias' },
  '/university/observations':{ title: 'Observaciones',          sub: 'Observaciones del auditor' },
  '/auditor/dashboard':      { title: 'Dashboard Auditor',      sub: 'Vista general del sistema' },
  '/auditor/index':          { title: 'Índice de Transparencia',sub: 'Cálculo del índice institucional' },
  '/auditor/comparatives':   { title: 'Análisis Comparativo',   sub: 'Comparar universidades' },
  '/auditor/rankings':       { title: 'Rankings',               sub: 'Clasificación nacional de transparencia' },
};

export default function Header() {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] || { title: 'SisTransp', sub: 'Plataforma de Transparencia' };
  const now = new Date().toLocaleDateString('es-EC', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">{meta.title}</span>
        <span className="topbar-breadcrumb">{meta.sub}</span>
      </div>
      <div className="topbar-right">
        <span style={{ fontSize:'0.75rem', color:'var(--text-subtle)', marginRight:4 }}>{now}</span>
        <div className="topbar-btn" title="Notificaciones" style={{ position:'relative' }}>
          🔔
          <span className="topbar-notif-dot" />
        </div>
        <div className="topbar-btn" title="Ayuda">❓</div>
      </div>
    </header>
  );
}
