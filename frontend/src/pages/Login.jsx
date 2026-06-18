import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Shield, Database, Zap, BookOpen, Lock, Eye, EyeOff } from 'lucide-react';

const DB_PILLARS = [
  {
    icon: Database,
    color: 'text-blue-600 bg-blue-50',
    name: 'AlloyDB',
    role: 'Personal data + ACID transactions',
    article: 'Article 17 cascade delete',
  },
  {
    icon: Zap,
    color: 'text-orange-600 bg-orange-50',
    name: 'Firestore',
    role: 'Real-time consent sync',
    article: 'Article 7, instant revocation',
  },
  {
    icon: Shield,
    color: 'text-green-600 bg-green-50',
    name: 'Memorystore',
    role: 'Consent gate <1ms Redis check',
    article: 'Article 25, privacy by default',
  },
  {
    icon: BookOpen,
    color: 'text-purple-600 bg-purple-50',
    name: 'Datastore',
    role: 'Immutable audit log',
    article: 'Article 30, processing records',
  },
];

export default function Login() {
  const { user, isAdmin, signInWithGoogle, signInAsAdmin, adminLoginError } = useAuth();
  const navigate = useNavigate();

  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminEmail, setAdminEmail]       = useState('');
  const [adminPass, setAdminPass]         = useState('');
  const [showPass, setShowPass]           = useState(false);

  useEffect(() => {
    if (user) {
      if (isAdmin) {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
    }
  }, [user, isAdmin, navigate]);

  const handleAdminLogin = (e) => {
    e.preventDefault();
    const ok = signInAsAdmin(adminEmail, adminPass);
    if (ok) navigate('/admin');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Left: Sign-in card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col justify-center">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-600 p-2.5 rounded-xl">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">GDPR Tracker</h1>
                <p className="text-xs text-gray-500">Consent & Data Lineage Platform</p>
              </div>
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Your data. Your rights.</h2>
            <p className="text-gray-500 text-sm leading-relaxed">
              See exactly what personal data this company holds about you, control how it's used,
              and exercise your GDPR rights, all in one place.
            </p>
          </div>

          {/* Google sign-in (regular users) */}
          {!showAdminForm && (
            <>
              <button
                onClick={signInWithGoogle}
                className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 rounded-xl px-6 py-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm mb-4"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </button>

              <div className="relative flex items-center my-2">
                <div className="flex-grow border-t border-gray-100"></div>
                <span className="flex-shrink mx-3 text-xs text-gray-400">or</span>
                <div className="flex-grow border-t border-gray-100"></div>
              </div>

              <button
                onClick={() => setShowAdminForm(true)}
                className="w-full flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-purple-600 transition-colors py-2"
              >
                <Lock className="w-3.5 h-3.5" />
                Admin sign in
              </button>
            </>
          )}

          {/* Admin credentials form */}
          {showAdminForm && (
            <form onSubmit={handleAdminLogin} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-gray-800">Admin Login</span>
              </div>

              {adminLoginError && (
                <div className="bg-red-50 border border-red-100 text-red-600 text-xs rounded-lg px-3 py-2">
                  {adminLoginError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={e => setAdminEmail(e.target.value)}
                  placeholder="admin@gdprtracker.com"
                  required
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={adminPass}
                    onChange={e => setAdminPass(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-purple-400 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm rounded-xl px-6 py-3 transition-colors mt-1"
              >
                Sign in as Admin
              </button>

              <button
                type="button"
                onClick={() => { setShowAdminForm(false); setAdminEmail(''); setAdminPass(''); }}
                className="text-xs text-gray-400 hover:text-gray-600 text-center transition-colors"
              >
                ← Back to regular sign in
              </button>
            </form>
          )}

          <div className="flex flex-wrap gap-2 mt-4">
            {['Article 6', 'Article 7', 'Article 17', 'Article 20', 'Article 30'].map(a => (
              <span key={a} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">{a}</span>
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-6">
            EU data residency · <span className="font-medium">europe-west3</span> (Frankfurt, Germany)
          </p>
        </div>

        {/* Right: Architecture overview */}
        <div className="flex flex-col gap-3">
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl border border-white shadow-sm p-5 mb-1">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-gray-700" />
              <p className="text-sm font-semibold text-gray-900">4-Database Architecture</p>
            </div>
            <p className="text-xs text-gray-500">Each GCP database plays a distinct, justified GDPR role</p>
          </div>
          {DB_PILLARS.map(({ icon: Icon, color, name, role, article }) => (
            <div key={name} className="bg-white/80 backdrop-blur-sm rounded-xl border border-white shadow-sm p-4 flex items-start gap-3">
              <div className={`p-2 rounded-lg flex-shrink-0 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{name}</p>
                <p className="text-xs text-gray-600">{role}</p>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{article}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
