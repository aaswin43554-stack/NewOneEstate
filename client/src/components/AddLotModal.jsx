import { useState } from 'react';
import { api } from '../lib/api';
import { Button, FormInput, FormSelect } from './ui';
import { X } from 'lucide-react';

const PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];
const INIT = {
  lot_code: '', estate: '', process: 'Washed',
  harvest_year: String(new Date().getFullYear()),
  arrival_date: new Date().toISOString().split('T')[0],
  arrival_weight_kg: '', storage_location: '',
  moisture_content: '', water_activity: '', supplier_notes: '',
};

export default function AddLotModal({ onClose, onCreated }) {
  const [form,    setForm]    = useState(INIT);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  function field(key) {
    return (e) => setForm(f => ({ ...f, [key]: e.target.value }));
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
        lot_code: form.lot_code, estate: form.estate, process: form.process,
        harvest_year: parseInt(form.harvest_year), arrival_date: form.arrival_date,
        arrival_weight_g, storage_location: form.storage_location,
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
      className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
      style={{ background: 'rgba(34,21,8,0.2)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-lg my-8">
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid #F2EAE0' }}
        >
          <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>
            Add New Lot
          </h2>
          <button
            onClick={onClose}
            className="text-coffee-400 hover:text-coffee-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div
              className="px-3 py-2.5 rounded-lg text-sm"
              style={{ background: '#FCEBEB', color: '#A32D2D' }}
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Lot Code"
              value={form.lot_code}
              onChange={field('lot_code')}
              placeholder="e.g. W-2024-001"
              required
              className="font-mono"
            />
            <FormSelect
              label="Process"
              value={form.process}
              onChange={field('process')}
            >
              {PROCESSES.map(p => <option key={p}>{p}</option>)}
            </FormSelect>
          </div>

          <FormInput
            label="Estate"
            value={form.estate}
            onChange={field('estate')}
            placeholder="Estate name"
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Harvest Year"
              type="number" min="2000" max="2100"
              value={form.harvest_year}
              onChange={field('harvest_year')}
              required
            />
            <FormInput
              label="Arrival Date"
              type="date"
              value={form.arrival_date}
              onChange={field('arrival_date')}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Arrival Weight (kg)"
              type="number" step="0.001" min="0.001"
              value={form.arrival_weight_kg}
              onChange={field('arrival_weight_kg')}
              placeholder="e.g. 60.000"
              required
            />
            <FormInput
              label="Storage Location"
              value={form.storage_location}
              onChange={field('storage_location')}
              placeholder="e.g. Rack A-3"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Moisture Content (%)"
              type="number" step="0.01" min="0" max="100"
              value={form.moisture_content}
              onChange={field('moisture_content')}
              placeholder="Optional"
            />
            <FormInput
              label="Water Activity (0–1)"
              type="number" step="0.001" min="0" max="1"
              value={form.water_activity}
              onChange={field('water_activity')}
              placeholder="Optional"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-coffee-600" style={{ fontWeight: 500 }}>
              Supplier Notes
            </label>
            <textarea
              value={form.supplier_notes}
              onChange={field('supplier_notes')}
              rows={2}
              placeholder="Optional"
              className="px-3 py-2 text-sm border border-coffee-200 rounded-lg focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1 justify-center">
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={loading} className="flex-1 justify-center">
              {loading ? 'Creating…' : 'Create Lot'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
