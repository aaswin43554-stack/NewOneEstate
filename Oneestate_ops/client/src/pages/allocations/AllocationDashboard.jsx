import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const STATES = ['upcoming', 'open_for_requests', 'closed', 'roasting_in_progress', 'resting', 'dispatched', 'archived'];
const STATE_LABELS = {
  upcoming:             'Upcoming',
  open_for_requests:    'Open',
  closed:               'Closed',
  roasting_in_progress: 'Roasting',
  resting:              'Resting',
  dispatched:           'Dispatched',
  archived:             'Archived',
};

const PROCESS_COLORS = {
  Washed:    'bg-blue-100 text-blue-700',
  Honey:     'bg-amber-100 text-amber-700',
  Natural:   'bg-green-100 text-green-700',
  Anaerobic: 'bg-purple-100 text-purple-700',
};

function AllocationCard({ alloc, onClick }) {
  const pct = alloc.projected_bags > 0
    ? Math.min(100, Math.round((alloc.confirmed_bags / alloc.projected_bags) * 100))
    : 0;
  return (
    <div
      onClick={onClick}
      className="bg-white border border-coffee-200 rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-1">
        <span className="font-bold text-coffee-900">{alloc.allocation_code}</span>
        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PROCESS_COLORS[alloc.process] || ''}`}>
          {alloc.process}
        </span>
      </div>
      <div className="text-xs text-coffee-500 mb-2">{alloc.harvest_year}</div>
      <div className="text-xs text-coffee-600 mb-1">
        {alloc.confirmed_bags} / {alloc.projected_bags} bags
      </div>
      <div className="w-full h-1.5 bg-coffee-100 rounded-full overflow-hidden mb-1">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-400' : 'bg-green-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {alloc.dispatch_date && (
        <div className="text-xs text-coffee-400">Dispatch: {alloc.dispatch_date}</div>
      )}
    </div>
  );
}

export default function AllocationDashboard() {
  const [allocations, setAllocations] = useState([]);
  const [activeState, setActiveState] = useState(null); // null = kanban, string = filtered tab
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/allocations')
      .then(r => r.json())
      .then(d => setAllocations(d.allocations || []))
      .finally(() => setLoading(false));
  }, []);

  const grouped = STATES.reduce((acc, s) => {
    acc[s] = allocations.filter(a => a.state === s);
    return acc;
  }, {});

  return (
    <Layout>
      <div className="p-4">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold text-coffee-900">Allocations</h1>
          <button
            onClick={() => navigate('/allocations/new')}
            className="px-4 py-2 bg-coffee-700 text-white rounded-md text-sm font-semibold hover:bg-coffee-800"
          >
            + New Allocation
          </button>
        </div>

        {loading ? (
          <p className="text-coffee-500">Loading…</p>
        ) : (
          <>
            {/* Mobile: tab filter + list */}
            <div className="md:hidden">
              <div className="flex overflow-x-auto gap-2 mb-4 pb-1">
                <button
                  onClick={() => setActiveState(null)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    activeState === null ? 'bg-coffee-700 text-white border-coffee-700' : 'border-coffee-300 text-coffee-600'
                  }`}
                >
                  All
                </button>
                {STATES.map(s => (
                  <button
                    key={s}
                    onClick={() => setActiveState(s)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      activeState === s ? 'bg-coffee-700 text-white border-coffee-700' : 'border-coffee-300 text-coffee-600'
                    }`}
                  >
                    {STATE_LABELS[s]}
                  </button>
                ))}
              </div>
              <div className="space-y-3">
                {(activeState ? grouped[activeState] : allocations).map(a => (
                  <AllocationCard key={a.id} alloc={a} onClick={() => navigate(`/allocations/${a.id}`)} />
                ))}
              </div>
            </div>

            {/* Desktop: kanban columns */}
            <div className="hidden md:grid gap-3" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
              {STATES.map(s => (
                <div key={s} className="min-h-48">
                  <div className="text-xs font-semibold text-coffee-600 uppercase tracking-wide mb-2 px-1">
                    {STATE_LABELS[s]}
                    <span className="ml-1 text-coffee-400">({grouped[s].length})</span>
                  </div>
                  <div className="space-y-2">
                    {grouped[s].map(a => (
                      <AllocationCard key={a.id} alloc={a} onClick={() => navigate(`/allocations/${a.id}`)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
