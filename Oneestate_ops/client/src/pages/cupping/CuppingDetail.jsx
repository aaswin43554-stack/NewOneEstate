import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const ATTRS = ['aroma','flavour','acidity','body','sweetness','aftertaste','overall'];
const TZ = 'Asia/Vientiane';

const DECISION_STYLES = {
  adjust:  'bg-amber-100 text-amber-700',
  approve: 'bg-green-100 text-green-700',
  reject:  'bg-red-100 text-red-700',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium' });
}

export default function CuppingDetail() {
  const { id } = useParams();
  const [session, setSession] = useState(null);
  const [samples, setSamples] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft,   setDraft]   = useState('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

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

  if (loading) return <Layout><div className="p-6 text-coffee-600">Loading…</div></Layout>;
  if (!session) return <Layout><div className="p-6 text-red-600">Session not found.</div></Layout>;

  const sample = samples[0];
  const radarData = ATTRS.map(k => ({
    subject: k.charAt(0).toUpperCase() + k.slice(1),
    score: sample ? sample[`score_${k}`] : 0,
  }));

  const PURPOSE_LABELS = { development:'Development', quality_check:'Quality Check', comparative:'Comparative' };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-4 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-coffee-900">{session.cupping_date}</h1>
          <span className="text-xs bg-coffee-100 text-coffee-700 px-2 py-0.5 rounded">
            {PURPOSE_LABELS[session.cupping_purpose]}
          </span>
          <span className="text-sm text-coffee-500">Day {session.days_off_roast} off roast</span>
        </div>

        {session.early_warning && (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
            Logged before minimum rest period.
          </div>
        )}

        {/* Radar chart */}
        {sample && (
          <div className="bg-white border border-coffee-200 rounded-lg p-4">
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12 }} />
                <Radar name="Scores" dataKey="score" stroke="#2563eb" fill="#2563eb" fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Scores table */}
        {sample && (
          <div className="bg-white border border-coffee-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-coffee-50 border-b border-coffee-200">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-coffee-600">Attribute</th>
                  <th className="text-center px-3 py-2 text-xs font-semibold text-coffee-600">Score</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-coffee-600">Observation</th>
                </tr>
              </thead>
              <tbody>
                {ATTRS.map(k => (
                  <tr key={k} className="border-b border-coffee-50">
                    <td className="px-3 py-2 font-medium capitalize">{k}</td>
                    <td className="px-3 py-2 text-center font-bold">{sample[`score_${k}`]}/10</td>
                    <td className="px-3 py-2 text-coffee-500 text-xs">{sample[`obs_${k}`] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-3 py-3 flex items-center justify-between border-t border-coffee-100">
              <span className="text-sm font-semibold text-coffee-700">Final Decision</span>
              <span className={`text-xs px-2 py-1 rounded capitalize font-medium ${DECISION_STYLES[sample.final_decision]||''}`}>
                {sample.final_decision}
              </span>
            </div>
          </div>
        )}

        {/* Journal draft */}
        {sample && (
          <div className="bg-white border border-coffee-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-coffee-700 mb-2">Journal Draft</h2>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={5}
              className="w-full border border-coffee-200 rounded px-3 py-2 text-sm text-coffee-800 font-serif"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-coffee-400">
                {lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : ''}
              </span>
              <button onClick={saveDraft} disabled={draftSaving}
                className="px-4 py-1.5 bg-coffee-700 text-white rounded text-sm font-semibold hover:bg-coffee-800 disabled:opacity-50">
                {draftSaving ? 'Saving…' : 'Save Draft'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
