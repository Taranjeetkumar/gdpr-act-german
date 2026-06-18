import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';
import ConsentToggle from '../components/ConsentToggle';
import { consentActions } from '../store';
import { CheckCircle, Clock, Info } from 'lucide-react';

export default function ConsentManager() {
  const { user } = useAuth();
  const dispatch  = useDispatch();
  const { consents } = useSelector(s => s.consent);
  const [saving, setSaving]   = useState('');
  const [toast, setToast]     = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!user) return;
    client.get(`/api/consent/${user.uid}`)
      .then(r => dispatch(consentActions.setConsents(r.data.data?.consents || {})))
      .catch(console.error);
  }, [user, dispatch]);

  const handleToggle = async (purpose, newValue) => {
    if (saving) return;
    setSaving(purpose);
    try {
      await client.post(`/api/consent/${user.uid}`, { purpose, granted: newValue });
      dispatch(consentActions.updateConsent({ purpose, granted: newValue }));
      setToast({
        type: newValue ? 'success' : 'warning',
        message: `${purpose.replace(/_/g, ' ')} ${newValue ? 'enabled' : 'disabled'}, logged to Datastore audit trail`,
      });
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      setToast({ type: 'error', message: `Failed to update: ${err.message}` });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving('');
    }
  };

  const loadHistory = async () => {
    if (!user) return;
    try {
      const r = await client.get(`/api/consent/${user.uid}/history`);
      setHistory(r.data.data || []);
      setShowHistory(true);
    } catch (err) {
      console.error(err);
    }
  };

  const isEmpty = Object.keys(consents).length === 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Consent Preferences</h1>
        <p className="text-sm text-gray-500 mt-1">
          Changes sync instantly across all your sessions.
        </p>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded">
            Firestore: real-time sync
          </span>
          <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded">
            Memorystore: enforced on every request
          </span>
          <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded">
            Datastore: change logged immutably
          </span>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 mb-4 border ${
          toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
          toast.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-700' :
          'bg-red-50 border-red-200 text-red-700'
        }`}>
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {toast.message}
        </div>
      )}

      {/* Info box */}
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 text-xs text-blue-700">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          Under <strong>GDPR Article 7</strong>, you may withdraw consent at any time.
          Withdrawal does not affect the lawfulness of processing carried out before withdrawal.
          Required consents (marked "Always on") are based on <strong>legitimate interest</strong> under Article 6(1)(f).
        </span>
      </div>

      {/* Consent toggles */}
      {isEmpty ? (
        <div className="text-gray-400 text-sm py-8 text-center">Loading consent settings from Firestore...</div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {Object.entries(consents).map(([purpose, data]) => (
            <ConsentToggle
              key={purpose}
              purpose={purpose}
              data={data}
              saving={saving === purpose}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}

      {/* Consent history */}
      <div className="mt-8">
        <button
          onClick={showHistory ? () => setShowHistory(false) : loadHistory}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <Clock className="w-4 h-4" />
          {showHistory ? 'Hide' : 'Show'} consent change history
        </button>

        {showHistory && (
          <div className="mt-3 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
              <p className="text-xs font-medium text-gray-600">
                Consent change log · Source: Firestore history subcollection
              </p>
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-gray-400 p-4">No changes recorded yet</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      h.action === 'CONSENT_GRANTED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {h.action}
                    </span>
                    <span className="text-xs text-gray-700">{h.purpose?.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-gray-400 ml-auto">
                      {h.changedAt ? new Date(h.changedAt).toLocaleString('de-DE') : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
