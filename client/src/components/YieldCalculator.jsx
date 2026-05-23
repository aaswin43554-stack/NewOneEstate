import { useState } from 'react';
import { api } from '../lib/api';

const BAG_SIZES = [100, 200, 250, 300, 500, 1000];

export default function YieldCalculator({ lotId, process, currentWeightG }) {
  const [form, setForm] = useState({ planned_kg: '', bag_size_g: '200' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCalc(e) {
    e.preventDefault();
    setError('');
    setResult(null);

    const planned_g = Math.round(parseFloat(form.planned_kg) * 1000);
    const bag_g = parseInt(form.bag_size_g);

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
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="mb-4">
        <h2 className="font-semibold text-coffee-800">Yield Projection</h2>
        <p className="text-xs text-coffee-400 mt-0.5">Estimate sellable bags before committing green weight to a roast</p>
      </div>

      <form onSubmit={handleCalc} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-coffee-600 mb-1">
            Planned Green Weight (kg)
          </label>
          <input
            type="number" step="0.001" min="0.001"
            value={form.planned_kg}
            onChange={(e) => setForm((f) => ({ ...f, planned_kg: e.target.value }))}
            placeholder={`Max ${(currentWeightG / 1000).toFixed(2)}`}
            required
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-coffee-300"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-coffee-600 mb-1">Bag Size</label>
          <select
            value={form.bag_size_g}
            onChange={(e) => setForm((f) => ({ ...f, bag_size_g: e.target.value }))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-coffee-300"
          >
            {BAG_SIZES.map((s) => (
              <option key={s} value={s}>{s >= 1000 ? `${s / 1000} kg` : `${s} g`}</option>
            ))}
          </select>
        </div>
        <button
          type="submit" disabled={loading}
          className="bg-coffee-600 text-white px-5 py-2 rounded-lg hover:bg-coffee-700 disabled:opacity-50 text-sm font-medium transition-colors"
        >
          {loading ? 'Calculating…' : 'Calculate'}
        </button>
      </form>

      {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

      {result && (
        <div className="mt-4 bg-coffee-50 rounded-xl p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-coffee-400 text-xs">Process</p>
              <p className="font-semibold text-coffee-800 mt-0.5">{result.process}</p>
            </div>
            <div>
              <p className="text-coffee-400 text-xs">Roast Loss</p>
              <p className="font-semibold text-coffee-800 mt-0.5">{result.roast_loss_pct}%</p>
            </div>
            <div>
              <p className="text-coffee-400 text-xs">Buffer Deduction</p>
              <p className="font-semibold text-coffee-800 mt-0.5">{result.buffer_g} g</p>
            </div>
            <div>
              <p className="text-coffee-400 text-xs">Est. Roasted Weight</p>
              <p className="font-semibold text-coffee-800 mt-0.5">{(result.roasted_weight_g / 1000).toFixed(2)} kg</p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-coffee-100 flex items-center justify-between">
            <span className="text-coffee-500 text-sm">Projected {result.bag_size_g >= 1000 ? `${result.bag_size_g / 1000}kg` : `${result.bag_size_g}g`} bags</span>
            <span className="text-3xl font-bold text-coffee-900">{result.projected_bags}</span>
          </div>
        </div>
      )}
    </div>
  );
}
