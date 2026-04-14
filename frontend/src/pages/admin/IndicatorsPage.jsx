import { useState, useEffect, useCallback } from 'react';
import DataTable from '../../components/common/DataTable';
import Modal, { ConfirmModal } from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import { api } from '../../api/client';

const FRAMEWORKS = ['LOTAIP', 'OGP', 'OCDE', 'ODS'];
const EMPTY = { code: '', name: '', article: '', category: '', weight: 3.0, description: '', is_active: true };

export default function IndicatorsPage() {
  const [indicators, setIndicators] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [modal, setModal]         = useState(false);
  const [confirm, setConfirm]     = useState({ open: false, id: null });
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [filterCat, setFilter]    = useState('');
  const [saving, setSaving]       = useState(false);

  const fetchIndicators = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.indicators.list();
      setIndicators(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar indicadores. ¿Está el servidor activo?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchIndicators(); }, [fetchIndicators]);

  // Categorías únicas dinámicas desde la BD
  const categories = [...new Set(indicators.map(i => i.category).filter(Boolean))].sort();

  const filtered = indicators.filter(i =>
    !filterCat || i.category === filterCat
  );

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit   = (i)  => { setEditing(i); setForm({ ...i }); setModal(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.indicators.update(editing.id, form);
      } else {
        await api.indicators.create(form);
      }
      setModal(false);
      await fetchIndicators();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const totalWeight = indicators.reduce((s, i) => s + (parseFloat(i.weight) || 0), 0).toFixed(1);

  const columns = [
    { key: 'code', label: 'Código',
      render: (v) => <span style={{ fontFamily: 'monospace', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: 4, fontSize: '0.8125rem', color: 'var(--primary-light)' }}>{v}</span>
    },
    { key: 'name', label: 'Indicador', render: (v, row) => (
      <div>
        <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '0.875rem' }}>{v}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{row.article}</div>
      </div>
    )},
    { key: 'category', label: 'Categoría', render: (v) => v ? <span className="tag">{v}</span> : <span style={{ color: 'var(--text-subtle)' }}>—</span> },
    { key: 'framework', label: 'Marco', render: (v) => <Badge status={v || 'LOTAIP'} /> },
    { key: 'weight', label: 'Peso %', render: (v) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{parseFloat(v).toFixed(1)}%</span>
        <div className="progress-bar" style={{ width: 48 }}>
          <div className="progress-fill" style={{ width: `${(parseFloat(v) / 10) * 100}%` }} />
        </div>
      </div>
    )},
    { key: 'is_active', label: 'Estado', render: (v) => <Badge status={v ? 'Activo' : 'Inactivo'} /> },
    { key: 'id', label: 'Acciones', sortable: false, render: (_, row) => (
      <div className="table-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>✏️</button>
        <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ open: true, id: row.id })}>🗑️</button>
      </div>
    )},
  ];

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Indicadores LOTAIP</h1>
          <p>{loading ? 'Cargando...' : `${indicators.length} indicadores · Peso total: ${totalWeight}%`}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={fetchIndicators} disabled={loading}>🔄</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Nuevo Indicador</button>
        </div>
      </div>

      {/* Filters */}
      {categories.length > 0 && (
        <div className="search-bar" style={{ marginBottom: 20 }}>
          <select className="form-input" style={{ width: 'auto' }} value={filterCat} onChange={e => setFilter(e.target.value)}>
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c}>{c}</option>)}
          </select>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-subtle)' }}>{filtered.length} indicadores</span>
        </div>
      )}

      {/* Category summary pills */}
      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {categories.map(cat => {
            const count  = indicators.filter(i => i.category === cat).length;
            const weight = indicators.filter(i => i.category === cat).reduce((s, i) => s + (parseFloat(i.weight) || 0), 0).toFixed(1);
            return (
              <div key={cat} className="card card-sm" style={{ padding: '8px 14px', cursor: 'pointer' }} onClick={() => setFilter(f => f === cat ? '' : cat)}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{cat}</div>
                <div style={{ fontWeight: 700, color: 'var(--text)', display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  {count} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-subtle)' }}>· {weight}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
            Cargando indicadores...
          </div>
        ) : error ? (
          <div className="alert alert-danger" style={{ margin: 24 }}>⚠️ {error}</div>
        ) : indicators.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No hay indicadores registrados</div>
            <div style={{ fontSize: '0.875rem' }}>Los indicadores LOTAIP aparecerán aquí cuando estén cargados en la base de datos</div>
          </div>
        ) : (
          <DataTable columns={columns} data={filtered} searchKeys={['code', 'name', 'article', 'category']} />
        )}
      </div>

      {/* Modal */}
      <Modal isOpen={modal} onClose={() => setModal(false)}
        title={editing ? '✏️ Editar Indicador' : '➕ Nuevo Indicador'}
        footer={<><button className="btn btn-secondary" onClick={() => setModal(false)} disabled={saving}>Cancelar</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button></>}
        size="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Código *</label>
            <input className="form-input" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="LOT-7a" />
          </div>
          <div className="form-group">
            <label className="form-label">Artículo LOTAIP</label>
            <input className="form-input" value={form.article} onChange={e => setForm(p => ({ ...p, article: e.target.value }))} placeholder="Art. 7 Lit. a)" />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Nombre del indicador *</label>
            <input className="form-input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">Descripción</label>
            <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Categoría</label>
            <input className="form-input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="Ej: Financiero" />
          </div>
          <div className="form-group">
            <label className="form-label">Peso (%) — total debe ser 100</label>
            <input className="form-input" type="number" min="0" max="20" step="0.5" value={form.weight} onChange={e => setForm(p => ({ ...p, weight: parseFloat(e.target.value) }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24 }}>
            <input type="checkbox" id="ind-active" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
            <label htmlFor="ind-active" style={{ fontSize: '0.875rem', color: 'var(--text-muted)', cursor: 'pointer' }}>Indicador activo</label>
          </div>
        </div>
      </Modal>

      <ConfirmModal isOpen={confirm.open} onClose={() => setConfirm({ open: false, id: null })}
        onConfirm={async () => {
          try { await api.indicators.remove(confirm.id); setConfirm({ open: false, id: null }); await fetchIndicators(); }
          catch { alert('Error al eliminar indicador.'); }
        }}
        title="Eliminar indicador" message="¿Eliminar este indicador? Se perderán todas las puntuaciones asociadas." danger
      />
    </div>
  );
}
