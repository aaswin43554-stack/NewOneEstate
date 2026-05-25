import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import YieldCalculator from '../components/YieldCalculator';
import { Button, FormSelect, FormInput, ProcessBadge } from '../components/ui';

function gToKg(g) { return (g / 1000).toFixed(2); }

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const MOVEMENT_META = {
  reservation:       { label: 'Reservation',      bg: '#F1EFE8', color: '#888780' },
  roast_consumption: { label: 'Roast Consumption', bg: '#E6F1FB', color: '#185FA5' },
  write_off:         { label: 'Write-off',         bg: '#FCEBEB', color: '#A32D2D' },
};

const INIT_MOVE = { movement_type: 'reservation', weight_kg: '', reason: '' };

export default function LotDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [lot,         setLot]         = useState(null);
  const [movements,   setMovements]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [moveForm,    setMoveForm]    = useState(INIT_MOVE);
  const [moveError,   setMoveError]   = useState('');
  const [moveLoading, setMoveLoading] = useState(false);

  const canWrite = user?.role === 'admin' || user?.role === 'roaster';

  const fetchLot = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/lots/${id}`);
      if (!res.ok) { setError('Lot not found.'); return; }
      const data = await res.json();
      setLot(data.lot);
      setMovements(data.movements);
    } catch {
      setError('Failed to load lot.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchLot(); }, [fetchLot]);

  async function handleMovement(e) {
    e.preventDefault();
    setMoveError('');
    const weight_g = Math.round(parseFloat(moveForm.weight_kg) * 1000);
    if (isNaN(weight_g) || weight_g <= 0) { setMoveError('Enter a valid weight.'); return; }

    setMoveLoading(true);
    try {
      const res = await api.post(`/lots/${id}/movements`, {
        movement_type: moveForm.movement_type,
        weight_change_g: -weight_g,
        reason: moveForm.reason || undefined,
      });
      const data = await res.json();
      if (!res.ok) { setMoveError(data.error || 'Failed to record movement.'); return; }
      setMoveForm(INIT_MOVE);
      fetchLot();
    } catch {
      setMoveError('Failed to record movement.');
    } finally {
      setMoveLoading(false);
    }
  }

  if (loading) return (
    <Layout>
      <div className="px-6 py-6 text-sm text-coffee-400">Loading…</div>
    </Layout>
  );

  if (error || !lot) return (
    <Layout>
      <div className="px-6 py-24 text-center">
        <p className="text-sm" style={{ color: '#A32D2D' }}>{error || 'Lot not found.'}</p>
        <button
          onClick={() => navigate('/inventory')}
          className="mt-3 text-xs text-coffee-500 hover:text-coffee-700 transition-colors"
        >
          Back to Inventory
        </button>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-6 space-y-5">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate('/inventory')}
            className="text-xs text-coffee-400 hover:text-coffee-600 transition-colors mb-3 block"
          >
            ← Inventory
          </button>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="font-mono text-2xl text-coffee-900" style={{ fontWeight: 500 }}>
                  {lot.lot_code}
                </h1>
                <ProcessBadge process={lot.process} />
              </div>
              <p className="text-sm text-coffee-400">
                {lot.estate} · Harvest {lot.harvest_year}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-coffee-400 uppercase tracking-wide mb-1">Current Stock</p>
              <p className="text-2xl text-coffee-900" style={{ fontWeight: 500 }}>
                {gToKg(lot.current_weight_g)}
                <span className="text-sm text-coffee-400" style={{ fontWeight: 400 }}> kg</span>
              </p>
            </div>
          </div>
        </div>

        {/* Quality alert */}
        {lot.quality_alert && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FAEEDA', color: '#BA7517' }}>
            <span style={{ fontWeight: 500 }}>Quality Alert — Lot is over 12 months old.</span>
            {' '}Arrived {fmtDate(lot.arrival_date)}. Consider prioritising for the next roast.
          </div>
        )}

        {/* Lot details */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <p className="text-xs text-coffee-400 uppercase tracking-wide mb-4">Lot Details</p>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4 text-sm">
            {[
              ['Lot Code',         <span className="font-mono" key="lc">{lot.lot_code}</span>],
              ['Estate',           lot.estate],
              ['Process',          lot.process],
              ['Harvest Year',     lot.harvest_year],
              ['Arrival Date',     fmtDate(lot.arrival_date)],
              ['Storage Location', lot.storage_location],
              ['Arrival Weight',   `${gToKg(lot.arrival_weight_g)} kg`],
              ['Current Weight',   `${gToKg(lot.current_weight_g)} kg`],
              ...(lot.moisture_content != null ? [['Moisture Content', `${lot.moisture_content}%`]] : []),
              ...(lot.water_activity   != null ? [['Water Activity',   `${lot.water_activity}`]]    : []),
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-coffee-400 uppercase tracking-wide mb-1">{label}</dt>
                <dd className="text-coffee-800" style={{ fontWeight: 500 }}>{value}</dd>
              </div>
            ))}
            {lot.supplier_notes && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-coffee-400 uppercase tracking-wide mb-1">Supplier Notes</dt>
                <dd className="text-sm text-coffee-600">{lot.supplier_notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Yield calculator */}
        <YieldCalculator
          lotId={lot.id}
          process={lot.process}
          currentWeightG={lot.current_weight_g}
        />

        {/* Record movement */}
        {canWrite && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <p className="text-xs text-coffee-400 uppercase tracking-wide mb-4">Record Movement</p>
            <form onSubmit={handleMovement} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <FormSelect
                label="Type"
                value={moveForm.movement_type}
                onChange={e => setMoveForm(f => ({ ...f, movement_type: e.target.value }))}
              >
                <option value="reservation">Reservation</option>
                <option value="roast_consumption">Roast Consumption</option>
                <option value="write_off">Write-off</option>
              </FormSelect>

              <FormInput
                label="Weight (kg)"
                type="number"
                step="0.001"
                min="0.001"
                value={moveForm.weight_kg}
                onChange={e => setMoveForm(f => ({ ...f, weight_kg: e.target.value }))}
                placeholder="e.g. 5.000"
                required
              />

              <FormInput
                label="Reason (optional)"
                type="text"
                value={moveForm.reason}
                onChange={e => setMoveForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="e.g. Batch RS-001"
              />

              <Button type="submit" disabled={moveLoading} variant="secondary" className="self-end">
                {moveLoading ? 'Recording…' : 'Record'}
              </Button>
            </form>
            {moveError && (
              <p className="text-xs mt-2" style={{ color: '#A32D2D' }}>{moveError}</p>
            )}
          </div>
        )}

        {/* Movement history */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <p className="text-xs text-coffee-400 uppercase tracking-wide mb-4">
            Movement History
            <span className="ml-2 text-coffee-300 normal-case">({movements.length})</span>
          </p>
          {movements.length === 0 ? (
            <p className="text-sm text-coffee-300">No movements recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid #F2EAE0' }}>
                    {['Date & Time', 'Type', 'Weight Change', 'Reason', 'Authorised By'].map(h => (
                      <th
                        key={h}
                        className={`pb-2.5 text-coffee-400 uppercase tracking-wide whitespace-nowrap ${
                          h === 'Weight Change' ? 'text-right pr-4' : 'text-left pr-6'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => {
                    const meta = MOVEMENT_META[m.movement_type] || { label: m.movement_type, bg: '#F2EAE0', color: '#8B6A47' };
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid #F2EAE0' }}>
                        <td className="py-2.5 pr-6 text-coffee-400 whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                        <td className="py-2.5 pr-6">
                          <span
                            className="inline-block text-xs px-1.5 py-0.5 rounded-full"
                            style={{ background: meta.bg, color: meta.color }}
                          >
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-right whitespace-nowrap" style={{ fontWeight: 500, color: '#A32D2D' }}>
                          {m.weight_change_g >= 0 ? '+' : ''}{gToKg(m.weight_change_g)} kg
                        </td>
                        <td className="py-2.5 pr-6 text-coffee-500">{m.reason || '—'}</td>
                        <td className="py-2.5 text-coffee-500">{m.authorised_by_name || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
