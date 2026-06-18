import { Link, useLocation } from 'react-router-dom';
import { Shield, LayoutDashboard, ToggleLeft, Database, GitBranch, FileText, LogOut, Radio } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const navItems = [
  { path: '/dashboard', label: 'Dashboard',    icon: LayoutDashboard },
  { path: '/consent',   label: 'Consents',     icon: ToggleLeft },
  { path: '/my-data',   label: 'My Data',      icon: Database },
  { path: '/lineage',   label: 'Lineage',      icon: GitBranch },
  { path: '/requests',  label: 'My Rights',    icon: FileText },
  { path: '/realtime',  label: 'Live Compare', icon: Radio },
];

// DB badges shown in navbar to remind users of the architecture
const DB_LABELS = [
  { label: 'AlloyDB',     color: 'bg-blue-100 text-blue-700' },
  { label: 'Firestore',   color: 'bg-orange-100 text-orange-700' },
  { label: 'Memorystore', color: 'bg-green-100 text-green-700' },
  { label: 'Datastore',   color: 'bg-purple-100 text-purple-700' },
];

// adminOnly = true  → show only logo + "Admin Dashboard" title + logout
// adminOnly = false → show full user nav links (default)
export default function Navbar({ adminOnly = false }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link to={adminOnly ? '/admin' : '/dashboard'} className="flex items-center gap-2.5">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900 text-sm">GDPR Tracker</span>
            {adminOnly ? (
              <span className="ml-2 text-xs font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                Admin Dashboard
              </span>
            ) : (
              <span className="hidden lg:flex items-center gap-1 ml-2">
                {DB_LABELS.map(db => (
                  <span key={db.label} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${db.color}`}>
                    {db.label}
                  </span>
                ))}
              </span>
            )}
          </Link>

          {/* Nav links — only shown for regular users */}
          {!adminOnly && (
            <div className="hidden md:flex items-center gap-1">
              {navItems.map(({ path, label, icon: Icon }) => {
                const active = location.pathname === path;
                return (
                  <Link
                    key={path}
                    to={path}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                );
              })}
            </div>
          )}

          {/* User menu */}
          {user && (
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p className="text-xs font-medium text-gray-900">{user.displayName || user.email}</p>
                <p className="text-xs text-gray-400 truncate max-w-[140px]">{user.email}</p>
              </div>
              {user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-8 h-8 rounded-full border border-gray-200" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                  {(user.displayName || user.email || '?')[0].toUpperCase()}
                </div>
              )}
              <button
                onClick={logout}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          )}

        </div>
      </div>
    </nav>
  );
}
