import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ADMIN_NAV = [
  { section: "General" },
  { label: "Dashboard",       icon: "📊", to: "/admin/dashboard" },
  { section: "Gestión" },
  { label: "Usuarios",        icon: "👥", to: "/admin/users" },
  { label: "Universidades",   icon: "🏛️", to: "/admin/universities" },
  { section: "Evaluación" },
  { label: "Indicadores",     icon: "📋", to: "/admin/indicators" },
  { label: "Ponderaciones",   icon: "⚖️", to: "/admin/weightings" },
  { section: "Resultados" },
  { label: "Rankings",        icon: "🏆", to: "/admin/rankings" },
  { label: "Reportes",        icon: "📈", to: "/admin/reports" },
  { section: "Sistema" },
  { label: "Auditoría",       icon: "🔐", to: "/admin/audit" },
];

const UNIV_NAV = [
  { section: "General" },
  { label: "Mi Dashboard",    icon: "📊", to: "/university/dashboard" },
  { section: "Cumplimiento" },
  { label: "Documentos",      icon: "📁", to: "/university/documents" },
  { label: "Observaciones",   icon: "💬", to: "/university/observations", badge: 2 },
];

const AUDITOR_NAV = [
  { section: "General" },
  { label: "Dashboard",       icon: "📊", to: "/auditor/dashboard" },
  { section: "Análisis" },
  { label: "Índice de Transparencia", icon: "🔢", to: "/auditor/index" },
  { label: "Comparativas",    icon: "📉", to: "/auditor/comparatives" },
  { label: "Rankings",        icon: "🏆", to: "/auditor/rankings" },
];

const navsByRole = { 1: ADMIN_NAV, 2: UNIV_NAV, 3: UNIV_NAV, 4: AUDITOR_NAV };
const titleByRole = {
  1: { title: "SisTransp", sub: "Sistema Admin" },
  2: { title: "SisTransp", sub: "Univ. Admin" },
  3: { title: "SisTransp", sub: "Evaluador" },
  4: { title: "SisTransp", sub: "Auditor" },
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = navsByRole[user?.role_id] || [];
  const brand = titleByRole[user?.role_id] || { title: "SisTransp", sub: "" };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.full_name
    ?.split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('') || '?';

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-icon">🏛️</div>
        <div className="logo-text">
          <h3>{brand.title}</h3>
          <span>{brand.sub}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {nav.map((item, i) => {
          if (item.section) {
            return <div key={`sec-${i}`} className="nav-section-label">{item.section}</div>;
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.badge && <span className="nav-badge">{item.badge}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* User card */}
      <div className="sidebar-footer">
        <div className="user-card" onClick={handleLogout} title="Cerrar sesión">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{user?.full_name}</div>
            <div className="user-role">{user?.role_name} · Salir</div>
          </div>
          <span style={{ color: 'var(--text-subtle)', fontSize: '1rem' }}>→</span>
        </div>
      </div>
    </aside>
  );
}
