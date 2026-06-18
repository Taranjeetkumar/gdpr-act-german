import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ConsentManager from './pages/ConsentManager';
import MyData from './pages/MyData';
import DataLineage from './pages/DataLineage';
import Requests from './pages/Requests';
import AdminDashboard from './pages/AdminDashboard';
import BenchmarkDashboard from './pages/BenchmarkDashboard';
import RealtimeComparison from './pages/RealtimeComparison';

const LoadingSpinner = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50">
    <div className="text-center">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
      <p className="text-sm text-gray-500">Loading GDPR Tracker...</p>
    </div>
  </div>
);

// Regular users only (redirects admin to /admin)
function ProtectedRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  return children;
}

// Admin only route
function AdminRoute({ children }) {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

// Layout for regular users — shows full Navbar with all nav links
function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="pt-4 pb-12">{children}</main>
    </div>
  );
}

// Layout for admin — shows only the minimal admin Navbar (no user nav links)
function AdminLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar adminOnly />
      <main className="pt-4 pb-12">{children}</main>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Regular user routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>
      } />
      <Route path="/consent" element={
        <ProtectedRoute><Layout><ConsentManager /></Layout></ProtectedRoute>
      } />
      <Route path="/my-data" element={
        <ProtectedRoute><Layout><MyData /></Layout></ProtectedRoute>
      } />
      <Route path="/lineage" element={
        <ProtectedRoute><Layout><DataLineage /></Layout></ProtectedRoute>
      } />
      <Route path="/requests" element={
        <ProtectedRoute><Layout><Requests /></Layout></ProtectedRoute>
      } />
      <Route path="/realtime" element={
        <ProtectedRoute><Layout><RealtimeComparison /></Layout></ProtectedRoute>
      } />

      {/* Admin-only routes — use AdminLayout so user nav links are hidden */}
      <Route path="/admin" element={
        <AdminRoute><AdminLayout><AdminDashboard /></AdminLayout></AdminRoute>
      } />
      <Route path="/benchmark" element={
        <AdminRoute><AdminLayout><BenchmarkDashboard /></AdminLayout></AdminRoute>
      } />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
