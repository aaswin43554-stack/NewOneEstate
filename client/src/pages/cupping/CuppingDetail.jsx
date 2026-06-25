import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
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
            <button
              onClick={() => { setDeleteError(''); setDeleteOpen(true); }}
              className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
              style={{ borderColor: '#F3C0C0', color: '#A32D2D' }}
            >
              <Trash2 size={12} /> Delete
            </button>
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
