import { Fragment, useEffect, useMemo, useState } from 'react';
import client from '../../api/client';
import ErrorNotice from '../../components/common/ErrorNotice';

const PAGE_SIZE = 200;

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'medium' }) : '—');

const MODULE_LABELS = {
  auth: 'Autenticación', autenticacion: 'Autenticación', usuarios: 'Usuarios', universidades: 'Universidades',
  indicadores: 'Indicadores', ponderaciones: 'Ponderaciones', documentos: 'Documentos', evidences: 'Documentos',
  evaluacion: 'Evaluación', validation: 'Evaluación', feedback: 'Comentarios', reportes: 'Reportes', sistema: 'Sistema',
  scraper: 'Importación DPE',
};

const ACTION_LABELS = {
  LOGIN_ATTEMPT: 'Inicio de sesión (contraseña)', LOGIN_2FA: 'Inicio de sesión', LOGIN_BYPASS_2FA: 'Inicio de sesión',
  LOGOUT: 'Cierre de sesión', REGISTER: 'Registro de cuenta', REGISTRO: 'Registro de cuenta',
  PASSWORD_RESET_REQUESTED: 'Solicitud de nueva contraseña', PASSWORD_RESET_CONFIRMED: 'Contraseña restablecida',
  RECUPERAR_CLAVE: 'Recuperación de contraseña', VERIFICAR_2FA: 'Verificación 2FA',
  CREAR: 'Crear', ACTUALIZAR: 'Actualizar', ELIMINAR: 'Eliminar', ELIMINAR_MASIVO: 'Eliminar en bloque',
  ACTUALIZAR_MASIVO: 'Actualizar en bloque', ACTUALIZAR_PESOS: 'Cambiar ponderaciones', PLANTILLA: 'Plantilla LOTAIP',
  IMPORTAR: 'Importar desde DPE', DESCARGAR: 'Descargar archivo', EVALUAR: 'Evaluar', REINTENTAR: 'Reintentar evaluación',
  CANCELAR: 'Detener evaluación', LIMPIAR_CACHE: 'Limpiar caché', DECIDIR: 'Decidir enlace', REVISION_MANUAL: 'Revisión manual',
  REVISAR_CRITERIOS: 'Revisar criterios', VALIDATE_DOCUMENT: 'Evaluar documento', VALIDATE_ALL_UNIVERSITY: 'Evaluar universidad',
  CANCEL_LOTAIP_RUN: 'Detener evaluación', LOTAIP_MANUAL_REVIEW: 'Revisión manual', REVIEW_LOTAIP_CRITERIA: 'Revisar criterios',
  REVIEW_LOTAIP_LINK: 'Revisar enlace', SEND_FEEDBACK: 'Enviar comentario', UPDATE_FEEDBACK_STATUS: 'Atender comentario',
  EXPORTAR_REPORTE: 'Exportar reporte', VER_EVALUACION: 'Ver evaluación',
};

