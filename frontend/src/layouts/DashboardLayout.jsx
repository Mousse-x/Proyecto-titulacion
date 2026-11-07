import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import Header from '../components/layout/Header';
import HelpDrawer from '../components/layout/HelpDrawer';
import CommandPalette from '../components/layout/CommandPalette';
import { useAuth } from '../context/AuthContext';
import { DASHBOARD_BY_ROLE } from '../components/layout/navConfig';

export default function DashboardLayout({ children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Al cambiar de pantalla se cierra el menú móvil y se vuelve al inicio de la página.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [pathname]);

  // Atajos de teclado (H7): Ctrl+K búsqueda, Alt+H ayuda, Alt+I inicio.
  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.altKey && k === 'h') {
        e.preventDefault();
        setHelpOpen((v) => !v);
      } else if (e.altKey && k === 'i') {
        e.preventDefault();
        navigate(DASHBOARD_BY_ROLE[user?.role_id] || '/');
      } else if (e.key === 'Escape') {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, user?.role_id]);

  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  return (
    <div className="app-shell">
      <a href="#contenido-principal" className="skip-link">Saltar al contenido</a>
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      <div className="main-content">
        <Header
          menuOpen={menuOpen}
          onToggleMenu={() => setMenuOpen((v) => !v)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
        />
        <main className="page-body" id="contenido-principal" tabIndex={-1}>
          {children}
        </main>
      </div>
      <HelpDrawer open={helpOpen} onClose={closeHelp} />
      <CommandPalette open={searchOpen} onClose={closeSearch} />
    </div>
  );
}
