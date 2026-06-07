import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import Badge from '../../components/common/Badge';

const TYPE_LABELS = {
  system: 'Sistema',
  transparency: 'Transparencia',
};

const STATUS_LABELS = {
  pending: 'Pendiente',
  reviewed: 'Revisado',
};

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

export default function FeedbackPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.feedback.list({
        type: typeFilter || undefined,
        status: statusFilter || undefined,
      });
      setItems(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar comentarios.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => { fetchFeedback(); }, [fetchFeedback]);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(item => [
      item.subject,
      item.message,
      item.user_name,
      item.user_email,
      item.user_role,
      TYPE_LABELS[item.feedback_type],
    ].some(value => String(value || '').toLowerCase().includes(needle)));
  }, [items, search]);

  const counters = useMemo(() => ({
    total: items.length,
    system: items.filter(item => item.feedback_type === 'system').length,
    transparency: items.filter(item => item.feedback_type === 'transparency').length,
    pending: items.filter(item => item.status === 'pending').length,
  }), [items]);

  const updateStatus = async (id, status) => {
    setUpdatingId(id);
    setError(null);
    try {
      const res = await api.feedback.updateStatus(id, status);
      setItems(prev => prev.map(item => item.id === id ? res.data : item));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar el estado del comentario.');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Comentarios del Sistema</h1>
          <p>Feedback enviado por usuarios para mejorar el sistema y la transparencia.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={fetchFeedback} disabled={loading}>
            Actualizar
          </button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="card card-sm">
          <div className="card-title">Total comentarios</div>
          <div style={{ fontSize: '2rem', fontWeight: 800 }}>{loading ? '-' : counters.total}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Sistema</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--info)' }}>{loading ? '-' : counters.system}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Transparencia</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>{loading ? '-' : counters.transparency}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Pendientes</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--warning)' }}>{loading ? '-' : counters.pending}</div>
        </div>
      </div>

      <div className="feedback-admin-toolbar">
        <input
          className="form-input"
          placeholder="Buscar por asunto, mensaje, usuario o correo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="form-input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">Todos los tipos</option>
          <option value="system">Sistema</option>
          <option value="transparency">Transparencia</option>
        </select>
        <select className="form-input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pending">Pendiente</option>
          <option value="reviewed">Revisado</option>
        </select>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>{error}</div>}

      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
          Cargando comentarios...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
          No hay comentarios para mostrar.
        </div>
      ) : (
        <div className="feedback-admin-list">
          {filteredItems.map(item => (
            <article className={`feedback-admin-item status-${item.status}`} key={item.id}>
              <div className="feedback-admin-item-header">
                <div>
                  <div className="feedback-admin-subject">{item.subject}</div>
                  <div className="feedback-admin-meta">
                    {item.user_name || 'Usuario no registrado'} · {item.user_role || 'Sin rol'} · {fmtDate(item.created_at)}
                  </div>
                </div>
                <div className="feedback-admin-badges">
                  <Badge status={TYPE_LABELS[item.feedback_type] || item.feedback_type} />
                  <Badge status={STATUS_LABELS[item.status] || item.status} />
                  {item.email_sent && <Badge status="Correo enviado" />}
                </div>
              </div>

              <p className="feedback-admin-message">{item.message}</p>

              <div className="feedback-admin-detail">
                <span>Correo: {item.user_email || '-'}</span>
                <span>Destino: {item.recipient_email || '-'}</span>
                <span>ID usuario: {item.user_id || '-'}</span>
              </div>

              <div className="feedback-admin-actions">
                <label className="form-label" htmlFor={`feedback-status-${item.id}`}>Estado</label>
                <select
                  id={`feedback-status-${item.id}`}
                  className="form-input"
                  value={item.status}
                  onChange={e => updateStatus(item.id, e.target.value)}
                  disabled={updatingId === item.id}
                >
                  <option value="pending">Pendiente</option>
                  <option value="reviewed">Revisado</option>
                </select>
                {item.status !== 'reviewed' && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => updateStatus(item.id, 'reviewed')}
                    disabled={updatingId === item.id}
                  >
                    Marcar revisado
                  </button>
                )}
                {item.status !== 'pending' && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => updateStatus(item.id, 'pending')}
                    disabled={updatingId === item.id}
                  >
                    Reabrir
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
