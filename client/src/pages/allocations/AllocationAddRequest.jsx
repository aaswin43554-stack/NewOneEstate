import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';

const CHANNELS = ['WhatsApp', 'Instagram', 'Website', 'In_Person', 'Other'];
const CHANNEL_LABELS = { In_Person: 'In Person' };

export default function AllocationAddRequest() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    contact_name: '', contact_method: '', channel: '', quantity_bags: 1, notes: '',
  });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState(null);

  function set(key, val) { setForm(p => ({ ...p, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.contact_name || !form.contact_method || !form.channel) {
      setError('Please fill in all fields.'); return;
    }
    setSaving(true); setError('');
    const res = await api.post(`/allocations/${id}/requests`, form);
    const d   = await res.json();
    if (res.ok) {
      setSuccess({ name: form.contact_name, bags: form.quantity_bags });
    } else {
      setError(d.error || 'Failed to add request.');
    }
    setSaving(false);
  }

  function reset() {
    setForm({ contact_name:'', contact_method:'', channel:'', quantity_bags:1, notes:'' });
    setSuccess(null);
    setError('');
  }

  if (success) {
    return (
      <div className="min-h-screen bg-coffee-50 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="text-5xl mb-4">✓</div>
          <h2 className="text-xl font-bold text-coffee-900 mb-1">Request added!</h2>
          <p className="text-coffee-600 mb-8">
            {success.name} · {success.bags} bag{success.bags !== 1 ? 's' : ''}
          </p>
          <div className="flex flex-col gap-3">
            <button onClick={reset}
              className="w-full py-4 bg-coffee-700 text-white rounded-xl font-semibold text-lg">
              Add Another
            </button>
            <button onClick={() => navigate(`/allocations/${id}`)}
              className="w-full py-4 bg-white border border-coffee-300 text-coffee-700 rounded-xl font-semibold text-lg">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-coffee-50 flex flex-col">
      {/* Header */}
      <div className="bg-coffee-900 text-white px-5 py-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-coffee-300 hover:text-white">←</button>
        <h1 className="text-lg font-bold">Add Request</h1>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 px-5 pt-6 pb-28 space-y-5">
        {/* Contact name */}
        <div>
          <label className="block text-base font-semibold text-coffee-800 mb-2">Contact Name</label>
          <input value={form.contact_name}
            onChange={e => set('contact_name', e.target.value)}
            placeholder="Full name"
            className="w-full text-lg border-2 border-coffee-300 rounded-xl px-4 py-4 focus:border-coffee-600 outline-none"
            required />
        </div>

        {/* Contact method */}
        <div>
          <label className="block text-base font-semibold text-coffee-800 mb-2">Contact Method</label>
          <input value={form.contact_method}
            onChange={e => set('contact_method', e.target.value)}
            placeholder="WhatsApp number, @handle, email…"
            className="w-full text-lg border-2 border-coffee-300 rounded-xl px-4 py-4 focus:border-coffee-600 outline-none"
            required />
        </div>

        {/* Channel */}
        <div>
          <label className="block text-base font-semibold text-coffee-800 mb-2">Channel</label>
          <div className="grid grid-cols-2 gap-3">
            {CHANNELS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => set('channel', c)}
                className={`py-4 rounded-xl text-base font-semibold border-2 transition-colors ${
                  form.channel === c
                    ? 'bg-coffee-700 text-white border-coffee-700'
                    : 'bg-white text-coffee-700 border-coffee-200 hover:border-coffee-400'
                }`}
              >
                {CHANNEL_LABELS[c] || c}
              </button>
            ))}
          </div>
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-base font-semibold text-coffee-800 mb-2">Bags</label>
          <div className="flex items-center gap-4">
            <button type="button"
              onClick={() => set('quantity_bags', Math.max(1, form.quantity_bags - 1))}
              className="w-14 h-14 rounded-xl bg-coffee-100 text-2xl font-bold text-coffee-700 flex items-center justify-center">
              −
            </button>
            <span className="text-4xl font-bold text-coffee-900 w-16 text-center">{form.quantity_bags}</span>
            <button type="button"
              onClick={() => set('quantity_bags', form.quantity_bags + 1)}
              className="w-14 h-14 rounded-xl bg-coffee-100 text-2xl font-bold text-coffee-700 flex items-center justify-center">
              +
            </button>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>

      {/* Pinned submit button */}
      <div className="fixed bottom-0 left-0 right-0 px-5 pb-8 pt-3 bg-coffee-50 border-t border-coffee-200">
        <button onClick={handleSubmit} disabled={saving}
          className="w-full py-5 bg-coffee-700 text-white rounded-xl text-xl font-bold disabled:opacity-50">
          {saving ? 'Adding…' : 'Add Request'}
        </button>
      </div>
    </div>
  );
}
