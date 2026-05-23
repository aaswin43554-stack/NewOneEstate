import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

function fmtMSS(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseMSS(str) {
  const [m, s] = (str || '').split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}

export default function RoastLive() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [session, setSession]       = useState(null);
  const [profile, setProfile]       = useState(null);
  const [points, setPoints]         = useState([]);
  const [elapsed, setElapsed]       = useState(0);
  const [currentTemp, setCurrentTemp] = useState(null);
  const [noteText, setNoteText]     = useState('');
  const [noteOpen, setNoteOpen]     = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [varianceBanner, setVarianceBanner] = useState(null);
  const [completeForm, setCompleteForm] = useState({
    roastedKg: '', ejectTemp: '', totalMSS: '', devMSS: '',
  });
  const [error, setError]   = useState('');
  const [saving, setSaving] = useState(false);

  const wsRef       = useRef(null);
  const timerRef    = useRef(null);
  const startRef    = useRef(null);

  // Fetch session + profile on mount
  useEffect(() => {
    api.get(`/roast-sessions/${id}`)
      .then(r => r.json())
      .then(async ({ session: s }) => {
        setSession(s);
        startRef.current = new Date(s.started_at);
        // Derive process
        let proc = null;
        if (!s.is_development && s.allocation_id) {
          const ar = await api.get(`/allocations/${s.allocation_id}`);
          const ad = await ar.json();
          proc = ad.allocation?.process;
        } else {
          if (s.batch_code?.startsWith('DEV-AN')) proc = 'Anaerobic';
          else if (s.batch_code?.startsWith('DEV-W')) proc = 'Washed';
          else if (s.batch_code?.startsWith('DEV-H')) proc = 'Honey';
          else if (s.batch_code?.startsWith('DEV-N')) proc = 'Natural';
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
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/roast-live?session_id=${id}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.error) { console.warn('[WS]', data.error); return; }
      if (data.event === 'eject_suggested') return;
      if (data.t !== undefined) {
        setPoints(prev => [...prev, { t: data.t, temp: data.temp }]);
        setCurrentTemp(data.temp);
      }
    };

    return () => ws.close();
  }, [id]);

  // Elapsed timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (startRef.current) {
        setElapsed(Math.floor((Date.now() - startRef.current.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  const ror = points.length >= 8
    ? ((points[points.length - 1].temp - points[points.length - 8].temp) / (15 / 60)).toFixed(1)
    : '—';

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
      roasted_weight_out_g: Math.round(parseFloat(completeForm.roastedKg) * 1000),
      eject_temp_c: parseInt(completeForm.ejectTemp),
      total_time_seconds: totalS,
      development_time_seconds: devS,
      temperature_curve: points,
    };
    try {
      const res = await api.put(`/roast-sessions/${id}/complete`, body);
      const d   = await res.json();
      if (!res.ok) { setError(d.error || 'Failed.'); return; }
      if (d.session.variance_flagged) {
        const delta = parseInt(completeForm.ejectTemp) - (d.profile_eject_temp_c || 0);
        setVarianceBanner({ actual: parseInt(completeForm.ejectTemp), target: d.profile_eject_temp_c, delta });
      }
      wsRef.current?.send('complete');
      setTimeout(() => navigate(`/roast/${id}`), 1500);
    } catch { setError('Network error.'); }
    finally { setSaving(false); }
  }

  return (
    <Layout>
      <div className="p-4 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-coffee-900">
            {session?.batch_code || 'Live Roast'}
          </h1>
          <span className={`text-xs px-2 py-1 rounded font-medium ${session?.is_development ? 'bg-gray-200' : 'bg-blue-100 text-blue-700'}`}>
            {session?.is_development ? 'DEV' : 'PROD'}
          </span>
        </div>

        {varianceBanner && (
          <div className="bg-red-50 border border-red-300 text-red-700 rounded-md p-3 mb-4 text-sm">
            ⚠ Eject temp variance. Actual: {varianceBanner.actual}°C · Target: {varianceBanner.target}°C · Delta: {varianceBanner.delta > 0 ? '+' : ''}{varianceBanner.delta}°C
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white rounded-lg p-3 border border-coffee-200 text-center">
            <div className="text-xs text-coffee-500">Elapsed</div>
            <div className="text-lg font-mono font-bold text-coffee-800">{fmtMSS(elapsed)}</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-coffee-200 text-center">
            <div className="text-xs text-coffee-500">Temp</div>
            <div className="text-lg font-mono font-bold text-coffee-800">{currentTemp ?? '—'}°C</div>
          </div>
          <div className="bg-white rounded-lg p-3 border border-coffee-200 text-center">
            <div className="text-xs text-coffee-500">RoR</div>
            <div className="text-lg font-mono font-bold text-coffee-800">{ror}°/min</div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white rounded-lg border border-coffee-200 p-3 mb-4">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={points} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0e6d8" />
              <XAxis dataKey="t" tickFormatter={fmtMSS} tick={{ fontSize: 11 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} unit="°" />
              <Tooltip formatter={(v) => [`${v}°C`, 'Temp']} labelFormatter={fmtMSS} />
              <Line type="monotone" dataKey="temp" stroke="#2563eb" dot={false} strokeWidth={2} name="Live" />
              {profile && (
                <ReferenceLine
                  y={profile.eject_temp_c}
                  stroke="#d97706"
                  strokeDasharray="6 3"
                  label={{ value: `Target: ${profile.eject_temp_c}°C`, fill: '#d97706', fontSize: 11, position: 'insideTopRight' }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Note */}
        {noteOpen ? (
          <div className="bg-white border border-coffee-200 rounded-lg p-3 mb-3 flex gap-2">
            <input
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Observation note…"
              className="flex-1 border border-coffee-300 rounded px-2 py-1 text-sm"
            />
            <span className="text-xs text-coffee-400 self-center">{fmtMSS(elapsed)}</span>
            <button onClick={addNote} className="px-3 py-1 bg-coffee-700 text-white rounded text-sm">Save</button>
            <button onClick={() => setNoteOpen(false)} className="px-3 py-1 bg-gray-200 rounded text-sm">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setNoteOpen(true)} className="mb-3 px-4 py-2 border border-coffee-300 rounded-md text-sm text-coffee-700 hover:bg-coffee-50">
            + Add Note
          </button>
        )}

        <button
          onClick={() => setCompleteOpen(true)}
          className="w-full py-3 bg-green-700 text-white rounded-md font-semibold hover:bg-green-800"
        >
          Complete Roast
        </button>

        {/* Complete modal */}
        {completeOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-bold text-coffee-900 mb-4">Complete Roast</h2>
              <form onSubmit={handleComplete} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-coffee-800 mb-1">Roasted Weight (kg)</label>
                  <input
                    type="number" step="0.001" required
                    value={completeForm.roastedKg}
                    onChange={e => setCompleteForm(p => ({ ...p, roastedKg: e.target.value }))}
                    className="w-full border border-coffee-300 rounded px-3 py-2 text-sm"
                    placeholder="e.g. 4.200"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-coffee-800 mb-1">Eject Temp (°C)</label>
                  <input
                    type="number" required
                    value={completeForm.ejectTemp}
                    onChange={e => setCompleteForm(p => ({ ...p, ejectTemp: e.target.value }))}
                    className="w-full border border-coffee-300 rounded px-3 py-2 text-sm"
                    placeholder="e.g. 207"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-coffee-800 mb-1">Total Time (MM:SS)</label>
                  <input
                    type="text" required pattern="\d{1,2}:\d{2}"
                    value={completeForm.totalMSS}
                    onChange={e => setCompleteForm(p => ({ ...p, totalMSS: e.target.value }))}
                    className="w-full border border-coffee-300 rounded px-3 py-2 text-sm font-mono"
                    placeholder="09:30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-coffee-800 mb-1">Development Time (MM:SS)</label>
                  <input
                    type="text" required pattern="\d{1,2}:\d{2}"
                    value={completeForm.devMSS}
                    onChange={e => setCompleteForm(p => ({ ...p, devMSS: e.target.value }))}
                    className="w-full border border-coffee-300 rounded px-3 py-2 text-sm font-mono"
                    placeholder="01:30"
                  />
                </div>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <div className="flex gap-3">
                  <button type="submit" disabled={saving}
                    className="flex-1 py-2 bg-green-700 text-white rounded font-semibold disabled:opacity-50">
                    {saving ? 'Saving…' : 'Complete'}
                  </button>
                  <button type="button" onClick={() => setCompleteOpen(false)}
                    className="px-4 py-2 bg-gray-200 rounded font-semibold">
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
