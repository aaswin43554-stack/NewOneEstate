import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, FormInput, StatCard } from '../../components/ui';

function fmtMSS(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function parseMSS(str) {
  const [m, s] = (str || '').split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}

// Roast phases — each phase gets a shade in the coffee scale
const PHASES = [
  { key: 'drying',       label: 'Drying',      range: [0, 0.3],  color: '#F2EAE0' },
  { key: 'maillard',     label: 'Maillard',    range: [0.3, 0.7], color: '#C9B49A' },
  { key: 'development',  label: 'Development', range: [0.7, 0.9], color: '#8B6A47' },
  { key: 'done',         label: 'Done',        range: [0.9, 1.0], color: '#533A24' },
];

function PhaseBar({ elapsedPct }) {
  return (
    <div className="flex rounded-full overflow-hidden h-2 w-full">
      {PHASES.map((phase, i) => {
        const width = (phase.range[1] - phase.range[0]) * 100;
        const filled = elapsedPct >= phase.range[1] * 100;
        const partial = elapsedPct > phase.range[0] * 100 && elapsedPct < phase.range[1] * 100;
        const fillPct = partial
          ? ((elapsedPct - phase.range[0] * 100) / (width))
          : filled ? 1 : 0;
        return (
          <div
            key={phase.key}
            className="relative"
            style={{ width: `${width}%`, background: '#F2EAE0' }}
            title={phase.label}
          >
            <div
              className="absolute inset-y-0 left-0 transition-all"
              style={{ width: `${fillPct * 100}%`, background: phase.color }}
            />
          </div>
        );
      })}
    </div>
  );
}

function currentPhaseName(elapsedPct) {
  for (const phase of [...PHASES].reverse()) {
    if (elapsedPct >= phase.range[0] * 100) return phase.label;
  }
  return 'Drying';
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-3 py-2 rounded-lg border text-xs"
      style={{ background: '#FDFAF6', borderColor: '#E0D0BC', color: '#533A24' }}
    >
      <p>{fmtMSS(label)}</p>
      <p style={{ fontWeight: 500 }}>{payload[0]?.value?.toFixed(1)}°C</p>
    </div>
  );
};

