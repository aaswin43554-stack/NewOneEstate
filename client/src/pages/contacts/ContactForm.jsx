import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const SEGMENTS = ['Laos', 'Thailand', 'Malaysia', 'Singapore', 'Other'];
const STATUSES = ['prospect', 'active_buyer', 'private_list', 'trade_account'];

function statusLabel(s) {
  return (
    { prospect: 'Prospect', active_buyer: 'Active Buyer', private_list: 'Private List', trade_account: 'Trade Account' }[s] || s
  );
}

const EMPTY = {
  name: '',
  primary_contact_method: '',
  location: '',
  market_segment: 'Laos',
  preferred_channel: '',
  status: 'prospect',
  personal_notes: '',
};

export default function ContactForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/contacts/${id}`)
      .then(r => r.json())
      .then(d => {
        const c = d.contact;
        setForm({
          name:                   c.name || '',
          primary_contact_method: c.primary_contact_method || '',
          location:               c.location || '',
          market_segment:         c.market_segment || 'Laos',
          preferred_channel:      c.preferred_channel || '',
          status:                 c.status || 'prospect',
          personal_notes:         c.personal_notes || '',
        });
      })
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  function field(key) {
    return e => setForm(f => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = isEdit
        ? await api.put(`/contacts/${id}`, form)
        : await api.post('/contacts', form);
      if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed.'); return; }
      const d = await res.json();
      navigate(`/contacts/${isEdit ? id : d.contact.id}`);
    } catch {
      setError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Layout><div className="p-6 text-coffee-600">Loading…</div></Layout>;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-coffee-900 mb-6">
          {isEdit ? 'Edit Contact' : 'New Contact'}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              onChange={field('name')}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">
              Primary Contact Method <span className="text-red-500">*</span>
            </label>
            <input
              value={form.primary_contact_method}
              onChange={field('primary_contact_method')}
              placeholder="WhatsApp number, @handle, email…"
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">Location</label>
            <input
              value={form.location}
              onChange={field('location')}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">
              Market Segment <span className="text-red-500">*</span>
            </label>
            <select
              value={form.market_segment}
              onChange={field('market_segment')}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
              required
            >
              {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">Preferred Channel</label>
            <input
              value={form.preferred_channel}
              onChange={field('preferred_channel')}
              placeholder="e.g. WhatsApp, Instagram, email…"
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">
              Status <span className="text-red-500">*</span>
            </label>
            <select
              value={form.status}
              onChange={field('status')}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
              required
            >
              {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">Personal Notes</label>
            <textarea
              value={form.personal_notes}
              onChange={field('personal_notes')}
              rows={6}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm resize-y"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-coffee-700 text-white rounded-md font-semibold hover:bg-coffee-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Contact'}
            </button>
            <button
              type="button"
              onClick={() => navigate(isEdit ? `/contacts/${id}` : '/contacts')}
              className="px-5 py-3 bg-gray-200 text-gray-700 rounded-md font-semibold hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
