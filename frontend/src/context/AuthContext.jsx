import { createContext, useContext, useState, useCallback } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

// Mapa de nombre de rol (string) → role_id (número)
const ROLE_ID_MAP = {
  'Administrador del Sistema': 1,
  'Administrador Universitario': 2,
  'Responsable de Unidad': 3,
  'Auditor': 4,
  'Visualizador': 4,
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = sessionStorage.getItem('auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [errorData, setErrorData] = useState(null);  // payload completo del error

  const login = useCallback(async (email, password) => {
    setLoading(true);
    setError(null);
    setErrorData(null);

    try {
      const res = await api.auth.login({ email, password });
      const data = res.data;

      // Normalizar role_id: el backend lo devuelve directamente desde la BD
      const roleId = data.user.role_id ?? ROLE_ID_MAP[data.user.role] ?? 4;

      const sessionUser = {
        id:            data.user.id,
        full_name:     data.user.name,
        email:         data.user.email,
        role:          data.user.role,
        role_id:       roleId,
        university_id: data.user.university_id ?? null,
        is_active:     data.user.is_active ?? true,
      };

      setUser(sessionUser);
      sessionStorage.setItem('auth_user', JSON.stringify(sessionUser));
      setLoading(false);
      return true;

    } catch (err) {
      setLoading(false);
      const payload = err.response?.data || {};
      const msg = payload.error || 'Error de conexión. Verifique que el servidor esté activo.';
      setError(msg);
      setErrorData(payload);   // guarda el objeto completo {error, remaining, support_email, ...}
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    sessionStorage.removeItem('auth_user');
    sessionStorage.removeItem('auth_token');
  }, []);

  const isAdmin      = user?.role_id === 1;
  const isUnivAdmin  = user?.role_id === 2 || user?.role_id === 3;
  const isAuditor    = user?.role_id === 4;

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, error, errorData, isAdmin, isUnivAdmin, isAuditor }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
