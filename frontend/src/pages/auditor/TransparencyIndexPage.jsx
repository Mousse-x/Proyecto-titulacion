import { useEffect, useMemo, useState } from 'react';
import { ScoreCard } from '../../components/common/StatCard';
import TransparencyRadar from '../../components/charts/TransparencyRadar';
import Badge from '../../components/common/Badge';
import { api } from '../../api/client';
import { getScoreColor, getScoreLabel } from '../../data/mockData';

export default function TransparencyIndexPage() {
  const [rankings, setRankings] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stats()
      .then((res) => {
        const rows = res.data.ranking || [];
        setRankings(rows);
        setSelectedId(rows[0]?.id ? String(rows[0].id) : '');
      })
      .catch(() => {
        setRankings([]);
        setSelectedId('');
      })
      .finally(() => setLoading(false));
  }, []);

  const selected = rankings.find((u) => String(u.id) === String(selectedId)) || rankings[0];
  const national = selected?.transparency_score || 0;
  const integrated = selected?.integrated_transparency_score || 0;
  const evaluatedDocs = selected?.evaluated_documents || 0;

  const radarData = useMemo(() => ([
    { subject: 'Nacional', score: national },
    { subject: 'Internacional integrado', score: integrated },
    { subject: 'Documentos evaluados', score: Math.min(100, evaluatedDocs) },
  ]), [national, integrated, evaluatedDocs]);

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Indice de Transparencia Institucional</h1>
          <p>Valores reales calculados desde las validaciones LOTAIP e internacionales</p>
        </div>
        <div className="page-header-actions">
          <select className="form-input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={!rankings.length}>
            {rankings.map((u) => (
              <option key={u.id} value={u.id}>{u.name} - {u.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card"><div className="empty-state"><h4>Cargando indices...</h4></div></div>
      ) : !selected ? (
        <div className="card">
          <div className="empty-state">
            <h4>Sin evaluaciones calculadas</h4>
            <p>Ejecuta la evaluacion LOTAIP para generar indices reales.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ width: 60, height: 60, borderRadius: 14, background: 'var(--primary-subtle)', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: 'var(--primary-light)', fontSize: '1rem', flexShrink: 0 }}>
                {selected.name}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ margin: 0 }}>{selected.full_name}</h2>
                <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  {evaluatedDocs} documentos evaluados
                </p>
              </div>
              <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                <ScoreCard score={national} size={90} label="Indice nacional" />
                <ScoreCard score={integrated} size={90} label="Nacional + internacional" />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: getScoreColor(integrated), lineHeight: 1 }}>
                    {getScoreLabel(integrated)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: 4 }}>Clasificacion integrada</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid-21" style={{ marginBottom: 24 }}>
            <div className="chart-card">
              <div className="chart-title">Perfil de indices reales</div>
              <TransparencyRadar data={radarData} color="var(--primary)" height={300} />
            </div>
            <div className="card">
              <div className="card-title" style={{ marginBottom: 14 }}>Resumen de indices</div>
              {[
                { label: 'Indice nacional', score: national },
                { label: 'Indice nacional + internacional', score: integrated },
              ].map((item) => (
                <div key={item.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{item.label}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontWeight: 700, color: getScoreColor(item.score) }}>{item.score}%</span>
                      <Badge status={getScoreLabel(item.score)} />
                    </div>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${item.score}%`, background: getScoreColor(item.score) }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Detalle institucional</span>
              <span className="tag">{evaluatedDocs} documentos evaluados</span>
            </div>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Componente</th>
                    <th>Puntaje</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Transparencia nacional LOTAIP</td>
                    <td><span style={{ fontWeight: 800, color: getScoreColor(national) }}>{national}%</span></td>
                    <td><Badge status={getScoreLabel(national)} /></td>
                  </tr>
                  <tr>
                    <td>Transparencia nacional + internacional</td>
                    <td><span style={{ fontWeight: 800, color: getScoreColor(integrated) }}>{integrated}%</span></td>
                    <td><Badge status={getScoreLabel(integrated)} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
