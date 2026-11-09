import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { DASHBOARD_BY_ROLE, NAV_BY_ROLE } from './navConfig';

function StatisticsIcon() {
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12.906-.031a1 1 0 0 0-.125.031A1 1 0 0 0 12 1v1H3a3 3 0 0 0-3 3v13c0 1.656 1.344 3 3 3h9v.375l-5.438 2.719a1.006 1.006 0 0 0 .875 1.812L12 23.625V24a1 1 0 1 0 2 0v-.375l4.563 2.281a1.006 1.006 0 0 0 .875-1.812L14 21.375V21h9c1.656 0 3-1.344 3-3V5a3 3 0 0 0-3-3h-9V1a1 1 0 0 0-1.094-1.031M2 5h22v13H2zm18.875 1a1 1 0 0 0-.594.281L17 9.563L14.719 7.28a1 1 0 0 0-1.594.219l-2.969 5.188l-1.219-3.063a1 1 0 0 0-1.656-.344l-3 3a1.016 1.016 0 1 0 1.439 1.44l1.906-1.906l1.438 3.562a1 1 0 0 0 1.812.125l3.344-5.844l2.062 2.063a1 1 0 0 0 1.438 0l4-4A1 1 0 0 0 20.875 6"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
        d="m3 11l9-8l9 8M5 10v11h14V10M9 21v-7h6v7"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M5 20v-1a7 7 0 0 1 7-7v0a7 7 0 0 1 7 7v1m-7-8a4 4 0 1 0 0-8a4 4 0 0 0 0 8"
      />
    </svg>
  );
}

function UniversityIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M2 22h19.5M3 13v9m18-9v9M7.5 8v14m9-14v14M2 13h5m15 0h-5M6.5 8h11M12 8V4.982m0 0V2.97c0-.474 0-.711.146-.858c.46-.463 2.354.631 3.074 1.075c.608.374.78 1.122.78 1.795zM12 22v-2m-1.5-8v.5m3-.5v.5m-3 3.5v.5m3-.5v.5"
      />
    </svg>
  );
}

function WeightIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <g fill="none">
        <path stroke="currentColor" strokeLinejoin="round" strokeWidth="4" d="M41 4H7a3 3 0 0 0-3 3v34a3 3 0 0 0 3 3h34a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3Z" />
        <path stroke="currentColor" strokeLinecap="round" strokeWidth="4" d="M12 19.054q4.987-6 12-6q7.012 0 12 6" />
        <path fill="currentColor" d="M24 31a3 3 0 1 0 0-6a3 3 0 0 0 0 6" />
        <path stroke="currentColor" strokeLinecap="round" strokeWidth="4" d="m19 21l5.008 7" />
      </g>
    </svg>
  );
}

function IndicatorIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-3m4 3V6" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M7 3h7l5 5v13H7zM14 3v5h5M10 12h6m-6 4h6" />
    </svg>
  );
}

function ValidationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M9 12l2 2l4-5M5 4h14v16H5zM8 4V2m8 2V2" />
    </svg>
  );
}

function RankingIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M5 20V9m7 11V4m7 16v-7M3 20h18" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}

function AuditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M12 3l7 3v5c0 4.5-2.9 8.2-7 10c-4.1-1.8-7-5.5-7-10V6zM9 12l2 2l4-4" />
    </svg>
  );
}

function IndexIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M12 20a8 8 0 1 0-8-8m8 8a8 8 0 0 0 8-8M12 20v-4m0-4l4-4M4 12h4m8 0h4" />
    </svg>
  );
}

function CompareIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M7 4v16m10-16v16M4 8h6M4 16h6m4-5h6m-6 6h6" />
    </svg>
  );
}

function ObservationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M4 5h16v11H8l-4 4zM8 9h8m-8 4h5" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18m-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01" />
    </svg>
  );
}

const ICONS = {
  HO: HomeIcon,
  DA: StatisticsIcon,
  US: UserIcon,
  UN: UniversityIcon,
  IN: IndicatorIcon,
  PO: WeightIcon,
  GD: DocumentIcon,
  DO: DocumentIcon,
  LC: DocumentIcon,
  EV: ValidationIcon,
  RK: RankingIcon,
  RP: ReportIcon,
  AU: AuditIcon,
  IT: IndexIcon,
  CO: CompareIcon,
  OB: ObservationIcon,
  FB: ObservationIcon,
  HE: HelpIcon,
};

const titleByRole = {
  1: { title: 'SisTransp', sub: 'Administrador del Sistema' },
  2: { title: 'SisTransp', sub: 'Administrador Universitario' },
  3: { title: 'SisTransp', sub: 'Responsable de Unidad' },
  4: { title: 'SisTransp', sub: 'Auditor' },
};

export default function Sidebar({ open = false, onNavigate }) {
  const { user } = useAuth();
  const dashboardPath = DASHBOARD_BY_ROLE[user?.role_id] || '/';
  // «Inicio» ya está en el botón de la casa junto al logo; no se repite en la lista.
  const nav = (NAV_BY_ROLE[user?.role_id] || []).filter((item) => item.to !== dashboardPath);
  const brand = titleByRole[user?.role_id] || { title: 'SisTransp', sub: '' };

  return (
    <aside className={`sidebar${open ? ' open' : ''}`} id="app-sidebar" aria-label="Menú principal">
      <div className="sidebar-logo">
        <div className="logo-icon" aria-hidden="true">ST</div>
        <div className="logo-text">
          <h3>{brand.title}</h3>
          <span>{brand.sub}</span>
        </div>
        <NavLink
          to={dashboardPath}
          className={({ isActive }) => `sidebar-home-button${isActive ? ' active' : ''}`}
          aria-label="Ir al inicio"
          title="Ir al inicio (Alt + I)"
          onClick={onNavigate}
        >
          <HomeIcon />
        </NavLink>
      </div>

      <nav className="sidebar-nav" aria-label="Módulos">
        {nav.map((item, i) => {
          if (item.section) {
            return <div key={`sec-${i}`} className="nav-section-label">{item.section}</div>;
          }
          const Icon = ICONS[item.icon] || StatisticsIcon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={onNavigate}
            >
              <span className="nav-icon" aria-hidden="true">
                <Icon />
              </span>
              <span>{item.label}</span>
              {item.badge && <span className="nav-badge">{item.badge}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
