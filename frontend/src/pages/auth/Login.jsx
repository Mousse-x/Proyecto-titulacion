import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

const ROLE_REDIRECTS = { 1: '/admin/dashboard', 2: '/university/dashboard', 3: '/university/dashboard', 4: '/auditor/dashboard' };

export default function Login() {
  const { login, loading, error, errorData } = useAuth();
  const navigate = useNavigate();

  // Tab: 'login' | 'register' | 'forgot'
  const [tab, setTab] = useState('login');

  // Login form
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPass, setShowPass] = useState(false);

  // Register form
  const [regForm, setRegForm] = useState({ fullName: '', email: '', password: '', confirm: '' });
  const [showRegPass, setShowRegPass] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState(null);
  const [regSuccess, setRegSuccess] = useState(false);

  // Forgot password form
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState(null);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotDevLink, setForgotDevLink] = useState(null);  // solo en desarrollo

  // ── Login ──────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    const ok = await login(form.email, form.password);
    if (ok) {
      const saved = JSON.parse(sessionStorage.getItem('auth_user') || 'null');
      navigate(ROLE_REDIRECTS[saved?.role_id] || '/login');
    }
  };

  // ── Register ───────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    setRegError(null);

    if (!regForm.fullName.trim() || !regForm.email.trim() || !regForm.password) {
      setRegError('Todos los campos son obligatorios.');
      return;
    }
    if (regForm.password !== regForm.confirm) {
      setRegError('Las contraseñas no coinciden.');
      return;
    }
    if (regForm.password.length < 6) {
      setRegError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setRegLoading(true);
    try {
      await api.auth.register({
        fullName: regForm.fullName.trim(),
        email: regForm.email.trim().toLowerCase(),
        password: regForm.password,
      });
      setRegSuccess(true);
      setRegForm({ fullName: '', email: '', password: '', confirm: '' });
    } catch (err) {
      setRegError(err.response?.data?.error || 'Error al registrar. Intente de nuevo.');
    } finally {
      setRegLoading(false);
    }
  };

  // ── Forgot password ────────────────────────────────────────────
  const handleForgot = async (e) => {
    e.preventDefault();
    setForgotError(null);

    const emailTrimmed = forgotEmail.trim().toLowerCase();
    if (!emailTrimmed) {
      setForgotError('Ingresa tu correo electrónico.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await api.passwordReset.request(emailTrimmed);
      setForgotSent(true);
      // En desarrollo el backend devuelve el link directo
      if (res.data?.dev_reset_link) {
        setForgotDevLink(res.data.dev_reset_link);
      }
    } catch (err) {
      setForgotError(err.response?.data?.error || 'No se pudo enviar el correo. Intente de nuevo.');
    } finally {
      setForgotLoading(false);
    }
  };

  const switchTab = (newTab) => {
    setTab(newTab);
    setForgotError(null);
    setForgotSent(false);
    setForgotEmail('');
    setForgotDevLink(null);
    setRegError(null);
    setRegSuccess(false);
  };


  return (
    <div className="login-page">
      {/* Animated background */}
      <div className="login-bg" />

      {/* Left — hero section */}
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
            Plataforma de evaluación del índice de transparencia en universidades públicas ecuatorianas, basada en LOTAIP y criterios internacionales OGP, OCDE y ODS.
          </p>
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {['📊 Indicadores LOTAIP', '⚖️ Ponderación Multicriteria', '🏆 Rankings Nacionales', '📁 Carga Documental', '🔍 Auditoría en línea', '📈 OGP · OCDE · ODS'].map(f => (
            <span key={f} className="tag" style={{ fontSize: '0.8125rem' }}>{f}</span>
          ))}
        </div>

        <div style={{ marginTop: 48, fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
          Escuela Superior Politécnica de Chimborazo · Facultad de Informática y Electrónica
        </div>
      </div>

      {/* Right — card with tabs */}
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

          {/* Tabs — solo login y register, forgot es un panel oculto */}
          {tab !== 'forgot' && (
            <div style={{
              display: 'flex', gap: 4,
              background: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius)',
              padding: 4,
              marginBottom: 24,
            }}>
              {[
                { id: 'login', label: '→ Iniciar sesión' },
                { id: 'register', label: '✦ Registrarse' },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => switchTab(t.id)}
                  style={{
                    flex: 1, padding: '9px 0', border: 'none', borderRadius: 'calc(var(--radius) - 2px)',
                    fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: tab === t.id ? 'var(--bg-card)' : 'transparent',
                    color: tab === t.id ? 'var(--text)' : 'var(--text-subtle)',
                    boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.2)' : 'none',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* ── LOGIN PANEL ── */}
          {tab === 'login' && (
            <>
              {errorData?.error === 'ACCOUNT_LOCKED' ? (
                /* ── Panel cuenta bloqueada ── */
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>🔒</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f87171', marginBottom: 8 }}>
                    Cuenta bloqueada
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
                    Has superado el número máximo de intentos permitidos.
                    Tu cuenta ha sido bloqueada por seguridad.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      className="btn btn-primary btn-lg"
                      style={{ width: '100%' }}
                      onClick={() => switchTab('forgot')}
                    >
                      🔑 Restablecer mi contraseña
                    </button>
                    <a
                      href={`mailto:${errorData.support_email}`}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        padding: '11px 20px', borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)', background: 'var(--bg-tertiary)',
                        color: 'var(--text-muted)', fontSize: '0.875rem', fontWeight: 500,
                        textDecoration: 'none', transition: 'all 0.2s',
                      }}
                    >
                      ✉️ Contactar soporte: {errorData.support_email}
                    </a>
                  </div>
                </div>
              ) : (
                /* ── Formulario de login ── */
                <>
                  <h2 className="login-title">Bienvenido de vuelta</h2>
                  <p className="login-subtitle">Ingresa tus credenciales para acceder al sistema</p>

                  <form className="login-form" onSubmit={handleLogin} autoComplete="on">
                    <div className="form-group">
                      <label className="form-label" htmlFor="login-email">Correo institucional</label>
                      <input
                        id="login-email"
                        type="email"
                        className="form-input"
                        placeholder="usuario@institucion.edu.ec"
                        value={form.email}
                        onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                        required
                        autoComplete="username"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="login-password">Contraseña</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          id="login-password"
                          type={showPass ? 'text' : 'password'}
                          className="form-input"
                          placeholder="••••••••"
                          value={form.password}
                          onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                          required
                          autoComplete="current-password"
                          style={{ paddingRight: 44 }}
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

                    {/* Error con intentos restantes */}
                    {error && (
                      <div className="alert alert-danger" style={{ borderRadius: 'var(--radius)' }}>
                        ⚠️ {error}
                        {errorData?.remaining != null && errorData.remaining > 0 && (
                          <span style={{ display: 'block', marginTop: 4, fontSize: '0.8rem', opacity: 0.85 }}>
                            Intentos restantes: <strong>{errorData.remaining}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    <button type="submit" className="btn btn-primary btn-lg" disabled={loading} style={{ width: '100%', marginTop: 4 }}>
                      {loading ? (
                        <><span className="spinner" style={{ width: 18, height: 18 }} /> Verificando...</>
                      ) : '→ Ingresar al Sistema'}
                    </button>
                  </form>

                  <p style={{ textAlign: 'center', marginTop: 16, fontSize: '0.8125rem', color: 'var(--text-subtle)' }}>
                    ¿No tienes cuenta?{' '}
                    <button type="button" onClick={() => switchTab('register')}
                      style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit' }}>
                      Regístrate aquí
                    </button>
                  </p>
                  <p style={{ textAlign: 'center', marginTop: 8, fontSize: '0.8125rem', color: 'var(--text-subtle)' }}>
                    <button type="button" onClick={() => switchTab('forgot')}
                      style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontWeight: 500, cursor: 'pointer', fontSize: 'inherit', textDecoration: 'underline' }}>
                      ¿Olvidaste tu contraseña?
                    </button>
                  </p>
                </>
              )}
            </>
          )}

          {/* ── REGISTER PANEL ── */}
          {tab === 'register' && (
            <>
              <h2 className="login-title">Crear cuenta</h2>
              <p className="login-subtitle">Regístrate como auditor del sistema de transparencia</p>

              {regSuccess ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>
                    ¡Cuenta creada exitosamente!
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 24 }}>
                    Tu cuenta ha sido registrada con el rol de <strong>Auditor</strong>. Ya puedes iniciar sesión.
                  </p>
                  <button className="btn btn-primary" onClick={() => { setTab('login'); setRegSuccess(false); }}>
                    → Ir a iniciar sesión
                  </button>
                </div>
              ) : (
                <form className="login-form" onSubmit={handleRegister} autoComplete="off">
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-name">Nombre completo *</label>
                    <input
                      id="reg-name"
                      type="text"
                      className="form-input"
                      placeholder="Nombre Apellido"
                      value={regForm.fullName}
                      onChange={e => setRegForm(p => ({ ...p, fullName: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-email">Correo electrónico *</label>
                    <input
                      id="reg-email"
                      type="email"
                      className="form-input"
                      placeholder="usuario@institucion.edu.ec"
                      value={regForm.email}
                      onChange={e => setRegForm(p => ({ ...p, email: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-password">Contraseña *</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="reg-password"
                        type={showRegPass ? 'text' : 'password'}
                        className="form-input"
                        placeholder="Mínimo 6 caracteres"
                        value={regForm.password}
                        onChange={e => setRegForm(p => ({ ...p, password: e.target.value }))}
                        required
                        style={{ paddingRight: 44 }}
                      />
                      <button type="button" onClick={() => setShowRegPass(v => !v)}
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: '1rem' }}>
                        {showRegPass ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="reg-confirm">Confirmar contraseña *</label>
                    <input
                      id="reg-confirm"
                      type="password"
                      className="form-input"
                      placeholder="Repite tu contraseña"
                      value={regForm.confirm}
                      onChange={e => setRegForm(p => ({ ...p, confirm: e.target.value }))}
                      required
                    />
                  </div>

                  {/* Role info badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                    background: 'var(--primary-subtle)', borderRadius: 'var(--radius)',
                    border: '1px solid rgba(99,102,241,0.2)',
                  }}>
                    <span style={{ fontSize: '1.25rem' }}>🔍</span>
                    <div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text)' }}>Rol asignado: Auditor</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>Acceso de lectura y análisis del sistema</div>
                    </div>
                  </div>

                  {regError && (
                    <div className="alert alert-danger" style={{ borderRadius: 'var(--radius)' }}>
                      ⚠️ {regError}
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary btn-lg" disabled={regLoading} style={{ width: '100%', marginTop: 4 }}>
                    {regLoading ? (
                      <><span className="spinner" style={{ width: 18, height: 18 }} /> Registrando...</>
                    ) : '✦ Crear cuenta'}
                  </button>
                </form>
              )}

              <p style={{ textAlign: 'center', marginTop: 16, fontSize: '0.8125rem', color: 'var(--text-subtle)' }}>
                ¿Ya tienes cuenta?{' '}
                <button type="button" onClick={() => switchTab('login')}
                  style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit' }}>
                  Inicia sesión
                </button>
              </p>
            </>
          )}

          {/* ── FORGOT PASSWORD PANEL ── */}
          {tab === 'forgot' && (
            <>
              {/* Back button */}
              <button
                type="button"
                onClick={() => switchTab('login')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
                  color: 'var(--text-subtle)', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 500,
                  padding: 0, marginBottom: 20,
                }}
              >
                ← Volver al inicio de sesión
              </button>

              {forgotSent ? (
                <div style={{ textAlign: 'center', padding: '24px 0' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 16 }}>📧</div>
                  <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>
                    ¡Solicitud enviada!
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
                    Si el correo está registrado en el sistema, recibirás un enlace para
                    restablecer tu contraseña. Revisa también tu carpeta de spam.
                  </p>

                  {/* Link de prueba — solo visible en desarrollo */}
                  {forgotDevLink && (
                    <div style={{
                      background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
                      borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 20, textAlign: 'left',
                    }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-light)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        🛠️ Modo desarrollo — link de prueba
                      </div>
                      <a
                        href={forgotDevLink}
                        style={{ fontSize: '0.8125rem', color: 'var(--primary-light)', wordBreak: 'break-all', lineHeight: 1.5 }}
                      >
                        {forgotDevLink}
                      </a>
                    </div>
                  )}

                  <button className="btn btn-primary" onClick={() => switchTab('login')}>
                    → Ir a iniciar sesión
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="login-title">Recuperar contraseña</h2>
                  <p className="login-subtitle">
                    Ingresa tu correo registrado y te enviaremos un enlace para restablecer tu contraseña.
                  </p>

                  <form className="login-form" onSubmit={handleForgot} autoComplete="off">
                    <div className="form-group">
                      <label className="form-label" htmlFor="forgot-email">Correo electrónico</label>
                      <input
                        id="forgot-email"
                        type="email"
                        className="form-input"
                        placeholder="usuario@institucion.edu.ec"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        required
                        autoComplete="email"
                      />
                    </div>

                    {forgotError && (
                      <div className="alert alert-danger" style={{ borderRadius: 'var(--radius)' }}>
                        ⚠️ {forgotError}
                      </div>
                    )}

                    <button
                      id="btn-forgot-submit"
                      type="submit"
                      className="btn btn-primary btn-lg"
                      disabled={forgotLoading}
                      style={{ width: '100%', marginTop: 4 }}
                    >
                      {forgotLoading ? (
                        <><span className="spinner" style={{ width: 18, height: 18 }} /> Enviando...</>
                      ) : '📧 Enviar enlace de recuperación'}
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
