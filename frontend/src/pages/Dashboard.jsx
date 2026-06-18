import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';
import {
  Shield, Database, ToggleLeft, GitBranch, FileText,
  CheckCircle, XCircle, AlertTriangle, Clock, ArrowRight
} from 'lucide-react';

const DB_COLORS = {
  alloyDB:     'bg-blue-50 border-blue-200 text-blue-700',
  firestore:   'bg-orange-50 border-orange-200 text-orange-700',
  memorystore: 'bg-green-50 border-green-200 text-green-700',
  datastore:   'bg-purple-50 border-purple-200 text-purple-700',
};

export default function Dashboard() {
  const { user, dbUser, dbUserReady, refreshDbUser } = useAuth();
  const [personalData, setPersonalData] = useState([]);
  const [consents, setConsents]         = useState(null);
  const [recentLogs, setRecentLogs]     = useState([]);
  const [requests, setRequests]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState(null);

  useEffect(() => {
    // wait for AuthContext to resolve the AlloyDB user before firing any
    // request. checking dbUserReady instead of just "user && dbUser" since
    // that can be momentarily true with a stale dbUser during re-auth.
    if (!dbUserReady) return;

    if (!user || !dbUser) {
      // auth resolved but there's no backend user, registration must have
      // failed. show this instead of an empty dashboard forever.
      setLoading(false);
      setLoadError(!user ? null : 'Could not load your account. Click retry below.');
      return;
    }

    const uid  = user.uid;
    const dbId = dbUser.id;
    let cancelled = false;

    setLoading(true);
    setLoadError(null);

    Promise.allSettled([
      client.get(`/api/data/${dbId}`),
      client.get(`/api/consent/${uid}`),
      client.get(`/api/audit/${uid}?limit=5`),
      client.get(`/api/requests/${dbId}`),
    ]).then((results) => {
      if (cancelled) return;
      const [data, consent, audit, reqs] = results;

      if (data.status === 'fulfilled')    setPersonalData(data.value.data.data || []);
      else console.error('[Dashboard] /api/data failed:', data.reason?.response?.data || data.reason?.message);

      if (consent.status === 'fulfilled') setConsents(consent.value.data.data?.consents || {});
      else console.error('[Dashboard] /api/consent failed:', consent.reason?.response?.data || consent.reason?.message);

      if (audit.status === 'fulfilled')   setRecentLogs(audit.value.data.data?.slice(0, 5) || []);
      else console.error('[Dashboard] /api/audit failed:', audit.reason?.response?.data || audit.reason?.message);

      if (reqs.status === 'fulfilled')    setRequests(reqs.value.data.data || []);
      else console.error('[Dashboard] /api/requests failed:', reqs.reason?.response?.data || reqs.reason?.message);

      // only block with an error banner if every call failed, partial
      // failures should still show whatever data we got back
      const allFailed = results.every(r => r.status === 'rejected');
      if (allFailed) {
        setLoadError('Could not reach the backend. Is it running on the configured VITE_API_URL?');
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [user, dbUser, dbUserReady]);

  const grantedCount = consents
    ? Object.values(consents).filter(c => c.granted).length
    : 0;
  const totalConsents = consents ? Object.keys(consents).length : 0;
  const pendingRequests = requests.filter(r => r.status === 'pending').length;

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <p className="text-sm font-medium text-gray-800 mb-1">Something went wrong</p>
        <p className="text-sm text-gray-500 mb-5">{loadError}</p>
        <button
          onClick={async () => { setLoading(true); await refreshDbUser(); }}
          className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.displayName?.split(' ')[0] || 'there'}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Your GDPR dashboard · EU data residency: <span className="font-medium text-blue-700">europe-west3 (Frankfurt)</span>
        </p>
      </div>

      {/* stats grid, each card shows which database it pulls from */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Personal Data Records"
          value={personalData.length}
          sub="stored about you"
          dbLabel="AlloyDB"
          dbColor={DB_COLORS.alloyDB}
          icon={Database}
          to="/my-data"
        />
        <StatCard
          label="Consents Granted"
          value={`${grantedCount}/${totalConsents}`}
          sub="processing purposes"
          dbLabel="Firestore"
          dbColor={DB_COLORS.firestore}
          icon={ToggleLeft}
          to="/consent"
        />
        <StatCard
          label="Audit Events"
          value={recentLogs.length}
          sub="recent accesses"
          dbLabel="Datastore"
          dbColor={DB_COLORS.datastore}
          icon={GitBranch}
          to="/lineage"
        />
        <StatCard
          label="Pending Requests"
          value={pendingRequests}
          sub="GDPR requests"
          dbLabel="AlloyDB"
          dbColor={DB_COLORS.alloyDB}
          icon={FileText}
          to="/requests"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Consent status */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Consent Status</h2>
              <p className="text-xs text-orange-600 font-medium">Source: Firestore (real-time)</p>
            </div>
            <Link to="/consent" className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
              Manage <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {consents && Object.entries(consents).map(([purpose, data]) => (
              <div key={purpose} className="flex items-center justify-between py-1">
                <span className="text-xs text-gray-700">{data.label || purpose}</span>
                <span className={`flex items-center gap-1 text-xs font-medium ${data.granted ? 'text-green-600' : 'text-red-500'}`}>
                  {data.granted
                    ? <><CheckCircle className="w-3.5 h-3.5" /> Granted</>
                    : <><XCircle className="w-3.5 h-3.5" /> Denied</>
                  }
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent audit events */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
              <p className="text-xs text-purple-600 font-medium">Source: Datastore (Article 30 audit log)</p>
            </div>
            <Link to="/lineage" className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
              Full log <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentLogs.length === 0 ? (
            <p className="text-xs text-gray-400">No audit events yet</p>
          ) : (
            <div className="space-y-2">
              {recentLogs.map((log, i) => (
                <div key={i} className="flex items-start gap-2 py-1 border-b border-gray-50 last:border-0">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${
                    log.action?.includes('READ')    ? 'bg-blue-50 text-blue-700' :
                    log.action?.includes('GRANTED') ? 'bg-green-50 text-green-700' :
                    log.action?.includes('REVOKED') ? 'bg-red-50 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{log.action}</span>
                  <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
                    {log.timestamp ? new Date(log.timestamp).toLocaleDateString('de-DE') : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <QuickAction
          to="/consent"
          icon={ToggleLeft}
          color="blue"
          title="Manage Consents"
          desc="Grant or revoke marketing, analytics, and personalization"
        />
        <QuickAction
          to="/my-data"
          icon={Database}
          color="indigo"
          title="View My Data"
          desc="See all personal data this platform holds about you"
        />
        <QuickAction
          to="/requests"
          icon={Shield}
          color="red"
          title="Exercise Rights"
          desc="Request data erasure (Art. 17) or export (Art. 20)"
        />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, dbLabel, dbColor, icon: Icon, to }) {
  return (
    <Link to={to} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-200 hover:shadow-sm transition-all group">
      <div className="flex items-start justify-between mb-3">
        <Icon className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${dbColor}`}>{dbLabel}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs font-medium text-gray-700 mt-0.5">{label}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </Link>
  );
}

function QuickAction({ to, icon: Icon, color, title, desc }) {
  const colors = {
    blue:  'bg-blue-600 hover:bg-blue-700',
    indigo:'bg-indigo-600 hover:bg-indigo-700',
    red:   'bg-red-600 hover:bg-red-700',
  };
  return (
    <Link to={to} className={`${colors[color]} text-white rounded-xl p-5 flex flex-col gap-2 transition-colors`}>
      <Icon className="w-5 h-5 opacity-80" />
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs opacity-80 leading-relaxed">{desc}</p>
    </Link>
  );
}
