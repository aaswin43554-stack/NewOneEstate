import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { PageHeader, Button, ProcessBadge, StatusBadge } from '../../components/ui';

const KANBAN_COLUMNS = [
  { key: 'upcoming',             label: 'Upcoming',              states: ['upcoming'] },
  { key: 'open_for_requests',    label: 'Open for Requests',     states: ['open_for_requests'] },
  { key: 'roasting_in_progress', label: 'Roasting in Progress',  states: ['roasting_in_progress'] },
  { key: 'allocation_closed',    label: 'Closed',                states: ['allocation_closed'] },
];

const STATE_TO_STATUS = {
  upcoming:             'draft',
  open_for_requests:    'published',
  roasting_in_progress: 'under_review',
  allocation_closed:    'draft',
};

const STATE_LABELS = {
  upcoming:             'Upcoming',
  open_for_requests:    'Open for Requests',
  roasting_in_progress: 'Roasting in Progress',
  allocation_closed:    'Allocation Closed',
};

const COLUMN_ACCENT = {
  upcoming:             '#8B6A47',
  open_for_requests:    '#3B6D11',
  roasting_in_progress: '#BA7517',
  allocation_closed:    '#533A24',
};

function AllocationCard({ alloc, onClick }) {
  const pct = alloc.projected_bags > 0
    ? Math.min(100, Math.round((alloc.confirmed_bags / alloc.projected_bags) * 100))
    : 0;

  const progressColor =
    pct >= 100 ? '#A32D2D'
    : pct >= 80 ? '#BA7517'
    : '#3B6D11';

  return (
    <div
      onClick={onClick}
      className="bg-white border border-coffee-200 rounded-[10px] p-4 cursor-pointer transition-colors duration-150 hover:border-coffee-300"
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm text-coffee-900" style={{ fontWeight: 500 }}>
          {alloc.allocation_code}
        </span>
        <ProcessBadge process={alloc.process} />
      </div>

      {alloc.source === 'one_estate' && (
        <div className="mb-2">
          <span
            className="inline-block px-1.5 py-0.5 rounded text-xs"
            style={{ background: '#EAF3DE', color: '#3B6D11', fontSize: 10 }}
          >
            From One Estate
          </span>
        </div>
      )}

      <div className="mb-3">
        <StatusBadge
          status={STATE_TO_STATUS[alloc.state] || 'draft'}
          label={STATE_LABELS[alloc.state] || alloc.state}
        />
      </div>

      {alloc.lot_code && (
        <div className="mb-2">
          <span
            className="inline-block px-2 py-0.5 rounded-full text-xs text-coffee-600"
            style={{ background: '#F2EAE0', fontSize: 11 }}
          >
            {alloc.lot_code}
          </span>
        </div>
      )}

      <p className="text-xs text-coffee-400 mb-2">
        {alloc.confirmed_bags ?? 0} / {alloc.projected_bags ?? 0} bags
      </p>

      <div
        className="w-full rounded-full overflow-hidden mb-2"
        style={{ height: 3, background: '#F2EAE0' }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: progressColor }}
        />
      </div>

      {alloc.dispatch_date && (
        <p className="text-xs text-coffee-300">
          Dispatch: {alloc.dispatch_date}
        </p>
      )}
    </div>
  );
}

function KanbanColumn({ column, allocations, onCardClick }) {
  const accent = COLUMN_ACCENT[column.key] || '#8B6A47';

  return (
    <div className="flex flex-col min-h-[200px]">
      <div
        className="flex items-center justify-between px-3 py-2 rounded-xl mb-3"
        style={{ background: '#F2EAE0' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: accent }}
          />
          <span className="text-xs text-coffee-600 uppercase tracking-wide" style={{ fontWeight: 500 }}>
            {column.label}
          </span>
        </div>
        <span
          className="inline-flex items-center justify-center rounded-full text-xs text-coffee-500"
          style={{ width: 20, height: 20, background: '#E0D0BC' }}
        >
          {allocations.length}
        </span>
      </div>

      <div className="space-y-2 flex-1">
        {allocations.length === 0 ? (
          <div className="border border-dashed border-coffee-200 rounded-[10px] p-4 text-center text-xs text-coffee-300">
            Empty
          </div>
        ) : (
          allocations.map(a => (
            <AllocationCard
              key={a.id}
              alloc={a}
              onClick={() => onCardClick(a)}
            />
          ))
        )}
      </div>
    </div>
  );
}

