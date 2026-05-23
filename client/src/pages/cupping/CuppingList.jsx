import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const TZ = 'Asia/Vientiane';
const PURPOSE_LABELS = { development:'Development', quality_check:'Quality Check', comparative:'Comparative' };
const DECISION_STYLES = {
  adjust:  'bg-amber-100 text-amber-700',
  approve: 'bg-green-100 text-green-700',
  reject:  'bg-red-100 text-red-700',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ });
}

const PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];
const PURPOSES  = ['development', 'quality_check', 'comparative'];
const DECISIONS = ['adjust', 'approve', 'reject'];

export default function CuppingList() {
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filters,  setFilters]  = useState({ process:'', cupping_purpose:'', final_decision:'' });
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const qs = Object.entries(filters)
      .filter(([,v]) => v)
      .map(([k,v]) => `${k}=${v}`).join('&');
    api.get(`/cupping-sessions${qs ? '?' + qs : ''}`)
      .then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold text-coffee-900">Cupping History</h1>
          <div className="flex gap-2">
            <Link to="/cupping/compare"
              className="px-3 py-2 border border-coffee-300 text-coffee-700 rounded-md text-sm font-medium hover:bg-coffee-50">
              Compare →
            </Link>
            <button onClick={() => navigate('/cupping/new')}
              className="px-4 py-2 bg-coffee-700 text-white rounded-md text-sm font-semibold hover:bg-coffee-800">
              + New Session
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap gap-2 mb-4">
          <select value={filters.process} onChange={e => setFilters(p => ({ ...p, process: e.target.value }))}
            className="border border-coffee-300 rounded px-2 py-1.5 text-sm">
            <option value="">All processes</option>
            {PROCESSES.map(p => <option key={p}>{p}</option>)}
          </select>
          <select value={filters.cupping_purpose} onChange={e => setFilters(p => ({ ...p, cupping_purpose: e.target.value }))}
            className="border border-coffee-300 rounded px-2 py-1.5 text-sm">
            <option value="">All purposes</option>
            {PURPOSES.map(p => <option key={p} value={p}>{PURPOSE_LABELS[p]}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-coffee-500">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-coffee-400 text-center py-12">No cupping sessions yet.</p>
        ) : (
          <div className="bg-white border border-coffee-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-coffee-50 border-b border-coffee-200">
                <tr>
                  {['Date','Purpose','Days Off Roast','Decisions','⚠'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-coffee-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} onClick={() => navigate(`/cupping/${s.id}`)}
                    className="border-b border-coffee-50 hover:bg-coffee-50 cursor-pointer">
                    <td className="px-3 py-2 font-semibold">{fmtDate(s.cupping_date)}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs bg-coffee-100 text-coffee-700 px-1.5 py-0.5 rounded">
                        {PURPOSE_LABELS[s.cupping_purpose]}
                      </span>
                    </td>
                    <td className="px-3 py-2">{s.days_off_roast}d</td>
                    <td className="px-3 py-2">
                      {(s.final_decisions || []).filter(Boolean).map((d, i) => (
                        <span key={i} className={`text-xs px-1.5 py-0.5 rounded mr-1 capitalize ${DECISION_STYLES[d]||''}`}>{d}</span>
                      ))}
                    </td>
                    <td className="px-3 py-2">{s.early_warning ? '⚠' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
