import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { EyeIcon, EyeOffIcon } from '../../components/common/ActionIcons';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>\-\_=+\[\]]).{8,}$/;
const SPECIAL_REGEX = /[!@#$%^&*(),.?":{}|<>\-\_=+\[\]]/;

export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState({ password: '', confirm: '' });
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const isLen = /.{8,}/.test(form.password);
  const isUpper = /[A-Z]/.test(form.password);
  const isLower = /[a-z]/.test(form.password);
  const isNum = /\d/.test(form.password);
  const isSpecial = SPECIAL_REGEX.test(form.password);
  const passwordsMatch = form.confirm && form.password === form.confirm;
  const passwordsMismatch = form.confirm && form.password !== form.confirm;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.password || !form.confirm) {
      setError('Completa todos los campos.');
      return;
    }
    if (form.password.length > 128) {
      setError('La contrasena no debe exceder 128 caracteres.');
      return;
    }
    if (!PASSWORD_REGEX.test(form.password)) {
      setError('La contrasena no cumple con los requisitos minimos de seguridad.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Las contrasenas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      await api.passwordReset.confirm(token, {
        password: form.password,
        confirm: form.confirm,
      });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo restablecer la contrasena. El enlace puede haber expirado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg" />

      <div className="login-left">
        <div style={{ marginBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div className="login-brand-icon">ST</div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>ESPOCH ? TESIS</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>SisTransp</div>
            </div>
          </div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 16, background: 'linear-gradient(135deg,#F1F5F9,#94A3B8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Transparencia<br />Institucional
          </h1>
          <p style={{ fontSize: '1.0625rem', color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 420 }}>
            Plataforma de evaluacion del indice de transparencia en universidades publicas ecuatorianas.
          </p>
        </div>
        <div style={{ marginTop: 48, fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
          Escuela Superior Politecnica de Chimborazo ? Facultad de Informatica y Electronica
        </div>
      </div>

      <div className="login-right">
        <div className="login-card">
          <div className="login-brand">
            <div className="login-brand-icon">ST</div>
            <div className="login-brand-text">
              <h2>SisTransp</h2>
              <span>Sistema de Transparencia ESPOCH</span>
            </div>
          </div>

          {success ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>
                Contrasena actualizada
              </div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.6 }}>
                Tu contrasena ha sido restablecida correctamente. Ya puedes iniciar sesion con tu nueva contrasena.
              </p>
              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                onClick={() => navigate('/login')}
              >
                Ir a iniciar sesion
              </button>
            </div>
          ) : (
            <>
              <h2 className="login-title">Nueva contrasena</h2>
              <p className="login-subtitle">
                Usa los mismos requisitos de seguridad del registro de usuario.
              </p>

              <form className="login-form" onSubmit={handleSubmit} autoComplete="off">
                <div className="form-group">
                  <label className="form-label" htmlFor="reset-password">Nueva contrasena</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="reset-password"
                      type={showPass ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Minimo 8 caracteres"
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      required
                      maxLength={128}
                      style={{ paddingRight: 44 }}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      aria-label={showPass ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4,
                      }}
                    >
                      {showPass ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </div>

                <div className="password-rules">
                  <div style={{ marginBottom: 6, fontWeight: 600 }}>Tu contrasena debe contener:</div>
                  <ul className="password-rules-list">
                    <li style={{ color: isLen ? 'var(--success)' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isLen ? 'OK' : '?'} Minimo 8 caracteres
                    </li>
                    <li style={{ color: isUpper ? 'var(--success)' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isUpper ? 'OK' : '?'} Una letra mayuscula
                    </li>
                    <li style={{ color: isLower ? 'var(--success)' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isLower ? 'OK' : '?'} Una letra minuscula
                    </li>
                    <li style={{ color: isNum ? 'var(--success)' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isNum ? 'OK' : '?'} Un numero
                    </li>
                    <li style={{ color: isSpecial ? 'var(--success)' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {isSpecial ? 'OK' : '?'} Un caracter especial
                    </li>
                  </ul>
                </div>

                <div className="form-group" style={{ marginTop: 16 }}>
                  <label className="form-label" htmlFor="reset-confirm">Confirmar contrasena</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="reset-confirm"
                      type={showConfirmPass ? 'text' : 'password'}
                      className="form-input"
                      placeholder="Repite tu nueva contrasena"
                      value={form.confirm}
                      onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                      required
                      autoComplete="new-password"
                      style={{
                        paddingRight: 44,
                        borderColor: passwordsMismatch
                          ? 'var(--danger)'
                          : passwordsMatch
                          ? 'var(--success)'
                          : undefined,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPass(v => !v)}
                      aria-label={showConfirmPass ? 'Ocultar confirmacion' : 'Mostrar confirmacion'}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4,
                      }}
                    >
                      {showConfirmPass ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                  {passwordsMismatch && (
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--danger)', marginTop: 4 }}>
                      Las contrasenas no coinciden
                    </span>
                  )}
                </div>

                {error && (
                  <div className="alert alert-danger" style={{ borderRadius: 'var(--radius)' }}>
                    {error}
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
                  ) : 'Establecer nueva contrasena'}
                </button>
              </form>

              <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.8125rem', color: 'var(--text-subtle)' }}>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit' }}
                >
                  Volver al inicio de sesion
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
