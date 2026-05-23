import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const TZ = 'Asia/Vientiane';

function fmtMSS(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
}

function kgLabel(g) {
  if (g == null) return '—';
  return (g / 1000).toFixed(2) + ' kg';
}

const STATUS_COLORS = {
  in_progress:        'bg-blue-100 text-blue-700',
  completed:          'bg-amber-100 text-amber-700',
  approved_for_bagging: 'bg-green-100 text-green-700',
  rejected:           'bg-red-100 text-red-700',
};

export default function RoastDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [notes,   setNotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(null); // 'approve' | 'reject'
  const [saving, setSaving]   = useState(false);

  function load() {
    setLoading(true);
    api.get(`/roast-sessions/${id}`)
      .then(r => r.json())
      .then(d => { setSession(d.session); setNotes(d.notes || []); })
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function updateStatus(status) {
    setSaving(true);
    const res = await api.put(`/roast-sessions/${id}/status`, { status });
    const d   = await res.json();
    if (res.ok) { setSession(d.session); setConfirming(null); }
    setSaving(false);
  }

  if (loading) return <Layout><div className="p-6 text-coffee-600">Loading…</div></Layout>;
  if (!session) return <Layout><div className="p-6 text-red-600">Session not found.</div></Layout>;

  const roastLossPct = session.roasted_weight_out_g
    ? (((session.green_weight_in_g - session.roasted_weight_out_g) / session.green_weight_in_g) * 100).toFixed(1)
    : null;

  const durationSec = session.ended_at && session.started_at
    ? Math.floor((new Date(session.ended_at) - new Date(session.started_at)) / 1000)
    : null;

  const curve = Array.isArray(session.temperature_curve) ? session.temperature_curve : [];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-3xl font-bold text-coffee-900">{session.batch_code}</span>
          <span className={`text-xs px-2 py-1 rounded font-bold uppercase ${session.is_development ? 'bg-gray-200 text-gray-700' : 'bg-blue-100 text-blue-700'}`}>
            {session.is_development ? 'DEV' : 'PROD'}
          </span>
        </div>

        {/* Variance warning */}
        {session.variance_flagged && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-md p-3 text-sm">
            Eject temp deviated from profile. Actual: {session.eject_temp_c}°C
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Started',      fmtDate(session.started_at)],
            ['Ended',        fmtDate(session.ended_at)],
            ['Duration',     durationSec != null ? fmtMSS(durationSec) : '—'],
            ['Green In',     kgLabel(session.green_weight_in_g)],
            ['Roasted Out',  kgLabel(session.roasted_weight_out_g)],
            ['Roast Loss',   roastLossPct ? `${roastLossPct}%` : '—'],
            ['Charge Temp',  session.charge_temp_c ? `${session.charge_temp_c}°C` : '—'],
            ['Eject Temp',   session.eject_temp_c  ? `${session.eject_temp_c}°C`  : '—'],
            ['DTR',          session.dtr ? `${session.dtr}%` : '—'],
          ].map(([label, value]) => (
            <div key={label} className="bg-white border border-coffee-200 rounded-lg p-3">
              <div className="text-xs text-coffee-500">{label}</div>
              <div className="text-sm font-semibold text-coffee-900 mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        {/* Curve chart */}
        {curve.length > 0 && (
          <div className="bg-white border border-coffee-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-coffee-700 mb-3">Temperature Curve</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={curve}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0e6d8" />
                <XAxis dataKey="t" tickFormatter={fmtMSS} tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="°" />
                <Tooltip formatter={v => [`${v}°C`, 'Temp']} labelFormatter={fmtMSS} />
                <Line type="monotone" dataKey="temp" stroke="#2563eb" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Notes */}
        {notes.length > 0 && (
          <div className="bg-white border border-coffee-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-coffee-700 mb-3">Notes</h2>
            <ul className="space-y-2">
              {notes.map(n => (
                <li key={n.id} className="text-sm text-coffee-800">
                  <span className="font-mono text-coffee-500 mr-2">{fmtMSS(n.roast_position_s)}</span>
                  {n.note_text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Status */}
        <div className="bg-white border border-coffee-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-coffee-700 mb-3">Status</h2>
          <span className={`inline-block text-xs px-2 py-1 rounded font-medium capitalize ${STATUS_COLORS[session.status] || ''}`}>
            {session.status.replace(/_/g, ' ')}
          </span>

          {session.status === 'completed' && ['admin', 'roaster'].includes(user?.role) && (
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setConfirming('approve')}
                className="px-4 py-2 bg-green-600 text-white rounded font-semibold text-sm hover:bg-green-700"
              >
                Approve for Bagging
              </button>
              <button
                onClick={() => setConfirming('reject')}
                className="px-4 py-2 bg-red-600 text-white rounded font-semibold text-sm hover:bg-red-700"
              >
                Reject
              </button>
            </div>
          )}
        </div>

        {/* Confirmation dialog */}
        {confirming && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
              <h3 className="text-lg font-bold text-coffee-900 mb-2">Confirm</h3>
              <p className="text-sm text-coffee-700 mb-5">
                {confirming === 'approve'
                  ? 'Approve this session for bagging?'
                  : 'Reject this session? This action marks it as rejected.'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => updateStatus(confirming === 'approve' ? 'approved_for_bagging' : 'rejected')}
                  disabled={saving}
                  className={`flex-1 py-2 text-white rounded font-semibold text-sm ${confirming === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                >
                  {saving ? 'Saving…' : 'Confirm'}
                </button>
                <button onClick={() => setConfirming(null)} className="px-4 py-2 bg-gray-200 rounded font-semibold text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
