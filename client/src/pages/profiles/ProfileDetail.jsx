import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const TZ = 'Asia/Vientiane';

const STATUS_STYLES = {
  development:      'bg-gray-100 text-gray-600',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved:         'bg-green-100 text-green-700',
  retired:          'bg-red-50 text-red-400',
};

function fmtMSS(sec) {
  if (!sec) return '—';
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium' });
}

export default function ProfileDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate  = useNavigate();

  const [profile,  setProfile]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState('');
  const [approving,setApproving]= useState(false);
  const [approveModal, setApproveModal] = useState(false);

  function load() {
    setLoading(true);
    api.get(`/profiles/${id}`).then(r => r.json())
      .then(d => setProfile(d.profile))
      .finally(() => setLoading(false));
  }
  useEffect(load, [id]);

  async function submit() {
    await api.post(`/profiles/${id}/submit`, {});
    load();
  }

  async function approve() {
    setApproving(true);
    const res = await api.post(`/profiles/${id}/approve`, {});
    const d   = await res.json();
    if (res.ok) {
      if (d.retired_previous) setToast('Previous profile retired.');
      setApproveModal(false);
      load();
    }
    setApproving(false);
  }

  if (loading) return <Layout><div className="p-6 text-coffee-600">Loading…</div></Layout>;
  if (!profile) return <Layout><div className="p-6 text-red-600">Profile not found.</div></Layout>;

  const isAdmin  = user?.role === 'admin';
  const isEditor = ['admin','roaster'].includes(user?.role);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-4 space-y-5">
        {toast && (
          <div className="bg-green-50 border border-green-300 text-green-800 rounded-md px-4 py-3 text-sm">
            {toast}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-coffee-900">{profile.process} {profile.harvest_year}</h1>
          <span className={`text-xs px-2 py-1 rounded capitalize font-medium ${STATUS_STYLES[profile.status]}`}>
            {profile.status.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Parent link */}
        {profile.parent_profile && (
          <div className="text-sm text-coffee-500">
            Based on:{' '}
            <Link to={`/profiles/${profile.parent_profile.id}`} className="text-coffee-700 hover:underline">
              {profile.parent_profile.process} {profile.parent_profile.harvest_year}
            </Link>
          </div>
        )}

        {/* Profile details */}
        <div className="bg-white border border-coffee-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-coffee-700 mb-3">Parameters</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              ['Estate', profile.estate],
              ['Charge Temp', `${profile.charge_temp_c}°C`],
              ['Eject Temp', `${profile.eject_temp_c}°C`],
              ['Target DTR', `${profile.target_dtr}%`],
              ['Total Time', fmtMSS(profile.total_time_target_s)],
            ].map(([label, value]) => (
              <div key={label} className="border border-coffee-100 rounded p-2">
                <div className="text-xs text-coffee-400">{label}</div>
                <div className="text-sm font-semibold text-coffee-900">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <div className="text-xs text-coffee-400 mb-1">Flavour Target</div>
            <p className="text-sm text-coffee-800">{profile.flavour_target}</p>
          </div>
        </div>

        {/* Status workflow */}
        <div className="bg-white border border-coffee-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-coffee-700 mb-3">Workflow</h2>

          {profile.status === 'development' && isEditor && (
            <button onClick={submit}
              className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm font-semibold hover:bg-amber-700">
              Submit for Approval
            </button>
          )}

          {profile.status === 'pending_approval' && isAdmin && (
            <button onClick={() => setApproveModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-semibold hover:bg-green-700">
              Approve Profile
            </button>
          )}

          {profile.status === 'approved' && (
            <div>
              <p className="text-sm text-coffee-700 mb-2">
                Approved by {profile.approved_by_name} on {fmtDate(profile.approved_at)}
              </p>
              <button onClick={() => navigate(`/profiles/new?from=${id}`)}
                className="px-4 py-2 bg-coffee-700 text-white rounded-md text-sm font-semibold hover:bg-coffee-800">
                Duplicate for Next Harvest
              </button>
            </div>
          )}

          {profile.status === 'retired' && (
            <div>
              <p className="text-sm text-coffee-400 mb-2">This profile has been retired.</p>
              <button onClick={() => navigate(`/profiles/new?from=${id}`)}
                className="px-4 py-2 bg-coffee-600 text-white rounded-md text-sm font-semibold hover:bg-coffee-700">
                Duplicate as New Development
              </button>
            </div>
          )}

          {profile.status === 'development' && isEditor && (
            <button onClick={() => navigate(`/profiles/${id}/edit`)}
              className="ml-3 px-4 py-2 border border-coffee-300 text-coffee-700 rounded-md text-sm font-semibold hover:bg-coffee-50">
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Approve modal */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-coffee-900 mb-2">Approve Profile</h2>
            <p className="text-sm text-coffee-700 mb-5">
              Approving this will retire the current approved {profile.process} profile if one exists.
            </p>
            <div className="flex gap-3">
              <button onClick={approve} disabled={approving}
                className="flex-1 py-2 bg-green-600 text-white rounded font-semibold text-sm disabled:opacity-50">
                {approving ? 'Approving…' : 'Approve'}
              </button>
              <button onClick={() => setApproveModal(false)} className="px-4 py-2 bg-gray-200 rounded text-sm font-semibold">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
