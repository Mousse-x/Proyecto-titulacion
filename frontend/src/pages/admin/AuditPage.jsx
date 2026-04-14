import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import client from '../../api/client';

// Helpers para formatear fechas
const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'medium' }) : '—';

// Colores por acción/código
const ACTION_COLORS = {
  LOGIN:    'var(--success)',
  REGISTER: 'var(--primary-light)',
  LOGOUT:   'var(--text-subtle)',
  UPDATE:   'var(--warning)',
  DELETE:   'var(--danger)',
};
const ERROR_CODE_COLORS = {
  USER_NOT_FOUND:   'var(--warning)',
  WRONG_PASSWORD:   'var(--danger)',
  ACCOUNT_INACTIVE: 'var(--danger)',
  DUPLICATE_EMAIL:  'var(--warning)',
  DB_ERROR:         'var(--danger)',
  MISSING_FIELDS:   'var(--text-subtle)',
};

export default function AuditPage() {
  const [tab, setTab]         = useState('logs');
  const [logs, setLogs]       = useState([]);
  const [errors, setErrors]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [expanded, setExpanded] = useState(null); // id del stack_trace expandido
  const [search, setSearch]   = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logsRes, errorsRes] = await Promise.all([
        client.get('/audit/logs/'),
        client.get('/audit/errors/'),
      ]);
      setLogs(logsRes.data);
      setErrors(errorsRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar datos de auditoría.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Filtrado por búsqueda
  const filteredLogs = logs.filter(l =>
    !search ||
    l.action?.toLowerCase().includes(search.toLowerCase()) ||
    l.description?.toLowerCase().includes(search.toLowerCase()) ||
    String(l.user_id).includes(search)
  );
  const filteredErrors = errors.filter(e =>
    !search ||
    e.error_message?.toLowerCase().includes(search.toLowerCase()) ||
    e.error_code?.toLowerCase().includes(search.toLowerCase()) ||
    e.function_name?.toLowerCase().includes(search.toLowerCase()) ||
    String(e.user_id).includes(search)
  );

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      {/* Page header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>🔐 Auditoría del Sistema</h1>
          <p>Registro de acciones y errores — campos sensibles cifrados en BD</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={fetchAll} disabled={loading}>🔄 Actualizar</button>
        </div>
      </div>

      {/* Counters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <div className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flex: 1 }}>
          <span style={{ fontSize: '1.5rem' }}>✅</span>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Acciones registradas</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--success)' }}>{loading ? '—' : logs.length}</div>
          </div>
        </div>
        <div className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flex: 1 }}>
          <span style={{ fontSize: '1.5rem' }}>⚠️</span>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Errores registrados</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: errors.length > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{loading ? '—' : errors.length}</div>
          </div>
        </div>
        <div className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', flex: 1 }}>
          <span style={{ fontSize: '1.5rem' }}>🔒</span>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cifrado</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary-light)' }}>Fernet AES-128</div>
          </div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', padding: 4 }}>
          {[
            { id: 'logs',   label: '✅ Logs de acciones', count: logs.length },
            { id: 'errors', label: '⚠️ Errores del sistema', count: errors.length },
          ].map(t => (
            <button key={t.id} type="button" onClick={() => { setTab(t.id); setSearch(''); setExpanded(null); }}
              style={{
                padding: '8px 16px', border: 'none', borderRadius: 'calc(var(--radius) - 2px)',
                fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                background: tab === t.id ? 'var(--bg-card)' : 'transparent',
                color: tab === t.id ? 'var(--text)' : 'var(--text-subtle)',
                boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
              }}>
              {t.label}
              <span style={{ marginLeft: 8, fontSize: '0.75rem', background: 'var(--bg-tertiary)', padding: '1px 7px', borderRadius: 10, color: 'var(--text-muted)' }}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <input
          className="form-input"
          style={{ flex: 1, minWidth: 200, maxWidth: 360 }}
          placeholder="Buscar por acción, usuario, código..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Error banner */}
      {error && <div className="alert alert-danger" style={{ marginBottom: 20 }}>⚠️ {error}</div>}

      {/* Loading */}
      {loading ? (
        <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
          <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
          Cargando registros de auditoría...
        </div>
      ) : (

        /* ── LOGS TAB ── */
        tab === 'logs' ? (
          <div className="card">
            {filteredLogs.length === 0 ? (
              <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>📋</div>
                <div style={{ fontWeight: 600 }}>No hay logs registrados todavía</div>
                <div style={{ fontSize: '0.875rem', marginTop: 4 }}>Las acciones de login y registro aparecerán aquí</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                      {['ID', 'Fecha', 'Usuario ID', 'Módulo', 'Acción', 'Tabla', 'Descripción'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-subtle)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((l, i) => (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border-light)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td style={{ padding: '10px 14px', color: 'var(--text-subtle)', fontFamily: 'monospace' }}>#{l.id}</td>
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{fmtDate(l.created_at)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {l.user_id
                            ? <span style={{ background: 'var(--primary-subtle)', color: 'var(--primary-light)', padding: '2px 8px', borderRadius: 99, fontSize: '0.75rem', fontWeight: 600 }}>UID {l.user_id}</span>
                            : <span style={{ color: 'var(--text-subtle)' }}>—</span>
                          }
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{l.module}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontWeight: 700, color: ACTION_COLORS[l.action] || 'var(--text)', padding: '2px 10px', borderRadius: 99, background: 'var(--bg-tertiary)', fontSize: '0.75rem' }}>
                            {l.action}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{l.table_name || '—'}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-muted)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (

        /* ── ERRORS TAB ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredErrors.length === 0 ? (
              <div className="card" style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 600 }}>No hay errores registrados</div>
                <div style={{ fontSize: '0.875rem', marginTop: 4 }}>El sistema funciona correctamente</div>
              </div>
            ) : (
              filteredErrors.map(e => (
                <div key={e.id} className="card" style={{ padding: '16px 20px', borderLeft: `3px solid ${ERROR_CODE_COLORS[e.error_code] || 'var(--border)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.6875rem', color: 'var(--text-subtle)' }}>#{e.id}</span>
                        {e.error_code && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 10px', borderRadius: 99, background: 'var(--bg-tertiary)', color: ERROR_CODE_COLORS[e.error_code] || 'var(--text-muted)' }}>
                            {e.error_code}
                          </span>
                        )}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{e.module}/{e.function_name}</span>
                        {e.user_id && (
                          <span style={{ fontSize: '0.75rem', background: 'var(--primary-subtle)', color: 'var(--primary-light)', padding: '2px 8px', borderRadius: 99 }}>UID {e.user_id}</span>
                        )}
                      </div>
                      {/* Message */}
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                        {e.error_message}
                      </div>
                      {/* Timestamp */}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{fmtDate(e.created_at)}</div>
                    </div>
                    {/* Stack trace toggle */}
                    {e.stack_trace && (
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                        style={{ flexShrink: 0, fontSize: '0.75rem' }}>
                        {expanded === e.id ? '▲ Ocultar trace' : '▼ Ver stack trace'}
                      </button>
                    )}
                  </div>
                  {/* Stack trace expandido */}
                  {expanded === e.id && e.stack_trace && (
                    <pre style={{
                      marginTop: 12, padding: '12px 14px',
                      background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)',
                      fontSize: '0.6875rem', color: 'var(--text-muted)',
                      overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      borderLeft: '3px solid var(--border)',
                      maxHeight: 340, overflowY: 'auto',
                    }}>
                      {e.stack_trace}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        )
      )}

      {/* Encryption badge */}
      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--primary-subtle)', borderRadius: 'var(--radius)', border: '1px solid rgba(99,102,241,0.2)', width: 'fit-content' }}>
        <span>🔐</span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--primary-light)' }}>error_message</strong> y <strong style={{ color: 'var(--primary-light)' }}>stack_trace</strong> se almacenan cifrados en BD con <strong>Fernet AES-128-CBC</strong> y se descifran en tiempo de consulta.
        </span>
      </div>
    </div>
  );
}
