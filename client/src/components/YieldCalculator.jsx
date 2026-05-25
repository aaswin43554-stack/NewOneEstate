import { useState } from 'react';
import { api } from '../lib/api';
import { Button, FormInput, FormSelect } from './ui';

const BAG_SIZES = [100, 200, 250, 300, 500, 1000];

export default function YieldCalculator({ lotId, process, currentWeightG }) {
  const [form,    setForm]    = useState({ planned_kg: '', bag_size_g: '200' });
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCalc(e) {
    e.preventDefault();
    setError('');
    setResult(null);

    const planned_g = Math.round(parseFloat(form.planned_kg) * 1000);
    const bag_g     = parseInt(form.bag_size_g);

    if (isNaN(planned_g) || planned_g <= 0) { setError('Enter a valid planned weight.'); return; }
    if (planned_g > currentWeightG) {
      setError(`Planned weight (${(planned_g / 1000).toFixed(2)} kg) exceeds current stock (${(currentWeightG / 1000).toFixed(2)} kg).`);
      return;
    }

    setLoading(true);
    try {
      const res = await api.get(`/lots/${lotId}/yield-projection?planned_green_weight_g=${planned_g}&bag_size_g=${bag_g}`);
      if (!res.ok) { setError('Calculation failed.'); return; }
      setResult(await res.json());
    } catch {
      setError('Calculation failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white border border-coffee-200 rounded-xl p-5 mb-5">
      <p className="text-xs text-coffee-400 uppercase tracking-wide mb-1">Yield Projection</p>
      <p className="text-xs text-coffee-300 mb-4">
        Estimate sellable bags before committing green weight to a roast
      </p>

      <form onSubmit={handleCalc} className="flex flex-wrap items-end gap-3">
        <FormInput
          label="Planned Green Weight (kg)"
          type="number"
          step="0.001"
          min="0.001"
          value={form.planned_kg}
          onChange={e => setForm(f => ({ ...f, planned_kg: e.target.value }))}
          placeholder={`Max ${(currentWeightG / 1000).toFixed(2)}`}
          containerClass="w-44"
          required
        />
        <FormSelect
          label="Bag Size"
          value={form.bag_size_g}
          onChange={e => setForm(f => ({ ...f, bag_size_g: e.target.value }))}
        >
          {BAG_SIZES.map(s => (
            <option key={s} value={s}>{s >= 1000 ? `${s / 1000} kg` : `${s} g`}</option>
          ))}
        </FormSelect>
        <Button type="submit" disabled={loading} variant="secondary">
          {loading ? 'Calculating…' : 'Calculate'}
        </Button>
      </form>

      {error && (
        <p className="text-xs mt-3" style={{ color: '#A32D2D' }}>{error}</p>
      )}

      {result && (
        <div className="mt-4 rounded-xl p-4" style={{ background: '#FAF6F0', border: '1px solid #F2EAE0' }}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-coffee-400 uppercase tracking-wide mb-1">Process</p>
              <p className="text-coffee-800" style={{ fontWeight: 500 }}>{result.process}</p>
            </div>
            <div>
              <p className="text-coffee-400 uppercase tracking-wide mb-1">Roast Loss</p>
              <p className="text-coffee-800" style={{ fontWeight: 500 }}>{result.roast_loss_pct}%</p>
            </div>
            <div>
              <p className="text-coffee-400 uppercase tracking-wide mb-1">Buffer</p>
              <p className="text-coffee-800" style={{ fontWeight: 500 }}>{result.buffer_g} g</p>
            </div>
            <div>
              <p className="text-coffee-400 uppercase tracking-wide mb-1">Roasted Weight</p>
              <p className="text-coffee-800" style={{ fontWeight: 500 }}>
                {(result.roasted_weight_g / 1000).toFixed(2)} kg
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid #F2EAE0' }}>
            <span className="text-xs text-coffee-400">
              Projected {result.bag_size_g >= 1000 ? `${result.bag_size_g / 1000}kg` : `${result.bag_size_g}g`} bags
            </span>
            <span className="text-2xl text-coffee-900" style={{ fontWeight: 500 }}>
              {result.projected_bags}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
