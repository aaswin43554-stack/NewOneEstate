import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const ATTRS = [
  { key: 'aroma',      label: 'Aroma',       placeholder: 'e.g. stone fruit, floral, dried herb…' },
  { key: 'flavour',    label: 'Flavour',      placeholder: 'e.g. brown sugar, lemon, roasted almond…' },
  { key: 'acidity',    label: 'Acidity',      placeholder: 'e.g. bright, citric, malic, low…' },
  { key: 'body',       label: 'Body',         placeholder: 'e.g. full, syrupy, light, tea-like…' },
  { key: 'sweetness',  label: 'Sweetness',    placeholder: 'e.g. caramel sweetness, very sweet, low…' },
  { key: 'aftertaste', label: 'Aftertaste',   placeholder: 'e.g. clean, lingering chocolate, short…' },
  { key: 'overall',    label: 'Overall',      placeholder: 'e.g. outstanding clarity, needs development…' },
];
const REST_DAYS = { Washed:4, Honey:5, Natural:7, Anaerobic:7 };
const PROCESS_CODE_MAP = { 'DEV-W-':'Washed','DEV-H-':'Honey','DEV-N-':'Natural','DEV-AN-':'Anaerobic' };

function getProcessFromBatchCode(bc) {
  for (const [prefix, process] of Object.entries(PROCESS_CODE_MAP)) {
    if (bc?.startsWith(prefix)) return process;
  }
  return null;
}

