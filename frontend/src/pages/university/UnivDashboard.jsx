import StatCard, { ScoreCard } from '../../components/common/StatCard';
import TransparencyRadar from '../../components/charts/TransparencyRadar';
import Badge from '../../components/common/Badge';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { validationApi } from '../../api/validation';
import { useAuth } from '../../context/AuthContext';
import { getScoreColor, getScoreLabel } from '../../utils/score';

const emptyStats = {
  total: 0,
  approved: 0,
  pending: 0,
  rejected: 0,
};

export default function UnivDashboard() {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [results, setResults] = useState([]);
  const [university, setUniversity] = useState(null);
  const [indicators, setIndicators] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const universityId = user?.university_id;
    if (!universityId) return;

    let cancelled = false;

    Promise.all([
      api.universities.list(),
      api.indicators.list(),
      api.evidences.list({ university_id: universityId }),
    ])
      .then(async ([universitiesRes, indicatorsRes, evidencesRes]) => {
        if (cancelled) return;

        const universityRows = universitiesRes.data || [];
        const indicatorRows = indicatorsRes.data || [];
        const evidenceRows = evidencesRes.data || [];

        setUniversity(universityRows.find((u) => String(u.id) === String(universityId)) || null);
        setIndicators(indicatorRows);
        setDocs(evidenceRows);

        const latest = [...evidenceRows]
          .filter((ev) => ev.period_id)
          .sort((a, b) => (b.year || 0) - (a.year || 0) || (b.month || 0) - (a.month || 0))[0];

        if (latest?.period_id) {
          const summaryRes = await validationApi.getSummary(universityId, latest.period_id, latest.month);
          if (!cancelled) {
            setSummary(summaryRes.data.summary || null);
            setResults(summaryRes.data.results || []);
          }
        } else {
          setSummary(null);
          setResults([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUniversity(null);
          setIndicators([]);
          setDocs([]);
          setSummary(null);
          setResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.university_id]);

  const docStats = useMemo(() => {
    if (!docs.length) return emptyStats;
    return {
      total: docs.length,
      approved: docs.filter((d) => d.validation_status === 'aprobado').length,
      pending: docs.filter((d) => d.validation_status === 'pendiente').length,
      rejected: docs.filter((d) => d.validation_status === 'rechazado').length,
    };
  }, [docs]);

  const radarData = useMemo(() => {
    const categoryMap = new Map();
    const resultByCode = new Map(results.map((result) => [result.literal, Number(result.puntaje_total || 0)]));

    indicators.forEach((indicator) => {
      const key = indicator.category || 'Sin categoria';
      const current = categoryMap.get(key) || { subject: key, total: 0, count: 0 };
      current.total += resultByCode.get(indicator.code) || 0;
      current.count += 1;
      categoryMap.set(key, current);
    });

    return Array.from(categoryMap.values()).map((item) => ({
      subject: item.subject,
      score: item.count ? Number((item.total / item.count).toFixed(2)) : 0,
    }));
  }, [indicators, results]);

  const pendingObservations = useMemo(() => (
    results
      .filter((result) => result.estado_cumplimiento !== 'CUMPLE')
      .flatMap((result) => (result.observaciones || []).map((message, index) => ({
        id: `${result.evidence_id}-${index}`,
        indicator_code: result.literal,
        severity: result.estado_cumplimiento === 'NO_CUMPLE' ? 'Alta' : 'Media',
        message,
        date: result.fecha_validacion ? new Date(result.fecha_validacion).toLocaleDateString() : 'Sin fecha',
      })))
  ), [results]);

  const score = summary?.integrated_index ?? summary?.total_index ?? university?.integrated_transparency_score ?? university?.transparency_score ?? 0;
  const accent = university?.color || '#6366F1';

  if (loading) {
    return (
      <div className="card">
        <div className="empty-state"><h4>Cargando panel institucional...</h4></div>
      </div>
    );
  }

  if (!university) {
    return (
      <div className="card">
        <div className="empty-state">
          <h4>Universidad no encontrada</h4>
          <p>El usuario actual no tiene una universidad activa asociada.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="card" style={{ marginBottom: 24, background: `linear-gradient(135deg, ${accent}18, ${accent}08)`, borderColor: `${accent}30` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ width: 64, height: 64, borderRadius: 14, background: `${accent}22`, border: `2px solid ${accent}66`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: accent, fontSize: '1rem', flexShrink: 0 }}>
            {university.logo_url ? <img src={university.logo_url} alt={`Logo ${university.full_name}`} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 6 }} /> : university.logo_initials}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, color: 'var(--text)' }}>{university.full_name}</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {[university.city, university.province].filter(Boolean).join(' · ') || 'Ubicacion no registrada'}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <Badge status={university.type || 'Institucion'} />
              <span className="tag">{university.name}</span>
              {university.website && <span className="tag">{university.website.replace(/^https?:\/\//, '')}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <ScoreCard score={score} size={90} label="Indice ITI" />
            <div style={{ marginTop: 6 }}>
              <Badge status={getScoreLabel(score)} />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: 4 }}>
                {university.rank ? `Rank #${university.rank}` : 'Sin ranking calculado'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <StatCard icon="Docs" label="Documentos cargados" value={docStats.total} color={accent} iconBg={`${accent}22`} />
        <StatCard icon="OK" label="Documentos aprobados" value={docStats.approved} color="var(--success)" iconBg="var(--success-subtle)" />
        <StatCard icon="REV" label="En revision" value={docStats.pending} color="var(--warning)" iconBg="var(--warning-subtle)" />
        <StatCard icon="X" label="Rechazados" value={docStats.rejected} color="var(--danger)" iconBg="var(--danger-subtle)" />
        <StatCard icon="Obs" label="Obs. pendientes" value={pendingObservations.length} color="var(--danger)" iconBg="var(--danger-subtle)" />
        <StatCard icon="Ind" label="Indicadores" value={indicators.length} color="var(--primary)" iconBg="var(--primary-subtle)" />
      </div>

      <div className="grid-21" style={{ marginBottom: 24 }}>
        <div className="chart-card">
          <div className="chart-title">Perfil de transparencia por categoria</div>
          {radarData.length ? (
            <TransparencyRadar data={radarData} color={accent} height={300} />
          ) : (
            <div className="empty-state"><h4>Sin categorias</h4><p>No hay indicadores activos para graficar.</p></div>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Indicadores por categoria</span>
          </div>
          {radarData.length ? radarData.map((cat) => (
            <div key={cat.subject} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{cat.subject}</span>
                <span style={{ fontWeight: 700, color: getScoreColor(cat.score) }}>{cat.score}</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${cat.score}%`, background: getScoreColor(cat.score) }} />
              </div>
            </div>
          )) : (
            <div className="empty-state"><h4>Sin datos reales</h4><p>Valida documentos para calcular resultados por categoria.</p></div>
          )}
        </div>
      </div>

      {pendingObservations.length > 0 && (
        <div className="card" style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'var(--danger-subtle)' }}>
          <div className="card-header">
            <span className="card-title" style={{ color: 'var(--danger)' }}>Observaciones pendientes</span>
            <Badge status={`${pendingObservations.length} por revisar`} />
          </div>
          {pendingObservations.slice(0, 8).map((obs) => (
            <div key={obs.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontFamily: 'monospace', background: 'var(--danger-subtle)', color: 'var(--danger)', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', flexShrink: 0 }}>{obs.indicator_code}</span>
                <div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text)', fontWeight: 500, marginBottom: 3 }}>{obs.message}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                    Sistema · {obs.date} · <Badge status={obs.severity} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
