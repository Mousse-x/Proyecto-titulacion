import { useCallback, useEffect, useState } from 'react';
import { validationApi } from '../api/validation';

/**
 * Cola de enlaces que el verificador automático no pudo comprobar, por ejemplo
 * porque el sitio responde con una verificación anti-bots (Cloudflare). El
 * revisor abre el enlace en su navegador y decide en un clic; el backend
 * recalcula «Estado de verificables» con la regla de la Tabla 6.
 */
export default function LotaipLinkReviewQueue({ universityId, periodId, month, refreshKey, onDecided }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!universityId || !periodId) return;
    setLoading(true);
    try {
      const res = await validationApi.getPendingLinks(universityId, periodId, month);
      setItems(res.data.items || []);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar la cola de enlaces pendientes.');
    } finally {
      setLoading(false);
    }
  }, [universityId, periodId, month]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const decide = async (item, decision) => {
    const key = `${item.evidence_id}:${item.index}`;
    setBusyKey(key);
    setError('');
    try {
      await validationApi.decidePendingLink(item.evidence_id, item.index, {
        decision, observation: notes[key] || '',
      });
      await load();
      await onDecided?.();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar la decisión.');
    } finally {
      setBusyKey('');
    }
  };

  if (!items.length && !error) return null;

  return <section className="card" style={{ marginBottom: 16 }} aria-label="Enlaces pendientes de revisión manual">
    <div style={{ fontWeight: 800 }}>Enlaces pendientes de revisión manual ({items.length})</div>
    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: '4px 0 12px' }}>
      El verificador no pudo comprobar estos enlaces (por ejemplo, el sitio respondió con una verificación anti-bots).
      Abre cada enlace, contrástalo con el registro y decide. «Cumple» significa que es de libre acceso, corresponde
      al registro y es legible (Tabla 6).
    </p>
    {error && <div role="alert" className="alert alert-danger">{error}</div>}
    {loading && !items.length && <p>Cargando…</p>}
    <div style={{ display: 'grid', gap: 12 }}>
      {items.map((item) => {
        const key = `${item.evidence_id}:${item.index}`;
        const busy = busyKey === key;
        return <article key={key} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <strong>{item.format} · {item.format_name}</strong>
            <small style={{ color: 'var(--text-subtle)' }}>
              {item.document}{item.row ? `, fila ${item.row}` : ''}{item.http_status ? ` · HTTP ${item.http_status}` : ''}
              {item.bot_challenge ? ' · verificación anti-bots' : ''}
            </small>
          </div>
          <div style={{ fontSize: '0.8125rem', marginTop: 6, overflowWrap: 'anywhere' }}>
            <div><strong>Campo:</strong> {item.field}</div>
            <div><strong>Enlace:</strong> <a href={item.url} target="_blank" rel="noopener noreferrer">{item.url}</a></div>
            <div style={{ color: 'var(--text-muted)' }}><strong>Motivo:</strong> {item.reason}</div>
          </div>
          {Object.keys(item.record || {}).length > 0 && <dl style={{
            display: 'grid', gridTemplateColumns: 'minmax(140px, 30%) 1fr', gap: '4px 12px',
            fontSize: '0.8125rem', margin: '10px 0 0', padding: 10, background: 'var(--bg-card-hover)', borderRadius: 6,
          }}>
            {Object.entries(item.record).map(([label, value]) => <div key={label} style={{ display: 'contents' }}>
              <dt style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{label}</dt>
              <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd>
            </div>)}
          </dl>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => decide(item, 'SI')}>✓ Cumple</button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => decide(item, 'NO')}>✗ No cumple</button>
            <input className="form-input" style={{ flex: '1 1 220px' }} maxLength={2000}
              placeholder="Observación (opcional)" aria-label={`Observación para ${item.format}, fila ${item.row}`}
              value={notes[key] || ''} onChange={(e) => setNotes((current) => ({ ...current, [key]: e.target.value }))} />
          </div>
        </article>;
      })}
    </div>
  </section>;
}
