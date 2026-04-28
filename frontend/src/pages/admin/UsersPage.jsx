import { useState, useEffect, useCallback } from 'react';
import DataTable from '../../components/common/DataTable';
import Modal, { ConfirmModal } from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const EMPTY = { full_name: '', email: '', role_id: 4, is_active: true };

// Roles estáticos como fallback si el endpoint falla
const DEFAULT_ROLES = [
  { id: 1, name: 'Administrador del Sistema' },
  { id: 2, name: 'Administrador Universitario' },
  { id: 3, name: 'Responsable de Unidad' },
  { id: 4, name: 'Auditor' },
];

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const [users, setUsers]       = useState([]);
  const [roles, setRoles]       = useState(DEFAULT_ROLES);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [modal, setModal]       = useState(false);
  const [confirm, setConfirm]   = useState({ open: false, id: null });
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);

  // ── Conteo de admins (role_id=1) para controlar el límite de 2 ──
  const adminCount = users.filter(u => u.role_id === 1).length;
  const adminLimitReached = adminCount >= 2;

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
    api.roles()
      .then(res => { if (Array.isArray(res.data) && res.data.length) setRoles(res.data); })
      .catch(() => {});
    fetchUsers();
  }, [fetchUsers]);

  // ── Helpers de protección ──────────────────────────────────────
  const isSelf        = (u) => u.id === currentUser?.id;
  const isSuperadmin  = (u) => u.is_superadmin === true;
  const isProtected   = (u) => isSelf(u) || isSuperadmin(u);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit   = (u)  => {
    setEditing(u);
    setForm({ full_name: u.full_name, email: u.email, role_id: u.role_id, is_active: u.is_active });
    setModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await api.users.update(editing.id, {
          ...form,
          _requester_id: currentUser?.id,  // ← identificador del actor
        });
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
      await api.users.update(u.id, {
        is_active: !u.is_active,
        _requester_id: currentUser?.id,
      });
      await fetchUsers();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al cambiar el estado del usuario.');
    }
  };

  // ── Tooltip de por qué está deshabilitado ─────────────────────
  const getEditTooltip = (u) => {
    if (isSelf(u))       return 'No puedes editar tu propia cuenta desde este panel';
    if (isSuperadmin(u)) return 'El superadministrador está protegido';
    return 'Editar usuario';
  };
  const getToggleTooltip = (u) => {
    if (isSelf(u))       return 'No puedes desactivar tu propia cuenta';
    if (isSuperadmin(u)) return 'El superadministrador siempre debe estar activo';
    return u.is_active ? 'Desactivar cuenta' : 'Activar cuenta';
  };
  const getDeleteTooltip = (u) => {
    if (isSuperadmin(u)) return 'El superadministrador no puede eliminarse';
    if (isSelf(u))       return 'No puedes eliminar tu propia cuenta';
    return 'Eliminar usuario';
  };

  const columns = [
    { key: 'full_name', label: '👤 Nombre completo', sortable: true,
      render: (v, row) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,var(--primary),var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', color: '#fff', flexShrink: 0 }}>
            {v.split(' ').slice(0, 2).map(n => n[0]).join('')}
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {v}
              {row.is_superadmin && (
                <span title="Superadministrador — protegido" style={{ fontSize: '0.65rem', background: 'linear-gradient(135deg,#f59e0b,#d97706)', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700, letterSpacing: '0.03em' }}>
                  SUPER
                </span>
              )}
              {isSelf(row) && (
                <span title="Eres tú" style={{ fontSize: '0.65rem', background: 'linear-gradient(135deg,var(--primary),var(--secondary))', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>
                  TÚ
                </span>
              )}
            </div>
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
      render: (_, row) => {
        const protected_ = isProtected(row);
        const cannotDelete = isSuperadmin(row) || isSelf(row);
        return (
          <div className="table-actions">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => !protected_ && openEdit(row)}
              disabled={protected_}
              title={getEditTooltip(row)}
              style={protected_ ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >✏️</button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => !protected_ && handleToggle(row)}
              disabled={protected_}
              title={getToggleTooltip(row)}
              style={protected_ ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >
              {row.is_active ? '🔒' : '🔓'}
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => !cannotDelete && setConfirm({ open: true, id: row.id })}
              disabled={cannotDelete}
              title={getDeleteTooltip(row)}
              style={cannotDelete ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >🗑️</button>
          </div>
        );
      }
    },
  ];

  // ── Aviso de límite de admins ─────────────────────────────────
  const adminLimitWarning = adminLimitReached && (
    <div className="alert alert-info" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
      🛡️ <span>Límite alcanzado: ya hay <strong>2 administradores del sistema</strong> (1 superadmin + 1 admin). Para añadir otro, primero elimina el admin secundario.</span>
    </div>
  );

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
              {r.id === 1 && (
                <span style={{ fontSize: '0.7rem', color: adminLimitReached ? 'var(--danger, #ef4444)' : 'var(--text-subtle)', fontWeight: 600 }}>
                  {adminLimitReached ? '(límite)' : `/ 2 máx`}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {adminLimitWarning}

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
            <select
              className="form-input"
              value={form.role_id}
              onChange={e => setForm(p => ({ ...p, role_id: Number(e.target.value) }))}
            >
              {roles.map(r => {
                // Deshabilitar role_id=1 si ya hay 2 admins (y no estamos editando a alguien que ya es admin)
                const isAdminRole = r.id === 1;
                const targetIsAlreadyAdmin = editing?.role_id === 1;
                const disabled = isAdminRole && adminLimitReached && !targetIsAlreadyAdmin;
                return (
                  <option key={r.id} value={r.id} disabled={disabled}>
                    {r.name}{disabled ? ' (límite alcanzado)' : ''}
                  </option>
                );
              })}
            </select>
            {form.role_id === 1 && adminLimitReached && editing?.role_id !== 1 && (
              <p style={{ fontSize: '0.8rem', color: 'var(--danger, #ef4444)', marginTop: 4 }}>
                ⚠️ Límite de 2 administradores alcanzado.
              </p>
            )}
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
