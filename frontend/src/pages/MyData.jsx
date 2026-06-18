import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';
import DataCategoryCard from '../components/DataCategoryCard';
import { Database, Filter } from 'lucide-react';

const SENSITIVITY_ORDER = { special: 0, high: 1, medium: 2, low: 3 };

export default function MyData() {
  const { user, dbUser } = useAuth();
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');

  useEffect(() => {
    if (!dbUser) return;
    client.get(`/api/data/${dbUser.id}`)
      .then(r => setData(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dbUser]);

  const filtered = data.filter(d => filter === 'all' || d.sensitivity_level === filter);

  // Group by category
  const grouped = filtered.reduce((acc, item) => {
    const key = item.category_name || 'Other';
    if (!acc[key]) acc[key] = { sensitivity: item.sensitivity_level, items: [], legal_basis: item.legal_basis };
    acc[key].items.push(item);
    return acc;
  }, {});

  const sortedGroups = Object.entries(grouped).sort(([, a], [, b]) =>
    (SENSITIVITY_ORDER[a.sensitivity] ?? 99) - (SENSITIVITY_ORDER[b.sensitivity] ?? 99)
  );

  const sensitivityCounts = data.reduce((acc, d) => {
    acc[d.sensitivity_level] = (acc[d.sensitivity_level] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">My Personal Data</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            All records stored about you ·{' '}
            <span className="font-medium text-blue-700">AlloyDB (PostgreSQL)</span> ·{' '}
            {data.length} records
          </p>
        </div>
      </div>

      {/* Sensitivity summary */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { level: 'low',    label: 'Low',    color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
          { level: 'medium', label: 'Medium', color: 'bg-amber-50 border-amber-200 text-amber-700' },
          { level: 'high',   label: 'High',   color: 'bg-red-50 border-red-200 text-red-700' },
          { level: 'special',label: 'Special',color: 'bg-purple-50 border-purple-200 text-purple-700' },
        ].map(({ level, label, color }) => (
          <button
            key={level}
            onClick={() => setFilter(filter === level ? 'all' : level)}
            className={`rounded-xl border p-3 text-center transition-all ${color} ${filter === level ? 'ring-2 ring-offset-1 ring-blue-400' : ''}`}
          >
            <p className="text-xl font-bold">{sensitivityCounts[level] || 0}</p>
            <p className="text-xs font-medium">{label}</p>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-500">Filter:</span>
        {['all', 'high', 'medium', 'low'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-lg transition-colors ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'All data' : f}
          </button>
        ))}
      </div>

      {/* Data cards grouped by category */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 h-20 animate-pulse" />
          ))}
        </div>
      ) : sortedGroups.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <Database className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No personal data records found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedGroups.map(([category, { sensitivity, items, legal_basis }]) => (
            <DataCategoryCard
              key={category}
              category={category}
              sensitivity={sensitivity}
              legalBasis={legal_basis}
              items={items}
            />
          ))}
        </div>
      )}

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
        <strong>GDPR Article 15</strong>, right of access: You have the right to obtain confirmation of whether personal
        data concerning you is being processed and to receive a copy of that data. Each record above shows the legal
        basis under which it is processed and when it will expire.
      </div>
    </div>
  );
}