export default function CuppingNew() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [sessions, setSessions] = useState([]);
  const [roastSessionId, setRoastSessionId] = useState('');
  const [roastSession, setRoastSession] = useState(null);
  const [daysOff, setDaysOff] = useState(null);
  const [processWarn, setProcessWarn] = useState(null);

  const [purpose, setPurpose] = useState('');
  const [cupDate, setCupDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessionNotes, setSessionNotes] = useState('');

  const [scores, setScores] = useState({ aroma:5, flavour:5, acidity:5, body:5, sweetness:5, aftertaste:5, overall:5 });
  const [obs,    setObs]    = useState({ aroma:'', flavour:'', acidity:'', body:'', sweetness:'', aftertaste:'', overall:'' });
  const [decision, setDecision] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    api.get('/roast-sessions').then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .catch(() => {});
  }, []);

  async function selectRoastSession(id) {
    setRoastSessionId(id);
    if (!id) { setRoastSession(null); setDaysOff(null); setProcessWarn(null); return; }
    const res = await api.get(`/roast-sessions/${id}`);
    const { session } = await res.json();
    setRoastSession(session);
    if (session.ended_at) {
      const days = Math.floor((new Date(cupDate) - new Date(session.ended_at)) / 86400000);
      setDaysOff(days);
      let process = null;
      if (!session.is_development && session.allocation_id) {
        const ar = await api.get(`/allocations/${session.allocation_id}`);
        const ad = await ar.json();
        process = ad.allocation?.process;
      } else {
        process = getProcessFromBatchCode(session.batch_code);
      }
      const min = REST_DAYS[process] || 4;
      if (days < min) {
        setProcessWarn({ process, min, days });
      } else {
        setProcessWarn(null);
      }
    }
  }

  async function handleSubmit() {
    setError('');
    if (!decision) { setError('Please select a final decision.'); return; }
    setSaving(true);
    try {
      // Create cupping session
      const csRes = await api.post('/cupping-sessions', {
        roast_session_id: roastSessionId, cupping_date: cupDate,
        cupping_purpose: purpose, session_notes: sessionNotes || undefined,
      });
      const csData = await csRes.json();
      if (!csRes.ok) { setError(csData.error || 'Failed to create session.'); return; }
      const cuppingSessionId = csData.session.id;

      // Add sample
      const sample = {
        roast_session_id: roastSessionId,
        ...Object.fromEntries(ATTRS.map(a => [`score_${a.key}`, scores[a.key]])),
        ...Object.fromEntries(ATTRS.map(a => [`obs_${a.key}`, obs[a.key] || undefined])),
        final_decision: decision,
      };
      const smRes = await api.post(`/cupping-sessions/${cuppingSessionId}/samples`, sample);
      if (!smRes.ok) { const d = await smRes.json(); setError(d.error || 'Failed.'); return; }
      navigate(`/cupping/${cuppingSessionId}`);
    } catch { setError('Network error.'); }
    finally { setSaving(false); }
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-coffee-900 mb-2">New Cupping Session</h1>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-6">
          {[1,2,3].map(s => (
            <div key={s} className={`flex items-center gap-2 ${s < 3 ? 'flex-1' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                step >= s ? 'bg-coffee-700 text-white' : 'bg-coffee-100 text-coffee-500'
              }`}>{s}</div>
              {s < 3 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-coffee-700' : 'bg-coffee-100'}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Select roast session */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-coffee-800">Select Roast Session</h2>
            <select value={roastSessionId} onChange={e => selectRoastSession(e.target.value)}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm">
              <option value="">Choose a roast session…</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.batch_code} · {s.started_at?.split('T')[0]}</option>
              ))}
            </select>
            {roastSession && !roastSession.ended_at && (
              <p className="text-amber-600 text-sm">⚠ This session is not yet completed.</p>
            )}
            {daysOff !== null && (
              <p className="text-sm text-coffee-600">Days off roast: <strong>{daysOff}</strong></p>
            )}
            {processWarn && (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                ⚠ Minimum rest for {processWarn.process} is {processWarn.min} days. This coffee is {processWarn.days} days old.
                Cupping may not reflect final cup quality. You can still log it.
              </div>
            )}
            <button
              onClick={() => setStep(2)}
              disabled={!roastSessionId || !roastSession?.ended_at}
              className="w-full py-3 bg-coffee-700 text-white rounded-md font-semibold hover:bg-coffee-800 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}

        {/* Step 2: Session details */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-coffee-800">Session Details</h2>
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-2">Purpose</label>
              <div className="grid grid-cols-3 gap-3">
                {[['development','Development'],['quality_check','Quality Check'],['comparative','Comparative']].map(([v,l]) => (
                  <button key={v} type="button" onClick={() => setPurpose(v)}
                    className={`py-3 rounded-lg font-semibold text-sm border-2 transition-colors ${
                      purpose === v ? 'bg-coffee-700 text-white border-coffee-700' : 'bg-white text-coffee-700 border-coffee-200 hover:border-coffee-400'
                    }`}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">Cupping Date</label>
              <input type="date" value={cupDate} onChange={e => setCupDate(e.target.value)}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">Session Notes (optional)</label>
              <textarea value={sessionNotes} onChange={e => setSessionNotes(e.target.value)} rows={3}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="px-4 py-3 bg-gray-200 rounded-md font-semibold text-sm">← Back</button>
              <button onClick={() => setStep(3)} disabled={!purpose}
                className="flex-1 py-3 bg-coffee-700 text-white rounded-md font-semibold hover:bg-coffee-800 disabled:opacity-40">
                Next →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Score */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-coffee-800">Score Sample</h2>
            {ATTRS.map(({ key, label, placeholder }) => (
              <div key={key} className="bg-white border border-coffee-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-coffee-800">{label}</span>
                  <span className="text-xl font-bold text-coffee-700">{scores[key]}</span>
                </div>
                <input type="range" min={0} max={10} step={1} value={scores[key]}
                  onChange={e => setScores(p => ({ ...p, [key]: parseInt(e.target.value) }))}
                  className="w-full accent-coffee-700" />
                <div className="flex justify-between text-xs text-coffee-400 mb-2"><span>0</span><span>10</span></div>
                <input type="text" value={obs[key]}
                  onChange={e => setObs(p => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full border border-coffee-100 rounded px-2 py-1.5 text-sm text-coffee-700" />
              </div>
            ))}

            <div>
              <label className="block text-sm font-semibold text-coffee-800 mb-2">Final Decision</label>
              <div className="grid grid-cols-3 gap-3">
                {[['adjust','Adjust','bg-amber-500'],['approve','Approve','bg-green-600'],['reject','Reject','bg-red-600']].map(([v,l,bg]) => (
                  <button key={v} type="button" onClick={() => setDecision(v)}
                    className={`py-3 rounded-lg font-bold text-sm border-2 transition-colors ${
                      decision === v ? `${bg} text-white border-transparent` : 'bg-white text-coffee-700 border-coffee-200 hover:border-coffee-400'
                    }`}>{l}</button>
                ))}
              </div>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="px-4 py-3 bg-gray-200 rounded-md font-semibold text-sm">← Back</button>
              <button onClick={handleSubmit} disabled={saving}
                className="flex-1 py-3 bg-coffee-700 text-white rounded-md font-semibold hover:bg-coffee-800 disabled:opacity-50">
                {saving ? 'Saving…' : 'Submit Cupping'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
