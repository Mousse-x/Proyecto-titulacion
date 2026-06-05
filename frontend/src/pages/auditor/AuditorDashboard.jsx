import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { getUniversityLogo } from '../../data/universityLogos';

const EMPTY_STATS = {
  total_universities: 0,
  avg_transparency: 0,
  avg_transparency_integrated: 0,
  indicators_active: 0,
  evaluated_documents: 0,
  ranking: [],
};

function getScoreTone(score) {
  if (score >= 85) return '#2ecc35';
  if (score >= 70) return '#8bcf25';
  if (score >= 50) return '#f2b705';
  return '#cf2027';
}

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
  const [stats, setStats] = useState(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('general');

  useEffect(() => {
    api.stats()
      .then((res) => setStats({ ...EMPTY_STATS, ...res.data }))
      .catch(() => setStats(EMPTY_STATS))
      .finally(() => setLoading(false));
  }, []);

  const rankings = useMemo(() => {
    const base = stats.ranking || [];
    return base
      .filter((item) => {
        const text = `${item.name || ''} ${item.full_name || ''}`.toLowerCase();
        const matchesSearch = text.includes(query.trim().toLowerCase());
        if (!matchesSearch) return false;
        if (tab === 'publicas') return true;
        if (tab === 'privadas') return false;
        return true;
      })
      .map((item, index) => ({
        ...item,
        position: index + 1,
        indicatorTotal: stats.indicators_active || item.evaluated_documents || 0,
      }));
  }, [query, stats.indicators_active, stats.ranking, tab]);

  return (
    <div className="auditor-ranking-page" style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="auditor-ranking-hero">
        <h1>Universidades</h1>
      </div>

      <div className="auditor-ranking-shell">
        <div className="auditor-ranking-tabs">
          <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>General</button>
          <button className={tab === 'publicas' ? 'active' : ''} onClick={() => setTab('publicas')}>Publicas</button>
          <button className={tab === 'privadas' ? 'active' : ''} onClick={() => setTab('privadas')}>Privada</button>
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
                      <span>Nacional + internacional</span>
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
    </div>
  );
}
