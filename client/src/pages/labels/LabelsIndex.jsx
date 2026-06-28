import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PageHeader, Button, ProcessBadge } from '../../components/ui';

const PROCESS_LABEL = {
  Washed:    'Washed Process',
  Honey:     'Honey Process',
  Natural:   'Natural Process',
  Anaerobic: 'Anaerobic Process',
};

function MiniLabel({ a, onDelete, isAdmin }) {
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
          </div>

          {/* Net weight footer + delete */}
          <div
            className="py-1 px-2 flex items-center justify-between"
            style={{ background: '#F2EAE0', borderTop: '1px solid #E0D0BC' }}
          >
            <p style={{ fontSize: 8, color: '#6F5035' }}>
              Net Wt. {a.net_weight_g || '—'}g · Roasted
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onDelete(); }}
                style={{ fontSize: 8, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Delete
              </button>
            )}
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
          <p style={{ fontSize: 10, color: '#8B6A47', marginTop: 2, fontWeight: 500 }}>
            + Create Label →
          </p>
          {isAdmin && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="mt-1"
              style={{ fontSize: 10, color: '#A32D2D', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Delete allocation
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function LabelsIndex() {
  const [allocations,   setAllocations]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [filter,        setFilter]        = useState('all');
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type, labelId, allocationId, code }
  const [deleting,      setDeleting]      = useState(false);
  const [deleteError,   setDeleteError]   = useState('');
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  function load() {
    api.get('/labels')
      .then(r => r.json())
      .then(d => setAllocations(d.allocations || []))
      .finally(() => setLoading(false));
  }

  function triggerExport(fmt) {
    api.get(`/export/labels?format=${fmt}`)
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `labels-${new Date().toISOString().split('T')[0]}.${fmt}`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  useEffect(load, []);

  async function performDelete() {
    if (!deleteConfirm) return;
    setDeleting(true); setDeleteError('');
    const url = deleteConfirm.type === 'allocation'
      ? `/allocations/${deleteConfirm.allocationId}`
      : `/labels/${deleteConfirm.labelId}`;
    const res = await api.delete(url);
    if (res.ok) {
      setDeleteConfirm(null);
      load();
    } else {
      const d = await res.json().catch(() => ({}));
      setDeleteError(d.error || 'Failed to delete.');
    }
    setDeleting(false);
  }

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
          actions={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => triggerExport('csv')}>CSV</Button>
              <Button variant="ghost" onClick={() => triggerExport('json')}>JSON</Button>
              <Button variant="primary" onClick={() => {
                if (withoutLabel.length > 0) {
                  navigate(`/labels/${withoutLabel[0].id}`);
                } else {
                  setFilter('unlabelled');
                }
              }}>
                + Create Label
              </Button>
            </div>
          }
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
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/labels/${a.id}`)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/labels/${a.id}`); } }}
                className="text-left hover:scale-[1.02] transition-transform"
                style={{ cursor: 'pointer' }}
              >
                <MiniLabel
                  a={a}
                  isAdmin={isAdmin}
                  onDelete={() => { setDeleteError(''); setDeleteConfirm(
                    a.label_id
                      ? { type: 'label', labelId: a.label_id, allocationId: a.id, code: a.allocation_code }
                      : { type: 'allocation', allocationId: a.id, code: a.allocation_code }
                  ); }}
                />
              </div>
            ))}
          </div>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(34,21,8,0.2)' }}>
            <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-sm p-6">
              {deleteConfirm.type === 'allocation' ? (
                <>
                  <h3 className="text-base text-coffee-900 mb-2" style={{ fontWeight: 500 }}>
                    Delete Allocation {deleteConfirm.code}
                  </h3>
                  <p className="text-sm text-coffee-600 mb-5">
                    This removes the allocation <strong>{deleteConfirm.code}</strong> and its requests
                    everywhere, not just from Labels. This cannot be undone.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-base text-coffee-900 mb-2" style={{ fontWeight: 500 }}>Delete Label</h3>
                  <p className="text-sm text-coffee-600 mb-5">
                    This will remove the label. You can recreate it at any time from the allocation.
                  </p>
                </>
              )}
              {deleteError && (
                <p className="text-xs mb-3" style={{ color: '#A32D2D' }}>{deleteError}</p>
              )}
              <div className="flex gap-3">
                <Button onClick={performDelete} disabled={deleting}
                  className="flex-1 justify-center" variant="destructive">
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
                <Button variant="secondary" onClick={() => { setDeleteConfirm(null); setDeleteError(''); }}>Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
