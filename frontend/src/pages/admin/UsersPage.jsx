import { useState, useEffect, useCallback } from 'react';
import DataTable from '../../components/common/DataTable';
import Modal, { ConfirmModal } from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import { api } from '../../api/client';

const EMPTY = { full_name: '', email: '', role_id: 4, is_active: true };

// Roles estáticos como fallback si el endpoint falla
const DEFAULT_ROLES = [
  { id: 1, name: 'Administrador del Sistema' },
  { id: 2, name: 'Administrador Universitario' },
  { id: 3, name: 'Responsable de Unidad' },
  { id: 4, name: 'Auditor' },
];

export default function UsersPage() {
  const [users, setUsers]       = useState([]);
  const [roles, setRoles]       = useState(DEFAULT_ROLES);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [modal, setModal]       = useState(false);
  const [confirm, setConfirm]   = useState({ open: false, id: null });
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.users.list();
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar usuarios. ¿Está el servidor activo?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Cargar roles desde el endpoint del backend
    api.roles()
      .then(res => { if (Array.isArray(res.data) && res.data.length) setRoles(res.data); })
      .catch(() => {}); // Usar DEFAULT_ROLES si falla

    fetchUsers();
  }, [fetchUsers]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit   = (u)  => { setEditing(u); setForm({ full_name: u.full_name, email: u.email, role_id: u.role_id, is_active: u.is_active }); setModal(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.users.update(editing.id, form);
      } else {
        await api.users.create({ ...form, password: 'admin123' });
      }
      setModal(false);
      await fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al guardar. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.users.remove(id);
      setConfirm({ open: false, id: null });
      await fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al eliminar usuario.');
    }
  };

  const handleToggle = async (u) => {
    try {
      await api.users.update(u.id, { is_active: !u.is_active });
      await fetchUsers();
    } catch (err) {
      alert('Error al cambiar el estado del usuario.');
    }
  };

  const columns = [
    { key: 'full_name', label: '👤 Nombre completo', sortable: true,
      render: (v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,var(--primary),var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', color: '#fff', flexShrink: 0 }}>
            {v.split(' ').slice(0, 2).map(n => n[0]).join('')}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{v}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{row.email}</div>
          </div>
        </div>
      )
    },
    { key: 'role_name', label: 'Rol', render: (v) => <Badge status={v} /> },
    { key: 'is_active', label: 'Estado', render: (v) => <Badge status={v ? 'Activo' : 'Inactivo'} /> },
    { key: 'last_login', label: 'Último acceso',
      render: (v) => <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{v ? new Date(v).toLocaleDateString('es-EC') : '—'}</span>
    },
    { key: 'id', label: 'Acciones', sortable: false,
      render: (_, row) => (
        <div className="table-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(row)}>✏️</button>
          <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(row)} title={row.is_active ? 'Desactivar' : 'Activar'}>
            {row.is_active ? '🔒' : '🔓'}
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ open: true, id: row.id })}>🗑️</button>
        </div>
      )
    },
  ];

  return (
    <div style={{ animation: 'slideIn 0.3s ease' }}>
      <div className="page-header">
        <div className="page-header-info">
          <h1>Gestión de Usuarios</h1>
          <p>{loading ? 'Cargando...' : `${users.length} usuarios registrados en el sistema`}</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={fetchUsers} disabled={loading}>🔄</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Nuevo Usuario</button>
        </div>
      </div>

      {/* Summary by role */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {roles.map(r => {
          const count = users.filter(u => u.role_id === r.id).length;
          return (
            <div key={r.id} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{r.name}</span>
              <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: '1.125rem' }}>{count}</span>
            </div>
          );
        })}
      </div>

      <div className="card">
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div className="spinner" style={{ width: 32, height: 32, margin: '0 auto 12px' }} />
            Cargando usuarios...
          </div>
        ) : error ? (
          <div className="alert alert-danger" style={{ margin: 24 }}>⚠️ {error}</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>👥</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No hay usuarios registrados</div>
            <div style={{ fontSize: '0.875rem' }}>Crea el primer usuario con el botón "+ Nuevo Usuario"</div>
          </div>
        ) : (
          <DataTable columns={columns} data={users} searchKeys={['full_name', 'email', 'role_name']} />
        )}
      </div>

      {/* New / Edit Modal */}
      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        title={editing ? '✏️ Editar Usuario' : '➕ Nuevo Usuario'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(false)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Guardando...</> : (editing ? 'Guardar cambios' : 'Crear usuario')}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Nombre completo *</label>
            <input className="form-input" value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Nombre Apellido" />
          </div>
          <div className="form-group">
            <label className="form-label">Correo electrónico *</label>
            <input className="form-input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="usuario@institucion.edu.ec" disabled={!!editing} />
          </div>
          <div className="form-group">
            <label className="form-label">Rol *</label>
            <select className="form-input" value={form.role_id} onChange={e => setForm(p => ({ ...p, role_id: Number(e.target.value) }))}>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="user-active" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} />
            <label htmlFor="user-active" style={{ fontSize: '0.875rem', color: 'var(--text-muted)', cursor: 'pointer' }}>Cuenta activa</label>
          </div>
          {!editing && (
            <div className="alert alert-info">
              ℹ️ La contraseña inicial será <strong>admin123</strong>. El usuario puede cambiarla al primer acceso.
            </div>
          )}
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmModal
        isOpen={confirm.open}
        onClose={() => setConfirm({ open: false, id: null })}
        onConfirm={() => handleDelete(confirm.id)}
        title="Eliminar usuario"
        message="¿Estás seguro de que deseas eliminar este usuario? Esta acción no se puede deshacer."
        danger
      />
    </div>
  );
}
