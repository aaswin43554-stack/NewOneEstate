import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { PageHeader, Button, DataTable, FilterPills } from '../../components/ui';

const TZ = 'Asia/Vientiane';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
}
function kgLabel(g) {
  if (g == null) return '—';
  return (g / 1000).toFixed(2) + ' kg';
}
function fmtMSS(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

const STATUS_MAP = {
  in_progress:          { label: 'In Progress', cls: 'badge-under-review' },
  completed:            { label: 'Completed',   cls: 'badge-draft' },
  approved_for_bagging: { label: 'Approved',    cls: 'badge-published' },
  rejected:             { label: 'Rejected',    cls: 'badge-missing' },
};

const MODE_OPTIONS = [
  { value: 'production',  label: 'Production' },
  { value: 'development', label: 'Development' },
];

const COLUMNS = [
  {
    key: 'batch_code',
    label: 'Batch Code',
    sortable: true,
    render: v => (
      <span className="font-mono text-coffee-800" style={{ fontWeight: 500, fontSize: 13 }}>
        {v}
      </span>
    ),
  },
  {
    key: 'started_at',
    label: 'Date',
    sortable: true,
    render: v => <span className="text-coffee-400">{fmtDate(v)}</span>,
  },
  {
    key: 'green_weight_in_g',
    label: 'Green In',
    sortable: true,
    render: v => kgLabel(v),
  },
  {
    key: 'roasted_weight_out_g',
    label: 'Roasted Out',
    render: v => kgLabel(v),
  },
  {
    key: '_loss',
    label: 'Loss %',
    render: (_, row) => {
      if (!row.roasted_weight_out_g || !row.green_weight_in_g) return '—';
      const loss = ((row.green_weight_in_g - row.roasted_weight_out_g) / row.green_weight_in_g * 100).toFixed(1);
      return <span className="text-coffee-500">{loss}%</span>;
    },
  },
  {
    key: 'dtr',
    label: 'DTR %',
    render: v => v ? <span className="text-coffee-500">{v}%</span> : '—',
  },
  {
    key: 'total_time_seconds',
    label: 'Duration',
    render: v => <span className="font-mono text-xs">{fmtMSS(v)}</span>,
  },
  {
    key: 'status',
    label: 'Result',
    render: v => {
      const meta = STATUS_MAP[v] || { label: v, cls: 'badge-draft' };
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs ${meta.cls}`}>
          {meta.label}
        </span>
      );
    },
  },
  {
    key: 'variance_flagged',
    label: '',
    render: v => v ? (
      <span className="text-xs" style={{ color: '#BA7517' }} title="Variance flagged">⚠</span>
    ) : null,
  },
];

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
      <div className="max-w-5xl mx-auto px-6 py-6">
        <PageHeader
          title="Roast Sessions"
          subtitle={`${sessions.length} ${mode} session${sessions.length !== 1 ? 's' : ''}`}
          actions={
            <Button variant="primary" onClick={() => navigate('/roast/new')}>
              + New Session
            </Button>
          }
        />

        <div className="mb-5">
          <FilterPills
            options={MODE_OPTIONS}
            value={mode}
            onChange={setMode}
          />
        </div>

        <DataTable
          columns={COLUMNS}
          rows={sessions}
          loading={loading}
          onRowClick={s => navigate(`/roast/${s.id}`)}
          emptyMessage={`No ${mode} roast sessions yet.`}
          keyField="id"
        />
      </div>
    </Layout>
  );
}
