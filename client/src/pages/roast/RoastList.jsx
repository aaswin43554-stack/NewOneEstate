import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const TZ = 'Asia/Vientiane';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ });
}

function kgLabel(g) {
  if (g == null) return '—';
  return (g / 1000).toFixed(2) + ' kg';
}

const STATUS_COLORS = {
  in_progress:          'bg-blue-100 text-blue-700',
  completed:            'bg-amber-100 text-amber-700',
  approved_for_bagging: 'bg-green-100 text-green-700',
  rejected:             'bg-red-100 text-red-700',
};

export default function RoastList() {
  const [mode,     setMode]     = useState('production');
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    api.get(`/roast-sessions?is_development=${mode === 'development'}`)
      .then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .finally(() => setLoading(false));
  }, [mode]);

  return (
    <Layout>
      <div className="p-4 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold text-coffee-900">Roast Sessions</h1>
          <button
            onClick={() => navigate('/roast/new')}
            className="px-4 py-2 bg-coffee-700 text-white rounded-md text-sm font-semibold hover:bg-coffee-800"
          >
            + New Session
          </button>
        </div>

        {/* Toggle */}
        <div className="flex rounded-lg overflow-hidden border border-coffee-300 mb-5 w-fit">
          {['production', 'development'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-5 py-2 text-sm font-semibold capitalize transition-colors ${
                mode === m ? 'bg-coffee-700 text-white' : 'bg-white text-coffee-600 hover:bg-coffee-50'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-coffee-500">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-coffee-500 py-12 text-center">
            No {mode} roast sessions yet.
          </p>
        ) : (
          <div className="bg-white rounded-lg border border-coffee-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-coffee-50 border-b border-coffee-200">
                <tr>
                  {['Batch Code', 'Date', 'Green In', 'Roasted Out', 'Loss %', 'DTR %', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-coffee-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => {
                  const loss = s.roasted_weight_out_g
                    ? (((s.green_weight_in_g - s.roasted_weight_out_g) / s.green_weight_in_g) * 100).toFixed(1)
                    : null;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => navigate(`/roast/${s.id}`)}
                      className="border-b border-coffee-100 hover:bg-coffee-50 cursor-pointer"
                    >
                      <td className="px-3 py-2 font-mono font-semibold text-coffee-900">{s.batch_code}</td>
                      <td className="px-3 py-2 text-coffee-600">{fmtDate(s.started_at)}</td>
                      <td className="px-3 py-2">{kgLabel(s.green_weight_in_g)}</td>
                      <td className="px-3 py-2">{kgLabel(s.roasted_weight_out_g)}</td>
                      <td className="px-3 py-2">{loss ? `${loss}%` : '—'}</td>
                      <td className="px-3 py-2">{s.dtr ? `${s.dtr}%` : '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded capitalize ${STATUS_COLORS[s.status] || ''}`}>
                          {s.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {s.variance_flagged && <span title="Variance flagged">⚠</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
