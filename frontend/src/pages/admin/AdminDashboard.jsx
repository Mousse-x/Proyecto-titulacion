import { Link } from 'react-router-dom';
import TrendLine from '../../components/charts/TrendLine';
import RankingBar from '../../components/charts/RankingBar';
import PeriodSelect, { SimulatedNotice } from '../../components/common/PeriodSelect';
import useDashboardStats from '../../hooks/useDashboardStats';
import { getScoreInk, getScoreLabel } from '../../utils/score';

// Datos vacíos por defecto mientras no hay info en BD
const EMPTY_STATS = {
  total_universities: 0,
  total_documents:    0,
  pending_reviews:    0,
  approved_docs:      0,
  avg_transparency:   0,
  avg_transparency_integrated: 0,
  active_users:       0,
  observations_open:  0,
  indicators_active:  0,
  ranking: [],
  trend: [],
  recent_documents: [],
  available_periods: [],
};

/* Íconos de línea sencillos (24×24). */
const ICONS = {
  gauge: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /><circle cx="12" cy="18" r="1" /></>,
  building: <><path d="M3 21h18" /><path d="M5 21V10l7-5l7 5v11" /><path d="M9 21v-6h6v6" /></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2" /></>,
  check: <><path d="M9 11l3 3l8-8" /><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  scale: <><path d="M12 3v18M5 21h14" /><path d="M6 7h12M6 7l-3 7h6l-3-7ZM18 7l-3 7h6l-3-7Z" /></>,
  report: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  arrow: <path d="M5 12h14M13 6l6 6l-6 6" />,
};
function Icon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[name]}</svg>
  );
}

const QUICK_LINKS = [
  { to: '/admin/users', label: 'Usuarios', desc: 'Cuentas y perfiles', icon: 'users' },
  { to: '/admin/universities', label: 'Universidades', desc: 'Instituciones evaluadas', icon: 'building' },
  { to: '/admin/documents', label: 'Documentos LOTAIP', desc: 'Cargar e importar', icon: 'file' },
  { to: '/admin/validation', label: 'Evaluación', desc: 'Ejecutar evaluaciones', icon: 'check' },
  { to: '/admin/weightings', label: 'Ponderaciones', desc: 'Pesos del índice', icon: 'scale' },
  { to: '/admin/reports', label: 'Reportes', desc: 'Exportar resultados', icon: 'report' },
];

const DOC_STATUS = {
  pendiente: { label: 'Pendiente', kind: 'warning' },
  aprobado: { label: 'Aprobado', kind: 'success' },
  rechazado: { label: 'Rechazado', kind: 'danger' },
  inconsistente: { label: 'Inconsistente', kind: 'danger' },
};

const formatNumber = (value) => Number(value || 0).toLocaleString('es-EC');
const formatPercent = (value) => `${Number(value || 0).toLocaleString('es-EC', { maximumFractionDigits: 2 })}%`;

function EmptyState({ text }) {
  return <div className="adm-empty">{text}</div>;
}

function SectionHead({ title, desc, action }) {
  return (
    <div className="adm-section-head">
      <div>
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      {action}
    </div>
  );
}

function KpiCard({ icon, tone, label, value, loading, children }) {
  return (
    <article className={`adm-kpi adm-tone-${tone}`}>
      <div className="adm-kpi-top">
        <span className="adm-kpi-icon"><Icon name={icon} /></span>
        <span className="adm-kpi-label">{label}</span>
      </div>
      <div className="adm-kpi-value">{loading ? '—' : value}</div>
      <div className="adm-kpi-foot">{children}</div>
    </article>
  );
}

