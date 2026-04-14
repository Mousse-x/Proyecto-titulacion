import { useState, useEffect, useCallback } from 'react';
import DataTable from '../../components/common/DataTable';
import Modal, { ConfirmModal } from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import { ScoreCard } from '../../components/common/StatCard';
import { api } from '../../api/client';

const EMPTY = { name: '', full_name: '', city: '', province: '', type: 'Pública', website: '', is_active: true };

export default function UniversitiesPage() {
  const [univs, setUnivs]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [modal, setModal]       = useState(false);
  const [confirm, setConfirm]   = useState({ open: false, id: null });
  const [form, setForm]         = useState(EMPTY);
  const [detailView, setDetail] = useState(null);
  const [saving, setSaving]     = useState(false);

  const fetchUnivs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.universities.list();
      setUnivs(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar universidades. ¿Está el servidor activo?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUnivs(); }, [fetchUnivs]);

  const openCreate = () => { setSelected(null); setForm(EMPTY); setModal(true); };
  const openEdit   = (u)  => { setSelected(u); setForm({ name: u.name, full_name: u.full_name, city: u.city || '', province: u.province || '', type: u.type || 'Pública', website: u.website || '', is_active: u.is_active }); setModal(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (selected) {
        await api.universities.update(selected.id, form);
      } else {
        await api.universities.create(form);
      }
      setModal(false);
      await fetchUnivs();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.universities.remove(id);
      setConfirm({ open: false, id: null });
      await fetchUnivs();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar universidad.');
    }
  };

  const columns = [
    { key: 'name', label: 'Institución', render: (v, row) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 38, height: 38, borderRadius: 8, background: `${row.color}22`, border: `1px solid ${row.color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: 800, color: row.color, flexShrink: 0 }}>
          {row.logo_initials}
        </div>
        <div>
          <div style={{ fontWeight: 700, color: 'var(--text)' }}>{v}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{row.city}{row.province ? `, ${row.province}` : ''}</div>
        </div>
      </div>
    )},
    { key: 'type', label: 'Tipo', render: (v) => <Badge status={v} /> },
    { key: 'transparency_score', label: 'Índice', sortable: true,
      render: (v) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ScoreCard score={v} size={44} />
        </div>
      )
    },
    { key: 'is_active', label: 'Estado', render: (v) => <Badge status={v ? 'Activo' : 'Inactivo'} /> },
    { key: 'id', label: 'Acciones', sortable: false, render: (_, row) => (
      <div className="table-actions">
        <button className="btn btn-secondary btn-sm" onClick={() => setDetail(row)}>👁️</button>
        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>✏️</button>
        <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ open: true, id: row.id })}>🗑️</button>
      </div>
    )},
  ];

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Universidades</h1>
          <p>{loading ? 'Cargando...' : `${univs.length} instituciones registradas en el sistema`}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={fetchUnivs} disabled={loading}>🔄</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Agregar Universidad</button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
            Cargando universidades...
          </div>
        ) : error ? (
          <div className="alert alert-danger" style={{ margin: 24 }}>⚠️ {error}</div>
        ) : univs.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>🏛️</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No hay universidades registradas</div>
            <div style={{ fontSize: '0.875rem' }}>Agrega la primera institución con el botón "+ Agregar Universidad"</div>
          </div>
        ) : (
          <DataTable columns={columns} data={univs} searchKeys={['name', 'full_name', 'city', 'province']} />
        )}
      </div>

      {/* Detail modal */}
      {detailView && (
        <Modal isOpen={!!detailView} onClose={() => setDetail(null)} title={`🏛️ ${detailView.full_name || detailView.name}`} size="lg">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              ['Siglas', detailView.name],
              ['Nombre completo', detailView.full_name],
              ['Tipo', detailView.type],
              ['Ciudad', detailView.city],
              ['Provincia', detailView.province],
              ['Sitio web', detailView.website],
            ].map(([k, v]) => (
              <div key={k} style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius)', padding: '10px 14px' }}>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{k}</div>
                <div style={{ fontWeight: 600, color: 'var(--text)' }}>{v || '—'}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, padding: '16px', background: 'var(--primary-subtle)', borderRadius: 'var(--radius)', border: '1px solid rgba(99,102,241,0.2)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Índice de Transparencia</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--primary-light)', letterSpacing: '-0.04em' }}>{detailView.transparency_score ?? 0}</div>
          </div>
        </Modal>
      )}

      {/* Edit/Create modal */}
      <Modal isOpen={modal} onClose={() => setModal(false)}
        title={selected ? '✏️ Editar Universidad' : '➕ Nueva Universidad'}
        footer={<><button className="btn btn-secondary" onClick={() => setModal(false)} disabled={saving}>Cancelar</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button></>}
        size="lg"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[
            ['name', 'Siglas (ej: ESPOCH)', 'text'],
            ['full_name', 'Nombre completo', 'text'],
            ['city', 'Ciudad', 'text'],
            ['province', 'Provincia', 'text'],
            ['website', 'Sitio web', 'url'],
          ].map(([k, l, t]) => (
            <div className="form-group" key={k}>
              <label className="form-label">{l}</label>
              <input className="form-input" type={t} value={form[k] || ''} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} />
            </div>
          ))}
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
              <option>Pública</option>
              <option>Particular cofinanciada</option>
              <option>Particular autofinanciada</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24 }}>
            <input type="checkbox" id="univ-active" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
            <label htmlFor="univ-active" style={{ fontSize: '0.875rem', color: 'var(--text-muted)', cursor: 'pointer' }}>Universidad activa</label>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={confirm.open} onClose={() => setConfirm({ open: false, id: null })}
        onConfirm={() => handleDelete(confirm.id)}
        title="Eliminar universidad" message="¿Eliminar esta universidad y todos sus datos?" danger
      />
    </div>
  );
}
