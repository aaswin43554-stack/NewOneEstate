import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trash2, Pencil } from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, FormTextarea } from '../../components/ui';

const TZ = 'Asia/Vientiane';

const DECISION_META = {
  adjust:  { cls: 'badge-under-review', label: 'Adjust' },
  approve: { cls: 'badge-published',    label: 'Approve' },
  reject:  { cls: 'badge-missing',      label: 'Reject' },
};

const PURPOSE_LABELS = {
  development:  'Development',
  quality_check: 'Quality Check',
  comparative:  'Comparative',
  production:   'Production',
  sampling:     'Sampling',
};

const SCA_SCORED_ATTRS = [
  { key: 'fragrance_aroma', label: 'Fragrance/Aroma' },
  { key: 'flavor',          label: 'Flavor' },
  { key: 'aftertaste',      label: 'Aftertaste' },
  { key: 'acidity',         label: 'Acidity' },
  { key: 'body',            label: 'Body' },
  { key: 'balance',         label: 'Balance' },
  { key: 'overall',         label: 'Overall' },
];

// Legacy attributes (old 70-point system)
const LEGACY_ATTRS = [
  { key: 'fragrance_aroma', label: 'Fragrance/Aroma', obsKey: 'obs_fragrance_dry' },
  { key: 'flavor',          label: 'Flavor',           obsKey: 'obs_flavor' },
  { key: 'aftertaste',      label: 'Aftertaste',        obsKey: 'obs_aftertaste' },
  { key: 'acidity',         label: 'Acidity',           obsKey: 'obs_acidity' },
  { key: 'body',            label: 'Body',              obsKey: 'obs_body' },
  { key: 'sweetness',       label: 'Sweetness',         obsKey: 'obs_sweetness_notes' },
  { key: 'overall',         label: 'Overall',           obsKey: 'obs_overall' },
];

const SCORE_LABELS = [
  [90, 100,  'Outstanding',    '#3B6D11'],
  [85, 89.99, 'Excellent',     '#3B6D11'],
  [80, 84.99, 'Specialty',     '#3B6D11'],
  [75, 79.99, 'Very Good',     '#BA7517'],
  [0,  74.99, 'Below Specialty', '#A32D2D'],
];

const ACIDITY_INTENSITIES = ['Low', 'Medium-Low', 'Medium', 'Medium-High', 'High'];
const BODY_LEVELS = ['Thin', 'Light', 'Medium', 'Heavy', 'Full'];
const EDIT_ATTRS = [
  { key: 'fragrance_aroma', label: 'Fragrance / Aroma', hasDry: true, hasWet: true },
  { key: 'flavor',          label: 'Flavor' },
  { key: 'aftertaste',      label: 'Aftertaste' },
  { key: 'acidity',         label: 'Acidity',  hasIntensity: true },
  { key: 'body',            label: 'Body',      hasLevel: true },
  { key: 'balance',         label: 'Balance' },
  { key: 'overall',         label: 'Overall' },
];

function getScoreLabel(score) {
  for (const [min, max, label, color] of SCORE_LABELS) {
    if (score >= min && score <= max) return { label, color };
  }
  return { label: 'Below Specialty', color: '#A32D2D' };
}

const CustomTick = ({ payload, x, y, textAnchor }) => (
  <text x={x} y={y} textAnchor={textAnchor} style={{ fontSize: 10, fill: '#A8896A', fontFamily: 'Inter' }}>
    {payload.value}
  </text>
);

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, dateStyle: 'medium' });
}

function cupCheckScore(cups) {
  if (!Array.isArray(cups)) return 0;
  const n = cups.filter(Boolean).length;
  if (n === 0) return 0;
  if (n === 1) return 3;
  if (n === 2) return 7;
  return 10;
}

function CupCheckGrid({ label, cups, score }) {
  if (!Array.isArray(cups) || cups.length === 0) return null;
  const displayScore = cupCheckScore(cups);
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid #F2EAE0' }}>
      <span className="text-sm text-coffee-700 w-32">{label}</span>
      <div className="flex gap-1">
        {cups.map((v, i) => (
          <span
            key={i}
            className="w-7 h-7 rounded flex items-center justify-center text-xs"
            style={{ background: v ? '#EAF3DE' : '#FCEBEB', color: v ? '#3B6D11' : '#A32D2D', fontWeight: 500 }}
          >
            {v ? '✓' : '✗'}
          </span>
        ))}
      </div>
      <span className="text-sm text-coffee-900 w-12 text-right" style={{ fontWeight: 500 }}>
        {displayScore} / 10
      </span>
    </div>
  );
}

