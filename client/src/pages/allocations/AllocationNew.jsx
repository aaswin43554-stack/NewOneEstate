import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, FormInput, PageHeader } from '../../components/ui';

const CURRENCIES = ['LAK', 'THB', 'USD'];
const MARKETS    = ['Laos', 'Thailand', 'Other: International'];

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function projectedBags(greenG, bagG) {
  if (!greenG || !bagG) return 0;
  const roasted = greenG * 0.80;
  return Math.max(0, Math.floor(roasted / bagG));
}

export default function AllocationNew() {
  const navigate = useNavigate();
  const [lots,      setLots]      = useState([]);
  // One allocation can draw green from several lots — "half from each".
  const [rows,      setRows]      = useState([{ lot_id: '', green_kg: '' }]);
  const [bagG,      setBagG]      = useState('200');
  const [openDate,  setOpenDate]  = useState(new Date().toISOString().split('T')[0]);
  const [closeDate, setCloseDate] = useState(addDays(new Date().toISOString().split('T')[0], 5));
  const [pricing,   setPricing]   = useState([{ market: 'Laos', amount: '', currency: 'THB' }]);
  const [error,     setError]     = useState('');
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    api.get('/lots').then(r => r.json()).then(d => {
      const flat = [];
      for (const [, years] of Object.entries(d.grouped || {})) {
        for (const [, lots] of Object.entries(years)) {
          flat.push(...lots);
        }
      }
      setLots(flat);
    }).catch(() => {});
  }, []);

  // Estate / process / harvest year are taken from the first (primary) lot.
  const primaryLot = lots.find(l => l.id === rows[0]?.lot_id) || null;
  const estate  = primaryLot?.estate || '';
  const process = primaryLot?.process || '';
  const year    = primaryLot ? String(primaryLot.harvest_year) : '';

  const totalGreenG = rows.reduce((sum, r) => {
    const kg = parseFloat(r.green_kg);
    return sum + (isNaN(kg) ? 0 : Math.round(kg * 1000));
  }, 0);
  const bags = projectedBags(totalGreenG, parseInt(bagG));

  function updateRow(i, key, val) {
    setRows(rs => rs.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  }
  function addRow()      { setRows(rs => [...rs, { lot_id: '', green_kg: '' }]); }
  function removeRow(i)  { setRows(rs => rs.filter((_, j) => j !== i)); }

  function addPricingRow() {
    setPricing(p => [...p, { market: 'Laos', amount: '', currency: 'THB' }]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Keep only rows the user actually started filling, then require both fields.
    const filled = rows.filter(r => r.lot_id || r.green_kg);
    if (filled.length === 0 || filled.some(r => !r.lot_id || !(parseFloat(r.green_kg) > 0))) {
      setError('Each lot needs both a lot and a green quantity greater than 0.');
      return;
    }
    if (!bagG || !openDate) {
      setError('Please fill in all required fields.');
      return;
    }

    const lotsPayload = filled.map(r => ({
      lot_id: r.lot_id,
      green_quantity_g: Math.round(parseFloat(r.green_kg) * 1000),
    }));

    const planned_price_json = pricing.reduce((acc, row) => {
      if (row.market && row.amount) acc[row.market] = { amount: parseInt(row.amount), currency: row.currency };
      return acc;
    }, {});

    setSaving(true);
    try {
      const res = await api.post('/allocations', {
        lots: lotsPayload,
        estate, process, harvest_year: parseInt(year),
        planned_bag_size_g: parseInt(bagG),
        planned_price_json, window_open_date: openDate, window_close_date: closeDate,
      });
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed.'); return; }
      const { allocation } = await res.json();
      navigate(`/allocations/${allocation.id}`);
    } catch { setError('Network error.'); }
    finally { setSaving(false); }
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-6">
        <PageHeader title="New Allocation" />

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Multi-lot picker */}
          <div>
            <label className="text-sm text-coffee-600 mb-2 block" style={{ fontWeight: 500 }}>
              Green Lots <span className="text-coffee-400" style={{ fontWeight: 400 }}>· pick one or more</span>
            </label>
            <div className="space-y-2">
              {rows.map((row, i) => {
                const taken   = rows.filter((_, j) => j !== i).map(r => r.lot_id).filter(Boolean);
                const options = lots.filter(l => !taken.includes(l.id));
                return (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      value={row.lot_id}
                      onChange={e => updateRow(i, 'lot_id', e.target.value)}
                      className="flex-1 h-9 px-3 text-sm border border-coffee-200 rounded-lg bg-white"
                    >
                      <option value="">Select lot…</option>
                      {options.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.lot_code} · {l.process} · {l.harvest_year} · {(l.current_weight_g / 1000).toFixed(2)} kg avail
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={row.green_kg}
                      placeholder="kg"
                      onChange={e => updateRow(i, 'green_kg', e.target.value)}
                      className="w-24 h-9 px-3 text-sm border border-coffee-200 rounded-lg"
                    />
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-coffee-400 hover:text-coffee-700 text-lg leading-none"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="mt-2 text-xs text-coffee-500 hover:text-coffee-700 transition-colors"
            >
              + Add lot
            </button>
            {totalGreenG > 0 && (
              <p className="text-xs text-coffee-400 mt-2">
                Total green: {(totalGreenG / 1000).toFixed(3)} kg = {totalGreenG}g
              </p>
            )}
          </div>

          {/* Auto-filled read-only lot info (from the first lot) */}
          {estate && (
            <div className="grid grid-cols-3 gap-3">
              {[['Estate', estate], ['Process', process], ['Harvest Year', year]].map(([label, value]) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-xs text-coffee-400 uppercase tracking-wide">{label}</span>
                  <div
                    className="h-9 px-3 flex items-center text-sm text-coffee-600 rounded-lg border border-coffee-200"
                    style={{ background: '#FAF6F0' }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}

          <FormInput
            label="Bag Size (g)"
            type="number"
            value={bagG}
            onChange={e => setBagG(e.target.value)}
            placeholder="e.g. 100, 150, 200, 250"
            required
          />

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Window Opens"
              type="date"
              value={openDate}
              onChange={e => { setOpenDate(e.target.value); setCloseDate(addDays(e.target.value, 5)); }}
              required
            />
            <FormInput
              label="Window Closes"
              type="date"
              value={closeDate}
              onChange={e => setCloseDate(e.target.value)}
            />
          </div>

          {/* Pricing */}
          <div>
            <label className="text-sm text-coffee-600 mb-2 block" style={{ fontWeight: 500 }}>Pricing</label>
            <div className="space-y-2">
              {pricing.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select
                    value={row.market}
                    onChange={e => { const p = [...pricing]; p[i].market = e.target.value; setPricing(p); }}
                    className="flex-1 h-9 px-3 text-sm border border-coffee-200 rounded-lg bg-white"
                  >
                    {MARKETS.map(m => <option key={m}>{m}</option>)}
                  </select>
                  <input
                    type="number"
                    value={row.amount}
                    placeholder="Amount"
                    onChange={e => { const p = [...pricing]; p[i].amount = e.target.value; setPricing(p); }}
                    className="w-24 h-9 px-3 text-sm border border-coffee-200 rounded-lg"
                  />
                  <select
                    value={row.currency}
                    onChange={e => { const p = [...pricing]; p[i].currency = e.target.value; setPricing(p); }}
                    className="w-20 h-9 px-2 text-sm border border-coffee-200 rounded-lg bg-white"
                  >
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  {pricing.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPricing(p => p.filter((_, j) => j !== i))}
                      className="text-coffee-400 hover:text-coffee-700 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addPricingRow}
              className="mt-2 text-xs text-coffee-500 hover:text-coffee-700 transition-colors"
            >
              + Add market
            </button>
          </div>

          {/* Yield projection */}
          {totalGreenG > 0 && (
            <div
              className="rounded-xl p-4 border border-coffee-200"
              style={{ background: '#FAF6F0' }}
            >
              <p className="text-xs text-coffee-400 uppercase tracking-wide mb-1">Projected Yield</p>
              <p className="text-2xl text-coffee-900" style={{ fontWeight: 500 }}>
                {bags} <span className="text-sm text-coffee-400" style={{ fontWeight: 400 }}>bags</span>
              </p>
              <p className="text-xs text-coffee-400 mt-1">
                Based on 20% roast loss
              </p>
            </div>
          )}

          {error && (
            <p className="text-xs" style={{ color: '#A32D2D' }}>{error}</p>
          )}

          <Button type="submit" disabled={saving} className="w-full justify-center" size="lg">
            {saving ? 'Creating…' : 'Create Allocation'}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
