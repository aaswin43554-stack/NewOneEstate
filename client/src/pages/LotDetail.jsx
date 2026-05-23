import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import Layout from '../components/Layout';
import YieldCalculator from '../components/YieldCalculator';

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
  reservation:       { label: 'Reservation',        cls: 'bg-gray-100 text-gray-700' },
  roast_consumption: { label: 'Roast Consumption',   cls: 'bg-blue-100 text-blue-700' },
  write_off:         { label: 'Write-off',           cls: 'bg-red-100 text-red-700' },
};

const INIT_MOVE = { movement_type: 'reservation', weight_kg: '', reason: '' };

export default function LotDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [lot, setLot] = useState(null);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [moveForm, setMoveForm] = useState(INIT_MOVE);
  const [moveError, setMoveError] = useState('');
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

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-24 text-coffee-300 text-sm">Loading…</div>
      </Layout>
    );
  }

  if (error || !lot) {
    return (
      <Layout>
        <div className="text-center py-24">
          <p className="text-red-500 text-sm">{error || 'Lot not found.'}</p>
          <button onClick={() => navigate('/inventory')} className="mt-3 text-coffee-600 underline text-sm">
            Back to inventory
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Breadcrumb + header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/inventory')}
            className="text-sm text-coffee-400 hover:text-coffee-700 transition-colors flex items-center gap-1 mb-2"
          >
            ← Inventory
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold text-coffee-900 font-mono">{lot.lot_code}</h1>
              <p className="text-coffee-500 text-sm mt-0.5">
                {lot.estate} · {lot.process} · Harvest {lot.harvest_year}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-coffee-400 uppercase tracking-wide">Current Stock</p>
              <p className="text-2xl font-bold text-coffee-900">{gToKg(lot.current_weight_g)} <span className="text-sm font-normal text-coffee-500">kg</span></p>
            </div>
          </div>
        </div>

        {/* Quality alert banner */}
        {lot.quality_alert && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <span className="text-amber-500 text-xl mt-0.5">⚠</span>
            <div>
              <p className="font-semibold text-amber-800 text-sm">Quality Alert — Lot is over 12 months old</p>
              <p className="text-amber-600 text-sm mt-0.5">
                Arrived {fmtDate(lot.arrival_date)}. Consider prioritising this lot for the next roast.
              </p>
            </div>
          </div>
        )}

        {/* Lot details card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-coffee-800 mb-4">Lot Details</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-5 text-sm">
            {[
              ['Lot Code',         <span className="font-mono">{lot.lot_code}</span>],
              ['Estate',           lot.estate],
              ['Process',          lot.process],
              ['Harvest Year',     lot.harvest_year],
              ['Arrival Date',     fmtDate(lot.arrival_date)],
              ['Storage Location', lot.storage_location],
              ['Arrival Weight',   `${gToKg(lot.arrival_weight_g)} kg`],
              ['Current Weight',   <span className="font-bold">{gToKg(lot.current_weight_g)} kg</span>],
              ...(lot.moisture_content != null ? [['Moisture Content', `${lot.moisture_content}%`]] : []),
              ...(lot.water_activity   != null ? [['Water Activity',   `${lot.water_activity}`]]   : []),
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-coffee-400 uppercase tracking-wide mb-1">{label}</dt>
                <dd className="font-medium text-coffee-900">{value}</dd>
              </div>
            ))}
            {lot.supplier_notes && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-coffee-400 uppercase tracking-wide mb-1">Supplier Notes</dt>
                <dd className="text-coffee-700">{lot.supplier_notes}</dd>
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-coffee-800 mb-4">Record Movement</h2>
            <form onSubmit={handleMovement} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-coffee-600 mb-1">Type</label>
                <select
                  value={moveForm.movement_type}
                  onChange={(e) => setMoveForm((f) => ({ ...f, movement_type: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-coffee-300"
                >
                  <option value="reservation">Reservation</option>
                  <option value="roast_consumption">Roast Consumption</option>
                  <option value="write_off">Write-off</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-coffee-600 mb-1">Weight (kg)</label>
                <input
                  type="number" step="0.001" min="0.001"
                  value={moveForm.weight_kg}
                  onChange={(e) => setMoveForm((f) => ({ ...f, weight_kg: e.target.value }))}
                  placeholder="e.g. 5.000"
                  required
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-coffee-600 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={moveForm.reason}
                  onChange={(e) => setMoveForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g. Batch RS-001"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-300"
                />
              </div>
              <button
                type="submit" disabled={moveLoading}
                className="bg-coffee-700 text-white px-4 py-2 rounded-lg hover:bg-coffee-800 disabled:opacity-50 text-sm font-medium transition-colors h-[38px]"
              >
                {moveLoading ? 'Recording…' : 'Record'}
              </button>
            </form>
            {moveError && <p className="text-red-500 text-sm mt-2">{moveError}</p>}
          </div>
        )}

        {/* Movement history */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="font-semibold text-coffee-800 mb-4">
            Movement History
            <span className="ml-2 text-xs font-normal text-coffee-400">({movements.length})</span>
          </h2>
          {movements.length === 0 ? (
            <p className="text-coffee-300 text-sm">No movements recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Date & Time', 'Type', 'Weight Change', 'Reason', 'Authorised By'].map((h) => (
                      <th
                        key={h}
                        className={`pb-3 text-xs font-semibold text-coffee-500 uppercase tracking-wide whitespace-nowrap ${h === 'Weight Change' ? 'text-right pr-4' : 'text-left pr-6'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {movements.map((m) => {
                    const meta = MOVEMENT_META[m.movement_type] || {};
                    return (
                      <tr key={m.id}>
                        <td className="py-3 pr-6 text-gray-500 whitespace-nowrap">{fmtDateTime(m.created_at)}</td>
                        <td className="py-3 pr-6">
                          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${meta.cls}`}>
                            {meta.label}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-right font-semibold whitespace-nowrap text-red-600">
                          {m.weight_change_g >= 0 ? '+' : ''}{gToKg(m.weight_change_g)} kg
                        </td>
                        <td className="py-3 pr-6 text-gray-500">{m.reason || '—'}</td>
                        <td className="py-3 text-gray-500">{m.authorised_by_name || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </Layout>
  );
}
