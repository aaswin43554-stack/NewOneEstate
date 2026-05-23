import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ });
}

export default function ProfileList() {
  const [profiles, setProfiles] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const { user } = useAuth();
  const navigate  = useNavigate();

  function load() {
    setLoading(true);
    api.get('/profiles').then(r => r.json())
      .then(d => setProfiles(d.profiles || []))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const isAdmin  = user?.role === 'admin';
  const isEditor = ['admin','roaster'].includes(user?.role);

  async function submit(id) {
    await api.post(`/profiles/${id}/submit`, {});
    load();
  }

  // Group by process
  const grouped = profiles.reduce((acc, p) => {
    if (!acc[p.process]) acc[p.process] = [];
    acc[p.process].push(p);
    return acc;
  }, {});

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-bold text-coffee-900">Roast Profiles</h1>
          {isEditor && (
            <button onClick={() => navigate('/profiles/new')}
              className="px-4 py-2 bg-coffee-700 text-white rounded-md text-sm font-semibold hover:bg-coffee-800">
              + New Profile
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-coffee-500">Loading…</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-coffee-400 text-center py-12">No profiles yet.</p>
        ) : (
          Object.entries(grouped).map(([process, plist]) => (
            <div key={process} className="mb-6">
              <h2 className="text-sm font-bold text-coffee-700 uppercase tracking-wide mb-2">{process}</h2>
              <div className="bg-white border border-coffee-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-coffee-50 border-b border-coffee-200">
                    <tr>
                      {['Year','Status','Charge','Eject','DTR%','Time','Flavour Target','Approved By','Actions'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-semibold text-coffee-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plist.map(p => (
                      <tr key={p.id} className={`border-b border-coffee-50 hover:bg-coffee-50 ${p.status === 'retired' ? 'opacity-50' : ''}`}>
                        <td className="px-3 py-2 font-semibold">{p.harvest_year}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${STATUS_STYLES[p.status]}`}>
                            {p.status.replace(/_/g,' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2">{p.charge_temp_c}°C</td>
                        <td className="px-3 py-2">{p.eject_temp_c}°C</td>
                        <td className="px-3 py-2">{p.target_dtr}%</td>
                        <td className="px-3 py-2 font-mono">{fmtMSS(p.total_time_target_s)}</td>
                        <td className="px-3 py-2 max-w-xs truncate text-coffee-500 text-xs">
                          {p.flavour_target?.substring(0, 60)}{p.flavour_target?.length > 60 ? '…' : ''}
                        </td>
                        <td className="px-3 py-2 text-xs text-coffee-400">
                          {p.approved_by_name ? `${p.approved_by_name} · ${fmtDate(p.approved_at)}` : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1.5 flex-wrap">
                            <button onClick={() => navigate(`/profiles/${p.id}`)}
                              className="text-xs px-2 py-0.5 bg-coffee-100 text-coffee-700 rounded hover:bg-coffee-200">View</button>
                            {isEditor && p.status === 'development' && (
                              <button onClick={() => navigate(`/profiles/${p.id}/edit`)}
                                className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded hover:bg-amber-200">Edit</button>
                            )}
                            {isEditor && p.status === 'development' && (
                              <button onClick={() => submit(p.id)}
                                className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Submit</button>
                            )}
                            {isAdmin && p.status === 'pending_approval' && (
                              <button onClick={() => navigate(`/profiles/${p.id}`)}
                                className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded hover:bg-green-200">Approve</button>
                            )}
                            <button onClick={() => navigate(`/profiles/new?from=${p.id}`)}
                              className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200">Duplicate</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}
