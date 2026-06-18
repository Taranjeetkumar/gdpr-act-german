import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import client from '../api/client';
import { openSse } from '../api/sse';
import {
  Radio, RefreshCw, Zap, Clock, ArrowRight, Wifi, WifiOff,
  MousePointerClick, Info, CheckCircle2,
} from 'lucide-react';

const PURPOSES = [
  { value: 'marketing_emails', label: 'Marketing Emails' },
  { value: 'analytics', label: 'Analytics Tracking' },
  { value: 'personalization', label: 'Personalization' },
  { value: 'third_party_sharing', label: 'Third-Party Sharing' },
];

const TTL_OPTIONS = [5, 10, 20];

export default function RealtimeComparison() {
  const { user } = useAuth();
  const [purpose, setPurpose] = useState('marketing_emails');
  const [demoTtl, setDemoTtl] = useState(10);

  // Firestore, pushed via SSE
  const [firestoreValue, setFirestoreValue] = useState(null);
  const [firestoreConnected, setFirestoreConnected] = useState(false);
  const [firestoreReceivedAt, setFirestoreReceivedAt] = useState(null);

  // Memorystore, polled demo cache (cache-aside, short TTL)
  const [cacheValue, setCacheValue] = useState(null);
  const [cacheTtlRemaining, setCacheTtlRemaining] = useState(null);
  const [cacheJustRefreshed, setCacheJustRefreshed] = useState(false);
  const [cacheUnreachable, setCacheUnreachable] = useState(false);

  // AlloyDB, pull-only, only updates when the user clicks Refresh
  const [alloydbValue, setAlloydbValue] = useState(null);
  const [alloydbCheckedAt, setAlloydbCheckedAt] = useState(null);
  const [alloydbLoading, setAlloydbLoading] = useState(false);

  const [toggling, setToggling] = useState(false);
  const [log, setLog] = useState([]);
  const toggleSentAtRef = useRef(null);
  const lastLoggedFirestoreRef = useRef(null);
  const lastLoggedCacheRef = useRef(null);

  const addLog = useCallback((source, message) => {
    setLog((prev) => [
      { id: `${Date.now()}-${Math.random()}`, time: new Date(), source, message },
      ...prev,
    ].slice(0, 12));
  }, []);

  // open the Firestore SSE stream once we know who the user is
  useEffect(() => {
    if (!user) return;
    setFirestoreConnected(false);
    const unsubscribe = openSse(
      `/api/realtime/consent/${user.uid}/stream`,
      (event, data) => {
        if (event === 'update') {
          setFirestoreConnected(true);
          const granted = Boolean(data.consents?.[purpose]?.granted);
          setFirestoreValue(granted);
          setFirestoreReceivedAt(Date.now());
        }
      },
      () => setFirestoreConnected(false)
    );
    return unsubscribe;
  }, [user, purpose]);

  // Log Firestore transitions (and latency since the last toggle we sent)
  useEffect(() => {
    if (firestoreValue === null) return;
    if (lastLoggedFirestoreRef.current === firestoreValue) return;
    lastLoggedFirestoreRef.current = firestoreValue;
    const elapsed = toggleSentAtRef.current ? Date.now() - toggleSentAtRef.current : null;
    addLog('firestore', elapsed != null
      ? `Firestore pushed the new value in ${elapsed}ms, no refresh or poll needed.`
      : `Firestore stream connected, current value: ${firestoreValue ? 'granted' : 'revoked'}.`);
  }, [firestoreValue, addLog]);

  // poll the short-TTL demo cache every second
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let loggedUnreachable = false;
    const poll = async () => {
      try {
        const res = await client.get(
          `/api/realtime/consent/${user.uid}/${purpose}/cache?ttl=${demoTtl}`
        );
        if (cancelled) return;
        const { value, cacheHit, ttlRemainingSeconds } = res.data.data;
        setCacheUnreachable(false);
        setCacheValue(value);
        setCacheTtlRemaining(ttlRemainingSeconds);
        if (!cacheHit) {
          setCacheJustRefreshed(true);
          setTimeout(() => setCacheJustRefreshed(false), 1200);
        }
        if (lastLoggedCacheRef.current !== null && lastLoggedCacheRef.current !== value) {
          const elapsed = toggleSentAtRef.current ? Date.now() - toggleSentAtRef.current : null;
          addLog('memorystore', elapsed != null
            ? `Memorystore demo cache caught up ${elapsed}ms after the toggle (waited out its ${demoTtl}s TTL).`
            : `Memorystore demo cache value changed.`);
        }
        lastLoggedCacheRef.current = value;
      } catch (err) {
        if (cancelled) return;
        // a 503 here usually means Redis is unreachable (MEMORYSTORE_HOST
        // is a private VPC IP and this backend can't route to it). show
        // that instead of leaving the last value on screen, which used to
        // render as a permanently misleading "Revoked" the first time this
        // happened.
        setCacheUnreachable(true);
        setCacheValue(null);
        if (!loggedUnreachable) {
          loggedUnreachable = true;
          addLog('memorystore', `Memorystore cache demo unreachable: ${err.response?.data?.message || err.message}`);
        }
      }
    };
    poll();
    const interval = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user, purpose, demoTtl, addLog]);

  // Reset comparison state when switching purpose
  useEffect(() => {
    setAlloydbValue(null);
    setAlloydbCheckedAt(null);
    lastLoggedFirestoreRef.current = null;
    lastLoggedCacheRef.current = null;
  }, [purpose]);

  const refreshAlloydb = async () => {
    if (!user) return;
    setAlloydbLoading(true);
    try {
      const res = await client.get(`/api/realtime/consent/${user.uid}/${purpose}/alloydb`);
      const snapshot = res.data.data;
      const newValue = snapshot ? Boolean(snapshot.granted) : null;
      const changed = alloydbValue !== null && alloydbValue !== newValue;
      setAlloydbValue(newValue);
      setAlloydbCheckedAt(Date.now());
      const elapsed = toggleSentAtRef.current ? Date.now() - toggleSentAtRef.current : null;
      addLog('alloydb', changed || alloydbValue === null
        ? `AlloyDB already had the new value${elapsed != null ? ` (written ${elapsed}ms ago)` : ''}, it just took a manual refresh to find out.`
        : `AlloyDB checked, no change since last refresh.`);
    } catch {
      // non-blocking
    } finally {
      setAlloydbLoading(false);
    }
  };

  const triggerToggle = async () => {
    if (!user || toggling) return;
    setToggling(true);
    const current = firestoreValue ?? false;
    const next = !current;
    toggleSentAtRef.current = Date.now();
    addLog('toggle', `Sent: set "${PURPOSES.find(p => p.value === purpose)?.label}" to ${next ? 'granted' : 'revoked'}.`);
    try {
      await client.post(`/api/consent/${user.uid}`, { purpose, granted: next });
    } catch (err) {
      addLog('toggle', `Failed to send toggle: ${err.message}`);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-indigo-600" />
          <h1 className="text-2xl font-bold text-gray-900">Live Database Behavior Comparison</h1>
        </div>
        <p className="text-sm text-gray-500 mt-1 max-w-3xl">
          One real consent change, written once, observed through three different databases at once.
          Firestore, Memorystore, and AlloyDB all receive the exact same update in the same request.
          The difference below is entirely in <em>how</em> each one lets a client find out, not in
          when the underlying value itself changes.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Consent purpose</label>
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
          >
            {PURPOSES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Demo cache TTL</label>
          <select
            value={demoTtl}
            onChange={(e) => setDemoTtl(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
          >
            {TTL_OPTIONS.map((t) => <option key={t} value={t}>{t}s (real prod TTL is 5min)</option>)}
          </select>
        </div>
        <button
          onClick={triggerToggle}
          disabled={toggling || !user}
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 ml-auto"
        >
          <MousePointerClick className="w-4 h-4" />
          {toggling ? 'Sending…' : 'Toggle consent now'}
        </button>
      </div>

      {/* Three panels */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {/* Firestore */}
        <Panel
          title="Firestore"
          subtitle="Push, admin SDK onSnapshot over SSE"
          color="orange"
          icon={firestoreConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          statusLabel={firestoreConnected ? 'Live' : 'Connecting…'}
          statusLive={firestoreConnected}
        >
          <ValueDisplay value={firestoreValue} />
          <p className="text-xs text-gray-400 mt-3">
            {firestoreReceivedAt
              ? `Last push received ${formatAgo(firestoreReceivedAt)}`
              : 'Waiting for first event…'}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            No refresh needed, the server holds this connection open and writes a new
            event the instant Firestore notifies it of a change.
          </p>
        </Panel>

        {/* Memorystore */}
        <Panel
          title="Memorystore"
          subtitle={`Cache-aside, ${demoTtl}s demo TTL`}
          color="green"
          icon={<Clock className="w-4 h-4" />}
          statusLabel={
            cacheUnreachable ? 'Unreachable'
            : cacheJustRefreshed ? 'Refreshed'
            : `TTL ${cacheTtlRemaining ?? '—'}s`
          }
          statusLive={cacheJustRefreshed && !cacheUnreachable}
        >
          {cacheUnreachable ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              <strong>Redis unreachable.</strong> Check that MEMORYSTORE_HOST/PORT in
              backend/.env point to a Redis instance this backend can actually
              route to. Memorystore only exposes a private VPC IP, so a backend
              running outside that VPC (e.g. your laptop) can't reach it directly.
            </div>
          ) : (
            <ValueDisplay value={cacheValue} />
          )}
          <TtlBar remaining={cacheTtlRemaining} total={demoTtl} />
          <p className="text-xs text-gray-500 mt-2">
            Polled every second from the browser. Will keep showing the <strong>old</strong> value
            until its TTL expires, then reads through to Firestore and catches up. Production
            uses a 5-minute TTL, this demo shortens it so the lag is visible.
          </p>
        </Panel>

        {/* AlloyDB */}
        <Panel
          title="AlloyDB"
          subtitle="Pull-only, plain SELECT"
          color="blue"
          icon={<RefreshCw className={`w-4 h-4 ${alloydbLoading ? 'animate-spin' : ''}`} />}
          statusLabel={alloydbCheckedAt ? `Checked ${formatAgo(alloydbCheckedAt)}` : 'Not checked yet'}
          statusLive={false}
        >
          <ValueDisplay value={alloydbValue} />
          <button
            onClick={refreshAlloydb}
            className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh now
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Already holds the new value the moment you toggle, there's just no mechanism to tell
            an open tab about it. You have to ask.
          </p>
        </Panel>
      </div>

      {/* Event log */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">What just happened</h2>
        </div>
        {log.length === 0 ? (
          <p className="text-sm text-gray-400">Click "Toggle consent now" and watch the three panels above.</p>
        ) : (
          <div className="space-y-1.5">
            {log.map((entry) => (
              <div key={entry.id} className="flex items-start gap-2 text-xs">
                <span className="text-gray-400 w-16 flex-shrink-0 tabular-nums">
                  {entry.time.toLocaleTimeString('de-DE')}
                </span>
                <SourceBadge source={entry.source} />
                <span className="text-gray-700">{entry.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Explanation footer */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1.5">
        <p className="font-medium text-gray-600 flex items-center gap-1.5"><Info className="w-3.5 h-3.5" /> Reading this demo</p>
        <p>
          The same POST /api/consent/:userId request writes to Firestore, Memorystore, and AlloyDB
          together (see backend/src/routes/consent.js). All three are equally up to date the
          instant that request completes. The panels above aren't racing each other to be
          "correct", they're demonstrating three different <strong>propagation</strong> models for
          the same fact: push (Firestore), TTL-bounded cache (Memorystore), and pull-on-demand
          (AlloyDB). That's the architectural trade-off the README documents in prose, this page
          makes it observable.
        </p>
      </div>
    </div>
  );
}

// small presentational pieces

const COLOR_MAP = {
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700',  dot: 'bg-green-500' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700',   dot: 'bg-blue-500' },
};

function Panel({ title, subtitle, color, icon, statusLabel, statusLive, children }) {
  const c = COLOR_MAP[color];
  return (
    <div className={`bg-white border ${c.border} rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className={`text-sm font-semibold ${c.text}`}>{title}</h3>
        <span className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
          {statusLive && <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse`} />}
          {icon}
          {statusLabel}
        </span>
      </div>
      <p className="text-[11px] text-gray-400 mb-3">{subtitle}</p>
      {children}
    </div>
  );
}

function ValueDisplay({ value }) {
  if (value === null) {
    return <p className="text-2xl font-bold text-gray-300">—</p>;
  }
  return (
    <div className={`flex items-center gap-2 text-2xl font-bold ${value ? 'text-green-600' : 'text-red-500'}`}>
      {value ? <CheckCircle2 className="w-6 h-6" /> : <ArrowRight className="w-6 h-6 rotate-180" />}
      {value ? 'Granted' : 'Revoked'}
    </div>
  );
}

function TtlBar({ remaining, total }) {
  if (remaining == null || !total) return <div className="h-1.5 bg-gray-100 rounded-full mt-3" />;
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
  return (
    <div className="h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
      <div className="h-full bg-green-400 transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

function SourceBadge({ source }) {
  const map = {
    firestore: { label: 'Firestore', cls: 'bg-orange-100 text-orange-700' },
    memorystore: { label: 'Memorystore', cls: 'bg-green-100 text-green-700' },
    alloydb: { label: 'AlloyDB', cls: 'bg-blue-100 text-blue-700' },
    toggle: { label: 'You', cls: 'bg-indigo-100 text-indigo-700' },
  };
  const m = map[source] || { label: source, cls: 'bg-gray-100 text-gray-600' };
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${m.cls}`}>{m.label}</span>;
}

function formatAgo(ts) {
  const seconds = Math.round((Date.now() - ts) / 1000);
  if (seconds < 1) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}
