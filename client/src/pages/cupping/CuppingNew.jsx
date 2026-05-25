import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer,
} from 'recharts';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, FormInput, FormSelect } from '../../components/ui';

const ATTRS = [
  { key: 'aroma',      label: 'Aroma',      placeholder: 'e.g. stone fruit, floral…' },
  { key: 'flavour',    label: 'Flavour',     placeholder: 'e.g. brown sugar, lemon…' },
  { key: 'acidity',    label: 'Acidity',     placeholder: 'e.g. bright, citric, malic…' },
  { key: 'body',       label: 'Body',        placeholder: 'e.g. full, syrupy, light…' },
  { key: 'sweetness',  label: 'Sweetness',   placeholder: 'e.g. caramel, very sweet…' },
  { key: 'aftertaste', label: 'Aftertaste',  placeholder: 'e.g. clean, lingering chocolate…' },
  { key: 'overall',    label: 'Overall',     placeholder: 'e.g. outstanding clarity…' },
];

const REST_DAYS = { Washed: 4, Honey: 5, Natural: 7, Anaerobic: 7 };

function getProcess(session) {
  if (!session) return null;
  const prefixMap = { 'DEV-AN': 'Anaerobic', 'DEV-W': 'Washed', 'DEV-H': 'Honey', 'DEV-N': 'Natural' };
  for (const [prefix, p] of Object.entries(prefixMap)) {
    if (session.batch_code?.startsWith(prefix)) return p;
  }
  return null;
}

// Radar chart custom tick label
const CustomTick = ({ payload, x, y, textAnchor }) => (
  <text x={x} y={y} textAnchor={textAnchor} style={{ fontSize: 11, fill: '#A8896A', fontFamily: 'Inter' }}>
    {payload.value}
  </text>
);

// Score display inside chart
function ScoreSummary({ scores }) {
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const max   = ATTRS.length * 10;
  const pct   = ((total / max) * 100).toFixed(0);

  function grade(t) {
    if (t >= 90) return 'Outstanding';
    if (t >= 85) return 'Excellent';
    if (t >= 80) return 'Very Good';
    if (t >= 75) return 'Good';
    return 'Average';
  }

  return (
    <div className="text-center">
      <p
        className="text-coffee-900"
        style={{ fontSize: 56, fontWeight: 500, lineHeight: 1 }}
      >
        {total}
      </p>
      <p className="text-xs text-coffee-400 mt-1">/ {max} points</p>
      <p className="text-sm text-coffee-600 mt-1">{grade(total)}</p>
    </div>
  );
}

