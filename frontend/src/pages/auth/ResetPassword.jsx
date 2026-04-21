import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';

export default function ResetPassword() {
  const { token } = useParams();
  const navigate   = useNavigate();

  const [form, setForm]         = useState({ password: '', confirm: '' });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.password || !form.confirm) {
      setError('Completa todos los campos.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (form.password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await api.passwordReset.confirm(token, {
        password: form.password,
        confirm:  form.confirm,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo restablecer la contraseña. El enlace puede haber expirado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg" />

      {/* Left hero (igual que Login) */}
      <div className="login-left">
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div className="login-brand-icon">🏛️</div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ESPOCH · TESIS</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>SisTransp</div>
            </div>
          </div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 16, background: 'linear-gradient(135deg,#F1F5F9,#94A3B8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Transparencia<br />Institucional
          </h1>
          <p style={{ fontSize: '1.0625rem', color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 420 }}>
            Plataforma de evaluación del índice de transparencia en universidades públicas ecuatorianas.
          </p>
        </div>
        <div style={{ marginTop: 48, fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
          Escuela Superior Politécnica de Chimborazo · Facultad de Informática y Electrónica
        </div>
      </div>

      {/* Right — card */}
      <div className="login-right">
        <div className="login-card">
          {/* Brand */}
          <div className="login-brand">
            <div className="login-brand-icon">🏛️</div>
            <div className="login-brand-text">
              <h2>SisTransp</h2>
              <span>Sistema de Transparencia ESPOCH</span>
            </div>
          </div>

          {success ? (
            /* ── Estado de éxito ── */
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: 16 }}>🔐</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>
                ¡Contraseña actualizada!
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.6 }}>
                Tu contraseña ha sido restablecida correctamente. Ya puedes iniciar sesión con tu nueva contraseña.
              </p>
              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                onClick={() => navigate('/login')}
              >
                → Ir a iniciar sesión
              </button>
            </div>
          ) : (
            /* ── Formulario ── */
            <>
              <h2 className="login-title">Nueva contraseña</h2>
              <p className="login-subtitle">
                Elige una contraseña segura para tu cuenta.
              </p>

              <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
                <div className="form-group">
                  <label className="form-label" htmlFor="reset-password">Nueva contraseña</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="reset-password"
                      type={showPass ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Mínimo 6 caracteres"
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      required
                      style={{ paddingRight: 44 }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: '1rem',
                      }}
                    >
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="reset-confirm">Confirmar contraseña</label>
                  <input
                    id="reset-confirm"
                    type="password"
                    className="form-input"
                    placeholder="Repite tu nueva contraseña"
                    value={form.confirm}
                    onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                    required
                    autoComplete="new-password"
                    style={{
                      borderColor: form.confirm && form.password !== form.confirm
                        ? 'var(--danger)'
                        : form.confirm && form.password === form.confirm
                        ? 'var(--success)'
                        : undefined,
                    }}
                  />
                  {form.confirm && form.password !== form.confirm && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: 4 }}>
                      Las contraseñas no coinciden
                    </span>
                  )}
                </div>

                {error && (
                  <div className="alert alert-danger" style={{ borderRadius: 'var(--radius)' }}>
                    ⚠️ {error}
                  </div>
                )}

                <button
                  id="btn-reset-submit"
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={loading}
                  style={{ width: '100%', marginTop: 4 }}
                >
                  {loading ? (
                    <><span className="spinner" style={{ width: 18, height: 18 }} /> Guardando...</>
                  ) : '🔒 Establecer nueva contraseña'}
                </button>
              </form>

              <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.8125rem', color: 'var(--text-subtle)' }}>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit' }}
                >
                  ← Volver al inicio de sesión
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
