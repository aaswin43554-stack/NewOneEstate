import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, FormInput, FormSelect, PageHeader } from '../../components/ui';

const PROCESSES  = ['Washed', 'Honey', 'Natural', 'Anaerobic'];
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
  const usable  = greenG - 700;
  const roasted = usable * (1 - (ROAST_LOSS[process] || 0.17));
  return Math.max(0, Math.floor(roasted / bagG));
}

export default function AllocationNew() {
  const navigate = useNavigate();
  const [lots,      setLots]      = useState([]);
  const [lotId,     setLotId]     = useState('');
  const [estate,    setEstate]    = useState('');
  const [process,   setProcess]   = useState('');
  const [year,      setYear]      = useState('');
  const [greenKg,   setGreenKg]   = useState('');
  const [bagG,      setBagG]      = useState('250');
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

  function selectLot(id) {
    setLotId(id);
    const lot = lots.find(l => l.id === id);
    if (lot) { setEstate(lot.estate); setProcess(lot.process); setYear(String(lot.harvest_year)); }
  }

  const greenG   = greenKg ? Math.round(parseFloat(greenKg) * 1000) : null;
  const bags     = projectedBags(greenG, parseInt(bagG), process);
  const lossLabel = process ? `${Math.round(ROAST_LOSS[process] * 100)}%` : '—';

  function addPricingRow() {
    setPricing(p => [...p, { market: 'Laos', amount: '', currency: 'THB' }]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!lotId || !greenKg || !bagG || !openDate) {
      setError('Please fill in all required fields.');
      return;
    }
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
      <div className="max-w-2xl mx-auto px-6 py-6">
        <PageHeader title="New Allocation" />

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Lot picker */}
          <FormSelect
            label="Green Lot"
            value={lotId}
            onChange={e => selectLot(e.target.value)}
            required
          >
            <option value="">Select lot…</option>
            {lots.map(l => (
              <option key={l.id} value={l.id}>
                {l.lot_code} · {l.process} · {l.harvest_year} · {(l.current_weight_g / 1000).toFixed(2)} kg
              </option>
            ))}
          </FormSelect>

          {/* Auto-filled read-only lot info */}
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
            label="Planned Green Quantity (kg)"
            type="number"
            step="0.001"
            value={greenKg}
            onChange={e => setGreenKg(e.target.value)}
            helper={greenG ? `= ${greenG}g` : undefined}
            required
          />

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
          {greenG && process && (
            <div
              className="rounded-xl p-4 border border-coffee-200"
              style={{ background: '#FAF6F0' }}
            >
              <p className="text-xs text-coffee-400 uppercase tracking-wide mb-1">Projected Yield</p>
              <p className="text-2xl text-coffee-900" style={{ fontWeight: 500 }}>
                {bags} <span className="text-sm text-coffee-400" style={{ fontWeight: 400 }}>bags</span>
              </p>
              <p className="text-xs text-coffee-400 mt-1">
                Based on {lossLabel} roast loss + 700g buffer
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
