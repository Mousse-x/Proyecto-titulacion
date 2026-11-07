import TrendLine from '../../components/charts/TrendLine';
import RankingBar from '../../components/charts/RankingBar';
import PeriodSelect, { SimulatedNotice } from '../../components/common/PeriodSelect';
import useDashboardStats from '../../hooks/useDashboardStats';
import { getScoreColor } from '../../utils/score';

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

function EmptyChart({ icon, text }) {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-subtle)' }}>
      <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: '0.875rem' }}>{text}</div>
    </div>
  );
}

function DashboardValue({ loading, value, suffix = '' }) {
  return loading ? '—' : `${Number(value || 0).toLocaleString('es-EC')}${suffix}`;
}

export default function AdminDashboard() {
  const { stats, loading, error, periodId, selectPeriod, reload } = useDashboardStats(EMPTY_STATS);
  const ranking = stats.ranking || [];
  const trend = stats.trend || [];
  const trendSeries = [...ranking.map(u => u.name), ...(trend.length ? ['Promedio'] : [])];

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      {/* Page header */}
      <div className="page-header admin-dashboard-header">
        <div className="page-header-info">
          <span className="admin-dashboard-eyebrow">Panel administrativo</span>
          <h1>Dashboard del Sistema</h1>
          <p>
            Resumen general de la plataforma de transparencia institucional
            {stats.period ? ` · ${stats.period.name}` : ''}
          </p>
        </div>
        <div className="page-header-actions admin-dashboard-controls">
          <PeriodSelect stats={stats} value={periodId} onChange={selectPeriod} />
          <button className="btn btn-primary" onClick={() => reload({ force: true })}>
            ↻ Actualizar datos
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 24 }}>
          ⚠️ {error} — Verifique que el servidor Django esté activo y accesible
        </div>
      )}
      <SimulatedNotice stats={stats} />

      {/* Resumen principal */}
      <section className="admin-overview-grid" aria-label="Resumen del sistema">
        <article className="admin-overview-card admin-overview-universities">
          <div className="admin-overview-card-head">
            <div className="admin-overview-icon" aria-hidden="true">🏛️</div>
            <span className="admin-overview-kicker">Cobertura institucional</span>
          </div>
          <div className="admin-overview-value"><DashboardValue loading={loading} value={stats.total_universities} /></div>
          <div className="admin-overview-title">Universidades activas</div>
          <p>Instituciones incluidas en el período seleccionado.</p>
        </article>

        <article className="admin-overview-card admin-overview-documents">
          <div className="admin-overview-card-head">
            <div className="admin-overview-icon" aria-hidden="true">📄</div>
            <span className="admin-overview-kicker">Gestión documental</span>
          </div>
          <div className="admin-overview-value"><DashboardValue loading={loading} value={stats.total_documents} /></div>
          <div className="admin-overview-title">Documentos del período</div>
          <div className="admin-document-breakdown">
            <div>
              <span className="admin-breakdown-dot pending" />
              <span>Pendientes</span>
              <strong><DashboardValue loading={loading} value={stats.pending_reviews} /></strong>
            </div>
            <div>
              <span className="admin-breakdown-dot approved" />
              <span>Aprobados</span>
              <strong><DashboardValue loading={loading} value={stats.approved_docs} /></strong>
            </div>
          </div>
        </article>

        <article className="admin-overview-card admin-overview-indices">
          <div className="admin-overview-card-head">
            <div className="admin-overview-icon" aria-hidden="true">📊</div>
            <span className="admin-overview-kicker">Resultados consolidados</span>
          </div>
          {[
            { label: 'Índice nacional (SITA)', value: stats.avg_transparency, color: 'var(--info)' },
            { label: 'Índice final ITI', value: stats.avg_transparency_integrated, color: 'var(--primary)' },
          ].map((item) => (
            <div className="admin-index-row" key={item.label}>
              <div className="admin-index-meta">
                <span>{item.label}</span>
                <strong style={{ color: item.color }}><DashboardValue loading={loading} value={item.value} suffix="%" /></strong>
              </div>
              <div className="admin-index-track">
                <div style={{ width: `${loading ? 0 : Math.max(0, Math.min(Number(item.value || 0), 100))}%`, background: item.color }} />
              </div>
            </div>
          ))}
        </article>
      </section>

      <section className="admin-secondary-metrics" aria-label="Indicadores operativos">
        {[
          { icon: '👥', label: 'Usuarios activos', value: stats.active_users, color: '#7c3aed', bg: '#f1eafe' },
          { icon: '💬', label: 'Resultados con observaciones', value: stats.observations_open, color: 'var(--danger)', bg: 'var(--danger-subtle)' },
          { icon: '📋', label: 'Indicadores activos', value: stats.indicators_active, color: 'var(--success)', bg: 'var(--success-subtle)' },
        ].map((item) => (
          <article className="admin-secondary-card" key={item.label} style={{ '--metric-color': item.color, '--metric-bg': item.bg }}>
            <div className="admin-secondary-icon" aria-hidden="true">{item.icon}</div>
            <div>
              <strong><DashboardValue loading={loading} value={item.value} /></strong>
              <span>{item.label}</span>
            </div>
          </article>
        ))}
      </section>

      {/* Charts Row */}
      <div className="grid-21" style={{ marginBottom: 24 }}>
        <div className="chart-card">
          <div className="chart-title">📈 Evolución mensual del índice final ITI</div>
          {loading ? <EmptyChart icon="⏳" text="Cargando evolución..." /> : trend.length < 2 ? (
            <EmptyChart icon="📊" text={trend.length ? 'El período tiene un solo mes evaluado; no hay evolución que mostrar.' : 'Sin índices mensuales calculados en este período.'} />
          ) : (
            <TrendLine data={trend} universities={trendSeries} />
          )}
        </div>
        <div className="chart-card">
          <div className="chart-title">🏆 Top 3 instituciones</div>
          {ranking.length === 0 ? (
            <EmptyChart icon="🏛️" text={loading ? 'Cargando...' : 'Las evaluaciones aún no han sido calculadas'} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {ranking.slice(0, 3).map((u, index) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 'var(--radius)', background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '1.25rem', width: 28, textAlign: 'center' }}>{['🥇', '🥈', '🥉'][index]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{u.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.full_name}</div>
                  </div>
                  <div style={{ fontWeight: 800, color: getScoreColor(u.integrated_transparency_score) }}>
                    {Number(u.integrated_transparency_score).toFixed(2)}%
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--success-subtle)', borderRadius: 'var(--radius)', border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--success)' }}>Promedio del índice final ITI</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>{stats.avg_transparency_integrated}%</div>
          </div>
        </div>
      </div>

      {/* Rankings bar + recent activity */}
      <div className="grid-21">
        <div className="chart-card">
          <div className="chart-title">📊 Ranking por índice final ITI</div>
          {ranking.length === 0 ? (
            <EmptyChart icon="📊" text="El ranking aparecerá cuando haya evaluaciones completadas" />
          ) : (
            <RankingBar data={ranking.map(u => ({ name: u.name, transparency_score: u.integrated_transparency_score }))} height={260} />
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">⚡ Documentos recientes del período</span>
          </div>
          {stats.recent_documents?.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.recent_documents.map((doc) => (
                <div key={doc.id} style={{ fontSize: '0.8125rem', paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</div>
                  <div style={{ color: 'var(--text-subtle)' }}>
                    {doc.university} · {doc.indicator_code} · {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString('es-EC') : ''}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyChart icon="📝" text="No hay actividad registrada todavía" />
          )}
        </div>
      </div>
    </div>
  );
}
