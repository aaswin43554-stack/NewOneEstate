import { useState } from 'react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Legend, Tooltip,
} from 'recharts';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];
const ATTRS = ['aroma','flavour','acidity','body','sweetness','aftertaste','overall'];
const COLORS = ['#2563eb','#d97706','#16a34a','#9333ea','#dc2626','#0891b2'];

const DECISION_STYLES = {
  adjust: 'bg-amber-100 text-amber-700',
  approve:'bg-green-100 text-green-700',
  reject: 'bg-red-100 text-red-700',
};

export default function CuppingCompare() {
  const [process, setProcess] = useState(null);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);

  async function selectProcess(p) {
    setProcess(p);
    setLoading(true);
    const res = await api.get(`/cupping-sessions/compare?process=${p}`);
    const d   = await res.json();
    setData(d);
    setLoading(false);
  }

  function makeRadarData(sessions) {
    return ATTRS.map(attr => {
      const point = { subject: attr.charAt(0).toUpperCase() + attr.slice(1) };
      sessions.forEach((s, i) => { point[`s${i}`] = s[`score_${attr}`]; });
      return point;
    });
  }

  function Section({ title, sessions }) {
    if (sessions.length === 0) {
      return (
        <div className="bg-white border border-coffee-200 rounded-lg p-4 mb-5">
          <h2 className="text-sm font-semibold text-coffee-700 mb-2">{title}</h2>
          <p className="text-sm text-coffee-400">No {title.toLowerCase()} cuppings logged for {process} yet.</p>
        </div>
      );
    }
    const radarData = makeRadarData(sessions);
    return (
      <div className="bg-white border border-coffee-200 rounded-lg p-4 mb-5">
        <h2 className="text-sm font-semibold text-coffee-700 mb-3">{title}</h2>
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {sessions.map((s, i) => (
              <Radar
                key={i}
                name={`${s.batch_code} ${s.cupping_date}`}
                dataKey={`s${i}`}
                stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={0.1}
              />
            ))}
          </RadarChart>
        </ResponsiveContainer>

        {/* Table */}
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-xs">
            <thead className="bg-coffee-50">
              <tr>
                <th className="text-left px-2 py-1 text-coffee-500">Date</th>
                <th className="text-left px-2 py-1 text-coffee-500">Batch</th>
                <th className="text-right px-2 py-1 text-coffee-500">Days</th>
                {ATTRS.map(a => (
                  <th key={a} className="text-right px-2 py-1 text-coffee-500 capitalize">{a.substring(0,3)}</th>
                ))}
                <th className="text-left px-2 py-1 text-coffee-500">Decision</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={i} className="border-t border-coffee-50">
                  <td className="px-2 py-1">{s.cupping_date}</td>
                  <td className="px-2 py-1 font-mono">{s.batch_code}</td>
                  <td className="px-2 py-1 text-right">{s.days_off_roast}</td>
                  {ATTRS.map(a => (
                    <td key={a} className="px-2 py-1 text-right font-semibold">{s[`score_${a}`]}</td>
                  ))}
                  <td className="px-2 py-1">
                    <span className={`px-1 py-0.5 rounded capitalize text-xs ${DECISION_STYLES[s.final_decision]||''}`}>
                      {s.final_decision}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-coffee-900 mb-5">Cupping Comparison</h1>

        {/* Process selector */}
        <div className="flex gap-3 mb-6">
          {PROCESSES.map(p => (
            <button key={p} onClick={() => selectProcess(p)}
              className={`px-4 py-2 rounded-lg font-semibold text-sm border-2 transition-colors ${
                process === p
                  ? 'bg-coffee-700 text-white border-coffee-700'
                  : 'bg-white text-coffee-700 border-coffee-200 hover:border-coffee-400'
              }`}>
              {p}
            </button>
          ))}
        </div>

        {!process && (
          <p className="text-coffee-400 text-center py-12">Select a process to compare cupping sessions.</p>
        )}

        {loading && <p className="text-coffee-500">Loading…</p>}

        {data && !loading && (
          <>
            <Section title="Production Cuppings" sessions={data.production || []} />
            <Section title="Development Cuppings" sessions={data.development || []} />
          </>
        )}
      </div>
    </Layout>
  );
}
