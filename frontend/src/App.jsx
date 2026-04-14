import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './routes/ProtectedRoute';
import DashboardLayout from './layouts/DashboardLayout';

// Auth
import Login from './pages/auth/Login';

// Admin pages
import AdminDashboard   from './pages/admin/AdminDashboard';
import UsersPage        from './pages/admin/UsersPage';
import UniversitiesPage from './pages/admin/UniversitiesPage';
import IndicatorsPage   from './pages/admin/IndicatorsPage';
import WeightingsPage   from './pages/admin/WeightingsPage';
import RankingsPage     from './pages/admin/RankingsPage';
import ReportsPage      from './pages/admin/ReportsPage';
import AuditPage        from './pages/admin/AuditPage';

// University pages
import UnivDashboard    from './pages/university/UnivDashboard';
import DocumentsPage    from './pages/university/DocumentsPage';
import ObservationsPage from './pages/university/ObservationsPage';

// Auditor pages
import AuditorDashboard      from './pages/auditor/AuditorDashboard';
import ComparativesPage      from './pages/auditor/ComparativesPage';
import TransparencyIndexPage from './pages/auditor/TransparencyIndexPage';

// Auditor also uses rankings page (read-only)
const AuditorRankingsPage = () => <RankingsPage />;

function WithLayout({ children }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/"       element={<Navigate to="/login" replace />} />

          {/* System Admin — role 1 */}
          <Route path="/admin/dashboard"    element={<ProtectedRoute allowedRoles={[1]}><WithLayout><AdminDashboard /></WithLayout></ProtectedRoute>} />
          <Route path="/admin/users"        element={<ProtectedRoute allowedRoles={[1]}><WithLayout><UsersPage /></WithLayout></ProtectedRoute>} />
          <Route path="/admin/universities" element={<ProtectedRoute allowedRoles={[1]}><WithLayout><UniversitiesPage /></WithLayout></ProtectedRoute>} />
          <Route path="/admin/indicators"   element={<ProtectedRoute allowedRoles={[1]}><WithLayout><IndicatorsPage /></WithLayout></ProtectedRoute>} />
          <Route path="/admin/weightings"   element={<ProtectedRoute allowedRoles={[1]}><WithLayout><WeightingsPage /></WithLayout></ProtectedRoute>} />
          <Route path="/admin/rankings"     element={<ProtectedRoute allowedRoles={[1]}><WithLayout><RankingsPage /></WithLayout></ProtectedRoute>} />
          <Route path="/admin/reports"      element={<ProtectedRoute allowedRoles={[1]}><WithLayout><ReportsPage /></WithLayout></ProtectedRoute>} />
          <Route path="/admin/audit"        element={<ProtectedRoute allowedRoles={[1]}><WithLayout><AuditPage /></WithLayout></ProtectedRoute>} />

          {/* University Admin — roles 2, 3 */}
          <Route path="/university/dashboard"    element={<ProtectedRoute allowedRoles={[2,3]}><WithLayout><UnivDashboard /></WithLayout></ProtectedRoute>} />
          <Route path="/university/documents"    element={<ProtectedRoute allowedRoles={[2,3]}><WithLayout><DocumentsPage /></WithLayout></ProtectedRoute>} />
          <Route path="/university/observations" element={<ProtectedRoute allowedRoles={[2,3]}><WithLayout><ObservationsPage /></WithLayout></ProtectedRoute>} />

          {/* Auditor — role 4 */}
          <Route path="/auditor/dashboard"    element={<ProtectedRoute allowedRoles={[4]}><WithLayout><AuditorDashboard /></WithLayout></ProtectedRoute>} />
          <Route path="/auditor/index"        element={<ProtectedRoute allowedRoles={[4]}><WithLayout><TransparencyIndexPage /></WithLayout></ProtectedRoute>} />
          <Route path="/auditor/comparatives" element={<ProtectedRoute allowedRoles={[4]}><WithLayout><ComparativesPage /></WithLayout></ProtectedRoute>} />
          <Route path="/auditor/rankings"     element={<ProtectedRoute allowedRoles={[4]}><WithLayout><AuditorRankingsPage /></WithLayout></ProtectedRoute>} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}