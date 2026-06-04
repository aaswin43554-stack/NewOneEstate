import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Wand2 } from 'lucide-react';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, StatusBadge } from '../../components/ui';

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

const STATUS_BADGE_MAP = {
  in_progress:           { status: 'draft',        label: 'In Progress' },
  completed:             { status: 'under_review',  label: 'Completed' },
  approved_for_bagging:  { status: 'active',        label: 'Approved for Bagging' },
  rejected:              { status: 'missing',       label: 'Rejected' },
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 rounded-lg border text-xs"
      style={{ background: '#FDFAF6', borderColor: '#E0D0BC', color: '#533A24' }}>
      <p>{fmtMSS(label)}</p>
      <p style={{ fontWeight: 500 }}>{payload[0]?.value?.toFixed(1)}°C</p>
    </div>
  );
};

export default function RoastDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session,      setSession]      = useState(null);
  const [notes,        setNotes]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [confirming,   setConfirming]   = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [anomalyData,  setAnomalyData]  = useState(null);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [anomalyError, setAnomalyError] = useState('');

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
    else { alert(d.error || 'Failed to update status.'); }
    setSaving(false);
  }

  async function analyzeAnomalies() {
    setAnomalyLoading(true); setAnomalyError(''); setAnomalyData(null);
    try {
      const res = await api.post('/ai/roast-anomaly', { session_id: id });
      const d   = await res.json();
      if (!res.ok) { setAnomalyError(d.error || 'AI failed.'); return; }
      setAnomalyData(d.analysis);
    } catch {
      setAnomalyError('Network error.');
    } finally {
      setAnomalyLoading(false);
    }
  }

  if (loading) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;
  if (!session) return <Layout><div className="px-6 py-6 text-sm" style={{ color: '#A32D2D' }}>Session not found.</div></Layout>;

  const roastLossPct = session.roasted_weight_out_g
    ? (((session.green_weight_in_g - session.roasted_weight_out_g) / session.green_weight_in_g) * 100).toFixed(1)
    : null;

  const durationSec = session.ended_at && session.started_at
    ? Math.floor((new Date(session.ended_at) - new Date(session.started_at)) / 1000)
    : null;

  const curve = Array.isArray(session.temperature_curve) ? session.temperature_curve : [];
  const badgeMeta = STATUS_BADGE_MAP[session.status] || { status: 'draft', label: session.status };

  const stats = [
    ['Started',     fmtDate(session.started_at)],
    ['Ended',       fmtDate(session.ended_at)],
    ['Duration',    durationSec != null ? fmtMSS(durationSec) : '—'],
    ['Green In',    kgLabel(session.green_weight_in_g)],
    ['Roasted Out', kgLabel(session.roasted_weight_out_g)],
    ['Roast Loss',  roastLossPct ? `${roastLossPct}%` : '—'],
    ['Charge Temp', session.charge_temp_c != null ? `${parseFloat(session.charge_temp_c).toFixed(1)}°C` : '—'],
    ['Eject Temp',  session.eject_temp_c  != null ? `${parseFloat(session.eject_temp_c).toFixed(1)}°C`  : '—'],
    ['DTR',         session.dtr ? `${session.dtr}%` : '—'],
  ];

  const devPhases = session.is_development ? [
    {
      label: 'Identity',
      rows: [
        ['Estate',   session.estate || '—'],
        ['Process',  session.process_description || '—'],
        ['Moisture', session.moisture_pct != null ? `${session.moisture_pct}%` : '—'],
      ],
    },
    {
      label: 'Charge & Turning Point',
      rows: [
        ['Charge',   session.charge_temp_c != null ? `${parseFloat(session.charge_temp_c).toFixed(1)}°C` : '—'],
        ['TP Temp',  session.tp_temp_c     != null ? `${parseFloat(session.tp_temp_c).toFixed(1)}°C`     : '—'],
        ['TP Time',  session.tp_time_seconds  ? fmtMSS(session.tp_time_seconds)  : '—'],
      ],
    },
    {
      label: 'Yellowing',
      rows: [
        ['Yellow Temp', session.yellow_temp_c       != null ? `${parseFloat(session.yellow_temp_c).toFixed(1)}°C` : '—'],
        ['Yellow Time', session.yellow_time_seconds ? fmtMSS(session.yellow_time_seconds) : '—'],
      ],
    },
    {
      label: '1st Crack',
      rows: [
        ['1C Temp',    session.first_crack_temp_c       != null ? `${parseFloat(session.first_crack_temp_c).toFixed(1)}°C` : '—'],
        ['1C Time',    session.first_crack_time_seconds ? fmtMSS(session.first_crack_time_seconds) : '—'],
        ['ROR at 1C',  session.ror_first_crack != null  ? `${session.ror_first_crack}°C/min` : '—'],
      ],
    },
    {
      label: 'Eject',
      rows: [
        ['Eject Temp', session.eject_temp_c  != null ? `${parseFloat(session.eject_temp_c).toFixed(1)}°C` : '—'],
        ['Eject Time', session.total_time_seconds ? fmtMSS(session.total_time_seconds) : '—'],
        ['ROR Eject',  session.ror_eject || '—'],
      ],
    },
    {
      label: 'Development',
      rows: [
        ['Dev Time', session.development_time_seconds ? fmtMSS(session.development_time_seconds) : '—'],
        ['DTR',      session.dtr ? `${session.dtr}%` : '—'],
      ],
    },
  ] : null;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="font-mono text-2xl text-coffee-900" style={{ fontWeight: 500 }}>
            {session.batch_code}
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: session.is_development ? '#F1EFE8' : '#E6F1FB',
              color:      session.is_development ? '#888780' : '#185FA5',
            }}
          >
            {session.is_development ? 'DEV' : 'PROD'}
          </span>
          <StatusBadge {...badgeMeta} />
        </div>

        {/* Variance warning */}
        {session.variance_flagged && (
          <div className="px-4 py-3 rounded-xl text-sm" style={{ background: '#FAEEDA', color: '#BA7517' }}>
            Eject temp deviated from profile. Actual: {session.eject_temp_c}°C
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {stats.map(([label, value]) => (
            <div key={label} className="bg-white border border-coffee-200 rounded-xl p-4">
              <p className="text-xs text-coffee-400 uppercase tracking-wide mb-1">{label}</p>
              <p className="text-sm text-coffee-900" style={{ fontWeight: 500 }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Dev roast curve data */}
        {devPhases && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5 space-y-5">
            <p className="text-xs text-coffee-400 uppercase tracking-wide">Roast Curve Data</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {devPhases.map(phase => (
                <div key={phase.label}>
                  <p className="text-xs font-medium text-coffee-500 uppercase tracking-wide mb-2">
                    {phase.label}
                  </p>
                  <div className="space-y-1">
                    {phase.rows.map(([label, value]) => (
                      <div key={label} className="flex justify-between text-sm">
                        <span className="text-coffee-400">{label}</span>
                        <span className="font-mono text-coffee-800">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {session.decision_notes && (
              <div className="pt-3 border-t border-coffee-100">
                <p className="text-xs font-medium text-coffee-500 uppercase tracking-wide mb-2">
                  Decision & Notes
                </p>
                <p className="text-sm text-coffee-700 leading-relaxed">{session.decision_notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Curve chart */}
        {curve.length > 0 && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-coffee-400 uppercase tracking-wide">Temperature Curve</p>
              <Button variant="ghost" size="sm" onClick={analyzeAnomalies} disabled={anomalyLoading}>
                <Wand2 size={13} className="mr-1" />
                {anomalyLoading ? 'Analyzing…' : 'Analyze'}
              </Button>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={curve} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="0" stroke="#F2EAE0" />
                <XAxis
                  dataKey="t"
                  tickFormatter={fmtMSS}
                  tick={{ fontSize: 11, fill: '#A8896A' }}
                  axisLine={{ stroke: '#E0D0BC' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#A8896A' }}
                  axisLine={false}
                  tickLine={false}
                  unit="°"
                  width={36}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="temp"
                  stroke="#EF9F27"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* AI Anomaly results */}
        {(anomalyError || anomalyData) && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5 space-y-3">
            <p className="text-xs text-coffee-400 uppercase tracking-wide">AI Anomaly Analysis</p>
            {anomalyError && <p className="text-sm" style={{ color: '#A32D2D' }}>{anomalyError}</p>}
            {anomalyData && (
              <>
                <p className="text-sm text-coffee-800">{anomalyData.overall_assessment}</p>
                {anomalyData.anomalies?.length > 0 ? (
                  <div className="space-y-2">
                    {anomalyData.anomalies.map((a, i) => {
                      const bg    = a.severity === 'high' ? '#FCEBEB' : a.severity === 'medium' ? '#FAEEDA' : '#F2EAE0';
                      const color = a.severity === 'high' ? '#A32D2D' : a.severity === 'medium' ? '#BA7517' : '#8B6A47';
                      return (
                        <div key={i} className="px-3 py-2 rounded-lg text-sm" style={{ background: bg, color }}>
                          <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{a.type}</span>
                          {' — '}{a.description}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: '#3B6D11' }}>No significant anomalies detected.</p>
                )}
                {anomalyData.recommendations?.length > 0 && (
                  <div>
                    <p className="text-xs text-coffee-400 mb-1">Recommendations</p>
                    <ul className="space-y-1">
                      {anomalyData.recommendations.map((r, i) => (
                        <li key={i} className="text-sm text-coffee-700">· {r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Notes */}
        {notes.length > 0 && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Notes</p>
            <ul className="space-y-2">
              {notes.map(n => (
                <li key={n.id} className="text-sm text-coffee-800">
                  <span className="font-mono text-coffee-400 mr-2">{fmtMSS(n.roast_position_s)}</span>
                  {n.note_text}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Approve / Reject actions */}
        {session.status === 'completed' && ['admin', 'roaster'].includes(user?.role) && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Review</p>
            <div className="flex gap-3">
              <Button
                variant="primary"
                onClick={() => setConfirming('approve')}
                style={{ background: '#3B6D11' }}
              >
                Approve for Bagging
              </Button>
              <Button
                variant="destructive"
                onClick={() => setConfirming('reject')}
              >
                Reject
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(34,21,8,0.2)' }}
        >
          <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-sm p-6">
            <h3 className="text-base text-coffee-900 mb-2" style={{ fontWeight: 500 }}>Confirm</h3>
            <p className="text-sm text-coffee-600 mb-5">
              {confirming === 'approve'
                ? 'Approve this session for bagging?'
                : 'Reject this session? This marks it as rejected.'}
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => updateStatus(confirming === 'approve' ? 'approved_for_bagging' : 'rejected')}
                disabled={saving}
                className="flex-1 justify-center"
                style={confirming === 'approve' ? { background: '#3B6D11', color: '#fff' } : {}}
                variant={confirming === 'approve' ? 'primary' : 'destructive'}
              >
                {saving ? 'Saving…' : 'Confirm'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
