import { Lock, Loader } from 'lucide-react';

const PURPOSE_META = {
  marketing_emails:    { desc: 'Promotional emails and newsletters', color: 'blue',   article: 'Art. 6(1)(a)' },
  analytics:           { desc: 'Usage analysis to improve the service', color: 'purple', article: 'Art. 6(1)(a)' },
  personalization:     { desc: 'Tailored content and recommendations', color: 'indigo', article: 'Art. 6(1)(a)' },
  third_party_sharing: { desc: 'Data sharing with trusted partners', color: 'red',    article: 'Art. 6(1)(a)' },
  functional:          { desc: 'Session management, always required', color: 'gray',  article: 'Art. 6(1)(f)' },
  security:            { desc: 'Fraud detection, always required', color: 'gray',    article: 'Art. 6(1)(f)' },
};

export default function ConsentToggle({ purpose, data, saving, onToggle }) {
  const meta = PURPOSE_META[purpose] || { desc: '', color: 'gray', article: '' };
  const locked = purpose === 'functional' || purpose === 'security';

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
      data.granted
        ? 'border-green-200 bg-green-50/50'
        : locked
          ? 'border-gray-100 bg-gray-50'
          : 'border-gray-200 bg-white'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800">{data.label || purpose}</span>
          {locked && <Lock className="w-3 h-3 text-gray-400 flex-shrink-0" />}
          <span className="text-xs text-gray-400 font-mono">{meta.article}</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{meta.desc || data.description}</p>
      </div>

      <div className="flex-shrink-0">
        {locked ? (
          <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-md border border-gray-200">
            Always on
          </span>
        ) : saving ? (
          <div className="w-12 h-6 flex items-center justify-center">
            <Loader className="w-4 h-4 text-blue-600 animate-spin" />
          </div>
        ) : (
          <button
            onClick={() => onToggle(purpose, !data.granted)}
            className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 ${
              data.granted ? 'bg-green-500' : 'bg-gray-200'
            }`}
            role="switch"
            aria-checked={data.granted}
            aria-label={`Toggle ${data.label || purpose}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                data.granted ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        )}
      </div>
    </div>
  );
}
