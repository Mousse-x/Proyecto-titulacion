import { useEffect, useState } from 'react';
import StatCard from '../../components/common/StatCard';
import RankingBar from '../../components/charts/RankingBar';
import Badge from '../../components/common/Badge';
import { api } from '../../api/client';
import { getScoreColor, getScoreLabel } from '../../data/mockData';

const EMPTY_STATS = {
  total_universities: 0,
  avg_transparency: 0,
  avg_transparency_integrated: 0,
  total_documents: 0,
  approved_docs: 0,
  pending_reviews: 0,
  observations_open: 0,
  ranking: [],
  recent_documents: [],
};

export default function AuditorDashboard() {
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stats()
      .then((res) => setStats({ ...EMPTY_STATS, ...res.data }))
      .catch(() => setStats(EMPTY_STATS))
      .finally(() => setLoading(false));
  }, []);

  const rankings = (stats.ranking || []).map((u) => ({
    ...u,
    logo_initials: u.name,
    color: 'var(--primary)',
  }));
  const recentDocs = stats.recent_documents || [];

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Panel del Auditor</h1>
          <p>Vista consolidada del sistema de transparencia institucional - Solo lectura</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <span className="badge badge-info" style={{ padding: '8px 14px', fontSize: '0.8125rem' }}>Modo Solo Lectura</span>
          <button className="btn btn-secondary">Exportar vista</button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <StatCard icon="UN" label="Universidades evaluadas" value={loading ? '-' : stats.total_universities} color="var(--primary)" iconBg="var(--primary-subtle)" />
        <StatCard icon="NA" label="Indice nacional" value={loading ? '-' : stats.avg_transparency} suffix="%" color="var(--accent)" iconBg="var(--accent-subtle)" />
        <StatCard icon="NI" label="Nacional + internacional" value={loading ? '-' : stats.avg_transparency_integrated} suffix="%" color="var(--primary)" iconBg="var(--primary-subtle)" />
        <StatCard icon="DO" label="Documentos totales" value={loading ? '-' : stats.total_documents} color="var(--info)" iconBg="var(--info-subtle)" />
        <StatCard icon="AP" label="Docs. aprobados" value={loading ? '-' : stats.approved_docs} color="var(--success)" iconBg="var(--success-subtle)" />
        <StatCard icon="PE" label="Pendientes validacion" value={loading ? '-' : stats.pending_reviews} color="var(--warning)" iconBg="var(--warning-subtle)" />
        <StatCard icon="OB" label="Obs. abiertas" value={loading ? '-' : stats.observations_open} color="var(--danger)" iconBg="var(--danger-subtle)" />
      </div>

      <div className="grid-21" style={{ marginBottom: 24 }}>
        <div className="chart-card">
          <div className="chart-title">Evolucion del ITI Nacional</div>
          <div style={{ padding: '72px 0', textAlign: 'center', color: 'var(--text-subtle)' }}>
            Sin serie historica real disponible
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Clasificacion actual</span>
          </div>
          {rankings.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-subtle)' }}>
              No hay evaluaciones calculadas todavia.
            </div>
          ) : rankings.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div className={`rank-number rank-${i < 3 ? i + 1 : 'n'}`}>{i + 1}</div>
              <div style={{ width: 38, height: 38, borderRadius: 8, background: `${u.color}22`, border: `1px solid ${u.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 800, color: u.color, flexShrink: 0 }}>
                {u.logo_initials}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text)' }}>{u.name}</div>
                <div className="progress-bar" style={{ marginTop: 4 }}>
                  <div className="progress-fill" style={{ width: `${u.transparency_score}%`, background: getScoreColor(u.transparency_score) }} />
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, color: getScoreColor(u.transparency_score) }}>{u.transparency_score}</div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-subtle)' }}>{getScoreLabel(u.transparency_score)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="chart-card">
          <div className="chart-title">Indice nacional por universidad</div>
          {rankings.length ? (
            <RankingBar data={rankings.map((u) => ({ name: u.name, transparency_score: u.transparency_score }))} height={250} />
          ) : (
            <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-subtle)' }}>Sin ranking disponible</div>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Documentos recientes</span>
          </div>
          {recentDocs.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-subtle)' }}>
              No hay documentos recientes.
            </div>
          ) : recentDocs.map((doc) => (
            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--border-light)' }}>
              <span className="tag">{doc.file_type || 'DOC'}</span>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{doc.uploaded_at?.split('T')[0]} - {doc.indicator_code}</div>
              </div>
              <Badge status={doc.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
