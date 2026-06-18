const ACTION_STYLES = {
  DATA_READ:          'bg-blue-50 text-blue-700',
  DATA_WRITE:         'bg-indigo-50 text-indigo-700',
  CONSENT_GRANTED:    'bg-green-50 text-green-700',
  CONSENT_REVOKED:    'bg-red-50 text-red-700',
  CONSENT_READ:       'bg-gray-100 text-gray-600',
  ERASURE_REQUESTED:  'bg-orange-50 text-orange-700',
  ERASURE_COMPLETED:  'bg-red-100 text-red-800',
  USER_REGISTERED:    'bg-purple-50 text-purple-700',
  DATA_EXPORTED:      'bg-teal-50 text-teal-700',
  ADMIN_VIEW:         'bg-gray-100 text-gray-600',
};

export default function AuditTable({ logs, loading }) {
  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="space-y-3 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-9 bg-gray-100 rounded-lg" />
          ))}
        </div>
        <p className="text-xs text-purple-600 font-medium mt-3">Loading from Datastore...</p>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
        <p className="text-sm text-gray-400">No audit events found in Datastore</p>
        <p className="text-xs text-gray-300 mt-1">Events appear here as you use the platform</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Timestamp</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Action</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Resource</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Performed By</th>
              <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden lg:table-cell">GDPR Article</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.map((log, i) => (
              <tr key={log.id || i} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs font-mono">
                  {log.timestamp
                    ? new Date(log.timestamp).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
                    : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${ACTION_STYLES[log.action] || 'bg-gray-100 text-gray-600'}`}>
                    {log.action || '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">
                  <span className="font-medium">{log.resourceType || '—'}</span>
                  {log.resourceId && (
                    <span className="text-gray-400 ml-1">· {String(log.resourceId).slice(0, 20)}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-400 text-xs font-mono hidden md:table-cell">
                  {log.performedBy ? String(log.performedBy).slice(0, 14) + '…' : '—'}
                </td>
                <td className="px-4 py-2.5 text-gray-400 text-xs hidden lg:table-cell">
                  {log.gdprArticle || 'Article 30'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
