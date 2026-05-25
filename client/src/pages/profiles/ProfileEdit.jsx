import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, FormInput, FormTextarea, StatusBadge, PageHeader } from '../../components/ui';

function mssToSec(str) {
  const [m, s] = (str || '').split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}
function secToMSS(sec) {
  if (!sec) return '';
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

const STATUS_MAP = {
  development:      'draft',
  pending_approval: 'under_review',
  approved:         'active',
  retired:          'archived',
};

export default function ProfileEdit() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/profiles/${id}`).then(r => r.json()).then(({ profile: p }) => {
      setProfile(p);
      setForm({
        estate: p.estate, charge_temp_c: p.charge_temp_c, target_dtr: p.target_dtr,
        eject_temp_c: p.eject_temp_c, total_time_mss: secToMSS(p.total_time_target_s),
        flavour_target: p.flavour_target,
      });
    });
  }, [id]);

  function set(key, val) { setForm(p => ({ ...p, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const totalS = mssToSec(form.total_time_mss);
    if (!totalS) { setError('Total time is required.'); return; }
    setSaving(true);
    const res = await api.put(`/profiles/${id}`, {
      estate: form.estate, charge_temp_c: parseInt(form.charge_temp_c),
      target_dtr: parseFloat(form.target_dtr), eject_temp_c: parseInt(form.eject_temp_c),
      total_time_target_s: totalS, flavour_target: form.flavour_target,
    });
    const d = await res.json();
    if (res.ok) { navigate(`/profiles/${id}`); }
    else { setError(d.error || 'Failed.'); }
    setSaving(false);
  }

  if (!form) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;

  const locked = profile.status !== 'development';

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-xl text-coffee-900" style={{ fontWeight: 500 }}>Edit Profile</h1>
          <StatusBadge status={STATUS_MAP[profile.status] || 'draft'} label={profile.status.replace(/_/g, ' ')} />
        </div>

        {locked && (
          <div
            className="px-4 py-3 rounded-xl text-sm mb-5"
            style={{ background: '#FAEEDA', color: '#BA7517' }}
          >
            Only development profiles can be modified.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormInput
            label="Estate"
            value={form.estate}
            onChange={e => set('estate', e.target.value)}
            disabled={locked}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-coffee-600" style={{ fontWeight: 500 }}>Process</label>
              <div
                className="h-9 px-3 flex items-center text-sm text-coffee-500 rounded-lg border border-coffee-200"
                style={{ background: '#FAF6F0' }}
              >
                {profile.process}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-coffee-600" style={{ fontWeight: 500 }}>Harvest Year</label>
              <div
                className="h-9 px-3 flex items-center text-sm text-coffee-500 rounded-lg border border-coffee-200"
                style={{ background: '#FAF6F0' }}
              >
                {profile.harvest_year}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'charge_temp_c', label: 'Charge °C', type: 'number' },
              { key: 'eject_temp_c',  label: 'Eject °C',  type: 'number' },
              { key: 'target_dtr',    label: 'DTR %',     type: 'number', step: '0.01' },
            ].map(({ key, label, type, step }) => (
              <FormInput
                key={key}
                label={label}
                type={type}
                step={step}
                value={form[key]}
                onChange={e => set(key, e.target.value)}
                disabled={locked}
                required
              />
            ))}
          </div>

          <FormInput
            label="Total Time (MM:SS)"
            type="text"
            value={form.total_time_mss}
            onChange={e => set('total_time_mss', e.target.value)}
            disabled={locked}
            placeholder="09:30"
            pattern="\d{1,2}:\d{2}"
            className="font-mono"
            required
          />

          <FormTextarea
            label="Flavour Target"
            value={form.flavour_target}
            onChange={e => set('flavour_target', e.target.value)}
            disabled={locked}
            rows={3}
            required
          />

          {error && (
            <p className="text-xs" style={{ color: '#A32D2D' }}>{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={saving || locked} className="flex-1 justify-center" size="lg">
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(`/profiles/${id}`)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
