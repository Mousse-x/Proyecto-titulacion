import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ADMIN_NAV = [
  { section: 'General' },
  { label: 'Dashboard', icon: 'DA', to: '/admin/dashboard' },
  { section: 'Gestion' },
  { label: 'Usuarios', icon: 'US', to: '/admin/users' },
  { label: 'Universidades', icon: 'UN', to: '/admin/universities' },
  { section: 'Evaluacion' },
  { label: 'Indicadores', icon: 'IN', to: '/admin/indicators' },
  { label: 'Ponderaciones', icon: 'PO', to: '/admin/weightings' },
  { section: 'Documentos' },
  { label: 'Gestion Documental', icon: 'GD', to: '/admin/documents' },
  { label: 'Evaluacion LOTAIP', icon: 'EV', to: '/admin/validation' },
  { section: 'Resultados' },
  { label: 'Rankings', icon: 'RK', to: '/admin/rankings' },
  { label: 'Reportes', icon: 'RP', to: '/admin/reports' },
  { section: 'Sistema' },
  { label: 'Auditoria', icon: 'AU', to: '/admin/audit' },
];

const UNIV_NAV = [
  { section: 'General' },
  { label: 'Mi Dashboard', icon: 'DA', to: '/university/dashboard' },
  { section: 'Cumplimiento' },
  { label: 'Documentos', icon: 'DO', to: '/university/documents' },
  { label: 'Observaciones', icon: 'OB', to: '/university/observations', badge: 2 },
];

const AUDITOR_NAV = [
  { section: 'General' },
  { label: 'Dashboard', icon: 'DA', to: '/auditor/dashboard' },
  { section: 'Analisis' },
  { label: 'Indice de Transparencia', icon: 'IT', to: '/auditor/index' },
  { label: 'Comparativas', icon: 'CO', to: '/auditor/comparatives' },
  { label: 'Rankings', icon: 'RK', to: '/auditor/rankings' },
  { section: 'Documentos' },
  { label: 'Lista de Cumplimiento', icon: 'LC', to: '/auditor/documents' },
  { label: 'Evaluacion LOTAIP', icon: 'EV', to: '/auditor/validation' },
];

const navsByRole = { 1: ADMIN_NAV, 2: UNIV_NAV, 3: UNIV_NAV, 4: AUDITOR_NAV };
const titleByRole = {
  1: { title: 'SisTransp', sub: 'Sistema Admin' },
  2: { title: 'SisTransp', sub: 'Univ. Admin' },
  3: { title: 'SisTransp', sub: 'Evaluador' },
  4: { title: 'SisTransp', sub: 'Auditor' },
};

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = navsByRole[user?.role_id] || [];
  const brand = titleByRole[user?.role_id] || { title: 'SisTransp', sub: '' };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = user?.full_name
    ?.split(' ')
    .slice(0, 2)
    .map((name) => name[0])
    .join('') || '?';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">ST</div>
        <div className="logo-text">
          <h3>{brand.title}</h3>
          <span>{brand.sub}</span>
        </div>
      </div>

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

      <div className="sidebar-footer">
        <div className="user-card" onClick={handleLogout} title="Cerrar sesion">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <div className="user-name">{user?.full_name}</div>
            <div className="user-role">{user?.role_name} - Salir</div>
          </div>
          <span style={{ color: 'var(--text-subtle)', fontSize: '1rem' }}>-&gt;</span>
        </div>
      </div>
    </aside>
  );
}
