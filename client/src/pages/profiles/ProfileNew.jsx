import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];

function mssToSec(str) {
  const [m, s] = (str || '').split(':').map(Number);
  return (m||0)*60 + (s||0);
}
function secToMSS(sec) {
  if (!sec) return '';
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}

export default function ProfileNew() {
  const navigate   = useNavigate();
  const [params]   = useSearchParams();
  const fromId     = params.get('from');
  const isEdit     = false;

  const [source,   setSource]  = useState(null);
  const [form, setForm]        = useState({
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
      <div className="max-w-lg mx-auto p-4">
        <h1 className="text-2xl font-bold text-coffee-900 mb-2">New Profile</h1>
        {source && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5 text-sm text-amber-800">
            Duplicated from {source.process} {source.harvest_year} — review before submitting.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: 'Estate', key: 'estate', type: 'text', required: true },
          ].map(({ label, key, type, required }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-coffee-800 mb-1">{label} {required && <span className="text-red-500">*</span>}</label>
              <input type={type} value={form[key]} onChange={e => set(key, e.target.value)}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm" required={required} />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">Process <span className="text-red-500">*</span></label>
              <select value={form.process} onChange={e => set('process', e.target.value)}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm">
                {PROCESSES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">Harvest Year <span className="text-red-500">*</span></label>
              <input type="number" value={form.harvest_year} onChange={e => set('harvest_year', e.target.value)}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm" required />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">Charge °C</label>
              <input type="number" value={form.charge_temp_c} onChange={e => set('charge_temp_c', e.target.value)}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">Eject °C</label>
              <input type="number" value={form.eject_temp_c} onChange={e => set('eject_temp_c', e.target.value)}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">Target DTR %</label>
              <input type="number" step="0.01" value={form.target_dtr} onChange={e => set('target_dtr', e.target.value)}
                className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">Total Time Target (MM:SS)</label>
            <input type="text" value={form.total_time_mss} onChange={e => set('total_time_mss', e.target.value)}
              placeholder="09:30" pattern="\d{1,2}:\d{2}"
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm font-mono" required />
          </div>

          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">Flavour Target</label>
            <textarea value={form.flavour_target} onChange={e => set('flavour_target', e.target.value)}
              rows={3} className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm"
              placeholder="e.g. Stone fruit, caramel sweetness, bright acidity…" required />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full py-3 bg-coffee-700 text-white rounded-md font-semibold hover:bg-coffee-800 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Profile'}
          </button>
        </form>
      </div>
    </Layout>
  );
}
