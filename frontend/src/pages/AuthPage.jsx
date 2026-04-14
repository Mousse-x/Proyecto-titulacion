import { useState } from "react";
import api from "../services/api";
import "./AuthPage.css";

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState("login");
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loginError, setLoginError] = useState("");
  const [registerError, setRegisterError] = useState("");
  const [registerSuccess, setRegisterSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showRegPass, setShowRegPass] = useState(false);
  const [showRegConfPass, setShowRegConfPass] = useState(false);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setLoginError("");
    setRegisterError("");
    setRegisterSuccess("");
  };

  const handleLoginChange = (e) => {
    setLoginForm({ ...loginForm, [e.target.name]: e.target.value });
  };

  const handleRegisterChange = (e) => {
    setRegisterForm({ ...registerForm, [e.target.name]: e.target.value });
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    setLoading(true);
    try {
      const response = await api.post("/api/login/", loginForm);
      localStorage.setItem("user", JSON.stringify(response.data.user));
      // TODO: redirect to dashboard
      alert(`👋 ¡Bienvenido, ${response.data.user.name}!`);
    } catch (err) {
      setLoginError(err.response?.data?.error || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegisterError("");
    setRegisterSuccess("");

    if (registerForm.password !== registerForm.confirmPassword) {
      setRegisterError("Las contraseñas no coinciden.");
      return;
    }
    if (registerForm.password.length < 8) {
      setRegisterError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post("/api/register/", registerForm);
      setRegisterSuccess(response.data.message || "¡Cuenta creada exitosamente!");
      setRegisterForm({ fullName: "", email: "", password: "", confirmPassword: "" });
    } catch (err) {
      setRegisterError(err.response?.data?.error || "Error al registrarse");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">
      {/* Animated background blobs */}
      <div className="auth-bg">
        <div className="blob blob-1" />
        <div className="blob blob-2" />
        <div className="blob blob-3" />
      </div>

      <div className="auth-wrapper">

        {/* Logo / Brand */}
        <div className="auth-brand">
          <div className="auth-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="10" fill="url(#logoGrad)" />
              <path d="M8 22L16 10L24 22H8Z" fill="white" opacity="0.9" />
              <circle cx="16" cy="10" r="3" fill="white" />
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h1 className="auth-brand-name">TransparenciaUni</h1>
            <p className="auth-brand-tagline">Sistema de evaluación universitaria</p>
          </div>
        </div>

        {/* Card */}
        <div className="auth-card">

          {/* Tabs */}
          <div className="auth-tabs" role="tablist">
            <button
              id="tab-login"
              role="tab"
              aria-selected={activeTab === "login"}
              className={`auth-tab ${activeTab === "login" ? "active" : ""}`}
              onClick={() => handleTabChange("login")}
            >
              Iniciar sesión
            </button>
            <button
              id="tab-register"
              role="tab"
              aria-selected={activeTab === "register"}
              className={`auth-tab ${activeTab === "register" ? "active" : ""}`}
              onClick={() => handleTabChange("register")}
            >
              Crear cuenta
            </button>
            <div className={`auth-tab-indicator ${activeTab === "register" ? "right" : ""}`} />
          </div>

          {/* ─── LOGIN PANEL ─── */}
          <div
            className={`auth-panel ${activeTab === "login" ? "visible" : "hidden"}`}
            role="tabpanel"
            aria-labelledby="tab-login"
          >
            <div className="auth-panel-header">
              <h2 className="auth-panel-title">¡Bienvenido de vuelta!</h2>
              <p className="auth-panel-sub">Ingresa tus credenciales para continuar</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="auth-form" noValidate>
              <div className="field-group">
                <label htmlFor="login-email" className="field-label">Correo electrónico</label>
                <div className="field-input-wrap">
                  <span className="field-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                  </span>
                  <input
                    id="login-email"
                    type="email"
                    name="email"
                    placeholder="tu@correo.com"
                    value={loginForm.email}
                    onChange={handleLoginChange}
                    className="field-input"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="login-password" className="field-label">Contraseña</label>
                <div className="field-input-wrap">
                  <span className="field-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    id="login-password"
                    type={showLoginPass ? "text" : "password"}
                    name="password"
                    placeholder="••••••••"
                    value={loginForm.password}
                    onChange={handleLoginChange}
                    className="field-input"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="field-eye"
                    onClick={() => setShowLoginPass(!showLoginPass)}
                    aria-label={showLoginPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showLoginPass ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="auth-alert auth-alert--error" role="alert">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {loginError}
                </div>
              )}

              <button
                id="btn-login-submit"
                type="submit"
                className="auth-btn primary"
                disabled={loading}
              >
                {loading ? (
                  <span className="btn-spinner" />
                ) : (
                  <>
                    Ingresar
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </>
                )}
              </button>
            </form>

            <p className="auth-switch">
              ¿No tienes cuenta?{" "}
              <button className="auth-link" onClick={() => handleTabChange("register")}>
                Regístrate aquí
              </button>
            </p>
          </div>

          {/* ─── REGISTER PANEL ─── */}
          <div
            className={`auth-panel ${activeTab === "register" ? "visible" : "hidden"}`}
            role="tabpanel"
            aria-labelledby="tab-register"
          >
            <div className="auth-panel-header">
              <h2 className="auth-panel-title">Crea tu cuenta</h2>
              <p className="auth-panel-sub">Regístrate como consultor del sistema</p>
            </div>

            <form onSubmit={handleRegisterSubmit} className="auth-form" noValidate>
              <div className="field-group">
                <label htmlFor="reg-fullname" className="field-label">Nombre completo</label>
                <div className="field-input-wrap">
                  <span className="field-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </span>
                  <input
                    id="reg-fullname"
                    type="text"
                    name="fullName"
                    placeholder="Juan Pérez López"
                    value={registerForm.fullName}
                    onChange={handleRegisterChange}
                    className="field-input"
                    required
                    autoComplete="name"
                  />
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="reg-email" className="field-label">Correo electrónico</label>
                <div className="field-input-wrap">
                  <span className="field-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  </span>
                  <input
                    id="reg-email"
                    type="email"
                    name="email"
                    placeholder="tu@correo.com"
                    value={registerForm.email}
                    onChange={handleRegisterChange}
                    className="field-input"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="reg-password" className="field-label">Contraseña</label>
                <div className="field-input-wrap">
                  <span className="field-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <input
                    id="reg-password"
                    type={showRegPass ? "text" : "password"}
                    name="password"
                    placeholder="Mín. 8 caracteres"
                    value={registerForm.password}
                    onChange={handleRegisterChange}
                    className="field-input"
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="field-eye"
                    onClick={() => setShowRegPass(!showRegPass)}
                    aria-label={showRegPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showRegPass ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
                {registerForm.password && (
                  <PasswordStrength password={registerForm.password} />
                )}
              </div>

              <div className="field-group">
                <label htmlFor="reg-confirm-password" className="field-label">Confirmar contraseña</label>
                <div className="field-input-wrap">
                  <span className="field-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  </span>
                  <input
                    id="reg-confirm-password"
                    type={showRegConfPass ? "text" : "password"}
                    name="confirmPassword"
                    placeholder="Repite tu contraseña"
                    value={registerForm.confirmPassword}
                    onChange={handleRegisterChange}
                    className={`field-input ${
                      registerForm.confirmPassword && registerForm.password !== registerForm.confirmPassword
                        ? "field-input--error"
                        : registerForm.confirmPassword && registerForm.password === registerForm.confirmPassword
                        ? "field-input--success"
                        : ""
                    }`}
                    required
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="field-eye"
                    onClick={() => setShowRegConfPass(!showRegConfPass)}
                    aria-label={showRegConfPass ? "Ocultar" : "Mostrar"}
                  >
                    {showRegConfPass ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    )}
                  </button>
                </div>
              </div>

              {registerError && (
                <div className="auth-alert auth-alert--error" role="alert">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {registerError}
                </div>
              )}

              {registerSuccess && (
                <div className="auth-alert auth-alert--success" role="alert">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  {registerSuccess}
                </div>
              )}

              <button
                id="btn-register-submit"
                type="submit"
                className="auth-btn primary"
                disabled={loading}
              >
                {loading ? (
                  <span className="btn-spinner" />
                ) : (
                  <>
                    Crear cuenta
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                  </>
                )}
              </button>
            </form>

            <p className="auth-switch">
              ¿Ya tienes cuenta?{" "}
              <button className="auth-link" onClick={() => handleTabChange("login")}>
                Inicia sesión
              </button>
            </p>
          </div>
        </div>

        <p className="auth-footer">
          © {new Date().getFullYear()} TransparenciaUni · Sistema de evaluación de universidades
        </p>
      </div>
    </div>
  );
}

// ─── Password strength meter ───
function PasswordStrength({ password }) {
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const strength = checks.filter(Boolean).length;
  const labels = ["Muy débil", "Débil", "Regular", "Fuerte", "Muy fuerte"];
  const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];

  return (
    <div className="pwd-strength">
      <div className="pwd-bars">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="pwd-bar"
            style={{ background: i <= strength ? colors[strength] : "var(--auth-border)" }}
          />
        ))}
      </div>
      <span className="pwd-label" style={{ color: colors[strength] || "var(--auth-muted)" }}>
        {labels[strength] || ""}
      </span>
    </div>
  );
}
