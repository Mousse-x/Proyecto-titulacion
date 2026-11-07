import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DASHBOARD_BY_ROLE, NAV_BY_ROLE, PAGE_META, pageKey, sectionForPath } from './navConfig';

export default function Header({ onToggleMenu, menuOpen, onOpenHelp, onOpenSearch }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const key = pageKey(pathname);
  const meta = PAGE_META[key] || { title: 'SisTransp', sub: 'Plataforma de Transparencia' };
  const dashboardPath = DASHBOARD_BY_ROLE[user?.role_id] || '/';
  const { section } = sectionForPath(NAV_BY_ROLE[user?.role_id] || [], pathname);
  const isHome = pathname === dashboardPath;
  const now = new Date().toLocaleDateString('es-EC', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(dashboardPath);
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="topbar-btn menu-toggle" onClick={onToggleMenu}
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="app-sidebar">
          <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
        </button>
        {!isHome && (
          <button type="button" className="topbar-btn topbar-back" onClick={goBack} title="Volver a la pantalla anterior" aria-label="Volver a la pantalla anterior">
            <span aria-hidden="true">←</span><span className="topbar-btn-text">Volver</span>
          </button>
        )}
        <div className="topbar-heading">
          <nav className="breadcrumbs" aria-label="Ruta de navegación">
            <ol>
              <li><Link to={dashboardPath}>Inicio</Link></li>
              {!isHome && section && <li aria-hidden="false"><span>{section}</span></li>}
              {!isHome && <li aria-current="page"><span>{meta.title}</span></li>}
            </ol>
          </nav>
          <div className="topbar-title">{meta.title}</div>
          <span className="topbar-breadcrumb">{meta.sub}</span>
        </div>
      </div>
      <div className="topbar-right">
        <button type="button" className="topbar-btn topbar-search" onClick={onOpenSearch} title="Búsqueda rápida (Ctrl + K)">
          <span aria-hidden="true">🔍</span>
          <span className="topbar-btn-text">Buscar</span>
          <kbd className="topbar-kbd">Ctrl K</kbd>
        </button>
        <button type="button" className="topbar-btn topbar-help" onClick={onOpenHelp} title="Ayuda de esta pantalla (Alt + H)">
          <span aria-hidden="true" className="topbar-help-icon">?</span>
          <span className="topbar-btn-text">Ayuda</span>
        </button>
        <span className="topbar-date">{now}</span>
      </div>
    </header>
  );
}
