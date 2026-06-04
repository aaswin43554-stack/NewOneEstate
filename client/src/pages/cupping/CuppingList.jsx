import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { PageHeader, Button, DataTable, FilterPills } from '../../components/ui';

const TZ = 'Asia/Vientiane';
const PURPOSE_LABELS = {
  development: 'Development',
  production:  'Production',
  sampling:    'Sampling',
};
const DECISION_META = {
  adjust:  { cls: 'badge-under-review', label: 'Adjust' },
  approve: { cls: 'badge-published',    label: 'Approve' },
  reject:  { cls: 'badge-missing',      label: 'Reject' },
};

const PURPOSE_OPTIONS = [
  { value: '',            label: 'All Purposes' },
  { value: 'development', label: 'Development' },
  { value: 'production',  label: 'Production' },
  { value: 'sampling',    label: 'Sampling' },
];

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
}

const COLUMNS = [
  {
    key: 'cupping_date',
    label: 'Date',
    sortable: true,
    render: v => <span style={{ fontWeight: 500 }}>{fmtDate(v)}</span>,
  },
  {
    key: 'cupping_purpose',
    label: 'Purpose',
    render: v => (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs badge-draft">
        {PURPOSE_LABELS[v] || v}
      </span>
    ),
  },
  {
    key: 'days_off_roast',
    label: 'Days Off Roast',
    sortable: true,
    render: v => <span className="text-coffee-500">{v != null ? `${v}d` : '—'}</span>,
  },
  {
    key: 'final_decisions',
    label: 'Decisions',
    render: v => (
      <div className="flex flex-wrap gap-1">
        {(v || []).filter(Boolean).map((d, i) => {
          const meta = DECISION_META[d] || { cls: 'badge-draft', label: d };
          return (
            <span key={i} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs capitalize ${meta.cls}`}>
              {meta.label}
            </span>
          );
        })}
      </div>
    ),
  },
  {
    key: 'early_warning',
    label: '',
    render: v => v
      ? <span className="text-xs" style={{ color: '#BA7517' }} title="Early warning">⚠</span>
      : null,
  },
];

async function triggerExport(format) {
  const res  = await api.get(`/export/cupping?format=${format}`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `cupping-${new Date().toISOString().split('T')[0]}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CuppingList() {
  const [sessions, setSessions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [purpose,  setPurpose]  = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const qs = purpose ? `?cupping_purpose=${purpose}` : '';
    api.get(`/cupping-sessions${qs}`)
      .then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .finally(() => setLoading(false));
  }, [purpose]);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-6">
        <PageHeader
          title="Cupping"
          subtitle={`${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
          actions={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => triggerExport('csv')}>CSV</Button>
              <Button variant="ghost" onClick={() => triggerExport('json')}>JSON</Button>
              <Button variant="secondary" onClick={() => navigate('/cupping/compare')}>Compare</Button>
              <Button variant="primary" onClick={() => navigate('/cupping/new')}>+ New Session</Button>
            </div>
          }
        />

        <div className="mb-5">
          <FilterPills
            options={PURPOSE_OPTIONS}
            value={purpose}
            onChange={setPurpose}
          />
        </div>

        <DataTable
          columns={COLUMNS}
          rows={sessions}
          loading={loading}
          onRowClick={s => navigate(`/cupping/${s.id}`)}
          emptyMessage="No cupping sessions yet. Start one to record scores."
          keyField="id"
        />
      </div>
    </Layout>
  );
}
