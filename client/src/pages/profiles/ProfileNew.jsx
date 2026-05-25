import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, FormInput, FormSelect, FormTextarea, PageHeader } from '../../components/ui';

const PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];

function mssToSec(str) {
  const [m, s] = (str || '').split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}
function secToMSS(sec) {
  if (!sec) return '';
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

export default function ProfileNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromId = params.get('from');

  const [source, setSource] = useState(null);
  const [form, setForm] = useState({
    estate: '', process: 'Washed', harvest_year: new Date().getFullYear(),
    charge_temp_c: '', target_dtr: '', eject_temp_c: '',
    total_time_mss: '', flavour_target: '',
  });
  const [error,  setError]  = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!fromId) return;
    api.get(`/profiles/${fromId}`)
      .then(r => r.json())
      .then(({ profile }) => {
        setSource(profile);
        setForm({
          estate: profile.estate,
          process: profile.process,
          harvest_year: profile.harvest_year + 1,
          charge_temp_c: profile.charge_temp_c,
          target_dtr: profile.target_dtr,
          eject_temp_c: profile.eject_temp_c,
          total_time_mss: secToMSS(profile.total_time_target_s),
          flavour_target: profile.flavour_target,
        });
      })
      .catch(() => {});
  }, [fromId]);

  function set(key, val) { setForm(p => ({ ...p, [key]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const totalS = mssToSec(form.total_time_mss);
    if (!totalS) { setError('Total time is required.'); return; }
    setSaving(true);
    try {
      const body = {
        estate: form.estate, process: form.process, harvest_year: parseInt(form.harvest_year),
        charge_temp_c: parseInt(form.charge_temp_c), target_dtr: parseFloat(form.target_dtr),
        eject_temp_c: parseInt(form.eject_temp_c), total_time_target_s: totalS,
        flavour_target: form.flavour_target,
      };
      const res = await api.post('/profiles', body);
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Failed.'); return; }
      navigate(`/profiles/${d.profile.id}`);
    } catch { setError('Network error.'); }
    finally { setSaving(false); }
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-6 py-6">
        <PageHeader title="New Roast Profile" />

        {source && (
          <div
            className="px-4 py-3 rounded-xl text-sm mb-5"
            style={{ background: '#FAEEDA', color: '#BA7517' }}
          >
            Duplicated from {source.process} {source.harvest_year} — review before submitting.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormInput
            label="Estate"
            value={form.estate}
            onChange={e => set('estate', e.target.value)}
            required
          />

          <div className="grid grid-cols-2 gap-4">
            <FormSelect
              label="Process"
              value={form.process}
              onChange={e => set('process', e.target.value)}
              required
            >
              {PROCESSES.map(p => <option key={p}>{p}</option>)}
            </FormSelect>

            <FormInput
              label="Harvest Year"
              type="number"
              value={form.harvest_year}
              onChange={e => set('harvest_year', e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <FormInput
              label="Charge °C"
              type="number"
              value={form.charge_temp_c}
              onChange={e => set('charge_temp_c', e.target.value)}
              required
            />
            <FormInput
              label="Eject °C"
              type="number"
              value={form.eject_temp_c}
              onChange={e => set('eject_temp_c', e.target.value)}
              required
            />
            <FormInput
              label="DTR %"
              type="number"
              step="0.01"
              value={form.target_dtr}
              onChange={e => set('target_dtr', e.target.value)}
              required
            />
          </div>

          <FormInput
            label="Total Time (MM:SS)"
            type="text"
            value={form.total_time_mss}
            onChange={e => set('total_time_mss', e.target.value)}
            placeholder="09:30"
            pattern="\d{1,2}:\d{2}"
            className="font-mono"
            required
          />

          <FormTextarea
            label="Flavour Target"
            value={form.flavour_target}
            onChange={e => set('flavour_target', e.target.value)}
            rows={3}
            placeholder="e.g. Stone fruit, caramel sweetness, bright acidity…"
            required
          />

          {error && (
            <p className="text-xs" style={{ color: '#A32D2D' }}>{error}</p>
          )}

          <Button type="submit" disabled={saving} className="w-full justify-center" size="lg">
            {saving ? 'Creating…' : 'Create Profile'}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
