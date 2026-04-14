import { useState, useEffect } from 'react';
import StatCard from '../../components/common/StatCard';
import TrendLine from '../../components/charts/TrendLine';
import RankingBar from '../../components/charts/RankingBar';
import { api } from '../../api/client';

// Datos vacíos por defecto mientras no hay info en BD
const EMPTY_STATS = {
  total_universities: 0,
  total_documents:    0,
  pending_reviews:    0,
  approved_docs:      0,
  avg_transparency:   0,
  active_users:       0,
  observations_open:  0,
  indicators_active:  0,
};

export default function AdminDashboard() {
  const [stats, setStats]     = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    api.stats()
      .then(res => { setStats(res.data); })
      .catch(err => {
        setError(err.response?.data?.error || 'No se pudo conectar con el servidor.');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>Dashboard del Sistema</h1>
          <p>Resumen general de la plataforma de transparencia institucional</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary">📥 Exportar</button>
          <button className="btn btn-primary" onClick={() => { setLoading(true); api.stats().then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false)); }}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: 24 }}>
          ⚠️ {error} — Verifique que el servidor Django esté activo en <code>127.0.0.1:8000</code>
        </div>
      )}

      {/* KPI Cards */}
      <div className="stat-grid">
        <StatCard icon="🏛️" label="Universidades activas"   value={loading ? '—' : stats.total_universities} color="var(--primary)"   iconBg="var(--primary-subtle)" />
        <StatCard icon="📄" label="Documentos subidos"       value={loading ? '—' : stats.total_documents}    color="var(--accent)"    iconBg="var(--accent-subtle)" />
        <StatCard icon="⏳" label="Pendientes de revisión"   value={loading ? '—' : stats.pending_reviews}    color="var(--warning)"   iconBg="var(--warning-subtle)" changeDir="down" />
        <StatCard icon="✅" label="Documentos aprobados"     value={loading ? '—' : stats.approved_docs}      color="var(--success)"   iconBg="var(--success-subtle)" />
        <StatCard icon="📊" label="Promedio transparencia"   value={loading ? '—' : stats.avg_transparency}   color="var(--info)"      iconBg="var(--info-subtle)" suffix="%" />
        <StatCard icon="👥" label="Usuarios activos"         value={loading ? '—' : stats.active_users}       color="var(--secondary)" iconBg="rgba(139,92,246,0.12)" />
        <StatCard icon="💬" label="Observaciones abiertas"   value={loading ? '—' : stats.observations_open}  color="var(--danger)"    iconBg="var(--danger-subtle)" changeDir="down" />
        <StatCard icon="📋" label="Indicadores activos"      value={loading ? '—' : stats.indicators_active}  color="var(--accent)"    iconBg="var(--accent-subtle)" />
      </div>

      {/* Charts Row */}
      <div className="grid-21" style={{ marginBottom: 24 }}>
        <div className="chart-card">
          <div className="chart-title">📈 Evolución del Índice de Transparencia</div>
          {stats.total_universities === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-subtle)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📊</div>
              <div style={{ fontSize: '0.875rem' }}>Sin datos históricos aún</div>
            </div>
          ) : (
            <TrendLine data={[]} />
          )}
        </div>
        <div className="chart-card">
          <div className="chart-title">🏆 Top 3 Instituciones</div>
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>🏛️</div>
            <div style={{ fontSize: '0.875rem' }}>
              {stats.total_universities === 0
                ? 'No hay universidades registradas aún'
                : 'Las evaluaciones aún no han sido calculadas'}
            </div>
          </div>
          <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--success-subtle)', borderRadius: 'var(--radius)', border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--success)' }}>Promedio nacional</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>{stats.avg_transparency}%</div>
          </div>
        </div>
      </div>

      {/* Rankings bar + notice */}
      <div className="grid-21">
        <div className="chart-card">
          <div className="chart-title">📊 Ranking por Índice de Transparencia</div>
          {stats.total_universities === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-subtle)' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📊</div>
              <div style={{ fontSize: '0.875rem' }}>El ranking aparecerá cuando haya evaluaciones completadas</div>
            </div>
          ) : (
            <RankingBar data={[]} height={260} />
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">⚡ Actividad Reciente</span>
          </div>
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>📝</div>
            <div style={{ fontSize: '0.875rem' }}>No hay actividad registrada todavía</div>
          </div>
        </div>
      </div>
    </div>
  );
}
