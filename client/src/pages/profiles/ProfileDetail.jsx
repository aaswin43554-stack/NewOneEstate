import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, StatusBadge, PanelField } from '../../components/ui';

const TZ = 'Asia/Vientiane';

const STATUS_MAP = {
  development:      { status: 'draft',        label: 'Development' },
  pending_approval: { status: 'under_review',  label: 'Pending Approval' },
  approved:         { status: 'active',        label: 'Approved' },
  retired:          { status: 'archived',      label: 'Retired' },
};

function fmtMSS(sec) {
  if (!sec) return '—';
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium' });
}

export default function ProfileDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [profile,      setProfile]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [toast,        setToast]        = useState('');
  const [approving,    setApproving]    = useState(false);
  const [approveModal, setApproveModal] = useState(false);
  const [retireModal,  setRetireModal]  = useState(false);
  const [retiring,     setRetiring]     = useState(false);

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
    if (res.ok) { setApproveModal(false); load(); }
    setApproving(false);
  }

  async function retire() {
    setRetiring(true);
    const res = await api.post(`/profiles/${id}/retire`, {});
    if (res.ok) { setRetireModal(false); setToast('Profile retired to archive.'); load(); }
    setRetiring(false);
  }

  if (loading) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;
  if (!profile) return <Layout><div className="px-6 py-6 text-sm" style={{ color: '#A32D2D' }}>Profile not found.</div></Layout>;

  const isAdmin  = user?.role === 'admin';
  const isEditor = ['admin', 'roaster'].includes(user?.role);
  const badgeMeta = STATUS_MAP[profile.status] || STATUS_MAP.development;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
        {toast && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#EAF3DE', color: '#3B6D11' }}>
            {toast}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3">
          <h1 className="text-xl text-coffee-900" style={{ fontWeight: 500 }}>
            {profile.process} {profile.harvest_year}
          </h1>
          <StatusBadge status={badgeMeta.status} label={badgeMeta.label} />
        </div>

        {profile.parent_profile && (
          <p className="text-sm text-coffee-400">
            Based on:{' '}
            <Link to={`/profiles/${profile.parent_profile.id}`} className="text-coffee-600 hover:text-coffee-800">
              {profile.parent_profile.process} {profile.parent_profile.harvest_year}
            </Link>
          </p>
        )}

        {/* Parameters */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <p className="text-xs text-coffee-400 uppercase tracking-wide mb-4">Parameters</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <PanelField label="Estate"      value={profile.estate} />
            <PanelField label="Charge Temp" value={`${profile.charge_temp_c}°C`} />
            <PanelField label="Eject Temp"  value={`${profile.eject_temp_c}°C`} />
            <PanelField label="Target DTR"  value={`${profile.target_dtr}%`} />
            <PanelField label="Total Time"  value={fmtMSS(profile.total_time_target_s)} />
          </div>
          {profile.flavour_target && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid #F2EAE0' }}>
              <p className="text-xs text-coffee-400 uppercase tracking-wide mb-1">Flavour Target</p>
              <p className="text-sm text-coffee-700">{profile.flavour_target}</p>
            </div>
          )}
        </div>

        {/* Workflow */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Workflow</p>
          <div className="flex flex-wrap items-center gap-3">
            {profile.status === 'development' && isEditor && (
              <>
                <Button onClick={submit} style={{ background: '#BA7517', color: '#fff' }}>
                  Submit for Approval
                </Button>
                <Button variant="secondary" onClick={() => navigate(`/profiles/${id}/edit`)}>
                  Edit
                </Button>
              </>
            )}

            {profile.status === 'pending_approval' && isAdmin && (
              <Button onClick={() => setApproveModal(true)} style={{ background: '#3B6D11', color: '#fff' }}>
                Approve Profile
              </Button>
            )}

            {profile.status === 'approved' && (
              <div className="space-y-3">
                <p className="text-sm text-coffee-600">
                  Approved by {profile.approved_by_name} on {fmtDate(profile.approved_at)}
                </p>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => navigate(`/profiles/new?from=${id}`)}>
                    Duplicate for Next Harvest
                  </Button>
                  {isAdmin && (
                    <Button variant="destructive" onClick={() => setRetireModal(true)}>
                      Retire to Archive
                    </Button>
                  )}
                </div>
              </div>
            )}

            {profile.status === 'retired' && (
              <div>
                <p className="text-sm text-coffee-400 mb-3">This profile has been retired.</p>
                <Button variant="secondary" onClick={() => navigate(`/profiles/new?from=${id}`)}>
                  Duplicate as New Development
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Approve modal */}
      {approveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(34,21,8,0.2)' }}>
          <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-sm p-6">
            <h2 className="text-base text-coffee-900 mb-2" style={{ fontWeight: 500 }}>Approve Profile</h2>
            <p className="text-sm text-coffee-600 mb-5">
              This profile will become active. Multiple approved profiles can be active at the same time.
            </p>
            <div className="flex gap-3">
              <Button onClick={approve} disabled={approving} className="flex-1 justify-center"
                style={{ background: '#3B6D11', color: '#fff' }}>
                {approving ? 'Approving…' : 'Approve'}
              </Button>
              <Button variant="secondary" onClick={() => setApproveModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Retire modal */}
      {retireModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(34,21,8,0.2)' }}>
          <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-sm p-6">
            <h2 className="text-base text-coffee-900 mb-2" style={{ fontWeight: 500 }}>Retire Profile</h2>
            <p className="text-sm text-coffee-600 mb-5">
              This profile will be moved to the archive and will no longer be used for variance checks.
            </p>
            <div className="flex gap-3">
              <Button onClick={retire} disabled={retiring} className="flex-1 justify-center" variant="destructive">
                {retiring ? 'Retiring…' : 'Retire to Archive'}
              </Button>
              <Button variant="secondary" onClick={() => setRetireModal(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
