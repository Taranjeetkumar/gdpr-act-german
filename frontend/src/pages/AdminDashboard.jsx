import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import AuditTable from '../components/AuditTable';
import { Settings, Database, Zap, BookOpen, Shield, RefreshCw, CheckCircle } from 'lucide-react';

const DB_COLORS = {
  alloyDB:     { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  firestore:   { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
  memorystore: { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-500'  },
  datastore:   { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', dot: 'bg-purple-500' },
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [recentAudit, setRecentAudit] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [processingReq, setProcessingReq] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [dash, audit] = await Promise.all([
        client.get('/api/admin/dashboard'),
        client.get('/api/audit/admin/all'),
      ]);
      setDashboard(dash.data);
      setRecentAudit(audit.data.data?.slice(0, 20) || []);
    } catch (err) {
      console.error('[Admin] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleProcessRequest = async (requestId, status) => {
    setProcessingReq(requestId);
    try {
      await client.patch(`/api/admin/requests/${requestId}`, { status });
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingReq('');
    }
  };

  // Build consent bar chart data from Firestore stats
  const consentChartData = dashboard?.databases?.firestore?.stats
    ? Object.entries(dashboard.databases.firestore.stats).map(([purpose, data]) => ({
        name: (data.label || purpose).replace(/\s/g, '\n').slice(0, 14),
        granted: data.granted || 0,
        denied:  data.denied  || 0,
        total:   data.total   || 0,
      }))
    : [];

  const alloyStats    = dashboard?.databases?.alloyDB?.stats || {};
  const firestoreStats= dashboard?.databases?.firestore?.stats || {};
  const redisStats    = dashboard?.databases?.memorystore?.stats || {};
  const datastoreStats= dashboard?.databases?.datastore?.stats || {};
  const pendingReqs   = dashboard?.pendingRequests || [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-purple-600" />
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Aggregated from all 4 GCP databases · europe-west3 (Frankfurt)
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* 4-database stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <DbStatCard
          db="alloyDB"
          icon={Database}
          label="AlloyDB"
          role="Relational data store"
          stats={[
            { label: 'Users',          value: alloyStats.total_users        || 0 },
            { label: 'Data Records',   value: alloyStats.active_data_records || 0 },
            { label: 'Pending Requests', value: alloyStats.pending_requests  || 0 },
            { label: 'Erasure Requests', value: alloyStats.erasure_requests  || 0 },
          ]}
          loading={loading}
        />
        <DbStatCard
          db="firestore"
          icon={Zap}
          label="Firestore"
          role="Real-time consent"
          stats={Object.entries(firestoreStats).slice(0, 4).map(([p, d]) => ({
            label: (d.label || p).slice(0, 18),
            value: `${d.granted || 0}/${d.total || 0}`,
          }))}
          loading={loading}
        />
        <DbStatCard
          db="memorystore"
          icon={Shield}
          label="Memorystore"
          role="Redis consent gate"
          stats={[
            { label: 'Cache Keys',    value: redisStats.keys        || 0 },
            { label: 'Memory Used',   value: redisStats.usedMemory  || '—' },
            { label: 'TTL (minutes)', value: redisStats.ttlMinutes  || 5 },
            { label: 'Status',        value: redisStats.status      || '—' },
          ]}
          loading={loading}
        />
        <DbStatCard
          db="datastore"
          icon={BookOpen}
          label="Datastore"
          role="Immutable audit log"
          stats={Object.entries(datastoreStats).slice(0, 5).map(([action, count]) => ({
            label: action.replace(/_/g, ' ').slice(0, 18),
            value: count,
          }))}
          loading={loading}
        />
      </div>

      {/* Consent grant rates (Firestore data via recharts) */}
      {consentChartData.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Consent Grant Rates</h2>
              <p className="text-xs text-orange-600 font-medium mt-0.5">Source: Firestore, real-time consent collection</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={consentChartData} margin={{ top: 4, right: 8, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af' }} interval={0} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                formatter={(value, name) => [value, name === 'granted' ? 'Granted' : 'Denied']}
              />
              <Bar dataKey="granted" fill="#22c55e" radius={[3, 3, 0, 0]} name="granted" />
              <Bar dataKey="denied"  fill="#f87171" radius={[3, 3, 0, 0]} name="denied" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pending GDPR requests */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Pending GDPR Requests</h2>
            <p className="text-xs text-blue-600 font-medium mt-0.5">Source: AlloyDB · data_requests table</p>
          </div>
          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
            {pendingReqs.length} pending
          </span>
        </div>

        {pendingReqs.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 py-4">
            <CheckCircle className="w-4 h-4 text-green-400" />
            No pending requests
          </div>
        ) : (
          <div className="space-y-2">
            {pendingReqs.map(req => (
              <div key={req.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800">{req.request_type} · {req.email}</p>
                  <p className="text-xs text-gray-400">{req.reason || 'No reason given'} · {new Date(req.requested_at).toLocaleDateString('de-DE')}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleProcessRequest(req.id, 'completed')}
                    disabled={processingReq === req.id}
                    className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {processingReq === req.id ? '...' : 'Approve'}
                  </button>
                  <button
                    onClick={() => handleProcessRequest(req.id, 'rejected')}
                    disabled={processingReq === req.id}
                    className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent audit log */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Recent Audit Events</h2>
          <p className="text-xs text-purple-600 font-medium mt-0.5">
            Source: Datastore · AuditLog kind · immutable · Article 30 compliant
          </p>
        </div>
        <AuditTable logs={recentAudit} loading={loading} />
      </div>
    </div>
  );
}

function DbStatCard({ db, icon: Icon, label, role, stats, loading }) {
  const colors = DB_COLORS[db];
  return (
    <div className={`rounded-xl border p-4 ${colors.bg} ${colors.border}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
        <span className={`text-xs font-bold ${colors.text}`}>{label}</span>
      </div>
      <p className="text-xs text-gray-500 mb-3">{role}</p>
      {loading ? (
        <div className="space-y-1.5 animate-pulse">
          {[1,2,3].map(i => <div key={i} className="h-4 bg-white/60 rounded" />)}
        </div>
      ) : (
        <div className="space-y-1.5">
          {stats.map(({ label: l, value: v }) => (
            <div key={l} className="flex items-center justify-between">
              <span className="text-xs text-gray-500 truncate">{l}</span>
              <span className={`text-xs font-semibold ${colors.text} ml-2 flex-shrink-0`}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
