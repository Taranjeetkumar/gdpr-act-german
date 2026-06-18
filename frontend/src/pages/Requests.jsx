import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';
import DeletionModal from '../components/DeletionModal';
import { Trash2, Download, Clock, FileText, Shield } from 'lucide-react';

const STATUS_STYLES = {
  pending:    'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  completed:  'bg-green-100 text-green-700',
  rejected:   'bg-red-100 text-red-700',
};

const TYPE_LABELS = {
  erasure:       'Right to Erasure (Art. 17)',
  portability:   'Right to Portability (Art. 20)',
  rectification: 'Right to Rectification (Art. 16)',
  restriction:   'Right to Restriction (Art. 18)',
};

export default function Requests() {
  const { user, dbUser } = useAuth();
  const [requests, setRequests]           = useState([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [exporting, setExporting]         = useState(false);
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    if (!dbUser) return;
    client.get(`/api/requests/${dbUser.id}`)
      .then(r => setRequests(r.data.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dbUser]);

  const handleExport = async () => {
    if (!dbUser || exporting) return;
    setExporting(true);
    try {
      const res = await client.get(`/api/requests/${dbUser.id}/export`);
      const json = JSON.stringify(res.data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `gdpr-data-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Your GDPR Rights</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          Exercise your rights as a data subject under EU GDPR at any time.
        </p>
      </div>

      {/* Rights cards */}
      <div className="space-y-4 mb-10">

        {/* Article 20, data portability */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="bg-blue-50 p-2.5 rounded-xl flex-shrink-0">
              <Download className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Export My Data</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Article 20, right to data portability
                  </p>
                </div>
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                  AlloyDB export
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2 mb-3">
                Downloads a JSON file containing all your personal data from AlloyDB, including data categories,
                sources, collection dates, and processing purposes. Machine-readable and human-readable format.
              </p>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-2 text-xs bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {exporting ? (
                  <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />Preparing export...</>
                ) : (
                  <><Download className="w-3.5 h-3.5" />Download Data Export (JSON)</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Article 17, right to erasure */}
        <div className="bg-white border border-red-100 rounded-xl p-5">
          <div className="flex items-start gap-4">
            <div className="bg-red-50 p-2.5 rounded-xl flex-shrink-0">
              <Trash2 className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Request Data Erasure</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Article 17, right to erasure ("right to be forgotten")
                  </p>
                </div>
                <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded">
                  Cascades all 4 DBs
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-2 mb-3">
                Permanently deletes your personal data from AlloyDB (cascade), Firestore consent data,
                and Memorystore cache. The Datastore audit trail is preserved under Article 17(3)(b)
                legal obligation exception.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {['AlloyDB (deleted)', 'Firestore (deleted)', 'Memorystore (deleted)', 'Datastore (kept)'].map(db => (
                  <span key={db} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{db}</span>
                ))}
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-2 text-xs bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Request Erasure
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Request history */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Request History</h2>
          <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
            AlloyDB · data_requests table
          </span>
        </div>

        {loading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2].map(i => <div key={i} className="h-12 bg-white border border-gray-200 rounded-lg" />)}
          </div>
        ) : requests.length === 0 ? (
          <div className="text-sm text-gray-400 bg-white border border-gray-200 rounded-xl p-6 text-center">
            No GDPR requests submitted yet.
            <p className="text-xs mt-1 text-gray-300">Use the options above to exercise your rights.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map(req => (
              <div key={req.id} className="flex items-center gap-3 p-3.5 bg-white border border-gray-200 rounded-xl text-sm">
                <Clock className="w-4 h-4 text-gray-300 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 text-xs">{TYPE_LABELS[req.request_type] || req.request_type}</p>
                  {req.reason && <p className="text-xs text-gray-400 truncate">{req.reason}</p>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_STYLES[req.status]}`}>
                  {req.status}
                </span>
                <span className="text-gray-400 text-xs flex-shrink-0">
                  {new Date(req.requested_at).toLocaleDateString('de-DE')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GDPR reference */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500">
        <strong className="text-gray-700">GDPR Article 12</strong>: Controllers must respond to data subject requests
        within <strong>30 days</strong> (extendable to 90 days for complex requests). All requests are logged
        to Datastore for accountability.
      </div>

      <DeletionModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        userId={dbUser?.id}
        userFirebaseUid={user?.uid}
      />
    </div>
  );
}
