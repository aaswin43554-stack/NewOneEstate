import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, FormTextarea } from '../../components/ui';

const ATTRS = ['aroma', 'flavour', 'acidity', 'body', 'sweetness', 'aftertaste', 'overall'];
const TZ = 'Asia/Vientiane';

const DECISION_META = {
  adjust:  { cls: 'badge-under-review', label: 'Adjust' },
  approve: { cls: 'badge-published',    label: 'Approve' },
  reject:  { cls: 'badge-missing',      label: 'Reject' },
};

const CustomTick = ({ payload, x, y, textAnchor }) => (
  <text x={x} y={y} textAnchor={textAnchor}
    style={{ fontSize: 11, fill: '#A8896A', fontFamily: 'Inter' }}>
    {payload.value}
  </text>
);

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium' });
}

const PURPOSE_LABELS = {
  development: 'Development',
  quality_check: 'Quality Check',
  comparative: 'Comparative',
};

export default function CuppingDetail() {
  const { id } = useParams();

  const [session,     setSession]     = useState(null);
  const [samples,     setSamples]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [draft,       setDraft]       = useState('');
  const [draftSaving, setDraftSaving] = useState(false);
  const [lastSaved,   setLastSaved]   = useState(null);

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

  if (loading) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;
  if (!session) return <Layout><div className="px-6 py-6 text-sm" style={{ color: '#A32D2D' }}>Session not found.</div></Layout>;

  const sample = samples[0];
  const radarData = ATTRS.map(k => ({
    attribute: k.charAt(0).toUpperCase() + k.slice(1),
    score: sample ? (sample[`score_${k}`] || 0) : 0,
  }));
  const total = ATTRS.reduce((s, k) => s + (sample?.[`score_${k}`] || 0), 0);
  const meta = DECISION_META[sample?.final_decision] || { cls: 'badge-draft', label: sample?.final_decision };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl text-coffee-900" style={{ fontWeight: 500 }}>{session.cupping_date}</h1>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: '#F2EAE0', color: '#8B6A47' }}
          >
            {PURPOSE_LABELS[session.cupping_purpose] || session.cupping_purpose}
          </span>
          <span className="text-sm text-coffee-400">Day {session.days_off_roast} off roast</span>
        </div>

        {session.early_warning && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FAEEDA', color: '#BA7517' }}>
            Logged before minimum rest period.
          </div>
        )}

        {/* Radar chart */}
        {sample && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <p className="text-xs text-coffee-400 uppercase tracking-wide mb-4">Score Radar</p>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="#E0D0BC" />
                <PolarAngleAxis dataKey="attribute" tick={<CustomTick />} />
                <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: '#FDFAF6', border: '1px solid #E0D0BC',
                    borderRadius: 8, fontSize: 12, color: '#533A24',
                  }}
                />
                <Radar
                  name="Scores"
                  dataKey="score"
                  stroke="#EF9F27"
                  fill="#EF9F27"
                  fillOpacity={0.2}
                  strokeWidth={1.5}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Score table */}
        {sample && (
          <div className="bg-white border border-coffee-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: '#FAF6F0', borderBottom: '1px solid #F2EAE0' }}>
                  <th className="text-left px-4 py-2.5 text-coffee-400 uppercase tracking-wide">Attribute</th>
                  <th className="text-center px-4 py-2.5 text-coffee-400 uppercase tracking-wide">Score</th>
                  <th className="text-left px-4 py-2.5 text-coffee-400 uppercase tracking-wide">Observation</th>
                </tr>
              </thead>
              <tbody>
                {ATTRS.map(k => (
                  <tr key={k} style={{ borderBottom: '1px solid #F2EAE0' }}>
                    <td className="px-4 py-2.5 text-coffee-700 capitalize">{k}</td>
                    <td className="px-4 py-2.5 text-center text-coffee-900" style={{ fontWeight: 500 }}>
                      {sample[`score_${k}`]}/10
                    </td>
                    <td className="px-4 py-2.5 text-coffee-400">{sample[`obs_${k}`] || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              className="px-4 py-3 flex items-center justify-between"
              style={{ borderTop: '1px solid #F2EAE0', background: '#FAF6F0' }}
            >
              <span className="text-xs text-coffee-500">
                Total: <span className="text-coffee-900" style={{ fontWeight: 500 }}>{total.toFixed(1)} / 70</span>
              </span>
              {sample.final_decision && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs capitalize ${meta.cls}`}>
                  {meta.label}
                </span>
              )}
            </div>
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
    </Layout>
  );
}
