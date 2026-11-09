import { useMemo, useState } from 'react';
import { getScoreColor } from '../../utils/score';
import { useNavigate } from 'react-router-dom';
import PeriodSelect, { SimulatedNotice } from '../../components/common/PeriodSelect';
import useDashboardStats from '../../hooks/useDashboardStats';
import { getUniversityLogo } from '../../data/universityLogos';
import FeedbackForm from '../../components/common/FeedbackForm';

const EMPTY_STATS = {
  total_universities: 0,
  avg_transparency: 0,
  avg_transparency_integrated: 0,
  indicators_active: 0,
  evaluated_documents: 0,
  ranking: [],
};

const getScoreTone = (score) => getScoreColor(score);

function UniversityMark({ university }) {
  const logo = getUniversityLogo(university);
  const letters = String(university?.name || 'U').slice(0, 2).toUpperCase();

  return (
    <div className={`auditor-university-mark${logo ? ' has-logo' : ''}`}>
      {logo ? <img src={logo} alt={`Logo ${university?.full_name || university?.name || 'universidad'}`} /> : letters}
    </div>
  );
}

export default function AuditorDashboard() {
  const navigate = useNavigate();
  const { stats, loading, periodId, selectPeriod } = useDashboardStats(EMPTY_STATS);
  const [query, setQuery] = useState('');

  const rankings = useMemo(() => {
    const base = stats.ranking || [];
    return base
      .filter((item) => {
        const text = `${item.name || ''} ${item.full_name || ''}`.toLowerCase();
        const matchesSearch = text.includes(query.trim().toLowerCase());
        return matchesSearch;
      })
      .map((item, index) => ({
        ...item,
        position: index + 1,
        indicatorTotal: stats.indicators_active || item.evaluated_documents || 0,
      }));
  }, [query, stats.indicators_active, stats.ranking]);

  return (
    <div className="auditor-ranking-page" style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="auditor-ranking-hero">
        <h1>Universidades</h1>
        {stats.period && <p style={{ marginTop: 6 }}>Ranking del período {stats.period.name}</p>}
      </div>

      <div className="auditor-ranking-shell">
        <SimulatedNotice stats={stats} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <PeriodSelect stats={stats} value={periodId} onChange={selectPeriod} />
        </div>
        <div className="auditor-ranking-card">
          <div className="auditor-ranking-search">
            <input
              className="form-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar una entidad ..."
            />
          </div>

          <div className="auditor-ranking-table">
            <div className="auditor-ranking-head">
              <span>Posicion</span>
              <span>Entidad</span>
              <span>Indices</span>
            </div>

            {loading ? (
              <div className="auditor-ranking-empty">Cargando ranking real...</div>
            ) : rankings.length === 0 ? (
              <div className="auditor-ranking-empty">
                No hay universidades evaluadas para mostrar.
              </div>
            ) : rankings.map((item) => {
              const nationalScore = Number(item.transparency_score || 0);
              const integratedScore = Number(item.integrated_transparency_score || 0);
              const nationalColor = getScoreTone(nationalScore);
              const integratedColor = getScoreTone(integratedScore);
              return (
                <div
                  className="auditor-ranking-row"
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/auditor/index?university_id=${item.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/auditor/index?university_id=${item.id}`);
                    }
                  }}
                  title={`Ver indice de transparencia de ${item.full_name || item.name}`}
                >
                  <div className="auditor-ranking-position">{item.position}</div>
                  <div className="auditor-ranking-entity">
                    <UniversityMark university={item} />
                    <div>
                      <div className="auditor-ranking-name">{item.full_name || item.name}</div>
                      <div className="auditor-ranking-subname">{item.name}</div>
                    </div>
                  </div>
                  <div className="auditor-ranking-indices">
                    <div className="auditor-ranking-index-label">
                      <span>Indice nacional</span>
                      <strong>{nationalScore.toFixed(2)}%</strong>
                    </div>
                    <div className="auditor-ranking-percent auditor-ranking-percent-main" style={{ '--score': `${Math.max(nationalScore, 6)}%`, '--score-color': nationalColor }}>
                      <div className="auditor-ranking-bar" />
                    </div>
                    <div className="auditor-ranking-index-label secondary">
                      <span>Índice final ITI</span>
                      <strong>{integratedScore.toFixed(2)}%</strong>
                    </div>
                    <div className="auditor-ranking-percent auditor-ranking-percent-secondary" style={{ '--score': `${Math.max(integratedScore, 6)}%`, '--score-color': integratedColor }}>
                      <div className="auditor-ranking-bar" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="dashboard-feedback-footer">
        <div>
          <strong>Ayuda a mejorar la transparencia</strong>
          <span>Reporta sugerencias, problemas del sistema o comentarios sobre la informacion evaluada.</span>
        </div>
        <FeedbackForm compact />
      </footer>
    </div>
  );
}
