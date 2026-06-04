import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, FormInput, FormSelect, FormTextarea, PageHeader } from '../../components/ui';

const PROCESSES = ['Washed', 'Honey', 'Natural', 'Anaerobic'];
const TZ = 'Asia/Vientiane';

function mssToSec(str) {
  const [m, s] = (str || '').split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}
function secToMSS(sec) {
  if (!sec) return '';
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
}
function guessProcess(session) {
  const desc = (session.process_description || '').toLowerCase();
  const code = (session.batch_code || '').toUpperCase();
  if (desc.includes('anaerobic') || code.includes('-NA-')) return 'Anaerobic';
  if (desc.includes('washed'))    return 'Washed';
  if (desc.includes('honey'))     return 'Honey';
  if (desc.includes('natural'))   return 'Natural';
  if (code.includes('-AN-'))      return 'Anaerobic';
  if (code.includes('-W-'))       return 'Washed';
  if (code.includes('-H-'))       return 'Honey';
  if (code.includes('-N-'))       return 'Natural';
  return 'Washed';
}

export default function ProfileNew() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fromId = params.get('from');

  const [mode, setMode] = useState('session'); // 'session' | 'manual'

  // Session-mode state
  const [sessions,        setSessions]        = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [selectedId,      setSelectedId]      = useState('');
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionProcess,  setSessionProcess]  = useState('Washed');
  const [sessionYear,     setSessionYear]     = useState(new Date().getFullYear());
  const [sessionFlavour,  setSessionFlavour]  = useState('');

  // Manual-mode state
  const [source, setSource] = useState(null);
  const [form, setForm] = useState({
    estate: '', process: 'Washed', harvest_year: new Date().getFullYear(),
    charge_temp_c: '', target_dtr: '', eject_temp_c: '',
    total_time_mss: '', flavour_target: '',
  });

  const [error,  setError]  = useState('');
  const [saving, setSaving] = useState(false);

  // Load completed dev sessions for session picker
  useEffect(() => {
    setSessionsLoading(true);
    api.get('/roast-sessions?is_development=true')
      .then(r => r.json())
      .then(d => {
        const eligible = (d.sessions || []).filter(s =>
          ['completed', 'approved_for_bagging'].includes(s.status)
        );
        setSessions(eligible);
      })
      .finally(() => setSessionsLoading(false));
  }, []);

  // Duplicate-from-profile (manual mode, ?from=id)
  useEffect(() => {
    if (!fromId) return;
    setMode('manual');
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
          flavour_target: profile.flavour_target || '',
        });
      })
      .catch(() => {});
  }, [fromId]);

  function set(key, val) { setForm(p => ({ ...p, [key]: val })); }

  function onSessionSelect(id) {
    setSelectedId(id);
    const s = sessions.find(x => x.id === id) || null;
    setSelectedSession(s);
    if (s) {
      setSessionProcess(guessProcess(s));
      setSessionYear(new Date(s.started_at).getFullYear());
    }
  }

  // ── Submit: from session ────────────────────────────────────────────────
  async function handleSessionSubmit(e) {
    e.preventDefault();
    setError('');
    if (!selectedId) { setError('Please choose a roast session.'); return; }
    setSaving(true);
    try {
      const res = await api.post('/profiles', {
        source_session_id: selectedId,
        process: sessionProcess,
        harvest_year: parseInt(sessionYear),
        flavour_target: sessionFlavour.trim() || null,
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Failed.'); return; }
      navigate(`/profiles/${d.profile.id}`);
    } catch { setError('Network error.'); }
    finally { setSaving(false); }
  }

  // ── Submit: manual ──────────────────────────────────────────────────────
  async function handleManualSubmit(e) {
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
        flavour_target: form.flavour_target || null,
      };
      const res = await api.post('/profiles', body);
      const d = await res.json();
      if (!res.ok) { setError(d.error || 'Failed.'); return; }
      navigate(`/profiles/${d.profile.id}`);
    } catch { setError('Network error.'); }
    finally { setSaving(false); }
  }

  const s = selectedSession;

  return (
    <Layout>
      <div className="max-w-lg mx-auto px-6 py-6">
        <PageHeader title="New Roast Profile" />

        {/* Mode toggle */}
        {!fromId && (
          <div className="flex rounded-lg overflow-hidden mb-6" style={{ border: '1px solid #E0D0BC' }}>
            {[['session', 'From Roast Session'], ['manual', 'Manual Entry']].map(([m, label]) => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(''); }}
                className="flex-1 py-2.5 text-sm transition-colors"
                style={{
                  background: mode === m ? '#533A24' : '#FFFFFF',
                  color:      mode === m ? '#FFFFFF' : '#8B6A47',
                  fontWeight: mode === m ? 500 : 400,
                }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {source && (
          <div className="px-4 py-3 rounded-xl text-sm mb-5" style={{ background: '#FAEEDA', color: '#BA7517' }}>
            Duplicated from {source.process} {source.harvest_year} — review before submitting.
          </div>
        )}

        {/* ── FROM SESSION ─────────────────────────────────────────────── */}
        {mode === 'session' && (
          <form onSubmit={handleSessionSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-coffee-500 uppercase tracking-wide mb-1.5">
                Roast Session
              </label>
              {sessionsLoading ? (
                <p className="text-sm text-coffee-400">Loading sessions…</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-coffee-400">
                  No completed development sessions available. Complete a dev roast first.
                </p>
              ) : (
                <select
                  value={selectedId}
                  onChange={e => onSessionSelect(e.target.value)}
                  required
                  className="w-full rounded-lg border text-sm px-3 py-2.5 bg-white"
                  style={{ borderColor: '#E0D0BC', color: '#533A24' }}
                >
                  <option value="">Choose a session…</option>
                  {sessions.map(sess => (
                    <option key={sess.id} value={sess.id}>
                      {sess.batch_code}
                      {sess.estate ? ` · ${sess.estate}` : ''}
                      {sess.process_description ? ` · ${sess.process_description}` : ''}
                      {' · '}{fmtDate(sess.started_at)}
                      {sess.dtr ? ` · DTR ${sess.dtr}%` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Preview card when session selected */}
            {s && (
              <div className="rounded-xl border p-4 space-y-3" style={{ background: '#FDFAF6', borderColor: '#E0D0BC' }}>
                <p className="text-xs font-medium text-coffee-500 uppercase tracking-wide">Session Data</p>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    ['Charge', s.charge_temp_c != null ? `${parseFloat(s.charge_temp_c).toFixed(1)}°C` : '—'],
                    ['Eject',  s.eject_temp_c  != null ? `${parseFloat(s.eject_temp_c).toFixed(1)}°C`  : '—'],
                    ['Time',   s.total_time_seconds ? secToMSS(s.total_time_seconds) : '—'],
                    ['DTR',    s.dtr ? `${s.dtr}%` : '—'],
                  ].map(([lbl, val]) => (
                    <div key={lbl}>
                      <p className="text-xs text-coffee-300 mb-0.5">{lbl}</p>
                      <p className="text-sm font-mono text-coffee-800">{val}</p>
                    </div>
                  ))}
                </div>
                {s.estate && (
                  <p className="text-xs text-coffee-500">Estate: <span className="text-coffee-800">{s.estate}</span></p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormSelect
                label="Process"
                value={sessionProcess}
                onChange={e => setSessionProcess(e.target.value)}
                required
              >
                {PROCESSES.map(p => <option key={p}>{p}</option>)}
              </FormSelect>

              <FormInput
                label="Harvest Year"
                type="number"
                value={sessionYear}
                onChange={e => setSessionYear(e.target.value)}
                required
              />
            </div>

            <FormTextarea
              label="Flavour Notes (optional)"
              value={sessionFlavour}
              onChange={e => setSessionFlavour(e.target.value)}
              rows={3}
              placeholder="e.g. Stone fruit, caramel sweetness, bright acidity…"
            />

            {error && <p className="text-xs" style={{ color: '#A32D2D' }}>{error}</p>}

            <Button type="submit" disabled={saving || !selectedId}
              className="w-full justify-center" size="lg"
              style={{ background: '#3B6D11' }}>
              {saving ? 'Activating…' : 'Activate Profile'}
            </Button>

            <p className="text-xs text-center text-coffee-400">
              Profile will be created as Active immediately.
            </p>
          </form>
        )}

        {/* ── MANUAL ENTRY ─────────────────────────────────────────────── */}
        {mode === 'manual' && (
          <form onSubmit={handleManualSubmit} className="space-y-4">
            <FormInput label="Estate" value={form.estate} onChange={e => set('estate', e.target.value)} required />

            <div className="grid grid-cols-2 gap-4">
              <FormSelect label="Process" value={form.process} onChange={e => set('process', e.target.value)} required>
                {PROCESSES.map(p => <option key={p}>{p}</option>)}
              </FormSelect>
              <FormInput label="Harvest Year" type="number" value={form.harvest_year}
                onChange={e => set('harvest_year', e.target.value)} required />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <FormInput label="Charge °C" type="number" value={form.charge_temp_c}
                onChange={e => set('charge_temp_c', e.target.value)} required />
              <FormInput label="Eject °C" type="number" value={form.eject_temp_c}
                onChange={e => set('eject_temp_c', e.target.value)} required />
              <FormInput label="DTR %" type="number" step="0.01" value={form.target_dtr}
                onChange={e => set('target_dtr', e.target.value)} required />
            </div>

            <FormInput label="Total Time (MM:SS)" type="text" value={form.total_time_mss}
              onChange={e => set('total_time_mss', e.target.value)}
              placeholder="09:30" pattern="\d{1,2}:\d{2}" className="font-mono" required />

            <FormTextarea label="Flavour Target (optional)" value={form.flavour_target}
              onChange={e => set('flavour_target', e.target.value)} rows={3}
              placeholder="e.g. Stone fruit, caramel sweetness, bright acidity…" />

            {error && <p className="text-xs" style={{ color: '#A32D2D' }}>{error}</p>}

            <Button type="submit" disabled={saving} className="w-full justify-center" size="lg">
              {saving ? 'Creating…' : 'Create Profile'}
            </Button>
          </form>
        )}
      </div>
    </Layout>
  );
}
