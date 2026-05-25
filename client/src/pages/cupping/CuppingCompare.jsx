import { useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend,
} from 'recharts';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { PageHeader, FilterPills, ProcessBadge } from '../../components/ui';

const PROCESS_OPTIONS = [
  { value: 'Washed',    label: 'Washed' },
  { value: 'Honey',     label: 'Honey' },
  { value: 'Natural',   label: 'Natural' },
  { value: 'Anaerobic', label: 'Anaerobic' },
];

const ATTRS = ['aroma', 'flavour', 'acidity', 'body', 'sweetness', 'aftertaste', 'overall'];

// Distinct coffee-palette colors for overlaid radars
const SERIES_COLORS = [
  '#EF9F27',  // amber — roast
  '#534AB7',  // purple — anaerobic
  '#185FA5',  // blue — washed
  '#3B6D11',  // green — natural
  '#A32D2D',  // red
  '#8B6A47',  // coffee
];

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

function CompareSection({ title, sessions, processName }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="bg-white border border-coffee-200 rounded-xl p-6 mb-5">
        <p className="text-xs text-coffee-400 uppercase tracking-wide mb-2">{title}</p>
        <p className="text-sm text-coffee-300">
          No {title.toLowerCase()} cuppings logged for {processName} yet.
        </p>
      </div>
    );
  }

  const radarData = ATTRS.map(attr => {
    const point = { attribute: attr.charAt(0).toUpperCase() + attr.slice(1) };
    sessions.forEach((s, i) => { point[`s${i}`] = s[`score_${attr}`]; });
    return point;
  });

  return (
    <div className="bg-white border border-coffee-200 rounded-xl p-6 mb-5">
      <p className="text-xs text-coffee-400 uppercase tracking-wide mb-5">{title}</p>

      <ResponsiveContainer width="100%" height={300}>
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
          <Legend
            formatter={(v, entry) => (
              <span style={{ fontSize: 11, color: '#8B6A47' }}>
                {sessions[parseInt(v.slice(1))]?.batch_code || v}
              </span>
            )}
          />
          {sessions.map((s, i) => (
            <Radar
              key={i}
              name={`s${i}`}
              dataKey={`s${i}`}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              fill={SERIES_COLORS[i % SERIES_COLORS.length]}
              fillOpacity={0.15}
              strokeWidth={1.5}
            />
          ))}
        </RadarChart>
      </ResponsiveContainer>

      {/* Legend row */}
      <div className="flex flex-wrap gap-4 mb-5 mt-2">
        {sessions.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-coffee-600">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
            />
            <span className="font-mono" style={{ fontWeight: 500 }}>{s.batch_code}</span>
            <span className="text-coffee-400">{s.cupping_date}</span>
            {s.final_decision && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs capitalize ${
                (DECISION_META[s.final_decision] || { cls: 'badge-draft' }).cls
              }`}>
                {s.final_decision}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Score table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: '#FAF6F0', borderBottom: '1px solid #F2EAE0' }}>
              <th className="text-left px-3 py-2 text-coffee-400 uppercase tracking-wide">Date</th>
              <th className="text-left px-3 py-2 text-coffee-400 uppercase tracking-wide">Batch</th>
              <th className="text-right px-3 py-2 text-coffee-400 uppercase tracking-wide">Days</th>
              {ATTRS.map(a => (
                <th key={a} className="text-right px-2 py-2 text-coffee-400 uppercase tracking-wide capitalize">
                  {a.slice(0, 3)}
                </th>
              ))}
              <th className="text-left px-3 py-2 text-coffee-400 uppercase tracking-wide">Decision</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s, i) => {
              const total = ATTRS.reduce((sum, a) => sum + (s[`score_${a}`] || 0), 0);
              const meta  = DECISION_META[s.final_decision] || { cls: 'badge-draft', label: s.final_decision };
              return (
                <tr
                  key={i}
                  style={{ borderBottom: '1px solid #F2EAE0' }}
                >
                  <td className="px-3 py-2 text-coffee-400">{s.cupping_date}</td>
                  <td className="px-3 py-2 font-mono text-coffee-800" style={{ fontWeight: 500 }}>
                    {s.batch_code}
                  </td>
                  <td className="px-3 py-2 text-right text-coffee-500">{s.days_off_roast}d</td>
                  {ATTRS.map(a => (
                    <td key={a} className="px-2 py-2 text-right text-coffee-700" style={{ fontWeight: 500 }}>
                      {s[`score_${a}`] ?? '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs capitalize ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CuppingCompare() {
  const [process, setProcess] = useState('');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);

  async function selectProcess(p) {
    setProcess(p);
    if (!p) { setData(null); return; }
    setLoading(true);
    const res = await api.get(`/cupping-sessions/compare?process=${p}`);
    const d   = await res.json();
    setData(d);
    setLoading(false);
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-6">
        <PageHeader
          title="Cupping Comparison"
          subtitle="Overlay SCA scores across sessions by process"
        />

        <div className="mb-6">
          <FilterPills
            options={[{ value: '', label: 'All Processes' }, ...PROCESS_OPTIONS]}
            value={process}
            onChange={selectProcess}
          />
        </div>

        {!process && (
          <div className="bg-white border border-coffee-200 rounded-xl py-16 text-center">
            <p className="text-sm text-coffee-300">
              Select a process above to compare cupping sessions.
            </p>
          </div>
        )}

        {loading && (
          <p className="text-sm text-coffee-400">Loading…</p>
        )}

        {data && !loading && (
          <>
            <CompareSection
              title="Production Cuppings"
              sessions={data.production || []}
              processName={process}
            />
            <CompareSection
              title="Development Cuppings"
              sessions={data.development || []}
              processName={process}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