export default function AdminDashboard() {
  const { stats, loading, error, periodId, selectPeriod, reload } = useDashboardStats(EMPTY_STATS);
  const ranking = stats.ranking || [];
  const trend = stats.trend || [];
  const trendSeries = [...ranking.map((u) => u.name), ...(trend.length ? ['Promedio'] : [])];
  const iti = Number(stats.avg_transparency_integrated || 0);
  const recent = stats.recent_documents || [];

  return (
    <div className="adm" style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header admin-dashboard-header">
        <div className="page-header-info">
          <span className="admin-dashboard-eyebrow">Panel administrativo</span>
          <h1>Dashboard del Sistema</h1>
          <p>Resumen general de la plataforma de transparencia institucional{stats.period ? ` · ${stats.period.name}` : ''}</p>
        </div>
        <div className="page-header-actions admin-dashboard-controls">
          <PeriodSelect stats={stats} value={periodId} onChange={selectPeriod} />
          <button className="btn btn-primary adm-refresh" onClick={() => reload({ force: true })} disabled={loading}>
            <Icon name="refresh" size={16} /> Actualizar datos
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 24 }}>
          {error} — Verifique que el servidor Django esté activo y accesible
        </div>
      )}
      <SimulatedNotice stats={stats} />

      {/* 1. Resumen */}
      <section className="adm-kpis" aria-label="Resumen del período">
        <KpiCard icon="gauge" tone="primary" label="Índice final ITI promedio" value={formatPercent(iti)} loading={loading}>
          <div className="adm-kpi-track"><span style={{ width: `${loading ? 0 : Math.min(100, Math.max(0, iti))}%` }} /></div>
          <span>Nacional (SITA): <strong>{formatPercent(stats.avg_transparency)}</strong></span>
        </KpiCard>
        <KpiCard icon="building" tone="info" label="Universidades activas" value={formatNumber(stats.total_universities)} loading={loading}>
          <span><strong>{ranking.length}</strong> con índice calculado en el período</span>
        </KpiCard>
        <KpiCard icon="file" tone="warning" label="Documentos del período" value={formatNumber(stats.total_documents)} loading={loading}>
          <span className="adm-kpi-split">
            <span><i className="adm-dot adm-dot-warning" />Pendientes <strong>{formatNumber(stats.pending_reviews)}</strong></span>
            <span><i className="adm-dot adm-dot-success" />Aprobados <strong>{formatNumber(stats.approved_docs)}</strong></span>
          </span>
        </KpiCard>
        <KpiCard icon="users" tone="violet" label="Usuarios activos" value={formatNumber(stats.active_users)} loading={loading}>
          <span><strong>{formatNumber(stats.indicators_active)}</strong> indicadores activos · <strong>{formatNumber(stats.observations_open)}</strong> resultados con observaciones</span>
        </KpiCard>
      </section>

      {/* 2. Resultados del período */}
      <SectionHead
        title="Resultados del período"
        desc="Índice final ITI de cada universidad evaluada."
        action={<Link className="btn btn-sm btn-secondary adm-link" to="/admin/rankings">Ver rankings <Icon name="arrow" size={14} /></Link>}
      />
      <div className="adm-grid-21">
        <div className="card adm-card">
          <div className="adm-card-title">Ranking por índice final ITI</div>
          {ranking.length === 0 ? (
            <EmptyState text={loading ? 'Cargando ranking…' : 'El ranking aparecerá cuando haya evaluaciones completadas.'} />
          ) : (
            <RankingBar data={ranking.map((u) => ({ name: u.name, transparency_score: u.integrated_transparency_score }))} height={280} />
          )}
        </div>
        <div className="card adm-card">
          <div className="adm-card-title">Mejores instituciones</div>
          {ranking.length === 0 ? (
            <EmptyState text={loading ? 'Cargando…' : 'Sin evaluaciones calculadas.'} />
          ) : (
            <ol className="adm-top">
              {ranking.slice(0, 3).map((u, index) => (
                <li key={u.id}>
                  <span className={`adm-top-pos adm-top-pos-${index + 1}`}>{index + 1}</span>
                  <div className="adm-top-name">
                    <strong>{u.name}</strong>
                    <small>{u.full_name}</small>
                  </div>
                  <div className="adm-top-score">
                    <strong style={{ color: getScoreInk(u.integrated_transparency_score) }}>{formatPercent(u.integrated_transparency_score)}</strong>
                    <small>{getScoreLabel(u.integrated_transparency_score)}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="adm-avg">
            <span>Promedio del período</span>
            <strong>{formatPercent(iti)}</strong>
          </div>
        </div>
      </div>

      {/* 3. Evolución */}
      <SectionHead title="Evolución mensual" desc="Índice final ITI mes a mes; la línea punteada es el promedio." />
      <div className="card adm-card" style={{ marginBottom: 28 }}>
        {loading ? <EmptyState text="Cargando evolución…" /> : trend.length < 2 ? (
          <EmptyState text={trend.length ? 'El período tiene un solo mes evaluado; no hay evolución que mostrar.' : 'Sin índices mensuales calculados en este período.'} />
        ) : (
          <TrendLine data={trend} universities={trendSeries} height={300} />
        )}
      </div>

      {/* 4. Actividad y accesos */}
      <SectionHead title="Actividad y accesos rápidos" desc="Últimos documentos cargados y atajos a las tareas más frecuentes." />
      <div className="adm-grid-21">
        <div className="card adm-card">
          <div className="adm-card-title">
            Documentos recientes
            <Link className="adm-card-link" to="/admin/documents">Ver todos <Icon name="arrow" size={13} /></Link>
          </div>
          {recent.length ? (
            <ul className="adm-docs">
              {recent.map((doc) => {
                const status = DOC_STATUS[doc.status] || { label: doc.status || 'Sin estado', kind: 'subtle' };
                return (
                  <li key={doc.id}>
                    <span className="adm-doc-icon"><Icon name="file" size={16} /></span>
                    <div className="adm-doc-main">
                      <strong title={doc.title}>{doc.title}</strong>
                      <small>
                        {doc.university || '—'}{doc.indicator_code ? ` · Literal ${doc.indicator_code}` : ''}
                        {doc.uploaded_at ? ` · ${new Date(doc.uploaded_at).toLocaleDateString('es-EC')}` : ''}
                      </small>
                    </div>
                    <span className={`adm-status adm-status-${status.kind}`}>{status.label}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState text={loading ? 'Cargando…' : 'No hay documentos cargados en este período.'} />
          )}
        </div>
        <div className="card adm-card">
          <div className="adm-card-title">Accesos rápidos</div>
          <div className="adm-quick">
            {QUICK_LINKS.map((q) => (
              <Link key={q.to} to={q.to} className="adm-quick-item">
                <span className="adm-quick-icon"><Icon name={q.icon} size={18} /></span>
                <span><strong>{q.label}</strong><small>{q.desc}</small></span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
