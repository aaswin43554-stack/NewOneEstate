import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import AddLotModal from '../components/AddLotModal';
import {
  PageHeader, Button, FilterPills, ProcessBadge, StatusBadge,
  DataTable, RightPanel, PanelField, EmptyState,
} from '../components/ui';

const PROCESSES = ['All', 'Washed', 'Honey', 'Natural', 'Anaerobic'];
const YEARS     = ['All', '2026', '2025', '2024', '2023', '2022', '2021'];

function gToKg(g) {
  return g != null ? (g / 1000).toFixed(2) + ' kg' : '—';
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function lotStatus(lot) {
  if (lot.current_weight_g <= 0) return 'archived';
  if (lot.quality_alert) return 'under_review';
  return 'published';
}

const COLUMNS = [
  {
    key: 'lot_code',
    label: 'Lot ID',
    sortable: true,
    render: v => (
      <span className="font-mono text-coffee-800" style={{ fontWeight: 500, fontSize: 13 }}>
        {v}
      </span>
    ),
  },
  { key: 'estate',       label: 'Origin',   sortable: true },
  {
    key: 'process',
    label: 'Process',
    render: v => <ProcessBadge process={v} />,
  },
  {
    key: 'current_weight_g',
    label: 'Weight',
    sortable: true,
    align: 'right',
    render: v => (
      <span style={{ fontWeight: 500 }}>{gToKg(v)}</span>
    ),
  },
  {
    key: 'arrival_date',
    label: 'Arrived',
    sortable: true,
    render: v => <span className="text-coffee-400">{fmtDate(v)}</span>,
  },
  {
    key: 'harvest_year',
    label: 'Year',
    sortable: true,
    render: v => <span className="text-coffee-400">{v || '—'}</span>,
  },
  {
    key: '_status',
    label: 'Status',
    render: (_, row) => (
      <StatusBadge
        status={lotStatus(row)}
        label={lotStatus(row) === 'published' ? 'Available' : lotStatus(row) === 'archived' ? 'Empty' : 'Aged'}
      />
    ),
  },
  {
    key: 'storage_location',
    label: 'Location',
    render: v => <span className="text-coffee-400">{v || '—'}</span>,
  },
];

export default function Inventory() {
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [allLots,    setAllLots]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [processF,   setProcessF]   = useState('All');
  const [yearF,      setYearF]      = useState('All');
  const [showModal,  setShowModal]  = useState(false);
  const [panelLot,   setPanelLot]   = useState(null);
  const [panelOpen,  setPanelOpen]  = useState(false);

  const canWrite = user?.role === 'admin' || user?.role === 'roaster';

  async function triggerExport(format) {
    const res  = await api.get(`/export/lots?format=${format}`);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `lots-${new Date().toISOString().split('T')[0]}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const fetchLots = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res  = await api.get('/lots');
      if (!res.ok) { setError('Failed to load inventory.'); return; }
      const data = await res.json();
      // Flatten grouped structure to flat array
      const flat = [];
      const grouped = data.grouped || {};
      for (const process of Object.keys(grouped)) {
        const yearGroups = grouped[process];
        for (const year of Object.keys(yearGroups)) {
          for (const lot of yearGroups[year]) {
            flat.push(lot);
          }
        }
      }
      setAllLots(flat);
    } catch {
      setError('Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLots(); }, [fetchLots]);

  const filtered = allLots.filter(lot => {
    if (processF !== 'All' && lot.process !== processF) return false;
    if (yearF    !== 'All' && String(lot.harvest_year) !== yearF) return false;
    return true;
  });

  function openPanel(lot) {
    setPanelLot(lot);
    setPanelOpen(true);
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <PageHeader
          title="Inventory"
          subtitle={loading ? 'Loading…' : `${filtered.length} lot${filtered.length !== 1 ? 's' : ''}`}
          actions={
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => triggerExport('csv')}>CSV</Button>
              <Button variant="ghost" onClick={() => triggerExport('json')}>JSON</Button>
              {canWrite && (
                <Button variant="primary" onClick={() => setShowModal(true)}>+ New Lot</Button>
              )}
            </div>
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 mb-5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-coffee-400">Process</span>
            <FilterPills
              options={PROCESSES}
              value={processF}
              onChange={setProcessF}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-coffee-400">Year</span>
            <FilterPills
              options={YEARS}
              value={yearF}
              onChange={setYearF}
            />
          </div>
        </div>

        {error && (
          <div
            className="mb-4 px-4 py-3 rounded-lg text-sm"
            style={{ background: '#FCEBEB', color: '#A32D2D' }}
          >
            {error}
          </div>
        )}

        <DataTable
          columns={COLUMNS}
          rows={filtered}
          loading={loading}
          onRowClick={openPanel}
          emptyMessage="No lots found. Add the first lot to get started."
          keyField="id"
        />
      </div>

      {/* Lot detail panel */}
      <RightPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title={panelLot?.lot_code || 'Lot Detail'}
        width={400}
      >
        {panelLot && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <PanelField label="Lot Code"   value={panelLot.lot_code} />
              <PanelField label="Estate"     value={panelLot.estate} />
              <PanelField label="Process"    value={<ProcessBadge process={panelLot.process} />} />
              <PanelField label="Year"       value={panelLot.harvest_year} />
              <PanelField label="Arrived"    value={fmtDate(panelLot.arrival_date)} />
              <PanelField label="Location"   value={panelLot.storage_location} />
              <PanelField label="Current Wt" value={gToKg(panelLot.current_weight_g)} />
              <PanelField label="Status"     value={
                <StatusBadge
                  status={lotStatus(panelLot)}
                  label={lotStatus(panelLot) === 'published' ? 'Available' : lotStatus(panelLot) === 'archived' ? 'Empty' : 'Aged'}
                />
              } />
            </div>

            {panelLot.quality_alert && (
              <div
                className="px-3 py-2 rounded-lg text-xs"
                style={{ background: '#FAEEDA', color: '#BA7517' }}
              >
                Quality alert — this lot is over 12 months old and may have degraded.
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                variant="primary"
                onClick={() => { navigate(`/inventory/${panelLot.id}`); setPanelOpen(false); }}
              >
                Open Full Detail
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPanelOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </RightPanel>

      {showModal && (
        <AddLotModal
          onClose={() => setShowModal(false)}
          onCreated={() => { setShowModal(false); fetchLots(); }}
        />
      )}
    </Layout>
  );
}
