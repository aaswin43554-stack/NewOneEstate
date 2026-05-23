import { useState, useEffect, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const DOC_TYPES = ['field_notes', 'roast_log', 'cupping_record', 'allocation_record'];
const DOC_LABELS = {
  field_notes:       'Field Notes',
  roast_log:         'Roast Log',
  cupping_record:    'Cupping Record',
  allocation_record: 'Allocation Record',
};
const STATUS_STYLES = {
  draft:        'bg-gray-100 text-gray-600',
  under_review: 'bg-amber-100 text-amber-700',
  published:    'bg-green-100 text-green-700',
  missing:      'border border-red-300 text-red-600',
};
const STATUS_LABELS = {
  draft:        'Draft',
  under_review: 'Review',
  published:    'Published',
  missing:      'Missing',
};
const PROCESS_COLORS = {
  Washed:    'bg-blue-100 text-blue-700',
  Honey:     'bg-amber-100 text-amber-700',
  Natural:   'bg-green-100 text-green-700',
  Anaerobic: 'bg-purple-100 text-purple-700',
};

function StatusBadge({ status }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_STYLES[status] || STATUS_STYLES.missing}`}>
      {STATUS_LABELS[status] || 'Missing'}
    </span>
  );
}

export default function JournalDashboard() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [generating, setGenerating] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    api.get('/journal')
      .then(r => r.json())
      .then(d => setRows(d.entries || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  async function generateDrafts(e, allocation_id) {
    e.stopPropagation();
    setGenerating(g => ({ ...g, [allocation_id]: true }));
    await api.post(`/journal/generate/${allocation_id}`, {});
    setGenerating(g => ({ ...g, [allocation_id]: false }));
    load();
  }

  function toggle(allocation_id) {
    setExpanded(e => e === allocation_id ? null : allocation_id);
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold text-coffee-900">Journal</h1>

        {loading ? (
          <p className="text-coffee-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-coffee-400 text-center py-12">No allocations found.</p>
        ) : (
          <div className="bg-white border border-coffee-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-coffee-50 border-b border-coffee-200">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-coffee-600">Allocation</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-coffee-600">Process</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-coffee-600">Year</th>
                  {DOC_TYPES.map(t => (
                    <th key={t} className="text-left px-3 py-2 text-xs font-semibold text-coffee-600 whitespace-nowrap">
                      {DOC_LABELS[t]}
                    </th>
                  ))}
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <Fragment key={row.allocation_id}>
                    <tr
                      className="border-b border-coffee-50 hover:bg-coffee-50 cursor-pointer"
                      onClick={() => toggle(row.allocation_id)}
                    >
                      <td className="px-3 py-2 font-mono font-semibold text-coffee-900">
                        {row.allocation_code}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PROCESS_COLORS[row.process] || ''}`}>
                          {row.process}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-coffee-600">{row.harvest_year}</td>
                      {DOC_TYPES.map(t => (
                        <td key={t} className="px-3 py-2">
                          <StatusBadge status={row.documents?.[t]?.status || 'missing'} />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={e => generateDrafts(e, row.allocation_id)}
                          disabled={!!generating[row.allocation_id]}
                          className="px-2 py-1 text-xs bg-coffee-100 text-coffee-700 rounded hover:bg-coffee-200 disabled:opacity-50 whitespace-nowrap"
                        >
                          {generating[row.allocation_id] ? 'Generating…' : 'Generate Drafts'}
                        </button>
                      </td>
                    </tr>

                    {expanded === row.allocation_id && (
                      <tr className="border-b border-coffee-100 bg-coffee-50">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex flex-wrap gap-4">
                            {DOC_TYPES.map(t => {
                              const doc = row.documents?.[t];
                              const status = doc?.status || 'missing';
                              return (
                                <Link
                                  key={t}
                                  to={`/journal/${row.allocation_id}/${t}`}
                                  className="flex items-center gap-1.5 text-sm text-coffee-700 hover:text-coffee-900"
                                  onClick={e => e.stopPropagation()}
                                >
                                  <span className="underline underline-offset-2">{DOC_LABELS[t]}</span>
                                  <StatusBadge status={status} />
                                </Link>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