export default function CuppingNew() {
  const navigate = useNavigate();

  const [step,           setStep]           = useState(1);
  const [sessions,       setSessions]       = useState([]);
  const [roastSessionId, setRoastSessionId] = useState('');
  const [roastSession,   setRoastSession]   = useState(null);
  const [daysOff,        setDaysOff]        = useState(null);
  const [processWarn,    setProcessWarn]    = useState(null);

  const [purpose,       setPurpose]       = useState('');
  const [cupDate,       setCupDate]       = useState(new Date().toISOString().split('T')[0]);
  const [sessionNotes,  setSessionNotes]  = useState('');

  const [scores,   setScores]   = useState(Object.fromEntries(ATTRS.map(a => [a.key, 5])));
  const [obs,      setObs]      = useState(Object.fromEntries(ATTRS.map(a => [a.key, ''])));
  const [decision, setDecision] = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    api.get('/roast-sessions').then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .catch(() => {});
  }, []);

  async function selectSession(id) {
    setRoastSessionId(id);
    if (!id) { setRoastSession(null); setDaysOff(null); setProcessWarn(null); return; }
    const res = await api.get(`/roast-sessions/${id}`);
    const { session } = await res.json();
    setRoastSession(session);
    if (session.ended_at) {
      const days = Math.floor((new Date(cupDate) - new Date(session.ended_at)) / 86400000);
      setDaysOff(days);
      let process = getProcess(session);
      if (!process && !session.is_development && session.allocation_id) {
        const ar = await api.get(`/allocations/${session.allocation_id}`);
        const ad = await ar.json();
        process = ad.allocation?.process;
      }
      const min = REST_DAYS[process] || 4;
      setProcessWarn(days < min ? { process, min, days } : null);
    }
  }

  async function handleSubmit() {
    setError('');
    if (!decision) { setError('Please select a final decision.'); return; }
    setSaving(true);
    try {
      const csRes = await api.post('/cupping-sessions', {
        roast_session_id: roastSessionId, cupping_date: cupDate,
        cupping_purpose: purpose, session_notes: sessionNotes || undefined,
      });
      const csData = await csRes.json();
      if (!csRes.ok) { setError(csData.error || 'Failed.'); return; }
      const cuppingSessionId = csData.session.id;
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
    finally   { setSaving(false); }
  }

  // Radar data
  const radarData = ATTRS.map(a => ({ attribute: a.label, score: scores[a.key] }));

  // Step indicators
  const steps = ['Session', 'Details', 'Score'];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-6">
        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-8">
          {steps.map((label, i) => {
            const s = i + 1;
            const done = step > s;
            const active = step === s;
            return (
              <div key={label} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="flex items-center justify-center rounded-full text-xs transition-colors"
                    style={{
                      width: 28, height: 28,
                      background: done || active ? '#533A24' : '#F2EAE0',
                      color:      done || active ? '#FFFFFF' : '#A8896A',
                      fontWeight: 500,
                    }}
                  >
                    {done ? '✓' : s}
                  </div>
                  <span className="text-xs text-coffee-400">{label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div
                    className="flex-1 mx-3 mb-5"
                    style={{ height: 1, background: step > s ? '#533A24' : '#E0D0BC' }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 1: Select roast session */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>
              Select Roast Session
            </h2>
            <FormSelect
              label="Roast Session"
              value={roastSessionId}
              onChange={e => selectSession(e.target.value)}
            >
              <option value="">Choose a roast session…</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  {s.batch_code} · {s.started_at?.split('T')[0]}
                </option>
              ))}
            </FormSelect>

            {roastSession && !roastSession.ended_at && (
              <p className="text-sm" style={{ color: '#BA7517' }}>
                This session is not yet completed.
              </p>
            )}
            {daysOff !== null && (
              <div
                className="px-4 py-3 rounded-xl text-sm"
                style={{ background: '#F2EAE0', color: '#8B6A47' }}
              >
                <span style={{ fontWeight: 500 }}>{daysOff} days</span> off roast
              </div>
            )}
            {processWarn && (
              <div
                className="px-4 py-3 rounded-xl text-sm"
                style={{ background: '#FAEEDA', color: '#BA7517' }}
              >
                Minimum rest for {processWarn.process} is {processWarn.min} days.
                This coffee is {processWarn.days} days old — scores may not reflect final quality.
              </div>
            )}
            <Button
              variant="primary"
              onClick={() => setStep(2)}
              disabled={!roastSessionId || !roastSession?.ended_at}
              className="w-full justify-center"
            >
              Continue
            </Button>
          </div>
        )}

        {/* Step 2: Session details */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>
              Session Details
            </h2>

            <div>
              <p className="text-sm text-coffee-600 mb-2" style={{ fontWeight: 500 }}>Purpose</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'development',   label: 'Development' },
                  { value: 'quality_check', label: 'Quality Check' },
                  { value: 'comparative',   label: 'Comparative' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPurpose(opt.value)}
                    className="py-2.5 rounded-xl text-sm border transition-colors duration-150"
                    style={{
                      background:   purpose === opt.value ? '#533A24' : '#FFFFFF',
                      color:        purpose === opt.value ? '#FFFFFF' : '#533A24',
                      borderColor:  purpose === opt.value ? '#533A24' : '#E0D0BC',
                      fontWeight:   purpose === opt.value ? 500 : 400,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <FormInput
              label="Cupping Date"
              type="date"
              value={cupDate}
              onChange={e => setCupDate(e.target.value)}
            />

            <div className="flex flex-col gap-1">
              <label className="text-sm text-coffee-600" style={{ fontWeight: 500 }}>
                Session Notes (optional)
              </label>
              <textarea
                value={sessionNotes}
                onChange={e => setSessionNotes(e.target.value)}
                rows={3}
                className="px-3 py-2 text-sm border border-coffee-200 rounded-lg focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100 resize-none"
              />
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>← Back</Button>
              <Button
                variant="primary"
                onClick={() => setStep(3)}
                disabled={!purpose}
                className="flex-1 justify-center"
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Score */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>
              Score Sample
            </h2>

            {/* Radar chart preview + score */}
            <div className="bg-white border border-coffee-200 rounded-xl p-5">
              <div className="flex items-center gap-6">
                <div style={{ flex: 1, height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                      <PolarGrid stroke="#E0D0BC" />
                      <PolarAngleAxis dataKey="attribute" tick={<CustomTick />} />
                      <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                      <Radar
                        dataKey="score"
                        stroke="#8B6A47"
                        fill="#8B6A47"
                        fillOpacity={0.25}
                        strokeWidth={1.5}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <ScoreSummary scores={scores} />
              </div>
            </div>

            {/* Score inputs */}
            <div className="space-y-3">
              {ATTRS.map(({ key, label, placeholder }) => (
                <div
                  key={key}
                  className="bg-white border border-coffee-200 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-coffee-700" style={{ fontWeight: 500 }}>
                      {label}
                    </span>
                    <span
                      className="font-mono text-coffee-800"
                      style={{ fontSize: 20, fontWeight: 500, minWidth: 24, textAlign: 'right' }}
                    >
                      {scores[key]}
                    </span>
                  </div>
                  <input
                    type="range" min={0} max={10} step={1}
                    value={scores[key]}
                    onChange={e => setScores(p => ({ ...p, [key]: parseInt(e.target.value) }))}
                    className="w-full mb-2"
                  />
                  <div className="flex justify-between text-xs text-coffee-300 mb-2">
                    <span>0</span><span>5</span><span>10</span>
                  </div>
                  <input
                    type="text"
                    value={obs[key]}
                    onChange={e => setObs(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-2 py-1.5 text-sm border border-coffee-100 rounded-lg focus:border-coffee-300 focus:ring-1 focus:ring-coffee-100 text-coffee-700"
                  />
                </div>
              ))}
            </div>

            {/* Decision */}
            <div>
              <p className="text-sm text-coffee-600 mb-2" style={{ fontWeight: 500 }}>
                Final Decision
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'adjust',  label: 'Adjust',  activeColor: '#BA7517', activeBg: '#FAEEDA' },
                  { value: 'approve', label: 'Approve', activeColor: '#3B6D11', activeBg: '#EAF3DE' },
                  { value: 'reject',  label: 'Reject',  activeColor: '#A32D2D', activeBg: '#FCEBEB' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDecision(opt.value)}
                    className="py-2.5 rounded-xl text-sm border transition-colors duration-150"
                    style={{
                      background:  decision === opt.value ? opt.activeBg  : '#FFFFFF',
                      color:       decision === opt.value ? opt.activeColor : '#8B6A47',
                      borderColor: decision === opt.value ? opt.activeColor : '#E0D0BC',
                      fontWeight:  decision === opt.value ? 500 : 400,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs" style={{ color: '#A32D2D' }}>{error}</p>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(2)}>← Back</Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 justify-center"
              >
                {saving ? 'Saving…' : 'Submit Cupping'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
