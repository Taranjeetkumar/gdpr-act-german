import { useState } from 'react';
import { ChevronDown, ChevronRight, Calendar, Tag } from 'lucide-react';

const SENSITIVITY_STYLES = {
  low:    { badge: 'badge-low',    bar: 'bg-emerald-400', label: 'Low Risk' },
  medium: { badge: 'badge-medium', bar: 'bg-amber-400',   label: 'Medium Risk' },
  high:   { badge: 'badge-high',   bar: 'bg-red-400',     label: 'High Risk' },
  special:{ badge: 'badge-special',bar: 'bg-purple-500',  label: 'Special Category' },
};

const LEGAL_BASIS_LABELS = {
  contract:             'Contract (Art. 6(1)(b))',
  consent:              'Consent (Art. 6(1)(a))',
  legitimate_interest:  'Legitimate Interest (Art. 6(1)(f))',
  legal_obligation:     'Legal Obligation (Art. 6(1)(c))',
};

export default function DataCategoryCard({ category, sensitivity, legalBasis, items }) {
  const [expanded, setExpanded] = useState(false);
  const style = SENSITIVITY_STYLES[sensitivity] || SENSITIVITY_STYLES.medium;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className={`w-1 h-10 rounded-full flex-shrink-0 ${style.bar}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{category}</span>
            <span className={style.badge}>{style.label}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {LEGAL_BASIS_LABELS[legalBasis] || legalBasis} · {items.length} record{items.length !== 1 ? 's' : ''}
          </p>
        </div>
        {expanded
          ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        }
      </button>

      {expanded && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {items.map((item) => (
            <div key={item.id} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-gray-400 mb-0.5">Value</p>
                <p className="font-mono text-gray-800 bg-gray-50 px-2 py-1 rounded text-[11px] break-all">
                  {item.data_value}
                </p>
              </div>
              <div>
                <p className="text-gray-400 mb-0.5 flex items-center gap-1">
                  <Tag className="w-3 h-3" /> Source
                </p>
                <p className="text-gray-700 capitalize">{item.source?.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-gray-400 mb-0.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Expires
                </p>
                <p className="text-gray-700">
                  {item.expires_at
                    ? new Date(item.expires_at).toLocaleDateString('de-DE')
                    : 'No expiry set'}
                </p>
                <p className="text-gray-400 mt-0.5">
                  Collected: {new Date(item.collected_at).toLocaleDateString('de-DE')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