const humanize = (value = '') => {
  const text = String(value).replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const moduleLabel = (m) => MODULE_LABELS[m] || humanize(m || 'sistema');
const actionLabel = (a) => ACTION_LABELS[a] || humanize(a);

/* Tono visual de la acción: crear, cambiar, borrar, sesión o neutro. */
function actionTone(action = '') {
  if (/ELIMINAR|DELETE|LIMPIAR/.test(action)) return 'danger';
  if (/LOGIN|LOGOUT|REGIST|2FA|PASSWORD|CLAVE/.test(action)) return 'session';
  if (/CREAR|IMPORTAR|SEND|PLANTILLA/.test(action)) return 'create';
  if (/ACTUALIZAR|UPDATE|REVIEW|REVISAR|REVISION|DECIDIR|PESOS/.test(action)) return 'update';
  if (/EVALUAR|VALIDATE|REINTENTAR|CANCEL/.test(action)) return 'eval';
  return 'neutral';
}

function errorTone(code = '') {
  if (/HTTP_5|EXCEPCION|DB_ERROR|_ERROR$/.test(code)) return 'danger';
  if (/HTTP_403|WRONG_PASSWORD|LOCKED|INACTIVE|USER_NOT_FOUND/.test(code)) return 'session';
  return 'update';
}

const EMPTY_FILTERS = { q: '', module: '', action: '', code: '', user_id: '', from: '', to: '' };

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const cell = (v) => {
    const text = String(v ?? '');
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return String.fromCharCode(0xfeff) + [headers.join(';'), ...rows.map((r) => headers.map((h) => cell(r[h])).join(';'))].join('\n');
}

export default function AuditPage() {
  const [tab, setTab] = useState('logs');
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // La búsqueda de texto espera a que el usuario deje de escribir.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((f) => (f.q === query ? f : { ...f, q: query })), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const params = useMemo(() => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (!v) return;
      if (tab === 'logs' && k === 'code') return;
      if (tab === 'errors' && k === 'action') return;
      p[k] = v;
    });
    return p;
  }, [filters, tab]);

  const endpoint = tab === 'logs' ? '/audit/logs/' : '/audit/errors/';

  useEffect(() => {
    let cancelled = false;
    client.get('/audit/summary/')
      .then((res) => { if (!cancelled) setSummary(res.data); })
      .catch(() => { if (!cancelled) setSummary(null); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => { if (cancelled) return null; setLoading(true); setError(null); setExpanded(null); return client.get(endpoint, { params: { ...params, limit: PAGE_SIZE, offset: 0 } }); })
      .then((res) => {
        if (cancelled || !res) return;
        setRows(res.data.results || []);
        setTotal(res.data.total ?? (res.data.results || []).length);
      })
      .catch((err) => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [endpoint, params, reloadKey]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await client.get(endpoint, { params: { ...params, limit: PAGE_SIZE, offset: rows.length } });
      setRows((current) => [...current, ...(res.data.results || [])]);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const changeTab = (next) => {
    if (next === tab) return;
    setTab(next);
    setRows([]);
  };
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => { setFilters(EMPTY_FILTERS); setQuery(''); };
  const hasFilters = Object.entries(filters).some(([k, v]) => v && !(tab === 'logs' && k === 'code') && !(tab === 'errors' && k === 'action'));

  const exportCsv = () => {
    const data = tab === 'logs'
      ? rows.map((r) => ({ Fecha: fmtDate(r.created_at), Usuario: r.user_name || (r.user_id ? `#${r.user_id}` : 'Sin sesión'), Rol: r.user_role || '', Módulo: moduleLabel(r.module), Acción: actionLabel(r.action), Código: r.action, Vista: r.table_name || '', Registro: r.record_id ?? '', Detalle: r.description || '' }))
      : rows.map((r) => ({ Fecha: fmtDate(r.created_at), Usuario: r.user_name || (r.user_id ? `#${r.user_id}` : 'Sin sesión'), Módulo: moduleLabel(r.module), Código: r.error_code || '', Función: r.function_name || '', Mensaje: r.error_message || '' }));
    const blob = new Blob([toCsv(data)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `auditoria_${tab === 'logs' ? 'acciones' : 'errores'}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const options = summary?.options || { modules: [], actions: [], codes: [], users: [] };
  const maxModule = Math.max(1, ...(summary?.by_module || []).map((m) => m.total));

  const cards = [
    { label: 'Acciones hoy', value: summary?.logs_today },
    { label: 'Acciones · 7 días', value: summary?.logs_week },
    { label: 'Inicios de sesión · 7 días', value: summary?.logins_week },
    { label: 'Errores · 7 días', value: summary?.errors_week, tone: summary?.errors_week ? 'danger' : '' },
    { label: 'Accesos rechazados · 7 días', value: summary?.denied_week, tone: summary?.denied_week ? 'warn' : '' },
  ];

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Auditoría del sistema</h1>
          <p>Registro automático de todas las acciones que cambian datos, descargas, inicios de sesión y errores. Los mensajes de error se guardan cifrados.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setReloadKey((k) => k + 1)} disabled={loading}>ACTUALIZAR</button>
          <button className="btn btn-primary" onClick={exportCsv} disabled={loading || !rows.length}
            title={rows.length ? `Exporta las ${rows.length} filas cargadas` : 'No hay filas para exportar'}>EXPORTAR CSV</button>
        </div>
      </div>

      <div className="aud-cards">
        {cards.map((c) => (
          <div key={c.label} className={`aud-card${c.tone ? ` ${c.tone}` : ''}`}>
            <div className="aud-card-value">{c.value ?? '—'}</div>
            <div className="aud-card-label">{c.label}</div>
          </div>
        ))}
      </div>

      {summary && (
        <div className="aud-overview">
          <div className="card">
            <div className="aud-subtitle">Actividad por módulo · últimos 7 días</div>
            {(summary.by_module || []).length === 0 ? <p className="aud-muted">Sin actividad en los últimos 7 días.</p> : (
              <ul className="aud-bars">
                {summary.by_module.map((m) => (
                  <li key={m.module}>
                    <button type="button" onClick={() => { changeTab('logs'); setFilter('module', m.module); }} title={`Ver solo ${moduleLabel(m.module)}`}>
                      <span className="aud-bar-label">{moduleLabel(m.module)}</span>
                      <span className="aud-bar-track"><span style={{ width: `${(m.total / maxModule) * 100}%` }} /></span>
                      <span className="aud-bar-value">{m.total}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card">
            <div className="aud-subtitle">Usuarios más activos · últimos 7 días</div>
            {(summary.top_users || []).length === 0 ? <p className="aud-muted">Sin actividad de usuarios.</p> : (
              <ol className="aud-top">
                {summary.top_users.map((u) => (
                  <li key={u.user_id}>
                    <button type="button" onClick={() => { changeTab('logs'); setFilter('user_id', String(u.user_id)); }} title="Ver solo sus acciones">
                      <span>{u.name || `Usuario #${u.user_id}`}</span><strong>{u.total}</strong>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}

      <div className="ind-tabs" role="tablist" aria-label="Tipo de registro" style={{ marginTop: 4 }}>
        <button type="button" role="tab" aria-selected={tab === 'logs'} className={`ind-tab${tab === 'logs' ? ' active' : ''}`} onClick={() => changeTab('logs')}>
          Acciones<span className="ind-tab-count">{summary?.logs_total ?? '—'}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'errors'} className={`ind-tab${tab === 'errors' ? ' active' : ''}`} onClick={() => changeTab('errors')}>
          Errores y accesos rechazados<span className="ind-tab-count">{summary?.errors_total ?? '—'}</span>
        </button>
      </div>

      <div className="aud-filters">
        <input className="form-input aud-search" placeholder={tab === 'logs' ? 'Buscar en detalle, acción o usuario…' : 'Buscar en mensaje, código o usuario…'}
          value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar" />
        <select className="form-input" value={filters.module} onChange={(e) => setFilter('module', e.target.value)} aria-label="Módulo">
          <option value="">Todos los módulos</option>
          {options.modules.map((m) => <option key={m} value={m}>{moduleLabel(m)}</option>)}
        </select>
        {tab === 'logs' ? (
          <select className="form-input" value={filters.action} onChange={(e) => setFilter('action', e.target.value)} aria-label="Acción">
            <option value="">Todas las acciones</option>
            {options.actions.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
          </select>
        ) : (
          <select className="form-input" value={filters.code} onChange={(e) => setFilter('code', e.target.value)} aria-label="Código">
            <option value="">Todos los códigos</option>
            {options.codes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <select className="form-input" value={filters.user_id} onChange={(e) => setFilter('user_id', e.target.value)} aria-label="Usuario">
          <option value="">Todos los usuarios</option>
          {options.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <label className="aud-date">Desde<input type="date" className="form-input" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} /></label>
        <label className="aud-date">Hasta<input type="date" className="form-input" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} /></label>
        {hasFilters && <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>LIMPIAR FILTROS</button>}
      </div>

      <ErrorNotice error={error} fallback="No se pudieron cargar los registros de auditoría." onRetry={() => setReloadKey((k) => k + 1)} onDismiss={() => setError(null)} style={{ marginBottom: 16 }} />

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="aud-table-head">
          <span>{loading ? 'Cargando…' : `${rows.length} de ${total} registros`}</span>
        </div>
        {loading ? (
          <div className="empty-state" aria-busy="true"><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto 12px' }} /><h4>Cargando registros…</h4></div>
        ) : rows.length === 0 ? (
          <div className="empty-state"><h4>Sin registros</h4><p>{hasFilters ? 'No hay registros con estos filtros.' : 'Todavía no hay registros.'}</p></div>
        ) : (
          <div className="table-wrapper" style={{ border: 0, borderRadius: 0 }}>
            <table className="table aud-table">
              <thead>
                {tab === 'logs'
                  ? <tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Detalle</th></tr>
                  : <tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Código</th><th>Mensaje</th></tr>}
              </thead>
              <tbody>
                {rows.map((r) => {
                  const open = expanded === r.id;
                  const user = (
                    <td className="aud-user">
                      {r.user_name ? <><strong>{r.user_name}</strong>{r.user_role && <span>{r.user_role}</span>}</> : <span>{r.user_id ? `Usuario #${r.user_id}` : 'Sin sesión'}</span>}
                    </td>
                  );
                  return tab === 'logs' ? (
                    <tr key={r.id}>
                      <td className="aud-date-cell">{fmtDate(r.created_at)}</td>
                      {user}
                      <td><span className="aud-module">{moduleLabel(r.module)}</span></td>
                      <td><span className={`aud-chip tone-${actionTone(r.action)}`} title={r.action}>{actionLabel(r.action)}</span>
                        {r.record_id != null && <div className="aud-record">Registro #{r.record_id}</div>}</td>
                      <td className="aud-detail">{r.description || '—'}</td>
                    </tr>
                  ) : (
                    <Fragment key={r.id}>
                      <tr>
                        <td className="aud-date-cell">{fmtDate(r.created_at)}</td>
                        {user}
                        <td><span className="aud-module">{moduleLabel(r.module)}</span>{r.function_name && <div className="aud-record">{r.function_name}</div>}</td>
                        <td><span className={`aud-chip tone-${errorTone(r.error_code)}`}>{r.error_code || '—'}</span></td>
                        <td className="aud-detail">
                          {r.error_message}
                          {r.stack_trace && (
                            <button type="button" className="eval-link-btn" style={{ display: 'block', marginTop: 4 }} onClick={() => setExpanded(open ? null : r.id)}>
                              {open ? 'Ocultar traza' : 'Ver traza técnica'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr><td colSpan={5}><pre className="aud-trace">{r.stack_trace}</pre></td></tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && rows.length < total && (
          <div style={{ padding: 14, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-secondary btn-sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'CARGANDO…' : `CARGAR ${Math.min(PAGE_SIZE, total - rows.length)} MÁS`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
