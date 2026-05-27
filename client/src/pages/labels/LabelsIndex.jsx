import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { ProcessBadge, StatusBadge } from '../../components/ui';
import { Tag, ChevronRight } from 'lucide-react';

function fmtDateTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function LabelsIndex() {
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/labels')
      .then(r => r.json())
      .then(d => setAllocations(d.allocations || []))
      .finally(() => setLoading(false));
  }, []);

  const labelable = allocations.filter(a =>
    !['upcoming', 'open_for_requests', 'archived'].includes(a.state)
  );
  const rest = allocations.filter(a =>
    ['upcoming', 'open_for_requests', 'archived'].includes(a.state)
  );

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-6">
        <h1 className="text-xl text-coffee-900 mb-1" style={{ fontWeight: 500 }}>Labels</h1>
        <p className="text-sm text-coffee-400 mb-6">Generate and print bag labels for your allocations.</p>

        {loading ? (
          <p className="text-sm text-coffee-400">Loading…</p>
        ) : allocations.length === 0 ? (
          <div className="bg-white border border-coffee-200 rounded-xl p-10 text-center">
            <p className="text-sm text-coffee-400">No allocations found.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {labelable.length > 0 && (
              <div>
                <p className="text-xs text-coffee-400 uppercase tracking-wide mb-2">Ready for Labels</p>
                <div className="bg-white border border-coffee-200 rounded-xl overflow-hidden divide-y divide-coffee-100">
                  {labelable.map(a => (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/labels/${a.id}`)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-coffee-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: '#FAF6F0' }}
                        >
                          <Tag size={14} style={{ color: '#6F5035' }} />
                        </div>
                        <div>
                          <p className="text-sm text-coffee-900" style={{ fontWeight: 500 }}>
                            {a.allocation_code}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <ProcessBadge process={a.process} />
                            {a.harvest_year && (
                              <span className="text-xs text-coffee-400">{a.harvest_year}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {a.label_id ? (
                          <span className="text-xs text-coffee-400">
                            Generated {fmtDateTime(a.generated_at)}
                          </span>
                        ) : (
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: '#FAF6F0', color: '#A8896A' }}
                          >
                            Not generated
                          </span>
                        )}
                        <ChevronRight size={16} className="text-coffee-300" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {rest.length > 0 && (
              <div>
                <p className="text-xs text-coffee-400 uppercase tracking-wide mb-2">Other Allocations</p>
                <div className="bg-white border border-coffee-200 rounded-xl overflow-hidden divide-y divide-coffee-100">
                  {rest.map(a => (
                    <div key={a.id} className="flex items-center justify-between px-5 py-4 opacity-50">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: '#FAF6F0' }}
                        >
                          <Tag size={14} style={{ color: '#6F5035' }} />
                        </div>
                        <div>
                          <p className="text-sm text-coffee-900" style={{ fontWeight: 500 }}>
                            {a.allocation_code}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <ProcessBadge process={a.process} />
                          </div>
                        </div>
                      </div>
                      <StatusBadge status={a.state} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
