import { useState, useEffect, useMemo } from 'react';
import client from '../api/client';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import {
  Gauge, Zap, RefreshCw, Download, ArrowRightLeft,
  TrendingUp, AlertTriangle, Info, Loader2,
} from 'lucide-react';

// keeping order and colors consistent with AdminDashboard.jsx
const DB_ORDER = ['alloydb', 'firestore', 'memorystore', 'datastore'];

const DB_META = {
  alloydb:     { label: 'AlloyDB',     hex: '#3b82f6', bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700'   },
  firestore:   { label: 'Firestore',   hex: '#f97316', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
  memorystore: { label: 'Memorystore', hex: '#22c55e', bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700'  },
  datastore:   { label: 'Datastore',   hex: '#a855f7', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
};

const SAMPLE_OPTIONS = [
  { value: 10, label: 'Quick (10 samples)' },
  { value: 25, label: 'Standard (25 samples)' },
  { value: 50, label: 'Thorough (50 samples)' },
];
const CONCURRENCY_OPTIONS = [5, 10, 20, 30];

const MATRIX_ROWS = [
  ['dataModel', 'Data Model'],
  ['consistencyModel', 'Consistency Model'],
  ['durability', 'Durability'],
  ['transactionSupport', 'Transaction Support'],
  ['scalability', 'Scalability'],
  ['typicalLatency', 'Typical Latency'],
  ['costModel', 'Cost Model'],
  ['bestFit', 'Best Fit For'],
];

export default function BenchmarkDashboard() {
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [matrix, setMatrix] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [sampleSize, setSampleSize] = useState(25);
  const [concurrency, setConcurrency] = useState(10);
  const [compareA, setCompareA] = useState('firestore');
  const [compareB, setCompareB] = useState('memorystore');

  const loadHistory = async () => {
    try {
      const res = await client.get('/api/benchmark/history?limit=10');
      setHistory(res.data.data || []);
    } catch (err) {
      console.error('[Benchmark] history load failed:', err);
    }
  };

  const loadMatrix = async () => {
    try {
      const res = await client.get('/api/benchmark/matrix');
      setMatrix(res.data.data);
    } catch (err) {
      console.error('[Benchmark] matrix load failed:', err);
    }
  };

  useEffect(() => { loadMatrix(); loadHistory(); }, []);

  const runBenchmark = async () => {
    setRunning(true);
    setError('');
    try {
      const res = await client.post(`/api/benchmark/run?sampleSize=${sampleSize}&concurrency=${concurrency}`);
      setResult(res.data.data);
      await loadHistory();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Benchmark run failed');
    } finally {
      setRunning(false);
    }
  };

  const downloadJson = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark-${result.runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const readChartData = useMemo(() => buildLatencyChartData(result, 'read'), [result]);
  const writeChartData = useMemo(() => buildLatencyChartData(result, 'write'), [result]);
  const throughputData = useMemo(() => buildThroughputData(result), [result]);
  const trendData = useMemo(() => buildTrendData(history), [history]);
  const headToHead = useMemo(() => computeHeadToHead(result, compareA, compareB), [result, compareA, compareB]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">Database Performance Benchmark</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Measured (not simulated) latency, throughput, and cache-effect data across all four
            databases (AlloyDB, Firestore, Memorystore, and Datastore), captured by timing the
            exact operations each one performs in production.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Sample size</label>
          <select
            value={sampleSize}
            onChange={(e) => setSampleSize(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
            disabled={running}
          >
            {SAMPLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-500">Concurrency</label>
          <select
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
            disabled={running}
          >
            {CONCURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c} parallel</option>)}
          </select>
        </div>
        <button
          onClick={runBenchmark}
          disabled={running}
          className="flex items-center gap-2 bg-indigo-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 ml-auto"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
          {running ? 'Running…' : 'Run Benchmark'}
        </button>
        {result && (
          <button
            onClick={downloadJson}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Raw JSON
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-6">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {!result && !running && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-xl p-4 mb-6">
          <Info className="w-4 h-4 flex-shrink-0" />
          Click "Run Benchmark" to execute real timed calls against all four live databases.
          Nothing below is pre-filled, it only populates from an actual run.
        </div>
      )}

      {result && (
        <>
          {/* Head-to-head comparator */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <ArrowRightLeft className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Head-to-Head Comparison</h2>
            </div>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <DbSelect value={compareA} onChange={setCompareA} />
              <span className="text-xs text-gray-400">vs</span>
              <DbSelect value={compareB} onChange={setCompareB} />
            </div>
            {headToHead ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <RatioCard
                  title="Read latency"
                  winnerLabel={headToHead.readFaster ? DB_META[headToHead.readFaster].label : '—'}
                  ratio={headToHead.readRatio}
                  suffix="faster"
                  color={headToHead.readFaster ? DB_META[headToHead.readFaster].text : 'text-gray-700'}
                />
                <RatioCard
                  title="Write latency"
                  winnerLabel={headToHead.writeFaster ? DB_META[headToHead.writeFaster].label : '—'}
                  ratio={headToHead.writeRatio}
                  suffix="faster"
                  color={headToHead.writeFaster ? DB_META[headToHead.writeFaster].text : 'text-gray-700'}
                />
                <RatioCard
                  title="Throughput"
                  winnerLabel={headToHead.throughputHigher ? DB_META[headToHead.throughputHigher].label : '—'}
                  ratio={headToHead.throughputRatio}
                  suffix="higher ops/sec"
                  color={headToHead.throughputHigher ? DB_META[headToHead.throughputHigher].text : 'text-gray-700'}
                />
              </div>
            ) : (
              <p className="text-xs text-gray-400">Not enough data to compare these two.</p>
            )}
          </div>

          {/* cache-aside effect, the architectural centerpiece */}
          {result.cacheAside && !result.cacheAside.unavailable && (
            <div className="bg-gradient-to-br from-green-50 to-orange-50 border border-green-200 rounded-xl p-5 mb-6">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-green-700" />
                <h2 className="text-sm font-semibold text-gray-900">Cache-Aside Effect: Memorystore vs Firestore</h2>
              </div>
              <p className="text-xs text-gray-600 mb-4">{result.cacheAside.note}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-xs text-orange-600 font-medium mb-1">Cold path (Firestore + populate cache)</p>
                  <p className="text-2xl font-bold text-orange-700">{result.cacheAside.coldPathMs} ms</p>
                  <p className="text-[11px] text-gray-400">happens once per 5-min TTL window</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-green-600 font-medium mb-1">Warm path (Memorystore hit, avg)</p>
                  <p className="text-2xl font-bold text-green-700">{result.cacheAside.warmPathAvgMs} ms</p>
                  <p className="text-[11px] text-gray-400">p95: {result.cacheAside.warmPathP95Ms} ms</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 font-medium mb-1">Speedup factor</p>
                  <p className="text-2xl font-bold text-indigo-700">{result.cacheAside.speedupFactor ?? '—'}×</p>
                  <p className="text-[11px] text-gray-400">warm vs cold, this run</p>
                </div>
              </div>
            </div>
          )}

          {/* Read / write latency charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <LatencyChartCard title="Read Latency" subtitle={`avg ms · p95 ms · n=${result.sampleSize} sequential calls`} data={readChartData} />
            <LatencyChartCard title="Write Latency" subtitle={`avg ms · p95 ms · n=${result.sampleSize} sequential calls`} data={writeChartData} />
          </div>

          {/* Percentile tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <PercentileTable title="Read, full distribution" section={result.read} />
            <PercentileTable title="Write, full distribution" section={result.write} />
          </div>

          {/* Throughput */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Throughput: Concurrent Burst</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {result.throughput?.concurrency || concurrency} parallel requests fired simultaneously per database; ops/sec derived from total wall-clock time
              </p>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={throughputData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} formatter={(v) => [`${v} ops/sec`, '']} />
                <Bar dataKey="opsPerSec" radius={[4, 4, 0, 0]}>
                  {throughputData.map((d) => <Cell key={d.db} fill={DB_META[d.db].hex} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Historical trend across runs */}
      {trendData.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Trend Across Benchmark Runs</h2>
            <p className="text-xs text-gray-500 mt-0.5">Average read latency (ms) per database, most recent {trendData.length} runs</p>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendData} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {DB_ORDER.map((db) => (
                <Line key={db} type="monotone" dataKey={db} name={DB_META[db].label} stroke={DB_META[db].hex} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Qualitative architecture comparison matrix */}
      {matrix && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 overflow-x-auto">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Architectural Comparison Matrix</h2>
            <p className="text-xs text-gray-500 mt-0.5">Documented design characteristics, not measured, the theoretical half of the comparison</p>
          </div>
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr>
                <th className="text-left text-gray-400 font-medium py-2 pr-3 w-40">Dimension</th>
                {DB_ORDER.map((db) => (
                  <th key={db} className={`text-left font-semibold py-2 px-3 ${DB_META[db].text}`}>{DB_META[db].label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-gray-100">
                <td className="text-gray-400 py-2 pr-3 align-top">Role in this project</td>
                {DB_ORDER.map((db) => (
                  <td key={db} className="py-2 px-3 align-top text-gray-700">{matrix[db]?.roleInProject}</td>
                ))}
              </tr>
              {MATRIX_ROWS.map(([key, label]) => (
                <tr key={key} className="border-t border-gray-100">
                  <td className="text-gray-400 py-2 pr-3 align-top">{label}</td>
                  {DB_ORDER.map((db) => (
                    <td key={db} className="py-2 px-3 align-top text-gray-700">{matrix[db]?.[key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* methodology / limitations note */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1.5">
        <p className="font-medium text-gray-600">Methodology notes</p>
        <p>Latency = sequential single-call timing (process.hrtime, ms resolution), isolating per-call cost from queueing. Throughput = wall-clock time for N concurrent calls, a distinct metric from latency.</p>
        <p>All calls hit the live, deployed databases with the same query/document/key shape used in production, no numbers here are fabricated or interpolated.</p>
        <p>Limitations: single-region client, no sustained load test, and results reflect this app's specific access patterns (small joins, single-document reads) rather than a general-purpose database benchmark. They should be read as evidence for *this architecture's* design choices, not as universal database rankings.</p>
      </div>
    </div>
  );
}

// small presentational components

function DbSelect({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
    >
      {DB_ORDER.map((db) => <option key={db} value={db}>{DB_META[db].label}</option>)}
    </select>
  );
}

function RatioCard({ title, winnerLabel, ratio, suffix, color }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <p className="text-[11px] text-gray-400 mb-1">{title}</p>
      <p className={`text-lg font-bold ${color}`}>{winnerLabel}</p>
      <p className="text-xs text-gray-500">{ratio ? `${ratio}× ${suffix}` : 'n/a'}</p>
    </div>
  );
}

function LatencyChartCard({ title, subtitle, data }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
          <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} unit="ms" />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="avg" name="avg ms" radius={[4, 4, 0, 0]}>
            {data.map((d) => <Cell key={`avg-${d.db}`} fill={DB_META[d.db].hex} />)}
          </Bar>
          <Bar dataKey="p95" name="p95 ms" radius={[4, 4, 0, 0]} fillOpacity={0.45}>
            {data.map((d) => <Cell key={`p95-${d.db}`} fill={DB_META[d.db].hex} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PercentileTable({ title, section }) {
  if (!section) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 overflow-x-auto">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      <table className="w-full text-xs min-w-[420px]">
        <thead>
          <tr className="text-gray-400">
            <th className="text-left font-medium py-1.5 pr-2">Database</th>
            <th className="text-right font-medium py-1.5 px-2">min</th>
            <th className="text-right font-medium py-1.5 px-2">avg</th>
            <th className="text-right font-medium py-1.5 px-2">p50</th>
            <th className="text-right font-medium py-1.5 px-2">p95</th>
            <th className="text-right font-medium py-1.5 px-2">p99</th>
            <th className="text-right font-medium py-1.5 pl-2">max</th>
          </tr>
        </thead>
        <tbody>
          {DB_ORDER.map((db) => {
            const s = section[db];
            return (
              <tr key={db} className="border-t border-gray-100">
                <td className={`py-1.5 pr-2 font-medium ${DB_META[db].text}`}>{DB_META[db].label}</td>
                {s && !s.unavailable ? (
                  <>
                    <td className="text-right py-1.5 px-2 text-gray-600">{s.minMs}</td>
                    <td className="text-right py-1.5 px-2 text-gray-600">{s.avgMs}</td>
                    <td className="text-right py-1.5 px-2 text-gray-600">{s.p50Ms}</td>
                    <td className="text-right py-1.5 px-2 text-gray-600">{s.p95Ms}</td>
                    <td className="text-right py-1.5 px-2 text-gray-600">{s.p99Ms}</td>
                    <td className="text-right py-1.5 pl-2 text-gray-600">{s.maxMs}</td>
                  </>
                ) : (
                  <td colSpan={6} className="text-right py-1.5 px-2 text-gray-400 italic">unavailable</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// data transforms

function buildLatencyChartData(result, opType) {
  if (!result) return [];
  const section = result[opType] || {};
  return DB_ORDER.map((db) => ({
    name: DB_META[db].label,
    db,
    avg: section[db] && !section[db].unavailable ? section[db].avgMs : 0,
    p95: section[db] && !section[db].unavailable ? section[db].p95Ms : 0,
  }));
}

function buildThroughputData(result) {
  if (!result?.throughput) return [];
  return DB_ORDER.map((db) => ({
    name: DB_META[db].label,
    db,
    opsPerSec: result.throughput.opsPerSec?.[db] ?? 0,
  }));
}

function buildTrendData(history) {
  return [...history].reverse().map((run) => {
    const row = {
      date: new Date(run.ranAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    };
    DB_ORDER.forEach((db) => {
      const s = run.read?.[db];
      row[db] = s && !s.unavailable ? s.avgMs : null;
    });
    return row;
  });
}

function computeHeadToHead(result, dbA, dbB) {
  if (!result) return null;
  const safe = (section, db) => (section?.[db] && !section[db].unavailable ? section[db].avgMs : null);
  const ratio = (x, y) => (x != null && y != null && x > 0 && y > 0 ? Math.round((Math.max(x, y) / Math.min(x, y)) * 10) / 10 : null);

  const readA = safe(result.read, dbA), readB = safe(result.read, dbB);
  const writeA = safe(result.write, dbA), writeB = safe(result.write, dbB);
  const tpA = result.throughput?.opsPerSec?.[dbA], tpB = result.throughput?.opsPerSec?.[dbB];

  return {
    readFaster: readA != null && readB != null ? (readA < readB ? dbA : dbB) : null,
    readRatio: ratio(readA, readB),
    writeFaster: writeA != null && writeB != null ? (writeA < writeB ? dbA : dbB) : null,
    writeRatio: ratio(writeA, writeB),
    throughputHigher: tpA != null && tpB != null ? (tpA > tpB ? dbA : dbB) : null,
    throughputRatio: ratio(tpA, tpB),
  };
}
