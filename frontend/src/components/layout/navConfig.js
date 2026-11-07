/*
 * Configuración única de navegación: menú lateral, migas de pan, títulos de
 * pantalla y búsqueda rápida usan los mismos nombres (H4.3, H6.1).
 */

export const ADMIN_NAV = [
  { label: 'Inicio', icon: 'HO', to: '/admin/dashboard' },
  { section: 'Gestión' },
  { label: 'Usuarios', icon: 'US', to: '/admin/users' },
  { label: 'Universidades', icon: 'UN', to: '/admin/universities' },
  { section: 'Modelo de evaluación' },
  { label: 'Indicadores', icon: 'IN', to: '/admin/indicators' },
  { label: 'Ponderaciones', icon: 'PO', to: '/admin/weightings' },
  { section: 'Evidencias y evaluación' },
  { label: 'Documentos LOTAIP', icon: 'GD', to: '/admin/documents' },
  { label: 'Evaluación de transparencia', icon: 'EV', to: '/admin/validation' },
  { section: 'Resultados' },
  { label: 'Rankings', icon: 'RK', to: '/admin/rankings' },
  { label: 'Reportes', icon: 'RP', to: '/admin/reports' },
  { section: 'Sistema' },
  { label: 'Comentarios', icon: 'FB', to: '/admin/feedback' },
  { label: 'Auditoría', icon: 'AU', to: '/admin/audit' },
  { label: 'Ayuda', icon: 'HE', to: '/ayuda' },
];

export const UNIV_NAV = [
  { label: 'Inicio', icon: 'HO', to: '/university/dashboard' },
  { section: 'General' },
  { label: 'Universidades', icon: 'UN', to: '/university/universities' },
  { section: 'Resultados' },
  { label: 'Índice de Transparencia', icon: 'IT', to: '/university/index' },
  { label: 'Comparativas', icon: 'CO', to: '/university/comparatives' },
  { label: 'Rankings', icon: 'RK', to: '/university/rankings' },
  { label: 'Reportes', icon: 'RP', to: '/university/reports' },
  { section: 'Evidencias y evaluación' },
  { label: 'Documentos LOTAIP', icon: 'DO', to: '/university/documents' },
  { label: 'Evaluación de transparencia', icon: 'EV', to: '/university/validation' },
  { label: 'Observaciones', icon: 'OB', to: '/university/observations' },
  { section: 'Sistema' },
  { label: 'Comentarios', icon: 'FB', to: '/university/feedback' },
  { label: 'Ayuda', icon: 'HE', to: '/ayuda' },
];

export const AUDITOR_NAV = [
  { label: 'Inicio', icon: 'HO', to: '/auditor/dashboard' },
  { section: 'Resultados' },
  { label: 'Índice de Transparencia', icon: 'IT', to: '/auditor/index' },
  { label: 'Comparativas', icon: 'CO', to: '/auditor/comparatives' },
  { label: 'Rankings', icon: 'RK', to: '/auditor/rankings' },
  { label: 'Reportes', icon: 'RP', to: '/auditor/reports' },
  { section: 'Evidencias y evaluación' },
  { label: 'Documentos LOTAIP', icon: 'LC', to: '/auditor/documents' },
  { label: 'Evaluación de transparencia', icon: 'EV', to: '/auditor/validation' },
  { section: 'Sistema' },
  { label: 'Ayuda', icon: 'HE', to: '/ayuda' },
];

export const NAV_BY_ROLE = { 1: ADMIN_NAV, 2: UNIV_NAV, 3: UNIV_NAV, 4: AUDITOR_NAV };

export const DASHBOARD_BY_ROLE = {
  1: '/admin/dashboard',
  2: '/university/dashboard',
  3: '/university/dashboard',
  4: '/auditor/dashboard',
};

export const ROLE_PREFIX = { 1: '/admin', 2: '/university', 3: '/university', 4: '/auditor' };

/* Título y descripción de cada pantalla (encabezado superior). */
export const PAGE_META = {
  dashboard: { title: 'Inicio', sub: 'Resumen del estado de transparencia del período' },
  users: { title: 'Gestión de usuarios', sub: 'Administrar cuentas y perfiles' },
  universities: { title: 'Universidades', sub: 'Instituciones registradas' },
  indicators: { title: 'Indicadores de transparencia', sub: 'Catálogo LOTAIP, mixto y complementario' },
  weightings: { title: 'Ponderaciones', sub: 'Pesos por dimensión e indicador' },
  rankings: { title: 'Rankings', sub: 'Clasificación nacional por Índice de Transparencia Institucional' },
  reports: { title: 'Reportes', sub: 'Generar y exportar informes' },
  audit: { title: 'Auditoría', sub: 'Registros y trazabilidad del sistema' },
  feedback: { title: 'Comentarios', sub: 'Comentarios y sugerencias de los usuarios' },
  documents: { title: 'Documentos LOTAIP', sub: 'Evidencias por universidad, año, mes y literal' },
  validation: { title: 'Evaluación de transparencia', sub: 'Evaluación nacional (LOTAIP) e internacional por separado' },
  index: { title: 'Índice de Transparencia', sub: 'Resultado integrado (ITI) y sus ocho dimensiones' },
  comparatives: { title: 'Análisis comparativo', sub: 'Comparar universidades' },
  observations: { title: 'Observaciones', sub: 'Observaciones del auditor' },
  ayuda: { title: 'Centro de ayuda', sub: 'Guía de uso, glosario del índice y solución de errores' },
};

export function pageKey(pathname = '') {
  return pathname.split('/').filter(Boolean).pop() || 'dashboard';
}

/* Sección del menú a la que pertenece una ruta (para las migas de pan). */
export function sectionForPath(nav, pathname) {
  let section = null;
  for (const item of nav) {
    if (item.section) section = item.section;
    else if (item.to === pathname) return { section, label: item.label };
  }
  return { section: null, label: null };
}