async function triggerExport(format) {
  const res  = await api.get(`/export/allocations?format=${format}`);
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `allocations-${new Date().toISOString().split('T')[0]}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AllocationDashboard() {
  const [allocations,        setAllocations]        = useState([]);
  const [loading,            setLoading]            = useState(true);
  const [showArchived,       setShowArchived]       = useState(false);
  const [archivedList,       setArchivedList]       = useState([]);
  const [archivedLoading,    setArchivedLoading]    = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/allocations')
      .then(r => r.json())
      .then(d => setAllocations(d.allocations || []))
      .finally(() => setLoading(false));
  }, []);

  async function toggleArchived() {
    if (!showArchived && archivedList.length === 0) {
      setArchivedLoading(true);
      const res = await api.get('/allocations?include_archived=true');
      const d   = await res.json();
      setArchivedList((d.allocations || []).filter(a => !!a.archived_at));
      setArchivedLoading(false);
    }
    setShowArchived(prev => !prev);
  }

  const grouped = KANBAN_COLUMNS.reduce((acc, col) => {
    acc[col.key] = allocations.filter(a => col.states.includes(a.state));
    return acc;
  }, {});

  return (
    <Layout>
      <div className="px-6 py-6">
        <PageHeader
          title="Allocations"
          subtitle={`${allocations.length} total`}
          actions={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => triggerExport('csv')}>CSV</Button>
              <Button variant="ghost" onClick={() => triggerExport('json')}>JSON</Button>
              <Button variant="ghost" onClick={toggleArchived}>
                {showArchived ? 'Hide Archived' : 'Archived'}
              </Button>
              <Button variant="primary" onClick={() => navigate('/allocations/new')}>+ New Allocation</Button>
            </div>
          }
        />

        {loading ? (
          <p className="text-sm text-coffee-400">Loading…</p>
        ) : (
          <>
            {/* Desktop: 4-column Kanban */}
            <div className="hidden md:grid grid-cols-4 gap-4">
              {KANBAN_COLUMNS.map(col => (
                <KanbanColumn
                  key={col.key}
                  column={col}
                  allocations={grouped[col.key]}
                  onCardClick={a => navigate(`/allocations/${a.id}`)}
                />
              ))}
            </div>

            {/* Mobile: stacked list */}
            <div className="md:hidden space-y-6">
              {KANBAN_COLUMNS.map(col => (
                <div key={col.key}>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: COLUMN_ACCENT[col.key] }}
                    />
                    <p className="text-xs text-coffee-400 uppercase tracking-wide">{col.label}</p>
                    <span className="text-xs text-coffee-300">({grouped[col.key].length})</span>
                  </div>
                  <div className="space-y-2">
                    {grouped[col.key].map(a => (
                      <AllocationCard
                        key={a.id}
                        alloc={a}
                        onClick={() => navigate(`/allocations/${a.id}`)}
                      />
                    ))}
                    {grouped[col.key].length === 0 && (
                      <p className="text-xs text-coffee-300 py-4 text-center border border-dashed border-coffee-200 rounded-xl">
                        None
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Archived section */}
        {showArchived && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: '#A8896A' }}
              />
              <p className="text-xs text-coffee-400 uppercase tracking-wide" style={{ fontWeight: 500 }}>
                Archived
              </p>
              {!archivedLoading && (
                <span
                  className="inline-flex items-center justify-center rounded-full text-xs text-coffee-500"
                  style={{ width: 20, height: 20, background: '#E0D0BC' }}
                >
                  {archivedList.length}
                </span>
              )}
            </div>
            {archivedLoading ? (
              <p className="text-sm text-coffee-400">Loading…</p>
            ) : archivedList.length === 0 ? (
              <p className="text-sm text-coffee-300">No archived allocations.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {archivedList.map(a => (
                  <div key={a.id} className="relative">
                    <AllocationCard alloc={a} onClick={() => navigate(`/allocations/${a.id}`)} />
                    <span
                      className="absolute top-2 right-2 text-xs px-1.5 py-0.5 rounded"
                      style={{ background: '#F2EAE0', color: '#8B6A47', pointerEvents: 'none' }}
                    >
                      Archived
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