export default function RoastLive() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [session,      setSession]      = useState(null);
  const [profile,      setProfile]      = useState(null);
  const [points,       setPoints]       = useState([]);
  const [elapsed,      setElapsed]      = useState(0);
  const [currentTemp,  setCurrentTemp]  = useState(null);
  const [noteText,     setNoteText]     = useState('');
  const [noteOpen,     setNoteOpen]     = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [varianceBanner, setVarianceBanner] = useState(null);
  const [completeForm, setCompleteForm] = useState({
    roastedKg: '', ejectTemp: '', totalMSS: '', devMSS: '',
  });
  const [error,  setError]  = useState('');
  const [saving, setSaving] = useState(false);
  const [hwLost, setHwLost] = useState(false);

  const wsRef    = useRef(null);
  const timerRef = useRef(null);
  const startRef = useRef(null);

  // Load session + profile
  useEffect(() => {
    api.get(`/roast-sessions/${id}`)
      .then(r => r.json())
      .then(async ({ session: s }) => {
        setSession(s);
        startRef.current = new Date(s.started_at);
        let proc = null;
        if (!s.is_development && s.allocation_id) {
          const ar = await api.get(`/allocations/${s.allocation_id}`);
          const ad = await ar.json();
          proc = ad.allocation?.process;
        } else {
          const prefixMap = { 'DEV-AN': 'Anaerobic', 'DEV-W': 'Washed', 'DEV-H': 'Honey', 'DEV-N': 'Natural' };
          for (const [prefix, p] of Object.entries(prefixMap)) {
            if (s.batch_code?.startsWith(prefix)) { proc = p; break; }
          }
        }
        if (proc) {
          api.get(`/profiles/active?process=${proc}`)
            .then(r => r.json())
            .then(d => setProfile(d.profile || null))
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [id]);

  // WebSocket
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = localStorage.getItem('access_token') || '';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/roast-live?session_id=${id}&token=${encodeURIComponent(token)}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.t !== undefined) {
        setPoints(prev => [...prev, { t: data.t, temp: data.temp }]);
        setCurrentTemp(data.temp);
      } else if (data.event === 'eject_suggested') {
        setCompleteOpen(true);
      } else if (data.event === 'hardware_disconnected') {
        setHwLost(true);
      }
    };
    return () => ws.close();
  }, [id]);

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (startRef.current) setElapsed(Math.floor((Date.now() - startRef.current.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const targetDuration = session?.profile_duration_s || 600; // default 10 min
  const elapsedPct = Math.min(100, (elapsed / targetDuration) * 100);

  const ror = points.length >= 8
    ? ((points[points.length - 1].temp - points[points.length - 8].temp) / (15 / 60)).toFixed(1)
    : null;

  async function addNote() {
    if (!noteText.trim()) return;
    await api.post(`/roast-sessions/${id}/notes`, { note_text: noteText.trim(), roast_position_s: elapsed });
    setNoteText('');
    setNoteOpen(false);
  }

  async function handleComplete(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const totalS = parseMSS(completeForm.totalMSS);
    const devS   = parseMSS(completeForm.devMSS);
    if (devS > totalS) { setError('Dev time cannot exceed total time.'); setSaving(false); return; }
    const body = {
      roasted_weight_out_g:    Math.round(parseFloat(completeForm.roastedKg) * 1000),
      eject_temp_c:            parseInt(completeForm.ejectTemp),
      total_time_seconds:      totalS,
      development_time_seconds: devS,
      temperature_curve:       points,
    };
    try {
      const res = await api.put(`/roast-sessions/${id}/complete`, body);
      const d   = await res.json();
      if (!res.ok) { setError(d.error || 'Failed.'); return; }
      if (d.session.variance_flagged) {
        setVarianceBanner({ actual: parseInt(completeForm.ejectTemp), target: d.profile_eject_temp_c });
      }
      wsRef.current?.send('complete');
      setTimeout(() => navigate(`/roast/${id}`), 1500);
    } catch { setError('Network error.'); }
    finally   { setSaving(false); }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl text-coffee-900" style={{ fontWeight: 500 }}>
              {session?.batch_code || 'Live Roast'}
            </h1>
            <p className="text-sm text-coffee-400 mt-0.5">
              {session?.is_development ? 'Development run' : 'Production run'}
              {profile && ` · profile target ${profile.eject_temp_c}°C`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: '#3B6D11', boxShadow: '0 0 0 4px #EAF3DE' }}
            />
            <span className="text-xs text-coffee-500">Live</span>
          </div>
        </div>

        {/* Hardware disconnected banner */}
        {hwLost && (
          <div
            className="mb-4 px-4 py-3 rounded-xl text-sm flex items-center justify-between"
            style={{ background: '#FEF3C7', color: '#92400E' }}
          >
            <span>Hardware disconnected — temperature data unavailable. Reconnect the roaster and refresh.</span>
            <button onClick={() => setHwLost(false)} className="ml-4 text-xs underline">Dismiss</button>
          </div>
        )}

        {/* Variance banner */}
        {varianceBanner && (
          <div
            className="mb-4 px-4 py-3 rounded-xl text-sm"
            style={{ background: '#FCEBEB', color: '#A32D2D' }}
          >
            Variance detected — Actual: {varianceBanner.actual}°C · Target: {varianceBanner.target}°C ·
            Delta: {varianceBanner.actual - varianceBanner.target > 0 ? '+' : ''}{varianceBanner.actual - varianceBanner.target}°C
          </div>
        )}

        {/* Phase bar */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-coffee-400 uppercase tracking-wide">
              Phase: {currentPhaseName(elapsedPct)}
            </p>
            <p className="text-xs text-coffee-400">{fmtMSS(elapsed)}</p>
          </div>
          <PhaseBar elapsedPct={elapsedPct} />
          <div className="flex justify-between text-xs text-coffee-300 mt-1">
            {PHASES.map(p => <span key={p.key}>{p.label}</span>)}
          </div>
        </div>

        {/* Large temp displays */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="bg-white border border-coffee-200 rounded-xl p-5 text-center">
            <p className="text-xs text-coffee-400 uppercase tracking-wide mb-2">Bean Temp</p>
            <p
              className="font-mono text-coffee-900"
              style={{ fontSize: 48, fontWeight: 500, lineHeight: 1 }}
            >
              {currentTemp != null ? Math.round(currentTemp) : '—'}
            </p>
            <p className="text-coffee-400 text-sm mt-1">°C</p>
          </div>
          <div className="bg-white border border-coffee-200 rounded-xl p-5 text-center">
            <p className="text-xs text-coffee-400 uppercase tracking-wide mb-2">Elapsed</p>
            <p
              className="font-mono text-coffee-900"
              style={{ fontSize: 48, fontWeight: 500, lineHeight: 1 }}
            >
              {fmtMSS(elapsed)}
            </p>
            <p className="text-coffee-400 text-sm mt-1">mm:ss</p>
          </div>
          <div className="bg-white border border-coffee-200 rounded-xl p-5 text-center">
            <p className="text-xs text-coffee-400 uppercase tracking-wide mb-2">Rate of Rise</p>
            <p
              className="font-mono text-coffee-900"
              style={{ fontSize: 48, fontWeight: 500, lineHeight: 1 }}
            >
              {ror ?? '—'}
            </p>
            <p className="text-coffee-400 text-sm mt-1">°C/min</p>
          </div>
        </div>

        {/* Temp chart */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5 mb-5">
          <p className="text-xs text-coffee-400 uppercase tracking-wide mb-4">Temperature Curve</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={points} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="0" stroke="#F2EAE0" />
              <XAxis
                dataKey="t"
                tickFormatter={fmtMSS}
                tick={{ fontSize: 11, fill: '#A8896A' }}
                axisLine={{ stroke: '#E0D0BC' }}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 11, fill: '#A8896A' }}
                axisLine={false}
                tickLine={false}
                unit="°"
                width={36}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="temp"
                stroke="#EF9F27"
                dot={false}
                strokeWidth={2}
                name="BT"
                isAnimationActive={false}
              />
              {profile && (
                <ReferenceLine
                  y={profile.eject_temp_c}
                  stroke="#C9B49A"
                  strokeDasharray="6 3"
                  label={{
                    value: `Target ${profile.eject_temp_c}°C`,
                    fill: '#A8896A',
                    fontSize: 11,
                    position: 'insideTopRight',
                  }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Note + Complete */}
        <div className="flex gap-3">
          {noteOpen ? (
            <div className="flex-1 flex gap-2">
              <input
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Observation note…"
                className="flex-1 h-9 px-3 text-sm border border-coffee-200 rounded-lg"
              />
              <span className="text-xs text-coffee-400 self-center whitespace-nowrap">
                {fmtMSS(elapsed)}
              </span>
              <Button variant="primary" size="sm" onClick={addNote}>Save</Button>
              <Button variant="ghost" size="sm" onClick={() => setNoteOpen(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setNoteOpen(true)}>
              + Note
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => setCompleteOpen(true)}
            className="ml-auto"
            style={{ background: '#3B6D11' }}
          >
            Complete Roast
          </Button>
        </div>
      </div>

      {/* Complete modal */}
      {completeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(34,21,8,0.2)' }}>
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6 border border-coffee-200"
          >
            <h2 className="text-base text-coffee-900 mb-5" style={{ fontWeight: 500 }}>
              Complete Roast
            </h2>
            <form onSubmit={handleComplete} className="space-y-4">
              <FormInput
                label="Roasted Weight (kg)"
                type="number" step="0.001" required
                value={completeForm.roastedKg}
                onChange={e => setCompleteForm(p => ({ ...p, roastedKg: e.target.value }))}
                placeholder="e.g. 4.200"
              />
              <FormInput
                label="Eject Temp (°C)"
                type="number" required
                value={completeForm.ejectTemp}
                onChange={e => setCompleteForm(p => ({ ...p, ejectTemp: e.target.value }))}
                placeholder="e.g. 207"
              />
              <FormInput
                label="Total Time (MM:SS)"
                type="text" required pattern="\d{1,2}:\d{2}"
                value={completeForm.totalMSS}
                onChange={e => setCompleteForm(p => ({ ...p, totalMSS: e.target.value }))}
                placeholder="09:30"
                className="font-mono"
              />
              <FormInput
                label="Development Time (MM:SS)"
                type="text" required pattern="\d{1,2}:\d{2}"
                value={completeForm.devMSS}
                onChange={e => setCompleteForm(p => ({ ...p, devMSS: e.target.value }))}
                placeholder="01:30"
                className="font-mono"
              />
              {error && (
                <p className="text-xs" style={{ color: '#A32D2D' }}>{error}</p>
              )}
              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={saving} className="flex-1"
                  style={{ background: '#3B6D11', color: '#fff' }}>
                  {saving ? 'Saving…' : 'Complete'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setCompleteOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}

