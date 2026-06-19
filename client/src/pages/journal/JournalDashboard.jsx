import { useState, useEffect, useCallback, Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { PageHeader, Button, ProcessBadge, DataTable } from '../../components/ui';

const DOC_TYPES = ['field_notes', 'roast_log', 'cupping_record', 'allocation_record'];
const DOC_LABELS = {
  field_notes:       'Field Notes',
  roast_log:         'Roast Log',
  cupping_record:    'Cupping Record',
  allocation_record: 'Allocation Record',
};

const STATUS_META = {
  draft:        { cls: 'badge-draft',        label: 'Draft' },
  under_review: { cls: 'badge-under-review', label: 'Review' },
  published:    { cls: 'badge-published',    label: 'Published' },
  missing:      { cls: 'badge-missing',      label: 'Missing' },
};

function DocStatus({ status }) {
  const meta = STATUS_META[status] || STATUS_META.missing;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

export default function JournalDashboard() {
  const [rows,       setRows]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState(null);
  const [generating, setGenerating] = useState({});
  const navigate = useNavigate();

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

  function triggerExport(fmt) {
    api.get(`/export/journal?format=${fmt}`)
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `journal-${new Date().toISOString().split('T')[0]}.${fmt}`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-6">
        <PageHeader
          title="Journal"
          subtitle="Per-allocation documentation records"
          actions={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => triggerExport('csv')}>CSV</Button>
              <Button variant="ghost" onClick={() => triggerExport('json')}>JSON</Button>
            </div>
          }
        />

        {loading ? (
          <p className="text-sm text-coffee-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-coffee-300 text-center py-16">
            No allocations found.
          </p>
        ) : (
          <div className="bg-white border border-coffee-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-coffee-50 border-b border-coffee-100">
                  <th className="text-left px-4 py-3 text-xs text-coffee-400 uppercase tracking-wide">Allocation</th>
                  <th className="text-left px-4 py-3 text-xs text-coffee-400 uppercase tracking-wide">Process</th>
                  <th className="text-left px-4 py-3 text-xs text-coffee-400 uppercase tracking-wide">Year</th>
                  {DOC_TYPES.map(t => (
                    <th key={t} className="text-left px-4 py-3 text-xs text-coffee-400 uppercase tracking-wide whitespace-nowrap">
                      {DOC_LABELS[t]}
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <Fragment key={row.allocation_id}>
                    <tr
                      className="border-b border-coffee-100 h-12 cursor-pointer transition-colors"
                      style={{ background: expanded === row.allocation_id ? '#FAF6F0' : '#FFFFFF' }}
                      onMouseEnter={e => { if (expanded !== row.allocation_id) e.currentTarget.style.background = '#FDFAF6'; }}
                      onMouseLeave={e => { if (expanded !== row.allocation_id) e.currentTarget.style.background = '#FFFFFF'; }}
                      onClick={() => toggle(row.allocation_id)}
                    >
                      <td className="px-4">
                        <span className="font-mono text-coffee-800" style={{ fontWeight: 500, fontSize: 13 }}>
                          {row.allocation_code}
                        </span>
                      </td>
                      <td className="px-4">
                        <ProcessBadge process={row.process} />
                      </td>
                      <td className="px-4 text-coffee-400 text-xs">{row.harvest_year}</td>
                      {DOC_TYPES.map(t => (
                        <td key={t} className="px-4">
                          <DocStatus status={row.documents?.[t]?.status || 'missing'} />
                        </td>
                      ))}
                      <td className="px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={e => generateDrafts(e, row.allocation_id)}
                          disabled={!!generating[row.allocation_id]}
                        >
                          {generating[row.allocation_id] ? 'Generating…' : 'Generate'}
                        </Button>
                      </td>
                    </tr>

                    {expanded === row.allocation_id && (
                      <tr className="border-b border-coffee-100">
                        <td
                          colSpan={8}
                          className="px-4 py-3"
                          style={{ background: '#FAF6F0' }}
                        >
                          <div className="flex flex-wrap gap-3">
                            {DOC_TYPES.map(t => {
                              const doc = row.documents?.[t];
                              const status = doc?.status || 'missing';
                              const meta = STATUS_META[status] || STATUS_META.missing;
                              return (
                                <Link
                                  key={t}
                                  to={`/journal/${row.allocation_id}/${t}`}
                                  onClick={e => e.stopPropagation()}
                                  className="flex items-center gap-2 text-sm text-coffee-700 hover:text-coffee-900 transition-colors"
                                >
                                  <span className="underline underline-offset-2">{DOC_LABELS[t]}</span>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${meta.cls}`}>
                                    {meta.label}
                                  </span>
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
