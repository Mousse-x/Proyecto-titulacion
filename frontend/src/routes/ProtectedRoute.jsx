import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * ProtectedRoute — wraps a page and redirects if:
 *  - Not authenticated → /login
 *  - Authenticated but wrong role → appropriate dashboard
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role_id)) {
    // Redirect to the user's own dashboard
    const redirectMap = {
      1: '/admin/dashboard',
      2: '/university/dashboard',
      3: '/university/dashboard',
      4: '/auditor/dashboard',
    };
    return <Navigate to={redirectMap[user.role_id] || '/login'} replace />;
  }

  return children;
}
