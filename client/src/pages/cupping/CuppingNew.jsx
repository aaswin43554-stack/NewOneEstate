import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer,
} from 'recharts';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, FormInput, FormSelect } from '../../components/ui';
import { Mic, MicOff, Wand2 } from 'lucide-react';

// ─── SCA Constants ────────────────────────────────────────────────────────────

const SCORED_ATTRS = [
  { key: 'fragrance_aroma', label: 'Fragrance / Aroma',  dryNotes: true, wetNotes: true },
  { key: 'flavor',          label: 'Flavor',             dryNotes: false, wetNotes: false },
  { key: 'aftertaste',      label: 'Aftertaste',         dryNotes: false, wetNotes: false },
  { key: 'acidity',         label: 'Acidity',            dryNotes: false, wetNotes: false, intensity: true },
  { key: 'body',            label: 'Body',               dryNotes: false, wetNotes: false, level: true },
  { key: 'balance',         label: 'Balance',            dryNotes: false, wetNotes: false },
  { key: 'overall',         label: 'Overall',            dryNotes: false, wetNotes: false },
];

const ACIDITY_INTENSITIES = ['Low', 'Medium-Low', 'Medium', 'Medium-High', 'High'];
const BODY_LEVELS         = ['Thin', 'Light', 'Medium', 'Heavy', 'Full'];
const PURPOSES = [
  { value: 'development',  label: 'Development' },
  { value: 'quality_check', label: 'Quality Check' },
  { value: 'comparative',  label: 'Comparative' },
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

// ─── Score helpers ────────────────────────────────────────────────────────────

function calcFinalScore(scores, cupChecks, nCups, defects) {
  const scored = SCORED_ATTRS.reduce((s, a) => s + (parseFloat(scores[a.key]) || 0), 0);
  const uniformity = cupChecks.uniformity.filter(Boolean).length * 2;
  const cleanCup   = cupChecks.clean_cup.filter(Boolean).length * 2;
  const sweetness  = cupChecks.sweetness.filter(Boolean).length * 2;
  const totalDefects = defects.reduce((s, d) => {
    const mult = d.type === 'fault' ? 4 : 2;
    return s + (parseInt(d.cups_affected) || 0) * (parseInt(d.intensity) || 0) * mult;
  }, 0);
  return scored + uniformity + cleanCup + sweetness - totalDefects;
}

function scoreGrade(score) {
  if (score >= 90) return 'Outstanding';
  if (score >= 85) return 'Excellent';
  if (score >= 80) return 'Specialty';
  if (score >= 75) return 'Very Good';
  return 'Below Specialty';
}

function gradeColor(score) {
  if (score >= 80) return '#3B6D11';
  if (score >= 75) return '#BA7517';
  return '#A32D2D';
}

// ─── Voice input ──────────────────────────────────────────────────────────────

function useVoiceInput(onResult) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef(null);

  useEffect(() => {
    setSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  function startListening(key) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    recRef.current?.stop();
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    recRef.current = rec;
    rec.onstart  = () => setListening(key);
    rec.onend    = () => setListening(false);
    rec.onerror  = () => setListening(false);
    rec.onresult = e => onResult(key, e.results[0][0].transcript);
    rec.start();
  }

  function stopListening() { recRef.current?.stop(); setListening(false); }
  return { listening, supported, startListening, stopListening };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const CustomTick = ({ payload, x, y, textAnchor }) => (
  <text x={x} y={y} textAnchor={textAnchor} style={{ fontSize: 10, fill: '#A8896A', fontFamily: 'Inter' }}>
    {payload.value}
  </text>
);

function ScorePanel({ scores, cupChecks, nCups, defects }) {
  const final = calcFinalScore(scores, cupChecks, nCups, defects);
  const uniformity = cupChecks.uniformity.filter(Boolean).length * 2;
  const cleanCup   = cupChecks.clean_cup.filter(Boolean).length * 2;
  const sweetness  = cupChecks.sweetness.filter(Boolean).length * 2;
  const totalDef   = defects.reduce((s, d) => {
    const mult = d.type === 'fault' ? 4 : 2;
    return s + (parseInt(d.cups_affected) || 0) * (parseInt(d.intensity) || 0) * mult;
  }, 0);

  return (
    <div className="bg-white border border-coffee-200 rounded-xl p-5">
      <div className="flex items-start gap-6">
        {/* Radar */}
        <div style={{ flex: 1, minWidth: 0, height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart
              data={SCORED_ATTRS.map(a => ({ attribute: a.label.split(' ')[0], score: parseFloat(scores[a.key]) || 6 }))}
              margin={{ top: 8, right: 20, bottom: 8, left: 20 }}
            >
              <PolarGrid stroke="#E0D0BC" />
              <PolarAngleAxis dataKey="attribute" tick={<CustomTick />} />
              <PolarRadiusAxis domain={[6, 10]} tick={false} axisLine={false} />
              <Radar dataKey="score" stroke="#8B6A47" fill="#8B6A47" fillOpacity={0.25} strokeWidth={1.5} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        {/* Score breakdown */}
        <div className="flex-shrink-0 text-right">
          <p className="text-coffee-900" style={{ fontSize: 48, fontWeight: 500, lineHeight: 1 }}>
            {final.toFixed(2)}
          </p>
          <p className="text-xs text-coffee-400 mt-0.5">/ 100</p>
          <p className="text-sm mt-1" style={{ fontWeight: 500, color: gradeColor(final) }}>
            {scoreGrade(final)}
          </p>
          <div className="mt-3 space-y-0.5 text-xs text-coffee-400">
            <p>Scored: {SCORED_ATTRS.reduce((s, a) => s + (parseFloat(scores[a.key]) || 0), 0).toFixed(2)}</p>
            <p>Cups: {uniformity + cleanCup + sweetness}</p>
            {totalDef > 0 && <p style={{ color: '#A32D2D' }}>Defects: −{totalDef}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreSlider({ label, value, onChange }) {
  const pct = ((value - 6) / 4) * 100;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <input
          type="range"
          min={6} max={10} step={0.25}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="w-full"
          style={{ accentColor: '#8B6A47' }}
        />
        <div className="flex justify-between text-xs text-coffee-300 mt-0.5">
          <span>6.00</span><span>8.00</span><span>10.00</span>
        </div>
      </div>
      <div
        className="flex-shrink-0 text-center rounded-lg"
        style={{ width: 52, background: '#FAF6F0', padding: '4px 8px' }}
      >
        <span className="font-mono text-coffee-800" style={{ fontWeight: 500, fontSize: 18 }}>
          {value.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function CupCheckRow({ label, cups, onChange, notes, onNotesChange }) {
  return (
    <div className="bg-white border border-coffee-200 rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-coffee-700" style={{ fontWeight: 500 }}>{label}</span>
        <span className="text-xs text-coffee-500">
          {cups.filter(Boolean).length * 2} / {cups.length * 2} pts
        </span>
      </div>
      <div className="flex gap-3 mb-2">
        {cups.map((checked, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(cups.map((v, j) => j === i ? !v : v))}
            className="flex flex-col items-center gap-1"
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-colors"
              style={{
                background: checked ? '#EAF3DE' : '#FAF6F0',
                border: `2px solid ${checked ? '#3B6D11' : '#E0D0BC'}`,
                color: checked ? '#3B6D11' : '#C0A882',
                fontWeight: 500,
              }}
            >
              {checked ? '✓' : '✗'}
            </div>
            <span className="text-xs text-coffee-400">{i + 1}</span>
          </button>
        ))}
      </div>
      <input
        type="text"
        value={notes}
        onChange={e => onNotesChange(e.target.value)}
        placeholder="Notes (optional)…"
        className="w-full px-2 py-1.5 text-sm border border-coffee-100 rounded-lg focus:border-coffee-300 text-coffee-700"
      />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CuppingNew() {
  const navigate = useNavigate();

  // Step 1: Session header
  const [sessions,       setSessions]       = useState([]);
  const [roastSessionId, setRoastSessionId] = useState('');
  const [roastSession,   setRoastSession]   = useState(null);
  const [daysOff,        setDaysOff]        = useState(null);
  const [processWarn,    setProcessWarn]    = useState(null);
  const [purpose,        setPurpose]        = useState('');
  const [cupDate,        setCupDate]        = useState(new Date().toISOString().split('T')[0]);
  const [nCups,          setNCups]          = useState(3);
  const [sessionNotes,   setSessionNotes]   = useState('');

  // Step 2: Scored attributes
  const [scores,    setScores]    = useState(Object.fromEntries(SCORED_ATTRS.map(a => [a.key, 8.00])));
  const [obsDry,    setObsDry]    = useState({});  // fragrance_aroma dry notes
  const [obsWet,    setObsWet]    = useState({});  // fragrance_aroma wet notes
  const [obs,       setObs]       = useState(Object.fromEntries(SCORED_ATTRS.map(a => [a.key, ''])));
  const [intensity, setIntensity] = useState('Medium');
  const [bodyLevel, setBodyLevel] = useState('Medium');

  // Step 3: Cup checks + defects
  const [cupChecks, setCupChecks] = useState({
    uniformity: Array(3).fill(true),
    clean_cup:  Array(3).fill(true),
    sweetness:  Array(3).fill(true),
  });
  const [cupCheckNotes, setCupCheckNotes] = useState({ uniformity: '', clean_cup: '', sweetness: '' });
  const [defects, setDefects] = useState([]);

  // Step 4: Decision
  const [decision,      setDecision]      = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');

  const [step,      setStep]      = useState(1);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState('');

  const { listening, supported: voiceSupported, startListening, stopListening } = useVoiceInput(
    (key, transcript) => setObs(p => ({ ...p, [key]: p[key] ? p[key] + ' ' + transcript : transcript }))
  );

  useEffect(() => {
    api.get('/roast-sessions').then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .catch(() => {});
  }, []);

  // Sync cup check arrays when nCups changes
  useEffect(() => {
    setCupChecks(prev => ({
      uniformity: Array(nCups).fill(null).map((_, i) => prev.uniformity[i] ?? true),
      clean_cup:  Array(nCups).fill(null).map((_, i) => prev.clean_cup[i]  ?? true),
      sweetness:  Array(nCups).fill(null).map((_, i) => prev.sweetness[i]  ?? true),
    }));
  }, [nCups]);

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

  async function handleAiStructure() {
    const hasAny = SCORED_ATTRS.some(a => obs[a.key]?.trim() || obsDry[a.key]?.trim() || obsWet[a.key]?.trim());
    if (!hasAny) { setAiError('Enter at least one observation note before structuring.'); return; }
    setAiLoading(true); setAiError('');
    try {
      const allObs = { ...obs };
      if (obsDry.fragrance_aroma) allObs.fragrance_aroma_dry = obsDry.fragrance_aroma;
      if (obsWet.fragrance_aroma) allObs.fragrance_aroma_wet = obsWet.fragrance_aroma;
      const res = await api.post('/ai/cupping-structure', { obs: allObs });
      const d   = await res.json();
      if (!res.ok) { setAiError(d.error || 'AI failed.'); return; }
      setObs(p => ({ ...p, ...d.structured }));
    } catch {
      setAiError('Network error.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit() {
    setError('');
    if (!decision) { setError('Please select a final decision.'); return; }
    if (['adjust', 'reject'].includes(decision) && !decisionNotes.trim()) {
      setError('Decision notes are required when Adjusting or Rejecting.'); return;
    }

    setSaving(true);
    try {
      const csRes = await api.post('/cupping-sessions', {
        roast_session_id: roastSessionId,
        cupping_date:     cupDate,
        cupping_purpose:  purpose,
        number_of_cups:   nCups,
        session_notes:    sessionNotes || undefined,
      });
      const csData = await csRes.json();
      if (!csRes.ok) { setError(csData.error || 'Failed to create session.'); return; }
      const cuppingSessionId = csData.session.id;

      const sample = {
        roast_session_id: roastSessionId,
        // Scored attributes
        ...Object.fromEntries(SCORED_ATTRS.map(a => [`score_${a.key}`, scores[a.key]])),
        // Observation notes
        obs_fragrance_dry: obsDry.fragrance_aroma || obs.fragrance_aroma || undefined,
        obs_aroma_wet:     obsWet.fragrance_aroma || undefined,
        obs_flavor:        obs.flavor      || undefined,
        obs_aftertaste:    obs.aftertaste  || undefined,
        obs_acidity:       obs.acidity     || undefined,
        obs_body:          obs.body        || undefined,
        obs_balance:       obs.balance     || undefined,
        obs_overall:       obs.overall     || undefined,
        // Qualifiers
        acidity_intensity: intensity,
        body_level:        bodyLevel,
        // Cup checks
        uniformity_cups: cupChecks.uniformity,
        clean_cup_cups:  cupChecks.clean_cup,
        sweetness_cups:  cupChecks.sweetness,
        // Defects
        defects_json: defects,
        // Decision
        final_decision: decision,
        decision_notes: decisionNotes || undefined,
      };

      const smRes = await api.post(`/cupping-sessions/${cuppingSessionId}/samples`, sample);
      if (!smRes.ok) { const d = await smRes.json(); setError(d.error || 'Failed to save scores.'); return; }
      navigate(`/cupping/${cuppingSessionId}`);
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  const STEPS = ['Session', 'Score', 'Cups & Defects', 'Decision'];

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-6">
        {/* Step indicator */}
        <div className="flex items-center gap-0 mb-8">
          {STEPS.map((label, i) => {
            const s = i + 1;
            const done   = step > s;
            const active = step === s;
            return (
              <div key={label} className={`flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}`}>
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="flex items-center justify-center rounded-full text-xs transition-colors"
                    style={{ width: 28, height: 28, background: done || active ? '#533A24' : '#F2EAE0', color: done || active ? '#FFF' : '#A8896A', fontWeight: 500 }}
                  >
                    {done ? '✓' : s}
                  </div>
                  <span className="text-xs text-coffee-400 whitespace-nowrap">{label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 mx-2 mb-5" style={{ height: 1, background: step > s ? '#533A24' : '#E0D0BC' }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: Session Header ─────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>Session Header</h2>

            <FormSelect label="Roast Session" value={roastSessionId} onChange={e => selectSession(e.target.value)}>
              <option value="">Choose a roast session…</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.batch_code} · {s.started_at?.split('T')[0]}</option>
              ))}
            </FormSelect>

            {roastSession && !roastSession.ended_at && (
              <p className="text-sm" style={{ color: '#BA7517' }}>This session is not yet completed.</p>
            )}
            {daysOff !== null && (
              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#F2EAE0', color: '#8B6A47' }}>
                <span style={{ fontWeight: 500 }}>{daysOff} days</span> off roast
              </div>
            )}
            {processWarn && (
              <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FAEEDA', color: '#BA7517' }}>
                Minimum rest for {processWarn.process} is {processWarn.min} days.
                This is {processWarn.days} days old — scores may not reflect final quality.
              </div>
            )}

            <FormInput
              label="Cupping Date"
              type="date"
              value={cupDate}
              onChange={e => setCupDate(e.target.value)}
            />

            <div>
              <p className="text-sm text-coffee-600 mb-2" style={{ fontWeight: 500 }}>Purpose</p>
              <div className="grid grid-cols-3 gap-2">
                {PURPOSES.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPurpose(opt.value)}
                    className="py-2.5 rounded-xl text-sm border transition-colors duration-150"
                    style={{
                      background:  purpose === opt.value ? '#533A24' : '#FFF',
                      color:       purpose === opt.value ? '#FFF' : '#533A24',
                      borderColor: purpose === opt.value ? '#533A24' : '#E0D0BC',
                      fontWeight:  purpose === opt.value ? 500 : 400,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm text-coffee-600 mb-2 block" style={{ fontWeight: 500 }}>
                Number of Cups <span className="text-coffee-400 font-normal">(min 3)</span>
              </label>
              <div className="flex items-center gap-4">
                {[3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNCups(n)}
                    className="w-12 h-12 rounded-xl text-lg border-2 font-semibold transition-colors"
                    style={{
                      background:  nCups === n ? '#533A24' : '#FFF',
                      color:       nCups === n ? '#FFF' : '#533A24',
                      borderColor: nCups === n ? '#533A24' : '#E0D0BC',
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm text-coffee-600" style={{ fontWeight: 500 }}>Session Notes (optional)</label>
              <textarea
                value={sessionNotes}
                onChange={e => setSessionNotes(e.target.value)}
                rows={3}
                className="px-3 py-2 text-sm border border-coffee-200 rounded-lg focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100 resize-none"
              />
            </div>

            <Button
              variant="primary"
              onClick={() => setStep(2)}
              disabled={!roastSessionId || !roastSession?.ended_at || !purpose}
              className="w-full justify-center"
            >
              Continue
            </Button>
          </div>
        )}

        {/* ── Step 2: Scored Attributes ──────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>Score Attributes</h2>
              <Button variant="secondary" size="sm" onClick={handleAiStructure} disabled={aiLoading} title="Structure tasting notes with AI">
                <Wand2 size={13} className="mr-1" />
                {aiLoading ? 'Structuring…' : 'AI Structure Notes'}
              </Button>
            </div>

            {aiError && <p className="text-xs" style={{ color: '#A32D2D' }}>{aiError}</p>}

            <ScorePanel scores={scores} cupChecks={cupChecks} nCups={nCups} defects={defects} />

            <div className="space-y-3">
              {SCORED_ATTRS.map(({ key, label, dryNotes, wetNotes, intensity: hasIntensity, level: hasLevel }) => {
                const isActive = listening === key;
                return (
                  <div key={key} className="bg-white border border-coffee-200 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-coffee-700" style={{ fontWeight: 500 }}>{label}</span>
                    </div>

                    <ScoreSlider
                      label={label}
                      value={scores[key]}
                      onChange={v => setScores(p => ({ ...p, [key]: v }))}
                    />

                    {/* Fragrance/Aroma split notes */}
                    {dryNotes ? (
                      <div className="mt-2 space-y-2">
                        <input
                          type="text"
                          value={obsDry.fragrance_aroma || ''}
                          onChange={e => setObsDry(p => ({ ...p, fragrance_aroma: e.target.value }))}
                          placeholder="Dry (Fragrance) notes…"
                          className="w-full px-2 py-1.5 text-sm border border-coffee-100 rounded-lg focus:border-coffee-300 text-coffee-700"
                        />
                        <input
                          type="text"
                          value={obsWet.fragrance_aroma || ''}
                          onChange={e => setObsWet(p => ({ ...p, fragrance_aroma: e.target.value }))}
                          placeholder="Wet (Aroma) notes after break…"
                          className="w-full px-2 py-1.5 text-sm border border-coffee-100 rounded-lg focus:border-coffee-300 text-coffee-700"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="text"
                          value={obs[key]}
                          onChange={e => setObs(p => ({ ...p, [key]: e.target.value }))}
                          placeholder="Descriptor notes…"
                          className="flex-1 px-2 py-1.5 text-sm border border-coffee-100 rounded-lg focus:border-coffee-300 text-coffee-700"
                        />
                        {voiceSupported && (
                          <button
                            type="button"
                            onClick={() => isActive ? stopListening() : startListening(key)}
                            className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
                            style={{ background: isActive ? '#FCEBEB' : '#F2EAE0', color: isActive ? '#A32D2D' : '#8B6A47' }}
                          >
                            {isActive ? <MicOff size={14} /> : <Mic size={14} />}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Acidity intensity */}
                    {hasIntensity && (
                      <div className="mt-2">
                        <p className="text-xs text-coffee-400 mb-1">Intensity</p>
                        <div className="flex gap-1 flex-wrap">
                          {ACIDITY_INTENSITIES.map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setIntensity(opt)}
                              className="px-2 py-0.5 rounded text-xs border transition-colors"
                              style={{
                                background:  intensity === opt ? '#533A24' : '#FFF',
                                color:       intensity === opt ? '#FFF' : '#8B6A47',
                                borderColor: intensity === opt ? '#533A24' : '#E0D0BC',
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Body level */}
                    {hasLevel && (
                      <div className="mt-2">
                        <p className="text-xs text-coffee-400 mb-1">Level</p>
                        <div className="flex gap-1 flex-wrap">
                          {BODY_LEVELS.map(opt => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setBodyLevel(opt)}
                              className="px-2 py-0.5 rounded text-xs border transition-colors"
                              style={{
                                background:  bodyLevel === opt ? '#533A24' : '#FFF',
                                color:       bodyLevel === opt ? '#FFF' : '#8B6A47',
                                borderColor: bodyLevel === opt ? '#533A24' : '#E0D0BC',
                              }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>← Back</Button>
              <Button variant="primary" onClick={() => setStep(3)} className="flex-1 justify-center">
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Cup Checks + Defects ──────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>Cup Checks & Defects</h2>

            <div className="rounded-xl px-4 py-3 text-sm" style={{ background: '#F2EAE0', color: '#8B6A47' }}>
              Evaluating <span style={{ fontWeight: 500 }}>{nCups} cups</span>. Each passing cup = 2 points.
            </div>

            <CupCheckRow
              label="Uniformity"
              cups={cupChecks.uniformity}
              onChange={v => setCupChecks(p => ({ ...p, uniformity: v }))}
              notes={cupCheckNotes.uniformity}
              onNotesChange={v => setCupCheckNotes(p => ({ ...p, uniformity: v }))}
            />
            <CupCheckRow
              label="Clean Cup"
              cups={cupChecks.clean_cup}
              onChange={v => setCupChecks(p => ({ ...p, clean_cup: v }))}
              notes={cupCheckNotes.clean_cup}
              onNotesChange={v => setCupCheckNotes(p => ({ ...p, clean_cup: v }))}
            />
            <CupCheckRow
              label="Sweetness"
              cups={cupChecks.sweetness}
              onChange={v => setCupChecks(p => ({ ...p, sweetness: v }))}
              notes={cupCheckNotes.sweetness}
              onNotesChange={v => setCupCheckNotes(p => ({ ...p, sweetness: v }))}
            />

            {/* Defects */}
            <div className="bg-white border border-coffee-200 rounded-xl px-4 py-3">
              <p className="text-sm text-coffee-700 mb-3" style={{ fontWeight: 500 }}>Defects</p>
              {defects.length > 0 && (
                <div className="space-y-2 mb-3">
                  {defects.map((d, i) => {
                    const mult  = d.type === 'fault' ? 4 : 2;
                    const score = (parseInt(d.cups_affected) || 0) * (parseInt(d.intensity) || 0) * mult;
                    return (
                      <div key={i} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: '#FDF4F4', border: '1px solid #F3C0C0' }}>
                        <select
                          value={d.type}
                          onChange={e => setDefects(p => p.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
                          className="h-8 px-2 text-xs border border-coffee-200 rounded-lg bg-white"
                        >
                          <option value="taint">Taint (×2)</option>
                          <option value="fault">Fault (×4)</option>
                        </select>
                        <input
                          type="number" min={1} max={5}
                          value={d.cups_affected}
                          onChange={e => setDefects(p => p.map((x, j) => j === i ? { ...x, cups_affected: e.target.value } : x))}
                          placeholder="Cups"
                          className="w-16 h-8 px-2 text-xs border border-coffee-200 rounded-lg text-center"
                        />
                        <span className="text-xs text-coffee-400">×</span>
                        <input
                          type="number" min={1} max={4}
                          value={d.intensity}
                          onChange={e => setDefects(p => p.map((x, j) => j === i ? { ...x, intensity: e.target.value } : x))}
                          placeholder="Int."
                          className="w-14 h-8 px-2 text-xs border border-coffee-200 rounded-lg text-center"
                        />
                        <span className="text-xs text-coffee-600" style={{ fontWeight: 500 }}>= −{score}</span>
                        <input
                          type="text"
                          value={d.notes || ''}
                          onChange={e => setDefects(p => p.map((x, j) => j === i ? { ...x, notes: e.target.value } : x))}
                          placeholder="Description…"
                          className="flex-1 h-8 px-2 text-xs border border-coffee-200 rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => setDefects(p => p.filter((_, j) => j !== i))}
                          className="text-coffee-400 hover:text-coffee-700 text-lg leading-none"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => setDefects(p => [...p, { type: 'taint', cups_affected: 1, intensity: 1, notes: '' }])}
                className="text-xs text-coffee-500 hover:text-coffee-700 transition-colors"
              >
                + Add Defect
              </button>
            </div>

            {/* Running score */}
            <ScorePanel scores={scores} cupChecks={cupChecks} nCups={nCups} defects={defects} />

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(2)}>← Back</Button>
              <Button variant="primary" onClick={() => setStep(4)} className="flex-1 justify-center">
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Decision ──────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>Final Decision</h2>

            <ScorePanel scores={scores} cupChecks={cupChecks} nCups={nCups} defects={defects} />

            <div>
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
                    className="py-3 rounded-xl text-sm border transition-colors duration-150"
                    style={{
                      background:  decision === opt.value ? opt.activeBg   : '#FFF',
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

            {['adjust', 'reject'].includes(decision) && (
              <div>
                <label className="text-sm text-coffee-600 mb-1 block" style={{ fontWeight: 500 }}>
                  Decision Notes <span style={{ color: '#A32D2D' }}>*</span>
                </label>
                <textarea
                  value={decisionNotes}
                  onChange={e => setDecisionNotes(e.target.value)}
                  rows={3}
                  placeholder={decision === 'adjust' ? 'Describe what parameters to review…' : 'Describe reason for rejection…'}
                  className="w-full px-3 py-2 text-sm border border-coffee-200 rounded-lg focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100 resize-none"
                />
              </div>
            )}

            {error && <p className="text-xs" style={{ color: '#A32D2D' }}>{error}</p>}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(3)}>← Back</Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={saving || !decision}
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