export default function CuppingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [session,     setSession]     = useState(null);
  const [samples,     setSamples]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [draft,       setDraft]       = useState('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [lastSaved,   setLastSaved]   = useState(null);
  const [deleteOpen,  setDeleteOpen]  = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [editOpen,          setEditOpen]          = useState(false);
  const [editScores,        setEditScores]        = useState({});
  const [editObs,           setEditObs]           = useState({});
  const [editCupChecks,     setEditCupChecks]     = useState({ uniformity: [], clean_cup: [], sweetness: [] });
  const [editDefects,       setEditDefects]       = useState([]);
  const [editDecision,      setEditDecision]      = useState('');
  const [editDecisionNotes, setEditDecisionNotes] = useState('');
  const [editSaving,        setEditSaving]        = useState(false);
  const [editError,         setEditError]         = useState('');

  function load() {
    setLoading(true);
    api.get(`/cupping-sessions/${id}`)
      .then(r => r.json())
      .then(d => {
        setSession(d.session);
        setSamples(d.samples || []);
        if (d.samples?.[0]) setDraft(d.samples[0].journal_draft || '');
      })
      .finally(() => setLoading(false));
  }
  useEffect(load, [id]);

  async function saveDraft() {
    if (!samples[0]) return;
    setDraftSaving(true);
    await api.put(`/cupping-sessions/${id}/samples/${samples[0].id}`, { journal_draft: draft });
    setLastSaved(new Date());
    setDraftSaving(false);
  }

  function openEditModal() {
    if (!sample) return;
    const nCups = session.number_of_cups || 3;
    setEditScores({
      fragrance_aroma: parseFloat(sample.score_fragrance_aroma) || 8,
      flavor:          parseFloat(sample.score_flavor)          || 8,
      aftertaste:      parseFloat(sample.score_aftertaste)      || 8,
      acidity:         parseFloat(sample.score_acidity)         || 8,
      body:            parseFloat(sample.score_body)            || 8,
      balance:         parseFloat(sample.score_balance)         || 8,
      overall:         parseFloat(sample.score_overall)         || 8,
    });
    setEditObs({
      obs_fragrance_dry: sample.obs_fragrance_dry  || '',
      obs_aroma_wet:     sample.obs_aroma_wet      || '',
      obs_flavor:        sample.obs_flavor         || '',
      obs_aftertaste:    sample.obs_aftertaste     || '',
      obs_acidity:       sample.obs_acidity        || '',
      obs_body:          sample.obs_body           || '',
      obs_balance:       sample.obs_balance        || '',
      obs_overall:       sample.obs_overall        || '',
      acidity_intensity: sample.acidity_intensity  || 'Medium',
      body_level:        sample.body_level         || 'Medium',
    });
    const toCupArr = (arr) =>
      Array.isArray(arr) && arr.length > 0 ? arr : Array(nCups).fill(true);
    setEditCupChecks({
      uniformity: toCupArr(sample.uniformity_cups),
      clean_cup:  toCupArr(sample.clean_cup_cups),
      sweetness:  toCupArr(sample.sweetness_cups),
    });
    setEditDefects(Array.isArray(sample.defects_json) ? [...sample.defects_json] : []);
    setEditDecision(sample.final_decision || '');
    setEditDecisionNotes(sample.decision_notes || '');
    setEditError('');
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editDecision) { setEditError('Final decision is required.'); return; }
    if (['adjust', 'reject'].includes(editDecision) && !editDecisionNotes.trim()) {
      setEditError('Decision notes are required for Adjust or Reject.');
      return;
    }
    setEditSaving(true); setEditError('');
    const res = await api.put(`/cupping-sessions/${id}/samples/${sample.id}`, {
      score_fragrance_aroma: editScores.fragrance_aroma,
      score_flavor:          editScores.flavor,
      score_aftertaste:      editScores.aftertaste,
      score_acidity:         editScores.acidity,
      score_body:            editScores.body,
      score_balance:         editScores.balance,
      score_overall:         editScores.overall,
      obs_fragrance_dry:     editObs.obs_fragrance_dry  || null,
      obs_aroma_wet:         editObs.obs_aroma_wet      || null,
      obs_flavor:            editObs.obs_flavor         || null,
      obs_aftertaste:        editObs.obs_aftertaste     || null,
      obs_acidity:           editObs.obs_acidity        || null,
      obs_body:              editObs.obs_body           || null,
      obs_balance:           editObs.obs_balance        || null,
      obs_overall:           editObs.obs_overall        || null,
      acidity_intensity:     editObs.acidity_intensity,
      body_level:            editObs.body_level,
      uniformity_cups:       editCupChecks.uniformity,
      clean_cup_cups:        editCupChecks.clean_cup,
      sweetness_cups:        editCupChecks.sweetness,
      defects_json:          editDefects,
      final_decision:        editDecision,
      decision_notes:        editDecisionNotes || null,
    });
    const d = await res.json();
    if (res.ok) { setEditOpen(false); load(); }
    else { setEditError(d.error || 'Failed to update.'); }
    setEditSaving(false);
  }

  async function confirmDelete() {
    setDeleting(true); setDeleteError('');
    const res = await api.delete(`/cupping-sessions/${id}`);
    if (res.ok) { navigate('/cupping'); }
    else {
      const d = await res.json().catch(() => ({}));
      setDeleteError(d.error || 'Failed to delete.');
      setDeleting(false);
    }
  }

  if (loading) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;
  if (!session) return <Layout><div className="px-6 py-6 text-sm" style={{ color: '#A32D2D' }}>Session not found.</div></Layout>;

  const sample  = samples[0];
  const isLegacy = session.legacy_scoring;
  const meta    = DECISION_META[sample?.final_decision] || { cls: 'badge-draft', label: sample?.final_decision };

  // SCA final score calculation
  const scoredTotal = SCA_SCORED_ATTRS.reduce((s, a) => s + (parseFloat(sample?.[`score_${a.key}`]) || 0), 0);
  const uniformityScore = Array.isArray(sample?.uniformity_cups) ? cupCheckScore(sample.uniformity_cups) : (parseFloat(sample?.score_uniformity) || 0);
  const cleanCupScore   = Array.isArray(sample?.clean_cup_cups)  ? cupCheckScore(sample.clean_cup_cups)  : (parseFloat(sample?.score_clean_cup)  || 0);
  const sweetnessScore  = Array.isArray(sample?.sweetness_cups)  ? cupCheckScore(sample.sweetness_cups)  : (parseFloat(sample?.score_sweetness)  || 0);
  const defectsTotal    = (sample?.defects_json || []).reduce((s, d) => {
    const mult = d.type === 'fault' ? 4 : 2;
    return s + (parseInt(d.cups_affected) || 0) * (parseInt(d.intensity) || 0) * mult;
  }, 0);
  const finalScore = scoredTotal + uniformityScore + cleanCupScore + sweetnessScore - defectsTotal;

  // Legacy total (old 70-point system)
  const legacyTotal = isLegacy
    ? (parseFloat(sample?.score_fragrance_aroma) || 0) +
      (parseFloat(sample?.score_flavor)          || 0) +
      (parseFloat(sample?.score_aftertaste)      || 0) +
      (parseFloat(sample?.score_acidity)         || 0) +
      (parseFloat(sample?.score_body)            || 0) +
      (parseFloat(sample?.score_sweetness)       || 0) +
      (parseFloat(sample?.score_overall)         || 0)
    : 0;

  const radarData = SCA_SCORED_ATTRS.map(a => ({
    attribute: a.label.split('/')[0],
    score: parseFloat(sample?.[`score_${a.key}`]) || 6,
  }));

  const { label: gradeLabel, color: gradeColor } = getScoreLabel(isLegacy ? legacyTotal : finalScore);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl text-coffee-900" style={{ fontWeight: 500 }}>
            {fmtDate(session.cupping_date)}
          </h1>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#F2EAE0', color: '#8B6A47' }}>
            {PURPOSE_LABELS[session.cupping_purpose] || session.cupping_purpose}
          </span>
          <span className="text-sm text-coffee-400">Day {session.days_off_roast} off roast</span>
          {isLegacy && (
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#FAEEDA', color: '#BA7517' }}>
              Legacy 70-pt
            </span>
          )}
          {isAdmin && (
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={openEditModal}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: '#E0D0BC', color: '#8B6A47' }}
              >
                <Pencil size={12} /> Edit
              </button>
              <button
                onClick={() => { setDeleteError(''); setDeleteOpen(true); }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
                style={{ borderColor: '#F3C0C0', color: '#A32D2D' }}
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          )}
        </div>

        {session.early_warning && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FAEEDA', color: '#BA7517' }}>
            Logged before minimum rest period.
          </div>
        )}

        {/* Final score */}
        {sample && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-coffee-400 uppercase tracking-wide mb-1">
                  {isLegacy ? 'Total Score (Legacy)' : 'SCA Final Score'}
                </p>
                <p className="text-coffee-900" style={{ fontSize: 52, fontWeight: 500, lineHeight: 1 }}>
                  {isLegacy ? legacyTotal.toFixed(1) : finalScore.toFixed(2)}
                </p>
                <p className="text-xs text-coffee-400 mt-0.5">
                  / {isLegacy ? '70' : '100'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg" style={{ fontWeight: 600, color: gradeColor }}>{gradeLabel}</p>
                {sample.final_decision && (
                  <span className={`mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs capitalize ${meta.cls}`}>
                    {meta.label}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Radar chart — SCA 7 attributes, domain 6-10 */}
        {sample && !isLegacy && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <p className="text-xs text-coffee-400 uppercase tracking-wide mb-4">Score Radar</p>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="#E0D0BC" />
                <PolarAngleAxis dataKey="attribute" tick={<CustomTick />} />
                <PolarRadiusAxis domain={[6, 10]} tick={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#FDFAF6', border: '1px solid #E0D0BC',
                    borderRadius: 8, fontSize: 12, color: '#533A24',
                  }}
                />
                <Radar name="Scores" dataKey="score" stroke="#EF9F27" fill="#EF9F27" fillOpacity={0.2} strokeWidth={1.5} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Scored attributes table */}
        {sample && (
          <div className="bg-white border border-coffee-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: '#FAF6F0', borderBottom: '1px solid #F2EAE0' }}>
                  <th className="text-left px-4 py-2.5 text-coffee-400 uppercase tracking-wide">Attribute</th>
                  <th className="text-center px-4 py-2.5 text-coffee-400 uppercase tracking-wide">Score</th>
                  <th className="text-left px-4 py-2.5 text-coffee-400 uppercase tracking-wide">Notes</th>
                </tr>
              </thead>
              <tbody>
                {(isLegacy ? LEGACY_ATTRS : SCA_SCORED_ATTRS).map(({ key, label, obsKey }) => {
                  const score = sample[`score_${key}`];
                  const note  = obsKey ? sample[obsKey] : sample[`obs_${key}`];
                  const qualifier = key === 'acidity'
                    ? sample.acidity_intensity
                    : key === 'body'
                    ? sample.body_level
                    : null;
                  return (
                    <tr key={key} style={{ borderBottom: '1px solid #F2EAE0' }}>
                      <td className="px-4 py-2.5 text-coffee-700">
                        {label}
                        {qualifier && (
                          <span className="ml-1 text-xs px-1 py-0.5 rounded" style={{ background: '#F2EAE0', color: '#8B6A47' }}>
                            {qualifier}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-coffee-900" style={{ fontWeight: 500 }}>
                        {score != null ? parseFloat(score).toFixed(isLegacy ? 0 : 2) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-coffee-400">
                        {key === 'fragrance_aroma' && !isLegacy ? (
                          <span>
                            {[sample.obs_fragrance_dry, sample.obs_aroma_wet].filter(Boolean).join(' / ') || '—'}
                          </span>
                        ) : (
                          note || '—'
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* SCA cup-check section */}
            {!isLegacy && sample && (
              <div className="px-4 py-3" style={{ borderTop: '1px solid #F2EAE0' }}>
                <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Cup Checks</p>
                <CupCheckGrid label="Uniformity"  cups={sample.uniformity_cups} score={sample.score_uniformity} />
                <CupCheckGrid label="Clean Cup"   cups={sample.clean_cup_cups}  score={sample.score_clean_cup} />
                <CupCheckGrid label="Sweetness"   cups={sample.sweetness_cups}  score={sample.score_sweetness} />
              </div>
            )}

            {/* Defects */}
            {!isLegacy && sample?.defects_json?.length > 0 && (
              <div className="px-4 py-3" style={{ borderTop: '1px solid #F2EAE0' }}>
                <p className="text-xs text-coffee-400 uppercase tracking-wide mb-2">Defects</p>
                {sample.defects_json.map((d, i) => {
                  const mult  = d.type === 'fault' ? 4 : 2;
                  const score = (parseInt(d.cups_affected) || 0) * (parseInt(d.intensity) || 0) * mult;
                  return (
                    <div key={i} className="flex gap-3 text-xs text-coffee-600 py-1.5" style={{ borderBottom: '1px solid #F2EAE0' }}>
                      <span className="capitalize w-10" style={{ fontWeight: 500 }}>{d.type}</span>
                      <span>{d.cups_affected} cup{d.cups_affected !== 1 ? 's' : ''}</span>
                      <span>× {d.intensity}</span>
                      <span>× {mult}</span>
                      <span className="text-coffee-900" style={{ fontWeight: 500 }}>= −{score}</span>
                      {d.notes && <span className="text-coffee-400 flex-1">{d.notes}</span>}
                    </div>
                  );
                })}
                <p className="text-xs mt-2" style={{ color: '#A32D2D', fontWeight: 500 }}>
                  Total deducted: −{defectsTotal}
                </p>
              </div>
            )}

            {/* Score totals footer */}
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderTop: '1px solid #F2EAE0', background: '#FAF6F0' }}
            >
              {isLegacy ? (
                <span className="text-xs text-coffee-500">
                  Total: <span className="text-coffee-900" style={{ fontWeight: 500 }}>{legacyTotal.toFixed(1)} / 70</span>
                  <span className="text-coffee-400 ml-1">(legacy scoring)</span>
                </span>
              ) : (
                <div className="flex gap-4 text-xs text-coffee-500">
                  <span>Scored: <span style={{ fontWeight: 500, color: '#533A24' }}>{scoredTotal.toFixed(2)}</span></span>
                  <span>Cups: <span style={{ fontWeight: 500, color: '#533A24' }}>{uniformityScore + cleanCupScore + sweetnessScore}</span></span>
                  {defectsTotal > 0 && <span style={{ color: '#A32D2D' }}>−{defectsTotal}</span>}
                  <span className="text-coffee-700" style={{ fontWeight: 600 }}>= {finalScore.toFixed(2)} / 100</span>
                </div>
              )}
              {sample?.final_decision && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs capitalize ${meta.cls}`}>
                  {meta.label}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Decision notes */}
        {sample?.decision_notes && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <p className="text-xs text-coffee-400 uppercase tracking-wide mb-2">Decision Notes</p>
            <p className="text-sm text-coffee-700">{sample.decision_notes}</p>
          </div>
        )}

        {/* Journal draft */}
        {sample && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Journal Draft</p>
            <FormTextarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={5}
              placeholder="Tasting notes and observations…"
            />
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-coffee-400">
                {lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : ''}
              </span>
              <Button variant="secondary" size="sm" onClick={saveDraft} disabled={draftSaving}>
                {draftSaving ? 'Saving…' : 'Save Draft'}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit cupping modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto p-4" style={{ background: 'rgba(34,21,8,0.4)' }}>
          <div className="flex min-h-screen items-start justify-center">
            <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-2xl my-8 p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>Edit Cupping Session</h2>
                <button onClick={() => setEditOpen(false)} className="text-coffee-400 hover:text-coffee-700 text-2xl leading-none">×</button>
              </div>

              {/* Scored Attributes */}
              <div>
                <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Scores</p>
                <div className="space-y-3">
                  {EDIT_ATTRS.map(({ key, label, hasDry, hasWet, hasIntensity, hasLevel }) => (
                    <div key={key} className="rounded-xl px-4 py-3" style={{ background: '#FAF6F0', border: '1px solid #F2EAE0' }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-coffee-700" style={{ fontWeight: 500 }}>{label}</span>
                        <span className="font-mono text-coffee-900" style={{ fontWeight: 500, fontSize: 16 }}>
                          {(editScores[key] || 8).toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range" min={6} max={10} step={0.25}
                        value={editScores[key] || 8}
                        onChange={e => setEditScores(p => ({ ...p, [key]: parseFloat(e.target.value) }))}
                        className="w-full mb-1"
                        style={{ accentColor: '#8B6A47' }}
                      />
                      <div className="flex justify-between text-xs text-coffee-300 mb-2">
                        <span>6.00</span><span>8.00</span><span>10.00</span>
                      </div>
                      {hasDry ? (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={editObs.obs_fragrance_dry || ''}
                            onChange={e => setEditObs(p => ({ ...p, obs_fragrance_dry: e.target.value }))}
                            placeholder="Dry (Fragrance) notes…"
                            className="w-full px-2 py-1.5 text-sm border border-coffee-200 rounded-lg"
                          />
                          <input
                            type="text"
                            value={editObs.obs_aroma_wet || ''}
                            onChange={e => setEditObs(p => ({ ...p, obs_aroma_wet: e.target.value }))}
                            placeholder="Wet (Aroma) notes…"
                            className="w-full px-2 py-1.5 text-sm border border-coffee-200 rounded-lg"
                          />
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={editObs[`obs_${key}`] || ''}
                          onChange={e => setEditObs(p => ({ ...p, [`obs_${key}`]: e.target.value }))}
                          placeholder="Descriptor notes…"
                          className="w-full px-2 py-1.5 text-sm border border-coffee-200 rounded-lg"
                        />
                      )}
                      {hasIntensity && (
                        <div className="mt-2">
                          <p className="text-xs text-coffee-400 mb-1">Intensity</p>
                          <div className="flex gap-1 flex-wrap">
                            {ACIDITY_INTENSITIES.map(opt => (
                              <button
                                key={opt} type="button"
                                onClick={() => setEditObs(p => ({ ...p, acidity_intensity: opt }))}
                                className="px-2 py-0.5 rounded text-xs border transition-colors"
                                style={{
                                  background:  editObs.acidity_intensity === opt ? '#533A24' : '#FFF',
                                  color:       editObs.acidity_intensity === opt ? '#FFF' : '#8B6A47',
                                  borderColor: editObs.acidity_intensity === opt ? '#533A24' : '#E0D0BC',
                                }}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {hasLevel && (
                        <div className="mt-2">
                          <p className="text-xs text-coffee-400 mb-1">Level</p>
                          <div className="flex gap-1 flex-wrap">
                            {BODY_LEVELS.map(opt => (
                              <button
                                key={opt} type="button"
                                onClick={() => setEditObs(p => ({ ...p, body_level: opt }))}
                                className="px-2 py-0.5 rounded text-xs border transition-colors"
                                style={{
                                  background:  editObs.body_level === opt ? '#533A24' : '#FFF',
                                  color:       editObs.body_level === opt ? '#FFF' : '#8B6A47',
                                  borderColor: editObs.body_level === opt ? '#533A24' : '#E0D0BC',
                                }}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Cup Checks */}
              {!isLegacy && (
                <div>
                  <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Cup Checks</p>
                  <div className="space-y-3">
                    {[
                      { key: 'uniformity', label: 'Uniformity' },
                      { key: 'clean_cup',  label: 'Clean Cup' },
                      { key: 'sweetness',  label: 'Sweetness' },
                    ].map(({ key, label }) => (
                      <div key={key} className="rounded-xl px-4 py-3" style={{ background: '#FAF6F0', border: '1px solid #F2EAE0' }}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-coffee-700" style={{ fontWeight: 500 }}>{label}</span>
                          <span className="text-xs text-coffee-500">
                            {(editCupChecks[key] || []).filter(Boolean).length * 2} / {(editCupChecks[key] || []).length * 2} pts
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {(editCupChecks[key] || []).map((checked, i) => (
                            <button
                              key={i} type="button"
                              onClick={() => setEditCupChecks(p => ({
                                ...p,
                                [key]: p[key].map((v, j) => j === i ? !v : v),
                              }))}
                              className="w-9 h-9 rounded-lg flex items-center justify-center text-sm transition-colors"
                              style={{
                                background: checked ? '#EAF3DE' : '#FAF6F0',
                                border: `2px solid ${checked ? '#3B6D11' : '#E0D0BC'}`,
                                color: checked ? '#3B6D11' : '#C0A882',
                                fontWeight: 500,
                              }}
                            >
                              {checked ? '✓' : '✗'}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Defects */}
              {!isLegacy && (
                <div>
                  <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Defects</p>
                  <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: '#FAF6F0', border: '1px solid #F2EAE0' }}>
                    {editDefects.map((d, i) => {
                      const mult  = d.type === 'fault' ? 4 : 2;
                      const score = (parseInt(d.cups_affected) || 0) * (parseInt(d.intensity) || 0) * mult;
                      return (
                        <div key={i} className="flex items-center gap-2 flex-wrap">
                          <select
                            value={d.type}
                            onChange={e => setEditDefects(p => p.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
                            className="h-8 px-2 text-xs border border-coffee-200 rounded-lg bg-white"
                          >
                            <option value="taint">Taint (×2)</option>
                            <option value="fault">Fault (×4)</option>
                          </select>
                          <input
                            type="number" min={1} max={5}
                            value={d.cups_affected}
                            onChange={e => setEditDefects(p => p.map((x, j) => j === i ? { ...x, cups_affected: e.target.value } : x))}
                            placeholder="Cups"
                            className="w-16 h-8 px-2 text-xs border border-coffee-200 rounded-lg text-center"
                          />
                          <span className="text-xs text-coffee-400">×</span>
                          <input
                            type="number" min={1} max={4}
                            value={d.intensity}
                            onChange={e => setEditDefects(p => p.map((x, j) => j === i ? { ...x, intensity: e.target.value } : x))}
                            placeholder="Int."
                            className="w-14 h-8 px-2 text-xs border border-coffee-200 rounded-lg text-center"
                          />
                          <span className="text-xs text-coffee-600" style={{ fontWeight: 500 }}>= −{score}</span>
                          <input
                            type="text"
                            value={d.notes || ''}
                            onChange={e => setEditDefects(p => p.map((x, j) => j === i ? { ...x, notes: e.target.value } : x))}
                            placeholder="Description…"
                            className="flex-1 h-8 px-2 text-xs border border-coffee-200 rounded-lg"
                          />
                          <button
                            type="button"
                            onClick={() => setEditDefects(p => p.filter((_, j) => j !== i))}
                            className="text-coffee-400 hover:text-coffee-700 text-lg leading-none"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setEditDefects(p => [...p, { type: 'taint', cups_affected: 1, intensity: 1, notes: '' }])}
                      className="text-xs text-coffee-500 hover:text-coffee-700 transition-colors"
                    >
                      + Add Defect
                    </button>
                  </div>
                </div>
              )}

              {/* Final Decision */}
              <div>
                <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Final Decision</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {[
                    { value: 'adjust',  label: 'Adjust',  activeColor: '#BA7517', activeBg: '#FAEEDA' },
                    { value: 'approve', label: 'Approve', activeColor: '#3B6D11', activeBg: '#EAF3DE' },
                    { value: 'reject',  label: 'Reject',  activeColor: '#A32D2D', activeBg: '#FCEBEB' },
                  ].map(opt => (
                    <button
                      key={opt.value} type="button"
                      onClick={() => setEditDecision(opt.value)}
                      className="py-2.5 rounded-xl text-sm border transition-colors"
                      style={{
                        background:  editDecision === opt.value ? opt.activeBg   : '#FFF',
                        color:       editDecision === opt.value ? opt.activeColor : '#8B6A47',
                        borderColor: editDecision === opt.value ? opt.activeColor : '#E0D0BC',
                        fontWeight:  editDecision === opt.value ? 500 : 400,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {['adjust', 'reject'].includes(editDecision) && (
                  <textarea
                    value={editDecisionNotes}
                    onChange={e => setEditDecisionNotes(e.target.value)}
                    rows={3}
                    placeholder={editDecision === 'adjust' ? 'Describe what to adjust…' : 'Reason for rejection…'}
                    className="w-full px-3 py-2 text-sm border border-coffee-200 rounded-lg resize-none"
                  />
                )}
              </div>

              {editError && <p className="text-xs" style={{ color: '#A32D2D' }}>{editError}</p>}

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  onClick={saveEdit}
                  disabled={editSaving || !editDecision}
                  className="flex-1 justify-center"
                  style={{ background: '#3B6D11', color: '#fff' }}
                >
                  {editSaving ? 'Saving…' : 'Save Changes'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete cupping session modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(34,21,8,0.2)' }}>
          <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-sm p-6">
            <h2 className="text-base text-coffee-900 mb-2" style={{ fontWeight: 500 }}>Delete Cupping Session</h2>
            <p className="text-sm text-coffee-600 mb-4">
              This will permanently remove the cupping session from {fmtDate(session.cupping_date)} and its scores. This cannot be undone.
            </p>
            {deleteError && <p className="text-xs mb-3" style={{ color: '#A32D2D' }}>{deleteError}</p>}
            <div className="flex gap-3">
              <Button onClick={confirmDelete} disabled={deleting} className="flex-1 justify-center" variant="destructive">
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
