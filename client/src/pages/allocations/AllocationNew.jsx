import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];
const ROAST_LOSS = { Washed: 0.17, Honey: 0.16, Natural: 0.18, Anaerobic: 0.18 };
const CURRENCIES = ['THB', 'USD', 'SGD', 'MYR', 'LAK'];
const MARKETS    = ['Laos', 'Thailand', 'Malaysia', 'Singapore', 'Other'];

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function projectedBags(greenG, bagG, process) {
  if (!greenG || !bagG || !process) return 0;
  const usable = greenG - 700;
  const roasted = usable * (1 - (ROAST_LOSS[process] || 0.17));
  return Math.max(0, Math.floor(roasted / bagG));
}

export default function AllocationNew() {
  const navigate = useNavigate();
  const [lots,     setLots]     = useState([]);
  const [lotId,    setLotId]    = useState('');
  const [estate,   setEstate]   = useState('');
  const [process,  setProcess]  = useState('');
  const [year,     setYear]     = useState('');
  const [greenKg,  setGreenKg]  = useState('');
  const [bagG,     setBagG]     = useState('250');
  const [openDate, setOpenDate] = useState(new Date().toISOString().split('T')[0]);
  const [closeDate,setCloseDate]= useState(addDays(new Date().toISOString().split('T')[0], 5));
  const [pricing,  setPricing]  = useState([{ market: 'Laos', amount: '', currency: 'THB' }]);
  const [error,    setError]    = useState('');
  const [saving,   setSaving]   = useState(false);

  useEffect(() => {
    api.get('/lots').then(r => r.json()).then(d => {
      const flat = [];
      for (const [proc, years] of Object.entries(d.grouped || {})) {
        for (const [yr, lots] of Object.entries(years)) {
          flat.push(...lots);
        }
      }
      setLots(flat);
    }).catch(() => {});
  }, []);

  function selectLot(id) {
    setLotId(id);
    const lot = lots.find(l => l.id === id);
    if (lot) { setEstate(lot.estate); setProcess(lot.process); setYear(String(lot.harvest_year)); }
  }

  const greenG = greenKg ? Math.round(parseFloat(greenKg) * 1000) : null;
  const bags   = projectedBags(greenG, parseInt(bagG), process);
  const lossLabel = process ? `${Math.round(ROAST_LOSS[process] * 100)}%` : '—';

  function addPricingRow() {
    setPricing(p => [...p, { market: 'Laos', amount: '', currency: 'THB' }]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!lotId || !greenKg || !bagG || !openDate) { setError('Please fill in all required fields.'); return; }
    const planned_price_json = pricing.reduce((acc, row) => {
      if (row.market && row.amount) acc[row.market] = { amount: parseInt(row.amount), currency: row.currency };
      return acc;
    }, {});
    setSaving(true);
    try {
      const res = await api.post('/allocations', {
        lot_id: lotId, estate, process, harvest_year: parseInt(year),
        planned_green_quantity_g: greenG, planned_bag_size_g: parseInt(bagG),
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
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-coffee-900 mb-6">New Allocation</h1>
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Lot picker */}
          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">Green Lot <span className="text-red-500">*</span></label>
            <select value={lotId} onChange={e => selectLot(e.target.value)}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm" required>
              <option value="">Select lot…</option>
              {lots.map(l => (
                <option key={l.id} value={l.id}>
                  {l.lot_code} · {l.process} · {l.harvest_year} · {(l.current_weight_g / 1000).toFixed(2)} kg
                </option>
              ))}
            </select>
          </div>

          {/* Auto-filled read-only */}
          {estate && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-coffee-500 mb-1">Estate</label>
                <div className="border border-coffee-200 bg-coffee-50 rounded px-3 py-2 text-sm text-coffee-700">{estate}</div>
              </div>
              <div>
                <label className="block text-xs text-coffee-500 mb-1">Process</label>
                <div className="border border-coffee-200 bg-coffee-50 rounded px-3 py-2 text-sm text-coffee-700">{process}</div>
              </div>
              <div>
                <label className="block text-xs text-coffee-500 mb-1">Harvest Year</label>
                <div className="border border-coffee-200 bg-coffee-50 rounded px-3 py-2 text-sm text-coffee-700">{year}</div>
              </div>
            </div>
          )}

          {/* Green quantity */}
          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">Planned Green Quantity (kg) <span className="text-red-500">*</span></label>
            <input type="number" step="0.001" value={greenKg}
              onChange={e => setGreenKg(e.target.value)}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm" required />
            {greenG && <p className="text-xs text-coffee-400 mt-1">= {greenG}g</p>}
          </div>

          {/* Bag size */}
          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">Bag Size (g) <span className="text-red-500">*</span></label>
            <input type="number" value={bagG} onChange={e => setBagG(e.target.value)}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
              placeholder="e.g. 100, 150, 200, 250g" required />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">Window Opens <span className="text-red-500">*</span></label>
              <input type="date" value={openDate}
                onChange={e => { setOpenDate(e.target.value); setCloseDate(addDays(e.target.value, 5)); }}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">Window Closes</label>
              <input type="date" value={closeDate}
                onChange={e => setCloseDate(e.target.value)}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm" />
            </div>
          </div>

          {/* Pricing */}
          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-2">Pricing</label>
            <div className="space-y-2">
              {pricing.map((row, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <select value={row.market}
                    onChange={e => { const p = [...pricing]; p[i].market = e.target.value; setPricing(p); }}
                    className="flex-1 border border-coffee-300 rounded px-2 py-1.5 text-sm">
                    {MARKETS.map(m => <option key={m}>{m}</option>)}
                  </select>
                  <input type="number" value={row.amount} placeholder="Amount"
                    onChange={e => { const p = [...pricing]; p[i].amount = e.target.value; setPricing(p); }}
                    className="w-24 border border-coffee-300 rounded px-2 py-1.5 text-sm" />
                  <select value={row.currency}
                    onChange={e => { const p = [...pricing]; p[i].currency = e.target.value; setPricing(p); }}
                    className="w-20 border border-coffee-300 rounded px-2 py-1.5 text-sm">
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                  {pricing.length > 1 && (
                    <button type="button" onClick={() => setPricing(p => p.filter((_, j) => j !== i))}
                      className="text-red-500 hover:text-red-700 text-lg leading-none">×</button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addPricingRow}
              className="mt-2 text-sm text-coffee-600 hover:text-coffee-800 underline">+ Add market</button>
          </div>

          {/* Yield projection */}
          {greenG && process && (
            <div className="bg-coffee-50 border border-coffee-200 rounded-lg p-4 text-sm">
              <p className="font-semibold text-coffee-800 mb-1">Projected yield: <span className="text-2xl text-coffee-900">{bags}</span> bags</p>
              <p className="text-coffee-500 text-xs">(based on {lossLabel} roast loss + 700g buffer)</p>
            </div>
          )}

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" disabled={saving}
            className="w-full py-3 bg-coffee-700 text-white rounded-md font-semibold hover:bg-coffee-800 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Allocation'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
