import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

function mssToSec(str) {
  const [m, s] = (str || '').split(':').map(Number);
  return (m||0)*60 + (s||0);
}
function secToMSS(sec) {
  if (!sec) return '';
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}

const STATUS_STYLES = {
  development:'bg-gray-100 text-gray-600', pending_approval:'bg-amber-100 text-amber-700',
  approved:'bg-green-100 text-green-700', retired:'bg-red-50 text-red-400',
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
    e.preventDefault(); setError('');
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

  if (!form) return <Layout><div className="p-6 text-coffee-600">Loading…</div></Layout>;

  const locked = profile.status !== 'development';

  return (
    <Layout>
      <div className="max-w-lg mx-auto p-4">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-2xl font-bold text-coffee-900">Edit Profile</h1>
          <span className={`text-xs px-2 py-1 rounded capitalize font-medium ${STATUS_STYLES[profile.status]}`}>
            {profile.status.replace(/_/g,' ')}
          </span>
        </div>

        {locked && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 mb-4 text-sm text-amber-800">
            This profile cannot be edited — only development profiles can be modified.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">Estate</label>
            <input value={form.estate} onChange={e => set('estate', e.target.value)} disabled={locked}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm disabled:bg-coffee-50" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">Process</label>
              <div className="border border-coffee-200 bg-coffee-50 rounded px-3 py-2 text-sm text-coffee-600">{profile.process}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-coffee-800 mb-1">Harvest Year</label>
              <div className="border border-coffee-200 bg-coffee-50 rounded px-3 py-2 text-sm text-coffee-600">{profile.harvest_year}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key:'charge_temp_c', label:'Charge °C', type:'number' },
              { key:'eject_temp_c',  label:'Eject °C',  type:'number' },
              { key:'target_dtr',    label:'DTR %',     type:'number', step:'0.01' },
            ].map(({ key, label, type, step }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-coffee-800 mb-1">{label}</label>
                <input type={type} step={step} value={form[key]} onChange={e => set(key, e.target.value)} disabled={locked}
                  className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm disabled:bg-coffee-50" required />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">Total Time (MM:SS)</label>
            <input type="text" value={form.total_time_mss} onChange={e => set('total_time_mss', e.target.value)}
              disabled={locked} placeholder="09:30" pattern="\d{1,2}:\d{2}"
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm font-mono disabled:bg-coffee-50" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-coffee-800 mb-1">Flavour Target</label>
            <textarea value={form.flavour_target} onChange={e => set('flavour_target', e.target.value)}
              disabled={locked} rows={3}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm disabled:bg-coffee-50" required />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={saving || locked}
              className="flex-1 py-3 bg-coffee-700 text-white rounded-md font-semibold hover:bg-coffee-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            <button type="button" onClick={() => navigate(`/profiles/${id}`)}
              className="px-4 py-3 bg-gray-200 rounded-md font-semibold">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
