import { useState, useEffect, useCallback } from 'react';
import DataTable from '../../components/common/DataTable';
import Modal, { ConfirmModal } from '../../components/common/Modal';
import Badge from '../../components/common/Badge';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import ErrorNotice from '../../components/common/ErrorNotice';
import { useConfirm, useToast } from '../../context/FeedbackContext';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  const [initialForm, setInitialForm] = useState(EMPTY);
  const [touched, setTouched]   = useState(false);
  const toast = useToast();
  const confirmAction = useConfirm();

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
      setError(err);
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

  const openCreate = () => { setEditing(null); setForm(EMPTY); setInitialForm(EMPTY); setTouched(false); setModal(true); };
  const openEdit   = (u)  => {
    const next = { full_name: u.full_name, email: u.email, role_id: u.role_id, is_active: u.is_active };
    setEditing(u);
    setForm(next);
    setInitialForm(next);
    setTouched(false);
    setModal(true);
  };

  const fieldErrors = {};
  if (!form.full_name.trim()) fieldErrors.full_name = 'El nombre completo es obligatorio.';
  else if (form.full_name.trim().split(/\s+/).length < 2) fieldErrors.full_name = 'Escribe al menos un nombre y un apellido.';
  if (!editing) {
    if (!form.email.trim()) fieldErrors.email = 'El correo electrónico es obligatorio.';
    else if (!EMAIL_RE.test(form.email.trim())) fieldErrors.email = 'Formato inválido. Ejemplo: usuario@institucion.edu.ec';
    else if (users.some((u) => String(u.email).toLowerCase() === form.email.trim().toLowerCase())) fieldErrors.email = 'Ya existe un usuario con este correo.';
  }
  const hasErrors = Object.keys(fieldErrors).length > 0;
  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const showError = (key) => (touched || form[key] !== initialForm[key]) && fieldErrors[key];

  const handleSave = async () => {
    setTouched(true);
    if (hasErrors) {
      toast.warning({ title: 'Revisa el formulario', message: 'Hay campos obligatorios vacíos o con formato inválido; están marcados en rojo.' });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.users.update(editing.id, {
          ...form,
          _requester_id: currentUser?.id,  // ← identificador del actor
        });
      } else {
        await api.users.create({ ...form, full_name: form.full_name.trim(), email: form.email.trim(), password: 'admin123' });
      }
      setModal(false);
      toast.success({ title: editing ? 'Usuario actualizado' : 'Usuario creado', message: `${form.full_name.trim()} se guardó correctamente.` });
      await fetchUsers();
    } catch (err) {
      toast.apiError(err, 'No se pudo guardar el usuario. Tus datos siguen en el formulario.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const target = users.find((u) => u.id === id);
      await api.users.remove(id);
      setConfirm({ open: false, id: null });
      toast.success({ title: 'Usuario eliminado', message: `${target?.full_name || 'El usuario'} ya no tiene acceso al sistema.` });
      await fetchUsers();
    } catch (err) {
      toast.apiError(err, 'No se pudo eliminar el usuario.');
    }
  };

  const handleToggle = async (u) => {
    if (u.is_active) {
      const ok = await confirmAction({
        title: 'Desactivar cuenta',
        message: `${u.full_name} no podrá iniciar sesión hasta que vuelvas a activar su cuenta. Sus datos se conservan.`,
        confirmLabel: 'Desactivar cuenta',
      });
      if (!ok) return;
    }
    try {
      await api.users.update(u.id, {
        is_active: !u.is_active,
        _requester_id: currentUser?.id,
      });
      toast.success({ title: u.is_active ? 'Cuenta desactivada' : 'Cuenta activada', message: u.full_name });
      await fetchUsers();
    } catch (err) {
      toast.apiError(err, 'No se pudo cambiar el estado del usuario.');
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
              aria-label={getEditTooltip(row)}
              style={protected_ ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >✏️ Editar</button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => !protected_ && handleToggle(row)}
              disabled={protected_}
              title={getToggleTooltip(row)}
              aria-label={getToggleTooltip(row)}
              style={protected_ ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >
              {row.is_active ? '🔒 Desactivar' : '🔓 Activar'}
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => !cannotDelete && setConfirm({ open: true, id: row.id })}
              disabled={cannotDelete}
              title={getDeleteTooltip(row)}
              aria-label={getDeleteTooltip(row)}
              style={cannotDelete ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
            >🗑️ Eliminar</button>
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
          <button className="btn btn-secondary" onClick={fetchUsers} disabled={loading} title="Volver a cargar la lista">↻ Actualizar</button>
          <button className="btn btn-primary" onClick={openCreate}>+ Nuevo usuario</button>
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
          <ErrorNotice error={error} fallback="No se pudieron cargar los usuarios." onRetry={fetchUsers} style={{ margin: 24 }} />
        ) : users.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>👥</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No hay usuarios registrados</div>
            <div style={{ fontSize: '0.875rem' }}>Crea el primer usuario con el botón «+ Nuevo usuario».</div>
          </div>
        ) : (
          <DataTable columns={columns} data={users} searchKeys={['full_name', 'email', 'role_name']} searchPlaceholder="Buscar por nombre, correo o rol" emptyMessage="No hay usuarios registrados" />
        )}
      </div>

      {/* New / Edit Modal */}
      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        dirty={isDirty}
        busy={saving}
        title={editing ? `Editar usuario · ${editing.full_name}` : 'Nuevo usuario'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setModal(false)} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || (editing && !isDirty)} title={editing && !isDirty ? 'No hay cambios por guardar' : undefined}>
              {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Guardando...</> : (editing ? 'Guardar cambios' : 'Crear usuario')}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="form-legend">Los campos marcados con <span className="required-mark">*</span> son obligatorios.</p>
          <div className="form-group">
            <label className="form-label" htmlFor="user-name">Nombre completo<span className="required-mark" aria-hidden="true">*</span></label>
            <input id="user-name" className={`form-input${showError('full_name') ? ' is-invalid' : ''}`} value={form.full_name} required
              aria-invalid={!!showError('full_name')} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))} placeholder="Nombre Apellido" />
            {showError('full_name') && <div className="field-error">{fieldErrors.full_name}</div>}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="user-email">Correo electrónico<span className="required-mark" aria-hidden="true">*</span></label>
            <input id="user-email" className={`form-input${showError('email') ? ' is-invalid' : ''}`} type="email" value={form.email} required
              aria-invalid={!!showError('email')} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="usuario@institucion.edu.ec" disabled={!!editing} />
            {showError('email')
              ? <div className="field-error">{fieldErrors.email}</div>
              : editing && <div className="field-hint">El correo identifica la cuenta y no se puede modificar.</div>}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="user-role">Rol<span className="required-mark" aria-hidden="true">*</span></label>
            <select
              id="user-role"
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
        confirmLabel="Eliminar usuario"
        message={`¿Eliminar a ${users.find((u) => u.id === confirm.id)?.full_name || 'este usuario'}? Perderá el acceso al sistema. Si solo quieres impedir temporalmente su acceso, usa «Desactivar».`}
        danger
      />
    </div>
  );
}
