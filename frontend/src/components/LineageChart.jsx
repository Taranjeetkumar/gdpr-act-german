import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';

const ACTION_COLORS = {
  DATA_READ:       '#3b82f6',
  CONSENT_GRANTED: '#22c55e',
  CONSENT_REVOKED: '#ef4444',
  DATA_WRITE:      '#6366f1',
  USER_REGISTERED: '#a855f7',
};

export function ActivityLineChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
          labelStyle={{ fontWeight: 600 }}
        />
        <Line
          type="monotone"
          dataKey="events"
          stroke="#7c3aed"
          strokeWidth={2}
          dot={{ r: 3, fill: '#7c3aed' }}
          activeDot={{ r: 5 }}
          name="Events"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ActionBreakdownChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="action" tick={{ fontSize: 9, fill: '#9ca3af' }} />
        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} allowDecimals={false} />
        <Tooltip
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
        />
        <Bar dataKey="count" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Events" />
      </BarChart>
    </ResponsiveContainer>
  );
}
