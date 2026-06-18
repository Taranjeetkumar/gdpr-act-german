import { useState } from 'react';
import client from '../api/client';
import { AlertTriangle, CheckCircle, Loader, X } from 'lucide-react';

const DELETION_STEPS = [
  { key: 'alloyDB',     label: 'AlloyDB',     desc: 'Personal data records (cascade delete via FK)', color: 'bg-blue-400' },
  { key: 'firestore',   label: 'Firestore',   desc: 'Consent preferences and history',              color: 'bg-orange-400' },
  { key: 'memorystore', label: 'Memorystore', desc: 'Cached session and consent flags',             color: 'bg-green-400' },
  { key: 'datastore',   label: 'Datastore',   desc: 'Audit log kept, Art. 17(3) legal exception', color: 'bg-gray-300' },
];

export default function DeletionModal({ isOpen, onClose, userId, userFirebaseUid }) {
  const [step, setStep]     = useState('confirm'); // 'confirm' | 'processing' | 'done' | 'error'
  const [result, setResult] = useState(null);
  const [error, setError]   = useState('');

  if (!isOpen) return null;

  const handleErasure = async () => {
    if (!userId) { setError('User ID not found. Please refresh and try again.'); return; }
    setStep('processing');
    setError('');
    try {
      // create the erasure request first
      const reqRes = await client.post('/api/requests', {
        userId,
        requestType: 'erasure',
        reason: 'User-initiated Article 17 right to erasure request',
      });

      // then run the cascade deletion through all 4 databases
      const eraseRes = await client.post(`/api/requests/${reqRes.data.data.id}/execute-erasure`, {
        userId,
      });

      setResult(eraseRes.data.summary);
      setStep('done');
    } catch (err) {
      console.error('[DeletionModal] Erasure failed:', err);
      setError(err.response?.data?.error || err.message || 'Erasure failed. Please try again.');
      setStep('error');
    }
  };

  const handleClose = () => {
    if (step === 'done') {
      // force logout since the user's data (and account) is gone
      window.location.href = '/login';
    } else {
      setStep('confirm');
      setResult(null);
      setError('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="bg-red-50 p-2 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Request Data Erasure</h2>
              <p className="text-xs text-gray-500">GDPR Article 17, right to be forgotten</p>
            </div>
          </div>
          {step !== 'processing' && (
            <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="p-6">
          {/* confirm step */}
          {step === 'confirm' && (
            <>
              <p className="text-sm text-gray-600 mb-4">
                This will permanently delete your personal data from all systems. This action cannot be undone.
              </p>

              <div className="space-y-2 mb-6">
                {DELETION_STEPS.map(({ key, label, desc, color }) => (
                  <div key={key} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${color}`} />
                    <div>
                      <p className="text-xs font-semibold text-gray-800">{label}</p>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-xs text-amber-700">
                You will be automatically logged out after erasure. Your account cannot be recovered.
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleErasure}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Confirm Erasure
                </button>
              </div>
            </>
          )}

          {/* processing step */}
          {step === 'processing' && (
            <div className="text-center py-6">
              <Loader className="w-10 h-10 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm font-medium text-gray-700 mb-1">Cascading deletion through all databases...</p>
              <p className="text-xs text-gray-400">AlloyDB, Firestore, Memorystore, Datastore (audit preserved)</p>
            </div>
          )}

          {/* done step */}
          {step === 'done' && result && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h3 className="text-base font-semibold text-gray-900">Erasure Complete</h3>
              </div>
              <div className="space-y-2 mb-4">
                {Object.entries(result).map(([system, msg]) => (
                  <div key={system} className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs font-semibold text-gray-700 capitalize">{system}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{msg}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mb-4">
                Completed at {new Date().toLocaleString('de-DE')}. You will be redirected to login.
              </p>
              <button
                onClick={handleClose}
                className="w-full px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-medium"
              >
                Done, go to login
              </button>
            </>
          )}

          {/* error step */}
          {step === 'error' && (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-red-700">Erasure failed</p>
                <p className="text-xs text-red-600 mt-1">{error}</p>
              </div>
              <button
                onClick={() => setStep('confirm')}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
