import { useEffect, useMemo, useState } from 'react';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { api } from '../../api/client';
import { validationApi } from '../../api/validation';
import { useAuth } from '../../context/AuthContext';

const statusFromCompliance = (status) => {
  if (status === 'CUMPLE') return 'Resuelta';
  if (status === 'CUMPLE_PARCIALMENTE') return 'En proceso';
  return 'Pendiente';
};

const severityFromCompliance = (status) => {
  if (status === 'NO_CUMPLE' || status === 'ERROR_PROCESAMIENTO') return 'Alta';
  if (status === 'INCOMPLETO' || status === 'NO_PRESENTADO') return 'Media';
  return 'Baja';
};

export default function ObservationsPage() {
  const { user } = useAuth();
  const [obs, setObs] = useState([]);
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const universityId = user?.university_id;
    if (!universityId) return;

    let cancelled = false;

    api.evidences.list({ university_id: universityId })
      .then((res) => {
        const evidences = res.data || [];
        const latest = [...evidences]
          .filter((ev) => ev.period_id)
          .sort((a, b) => (b.year || 0) - (a.year || 0) || (b.month || 0) - (a.month || 0))[0];

        if (!latest?.period_id) return { data: { observations: [] } };
        return validationApi.getObservations(universityId, latest.period_id, latest.month);
      })
      .then((res) => {
        if (cancelled) return;
        const rows = (res.data.observations || []).flatMap((item) => {
          const messages = item.observaciones?.length ? item.observaciones : ['Sin observaciones detalladas.'];
          return messages.map((message, index) => ({
            id: `${item.literal}-${item.documento}-${index}`,
            indicator_code: item.literal,
            indicator_name: item.literal_name,
            document: item.documento,
            message,
            status: statusFromCompliance(item.estado),
            severity: severityFromCompliance(item.estado),
            score: item.puntaje_total,
            auditor: 'Validacion automatica',
            date: 'Ultima validacion',
          }));
        });
        setObs(rows);
      })
      .catch(() => setObs([]))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.university_id]);

  const filtered = useMemo(() => (
    filter === 'all' ? obs : obs.filter((o) => o.status.toLowerCase().includes(filter))
  ), [filter, obs]);

  const handleResolve = (id) => {
    setObs((prev) => prev.map((o) => (o.id === id ? { ...o, status: 'Resuelta' } : o)));
    setDetail(null);
    setReply('');
  };

  const severityIcon = { Alta: 'Alta', Media: 'Med', Baja: 'Baja' };

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Observaciones del Auditor</h1>
          <p>{obs.filter((o) => o.status !== 'Resuelta').length} observaciones pendientes - {obs.filter((o) => o.status === 'Resuelta').length} resueltas</p>
        </div>
      </div>

      <div className="tabs">
        {[['all', 'Todas'], ['pendiente', 'Pendientes'], ['proceso', 'En proceso'], ['resuelta', 'Resueltas']].map(([k, l]) => (
          <button key={k} className={`tab ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div className="card"><div className="empty-state"><h4>Cargando observaciones...</h4></div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((o) => (
            <div key={o.id} className="card" style={{ borderLeft: `3px solid ${o.severity === 'Alta' ? 'var(--danger)' : o.severity === 'Media' ? 'var(--warning)' : 'var(--info)'}`, cursor: 'pointer' }} onClick={() => setDetail(o)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <span className="tag" style={{ flexShrink: 0 }}>{severityIcon[o.severity]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span className="tag" style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{o.indicator_code}</span>
                    <Badge status={o.severity} />
                    <Badge status={o.status} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginLeft: 'auto' }}>{o.score}%</span>
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>{o.message}</p>
                  <div style={{ marginTop: 8, fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                    {o.document} - {o.auditor}
                  </div>
                </div>
                {o.status !== 'Resuelta' && (
                  <button className="btn btn-success btn-sm" onClick={(e) => { e.stopPropagation(); setDetail(o); }}>
                    Responder
                  </button>
                )}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">OK</div>
              <h4>Sin observaciones</h4>
              <p>No hay observaciones reales en este estado.</p>
            </div>
          )}
        </div>
      )}

      {detail && (
        <Modal
          isOpen={!!detail}
          onClose={() => setDetail(null)}
          title={`Observacion - ${detail.indicator_code}`}
          size="lg"
          footer={
            detail.status !== 'Resuelta' ? (
              <>
                <button className="btn btn-secondary" onClick={() => setDetail(null)}>Cerrar</button>
                <button className="btn btn-success" onClick={() => handleResolve(detail.id)} disabled={!reply.trim()}>
                  Marcar como resuelta
                </button>
              </>
            ) : <button className="btn btn-secondary" onClick={() => setDetail(null)}>Cerrar</button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Badge status={detail.severity} /> <Badge status={detail.status} />
              <span className="tag">{detail.indicator_name}</span>
              <span className="tag">Puntaje: {detail.score}%</span>
            </div>
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', padding: '14px 16px', borderLeft: '3px solid var(--warning)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginBottom: 6 }}>Observacion generada:</div>
              <p style={{ fontSize: '0.9375rem', color: 'var(--text)', lineHeight: 1.7, margin: 0 }}>{detail.message}</p>
            </div>
            {detail.status !== 'Resuelta' && (
              <div className="form-group">
                <label className="form-label">Su respuesta / accion tomada *</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Describa las acciones tomadas para resolver esta observacion..."
                />
              </div>
            )}
            {detail.status === 'Resuelta' && (
              <div className="alert alert-success">Esta observacion fue marcada como resuelta en esta sesion.</div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
