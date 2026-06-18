import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';
import AuditTable from '../components/AuditTable';
import { ActivityLineChart, ActionBreakdownChart } from '../components/LineageChart';
import { GitBranch, BookOpen, RefreshCw } from 'lucide-react';

export default function DataLineage() {
  const { user } = useAuth();
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!user) return;
    setLoading(true);
    client.get(`/api/audit/${user.uid}?limit=100`)
      .then(r => setLogs(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [user]);

  // Group logs by date for line chart
  const chartData = logs.reduce((acc, log) => {
    if (!log.timestamp) return acc;
    const day = new Date(log.timestamp).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    const ex = acc.find(d => d.date === day);
    if (ex) ex.events++;
    else acc.push({ date: day, events: 1 });
    return acc;
  }, []).reverse().slice(-14);

  // Count by action type for bar chart
  const actionCounts = logs.reduce((acc, log) => {
    const action = (log.action || 'UNKNOWN').replace(/_/g, ' ');
    acc[action] = (acc[action] || 0) + 1;
    return acc;
  }, {});
  const barData = Object.entries(actionCounts)
    .map(([action, count]) => ({ action: action.split(' ').map(w => w[0]).join(''), count, fullAction: action }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-600" />
            <h1 className="text-2xl font-bold text-gray-900">Data Lineage & Audit Trail</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Every access to your personal data is recorded here.{' '}
            <span className="font-medium text-purple-700">Source: Google Cloud Datastore</span>
            {' '}· GDPR Article 30, records of processing activities
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-purple-700">{logs.length}</p>
          <p className="text-xs text-gray-500 mt-0.5">Total events logged</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">
            {logs.filter(l => l.action === 'DATA_READ').length}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Data read events</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-700">
            {logs.filter(l => l.action === 'CONSENT_GRANTED').length}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">Consent grants</p>
        </div>
      </div>

      {/* Charts */}
      {chartData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-gray-700 mb-1">Events over time (last 14 days)</p>
            <p className="text-xs text-purple-600 mb-3">Datastore chronological query</p>
            <ActivityLineChart data={chartData} />
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-gray-700 mb-1">Events by action type</p>
            <p className="text-xs text-purple-600 mb-3">Abbreviated action names</p>
            <ActionBreakdownChart data={barData} />
          </div>
        </div>
      )}

      {/* Key: Article 30 explanation */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4 text-xs text-purple-700">
        <strong>GDPR Article 30, records of processing activities:</strong> Controllers must maintain records of all
        processing activities under their responsibility. This audit trail stored in Google Cloud Datastore is that
        record. These entries are <strong>never deleted</strong>, even after your data is erased under Article 17,
        the audit log is preserved under Article 17(3)(b) (legal obligation exception).
      </div>

      {/* Full audit table */}
      <AuditTable logs={logs} loading={loading} />
    </div>
  );
}
