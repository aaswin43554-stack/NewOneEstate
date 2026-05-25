import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, FormInput, FormSelect, FormTextarea, PageHeader } from '../../components/ui';

const SEGMENTS = ['Laos', 'Thailand', 'Malaysia', 'Singapore', 'Other'];
const STATUSES = ['prospect', 'active_buyer', 'private_list', 'trade_account'];

function statusLabel(s) {
  return (
    { prospect: 'Prospect', active_buyer: 'Active Buyer', private_list: 'Private List', trade_account: 'Trade Account' }[s] || s
  );
}

const EMPTY = {
  name: '', primary_contact_method: '', location: '',
  market_segment: 'Laos', preferred_channel: '',
  status: 'prospect', personal_notes: '',
};

export default function ContactForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form,    setForm]    = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

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

  if (loading) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-6 py-6">
        <PageHeader title={isEdit ? 'Edit Contact' : 'New Contact'} />

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormInput
            label="Name"
            value={form.name}
            onChange={field('name')}
            required
          />

          <FormInput
            label="Primary Contact Method"
            value={form.primary_contact_method}
            onChange={field('primary_contact_method')}
            placeholder="WhatsApp number, @handle, email…"
            required
          />

          <FormInput
            label="Location"
            value={form.location}
            onChange={field('location')}
          />

          <FormSelect
            label="Market Segment"
            value={form.market_segment}
            onChange={field('market_segment')}
            required
          >
            {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
          </FormSelect>

          <FormInput
            label="Preferred Channel"
            value={form.preferred_channel}
            onChange={field('preferred_channel')}
            placeholder="e.g. WhatsApp, Instagram, email…"
          />

          <FormSelect
            label="Status"
            value={form.status}
            onChange={field('status')}
            required
          >
            {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </FormSelect>

          <FormTextarea
            label="Personal Notes"
            value={form.personal_notes}
            onChange={field('personal_notes')}
            rows={5}
          />

          {error && (
            <p className="text-xs" style={{ color: '#A32D2D' }}>{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={saving} className="flex-1 justify-center" size="lg">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Contact'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => navigate(isEdit ? `/contacts/${id}` : '/contacts')}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
