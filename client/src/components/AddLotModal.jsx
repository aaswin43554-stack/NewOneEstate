import { useState } from 'react';
import { api } from '../lib/api';

const PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];

const INIT = {
  lot_code: '', estate: '', process: 'Washed',
  harvest_year: String(new Date().getFullYear()),
  arrival_date: new Date().toISOString().split('T')[0],
  arrival_weight_kg: '', storage_location: '',
  moisture_content: '', water_activity: '', supplier_notes: '',
};

export default function AddLotModal({ onClose, onCreated }) {
  const [form, setForm] = useState(INIT);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function field(key) {
    return (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const arrival_weight_g = Math.round(parseFloat(form.arrival_weight_kg) * 1000);
    if (isNaN(arrival_weight_g) || arrival_weight_g <= 0) {
      setError('Enter a valid arrival weight.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        lot_code: form.lot_code,
        estate: form.estate,
        process: form.process,
        harvest_year: parseInt(form.harvest_year),
        arrival_date: form.arrival_date,
        arrival_weight_g,
        storage_location: form.storage_location,
      };
      if (form.moisture_content) payload.moisture_content = parseFloat(form.moisture_content);
      if (form.water_activity)   payload.water_activity   = parseFloat(form.water_activity);
      if (form.supplier_notes)   payload.supplier_notes   = form.supplier_notes;

      const res = await api.post('/lots', payload);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || data.errors?.[0]?.msg || 'Failed to create lot.');
        return;
      }
      onCreated();
    } catch {
      setError('Failed to create lot.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 z-50 overflow-y-auto"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-coffee-900">Add New Lot</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-coffee-700 mb-1">Lot Code *</label>
              <input
                value={form.lot_code} onChange={field('lot_code')} required
                placeholder="e.g. W-2024-001"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-coffee-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-coffee-700 mb-1">Process *</label>
              <select
                value={form.process} onChange={field('process')}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-coffee-300"
              >
                {PROCESSES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-coffee-700 mb-1">Estate *</label>
            <input
              value={form.estate} onChange={field('estate')} required
              placeholder="Estate name"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-coffee-700 mb-1">Harvest Year *</label>
              <input
                type="number" min="2000" max="2100"
                value={form.harvest_year} onChange={field('harvest_year')} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-coffee-700 mb-1">Arrival Date *</label>
              <input
                type="date"
                value={form.arrival_date} onChange={field('arrival_date')} required
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-coffee-700 mb-1">Arrival Weight (kg) *</label>
              <input
                type="number" step="0.001" min="0.001"
                value={form.arrival_weight_kg} onChange={field('arrival_weight_kg')} required
                placeholder="e.g. 60.000"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-coffee-700 mb-1">Storage Location *</label>
              <input
                value={form.storage_location} onChange={field('storage_location')} required
                placeholder="e.g. Rack A-3"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-coffee-500 mb-1">Moisture Content (%)</label>
              <input
                type="number" step="0.01" min="0" max="100"
                value={form.moisture_content} onChange={field('moisture_content')}
                placeholder="Optional"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-300"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-coffee-500 mb-1">Water Activity (0–1)</label>
              <input
                type="number" step="0.001" min="0" max="1"
                value={form.water_activity} onChange={field('water_activity')}
                placeholder="Optional"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-coffee-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-coffee-500 mb-1">Supplier Notes</label>
            <textarea
              value={form.supplier_notes} onChange={field('supplier_notes')} rows={2}
              placeholder="Optional"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-coffee-300"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button" onClick={onClose}
              className="flex-1 border border-gray-200 text-coffee-700 py-2 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={loading}
              className="flex-1 bg-coffee-700 text-white py-2 rounded-lg hover:bg-coffee-800 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {loading ? 'Creating…' : 'Create Lot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
