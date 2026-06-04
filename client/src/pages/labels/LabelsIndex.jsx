import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { PageHeader, Button, ProcessBadge } from '../../components/ui';

const PROCESS_LABEL = {
  Washed:    'Washed Process',
  Honey:     'Honey Process',
  Natural:   'Natural Process',
  Anaerobic: 'Anaerobic Process',
};

function MiniLabel({ a }) {
  const hasLabel = !!a.label_id;
  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        border: hasLabel ? '1px solid #D4C4AC' : '1px dashed #D4C4AC',
        background: hasLabel ? '#FDFAF6' : '#FAF8F5',
        minHeight: 220,
      }}
    >
      {hasLabel ? (
        <>
          {/* Mini label header */}
          <div
            className="text-center py-1.5"
            style={{ background: '#2A1A0C', color: '#FAF6F0' }}
          >
            <p style={{ fontSize: 9, letterSpacing: '0.15em', fontWeight: 600 }}>ONE ESTATE</p>
            <p style={{ fontSize: 7, letterSpacing: '0.1em', color: '#C8A87A' }}>SINGLE-ESTATE SPECIALTY COFFEE</p>
          </div>

          <div className="flex-1 p-3 flex flex-col gap-1.5">
            <p className="text-coffee-900" style={{ fontSize: 13, fontWeight: 600 }}>
              {a.allocation_code}
            </p>
            {a.estate_location && (
              <p style={{ fontSize: 9, color: '#8B6A47' }}>{a.estate_location}</p>
            )}
            <p style={{ fontSize: 9, color: '#6F5035' }}>
              {PROCESS_LABEL[a.process] || a.process}
            </p>
            {a.harvest_year && (
              <p style={{ fontSize: 9, color: '#6F5035' }}>Harvest {a.harvest_year}</p>
            )}
            {a.variety && (
              <p style={{ fontSize: 9, color: '#6F5035' }}>Variety  {a.variety}</p>
            )}
            {a.roast_level && (
              <p style={{ fontSize: 9, color: '#6F5035' }}>Roast  {a.roast_level}</p>
            )}
            {a.flavour_notes && (
              <p style={{ fontSize: 9, color: '#6F5035', marginTop: 2 }}>
                Profile  {a.flavour_notes}
              </p>
            )}

            {/* QR thumbnail */}
            {a.qr_code_base64 && (
              <div className="mt-auto pt-2 flex justify-end">
                <img
                  src={`data:image/png;base64,${a.qr_code_base64}`}
                  alt="QR"
                  style={{ width: 32, height: 32 }}
                />
              </div>
            )}
          </div>

          {/* Net weight footer */}
          <div
            className="text-center py-1"
            style={{ background: '#F2EAE0', borderTop: '1px solid #E0D0BC' }}
          >
            <p style={{ fontSize: 8, color: '#6F5035' }}>
              Net Wt. {a.net_weight_g || '—'}g · Roasted
            </p>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-2">
          <ProcessBadge process={a.process} />
          <p className="text-coffee-700" style={{ fontSize: 12, fontWeight: 500 }}>
            {a.allocation_code}
          </p>
          {a.harvest_year && (
            <p style={{ fontSize: 11, color: '#A8896A' }}>Harvest {a.harvest_year}</p>
          )}
          <p
            className="text-center mt-1"
            style={{ fontSize: 10, color: '#B8A48A' }}
          >
            No label created
          </p>
        </div>
      )}
    </div>
  );
}

export default function LabelsIndex() {
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [filter, setFilter]           = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/labels')
      .then(r => r.json())
      .then(d => setAllocations(d.allocations || []))
      .finally(() => setLoading(false));
  }, []);

  const withLabel    = allocations.filter(a => a.label_id);
  const withoutLabel = allocations.filter(a => !a.label_id);

  const displayed =
    filter === 'labelled'   ? withLabel :
    filter === 'unlabelled' ? withoutLabel :
    allocations;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-6">
        <PageHeader
          title="Labels"
          subtitle={`${withLabel.length} label${withLabel.length !== 1 ? 's' : ''} created`}
        />

        {/* Filter pills */}
        <div className="flex gap-2 mb-6">
          {[
            { value: 'all',         label: 'All' },
            { value: 'labelled',    label: `With label (${withLabel.length})` },
            { value: 'unlabelled',  label: `No label (${withoutLabel.length})` },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className="px-3 py-1.5 rounded-full text-xs transition-colors"
              style={{
                background: filter === opt.value ? '#533A24' : '#F2EAE0',
                color:      filter === opt.value ? '#FAF6F0' : '#6F5035',
                fontWeight: filter === opt.value ? 500 : 400,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-coffee-400">Loading…</p>
        ) : displayed.length === 0 ? (
          <div className="bg-white border border-coffee-200 rounded-xl p-10 text-center">
            <p className="text-sm text-coffee-400">No allocations found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {displayed.map(a => (
              <button
                key={a.id}
                onClick={() => navigate(`/labels/${a.id}`)}
                className="text-left hover:scale-[1.02] transition-transform"
                style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              >
                <MiniLabel a={a} />
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
