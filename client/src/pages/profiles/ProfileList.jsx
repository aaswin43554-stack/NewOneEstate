import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PageHeader, Button, ProcessBadge } from '../../components/ui';

const TZ = 'Asia/Vientiane';

const STATUS_META = {
  development:      { cls: 'badge-draft',        label: 'Development' },
  pending_approval: { cls: 'badge-under-review', label: 'Pending Approval' },
  approved:         { cls: 'badge-published',    label: 'Approved' },
  retired:          { cls: 'badge-missing',      label: 'Retired' },
};

function fmtMSS(sec) {
  if (!sec) return '—';
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
}

// Generates a simplified mock sparkline for a profile based on charge/eject temps
function makeCurveData(profile) {
  const charge = profile.charge_temp_c || 180;
  const eject  = profile.eject_temp_c  || 210;
  const points = [];
  const totalS = profile.total_time_target_s || 600;
  const steps  = 12;
  for (let i = 0; i <= steps; i++) {
    const pct = i / steps;
    // Simplified S-curve: slow start, rapid middle, plateau at end
    const t = pct * pct * (3 - 2 * pct);
    points.push({ t: i, temp: charge + (eject - charge) * t });
  }
  return points;
}

function ProfileCard({ profile, onView, onEdit, onSubmit, onDuplicate, onRetire, onDelete, isEditor, isAdmin }) {
  const meta = STATUS_META[profile.status] || { cls: 'badge-draft', label: profile.status };
  const curveData = makeCurveData(profile);
  const isRetired = profile.status === 'retired';

  return (
    <div
      className="bg-white border border-coffee-200 rounded-xl p-5 transition-colors duration-150"
      style={{ opacity: isRetired ? 0.55 : 1 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm text-coffee-900" style={{ fontWeight: 500 }}>
            {profile.process} · {profile.harvest_year}
          </p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs mt-1 ${meta.cls}`}>
            {meta.label}
          </span>
        </div>
        {/* Sparkline */}
        <div style={{ width: 120, height: 40 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={curveData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line
                type="monotone"
                dataKey="temp"
                stroke="#EF9F27"
                dot={false}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-4 mb-3">
        <div>
          <p className="text-xs text-coffee-300 mb-0.5">Charge</p>
          <p className="text-sm text-coffee-700">{profile.charge_temp_c}°C</p>
        </div>
        <div>
          <p className="text-xs text-coffee-300 mb-0.5">Eject</p>
          <p className="text-sm text-coffee-700">{profile.eject_temp_c}°C</p>
        </div>
        <div>
          <p className="text-xs text-coffee-300 mb-0.5">Time</p>
          <p className="text-sm font-mono text-coffee-700">{fmtMSS(profile.total_time_target_s)}</p>
        </div>
        <div>
          <p className="text-xs text-coffee-300 mb-0.5">DTR</p>
          <p className="text-sm text-coffee-700">{profile.target_dtr}%</p>
        </div>
      </div>

      {/* Flavour target */}
      {profile.flavour_target && (
        <p className="text-xs text-coffee-400 mb-3 line-clamp-2 leading-relaxed">
          {profile.flavour_target}
        </p>
      )}

      {/* Approved by */}
      {profile.approved_by_name && (
        <p className="text-xs text-coffee-300 mb-3">
          Approved by {profile.approved_by_name} · {fmtDate(profile.approved_at)}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-1.5 pt-3 border-t border-coffee-100">
        <Button variant="ghost" size="sm" onClick={onView}>View</Button>
        {isEditor && profile.status === 'development' && (
          <Button variant="ghost" size="sm" onClick={onEdit}>Edit</Button>
        )}
        {isEditor && profile.status === 'development' && (
          <Button variant="ghost" size="sm" onClick={onSubmit}
            style={{ color: '#BA7517' }}>
            Submit
          </Button>
        )}
        {isAdmin && profile.status === 'pending_approval' && (
          <Button variant="ghost" size="sm" onClick={onView}
            style={{ color: '#3B6D11' }}>
            Approve
          </Button>
        )}
        {isAdmin && profile.status === 'approved' && (
          <Button variant="ghost" size="sm" onClick={onRetire}
            style={{ color: '#A32D2D' }}>
            Retire
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDuplicate}
          className="ml-auto">
          Duplicate
        </Button>
        {isAdmin && (
          <Button variant="ghost" size="sm" onClick={onDelete}
            style={{ color: '#A32D2D' }}>
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ProfileList() {
  const [profiles, setProfiles] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  function load() {
    setLoading(true);
    api.get('/profiles').then(r => r.json())
      .then(d => setProfiles(d.profiles || []))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const isAdmin  = user?.role === 'admin';
  const isEditor = ['admin', 'roaster'].includes(user?.role);

  const [retireConfirm, setRetireConfirm] = useState(null);
  const [retiring, setRetiring] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  async function submit(id) {
    await api.post(`/profiles/${id}/submit`, {});
    load();
  }

  async function retire(id) {
    setRetiring(true);
    await api.post(`/profiles/${id}/retire`, {});
    setRetireConfirm(null);
    setRetiring(false);
    load();
  }

  async function deleteProfile(id) {
    setDeleting(true);
    await api.delete(`/profiles/${id}`);
    setDeleteConfirm(null);
    setDeleting(false);
    load();
  }

  // Split active vs archived
  const active   = profiles.filter(p => p.status !== 'retired');
  const archived = profiles.filter(p => p.status === 'retired');

  // Group active by process
  const grouped = active.reduce((acc, p) => {
    const key = p.process;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  // Group archived by process
  const archivedGrouped = archived.reduce((acc, p) => {
    const key = p.process;
    if (!acc[key]) acc[key] = [];
    acc[key].push(p);
    return acc;
  }, {});

  const processOrder         = ['Washed', 'Honey', 'Natural', 'Anaerobic'].filter(p => grouped[p]);
  const archivedProcessOrder = ['Washed', 'Honey', 'Natural', 'Anaerobic'].filter(p => archivedGrouped[p]);

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-6">
        <PageHeader
          title="Roast Profiles"
          subtitle={`${profiles.length} profile${profiles.length !== 1 ? 's' : ''}`}
          actions={
            isEditor && (
              <Button variant="primary" onClick={() => navigate('/profiles/new')}>
                + New Profile
              </Button>
            )
          }
        />

        {loading ? (
          <p className="text-sm text-coffee-400">Loading…</p>
        ) : processOrder.length === 0 && archived.length === 0 ? (
          <p className="text-sm text-coffee-300 text-center py-16">
            No roast profiles yet.
          </p>
        ) : (
          <>
            {/* Active profiles */}
            {processOrder.map(process => (
              <div key={process} className="mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <ProcessBadge process={process} />
                  <div style={{ flex: 1, height: 1, background: '#E0D0BC' }} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grouped[process].map(p => (
                    <ProfileCard
                      key={p.id}
                      profile={p}
                      isEditor={isEditor}
                      isAdmin={isAdmin}
                      onView={() => navigate(`/profiles/${p.id}`)}
                      onEdit={() => navigate(`/profiles/${p.id}/edit`)}
                      onSubmit={() => submit(p.id)}
                      onRetire={() => setRetireConfirm(p.id)}
                      onDuplicate={() => navigate(`/profiles/new?from=${p.id}`)}
                      onDelete={() => setDeleteConfirm(p.id)}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Archive section */}
            {archived.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setArchiveOpen(v => !v)}
                  className="flex items-center gap-2 text-sm text-coffee-400 mb-4"
                  style={{ fontWeight: 500 }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      transform: archiveOpen ? 'rotate(90deg)' : 'rotate(0)',
                      transition: 'transform 150ms',
                      fontSize: 11,
                    }}
                  >▶</span>
                  Archive · {archived.length} retired profile{archived.length !== 1 ? 's' : ''}
                </button>

                {archiveOpen && archivedProcessOrder.map(process => (
                  <div key={process} className="mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <ProcessBadge process={process} />
                      <div style={{ flex: 1, height: 1, background: '#E0D0BC' }} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {archivedGrouped[process].map(p => (
                        <ProfileCard
                          key={p.id}
                          profile={p}
                          isEditor={isEditor}
                          isAdmin={isAdmin}
                          onView={() => navigate(`/profiles/${p.id}`)}
                          onEdit={() => {}}
                          onSubmit={() => {}}
                          onRetire={() => {}}
                          onDuplicate={() => navigate(`/profiles/new?from=${p.id}`)}
                          onDelete={() => setDeleteConfirm(p.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Retire confirmation modal */}
        {retireConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(34,21,8,0.2)' }}>
            <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-sm p-6">
              <h3 className="text-base text-coffee-900 mb-2" style={{ fontWeight: 500 }}>Retire Profile</h3>
              <p className="text-sm text-coffee-600 mb-5">
                This profile will be moved to the archive. It will no longer be used for variance checks on new roast sessions.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => retire(retireConfirm)} disabled={retiring}
                  className="flex-1 justify-center" variant="destructive">
                  {retiring ? 'Retiring…' : 'Retire'}
                </Button>
                <Button variant="secondary" onClick={() => setRetireConfirm(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete confirmation modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(34,21,8,0.2)' }}>
            <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-sm p-6">
              <h3 className="text-base text-coffee-900 mb-2" style={{ fontWeight: 500 }}>Delete Profile</h3>
              <p className="text-sm text-coffee-600 mb-5">
                This will permanently remove the profile. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button onClick={() => deleteProfile(deleteConfirm)} disabled={deleting}
                  className="flex-1 justify-center" variant="destructive">
                  {deleting ? 'Deleting…' : 'Delete'}
                </Button>
                <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
