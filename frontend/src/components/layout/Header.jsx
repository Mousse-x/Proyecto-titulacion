import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/FeedbackContext';
import { api } from '../../api/client';
import { DASHBOARD_BY_ROLE, NAV_BY_ROLE, PAGE_META, pageKey, sectionForPath } from './navConfig';

/* Icono de usuario con un menú pequeño: nombre, rol y cerrar sesión. */
function UserMenu() {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    const ok = await confirm({
      title: 'Cerrar sesión',
      message: '¿Deseas cerrar tu sesión? Los datos ya guardados se conservan; los formularios abiertos sin guardar se perderán.',
      confirmLabel: 'Cerrar sesión',
    });
    if (!ok) return;
    await api.auditEvent('LOGOUT', 'Cierre de sesión desde el menú de usuario');
    logout();
    navigate('/login');
  };

  return (
    <div className="topbar-user" ref={rootRef}>
      <button type="button" className={`topbar-icon-btn${open ? ' active' : ''}`} onClick={() => setOpen((v) => !v)}
        title={user?.full_name || 'Mi cuenta'} aria-label="Mi cuenta" aria-haspopup="menu" aria-expanded={open}>
        <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <circle cx="12" cy="10" r="3.2" />
          <path d="M6.2 18.6a6.6 6.6 0 0 1 11.6 0" />
        </svg>
      </button>
      {open && (
        <div className="topbar-user-menu" role="menu">
          <div className="topbar-user-info">
            <div className="topbar-user-name">{user?.full_name}</div>
            <div className="topbar-user-role">{user?.role_name}</div>
            {user?.email && <div className="topbar-user-mail">{user.email}</div>}
          </div>
          <button type="button" role="menuitem" className="topbar-user-logout" onClick={handleLogout}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header({ onToggleMenu, menuOpen, onOpenHelp, onOpenSearch }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const key = pageKey(pathname);
  const meta = PAGE_META[key] || { title: 'SisTransp', sub: 'Plataforma de Transparencia' };
  const dashboardPath = DASHBOARD_BY_ROLE[user?.role_id] || '/';
  const { section } = sectionForPath(NAV_BY_ROLE[user?.role_id] || [], pathname);
  const isHome = pathname === dashboardPath;

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
          <button type="button" className="topbar-icon-btn topbar-back" onClick={goBack} title="Volver a la pantalla anterior" aria-label="Volver a la pantalla anterior">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
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
        </div>
      </div>
      <div className="topbar-right">
        <button type="button" className="topbar-icon-btn topbar-search" onClick={onOpenSearch}
          title="Búsqueda rápida (Ctrl + K)" aria-label="Buscar (Ctrl + K)">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
        </button>
        <button type="button" className="topbar-icon-btn topbar-help" onClick={onOpenHelp}
          title="Ayuda de esta pantalla (Alt + H)" aria-label="Ayuda (Alt + H)">
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" />
            <path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 3.9" />
            <path d="M12 17.2h.01" strokeWidth="2.6" />
          </svg>
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
