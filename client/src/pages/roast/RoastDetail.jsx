import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Wand2, Pencil, Check, X, Upload } from 'lucide-react';
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
function parseMSS(str) {
  if (!str) return null;
  const [m, s] = str.split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}
function secToMSS(sec) {
  if (!sec) return '';
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
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

// ── Machine data parsers ────────────────────────────────────────────────────
function parseMachineJSON(raw) {
  const d = JSON.parse(raw);
  return {
    charge_temp_c:            d.charge       ?? d.charge_temp     ?? d.charge_temp_c    ?? null,
    tp_temp_c:                d.tp_temp      ?? d.turning_point   ?? null,
    tp_time_seconds:          d.tp_time_s    ?? (d.tp_time ? parseMSS(d.tp_time) : null),
    yellow_temp_c:            d.yellow_temp  ?? null,
    yellow_time_seconds:      d.yellow_time_s ?? (d.yellow_time ? parseMSS(d.yellow_time) : null),
    first_crack_temp_c:       d['1c_temp']   ?? d.fc_temp         ?? d.first_crack_temp ?? null,
    first_crack_time_seconds: d['1c_time_s'] ?? (d['1c_time'] ? parseMSS(d['1c_time']) : null),
    ror_first_crack:          d.ror_1c       ?? d.ror_at_1c       ?? null,
    eject_temp_c:             d.eject_temp   ?? d.eject_temp_c    ?? null,
    total_time_seconds:       d.eject_time_s ?? (d.eject_time ? parseMSS(d.eject_time) : null) ?? (d.total_time_s ?? null),
    ror_eject:                d.ror_eject    ?? null,
    development_time_seconds: d.dev_time_s   ?? (d.dev_time ? parseMSS(d.dev_time) : null),
    temperature_curve:        d.curve        ?? d.temperature_curve ?? [],
    estate:                   d.estate       ?? null,
    process_description:      d.process      ?? null,
    moisture_pct:             d.moisture     ?? d.moisture_pct    ?? null,
    roasted_weight_out_g:     d.roasted_weight_out_g ?? (d.roasted_kg ? Math.round(d.roasted_kg * 1000) : null),
  };
}

function parseMachineCSV(raw) {
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  const curve = [];
  let headerSkipped = false;
  for (const line of lines) {
    const parts = line.split(/[,\t;]/);
    if (!headerSkipped && isNaN(parseFloat(parts[0]))) { headerSkipped = true; continue; }
    headerSkipped = true;
    const t = parseFloat(parts[0]);
    const temp = parseFloat(parts[1]);
    if (!isNaN(t) && !isNaN(temp)) curve.push({ t: Math.round(t), temp });
  }
  return { temperature_curve: curve };
}

function initEditForm(session) {
  return {
    estate:                   session.estate || '',
    process_description:      session.process_description || '',
    moisture_pct:             session.moisture_pct ?? '',
    charge_temp_c:            session.charge_temp_c ?? '',
    tp_temp_c:                session.tp_temp_c ?? '',
    tp_time:                  secToMSS(session.tp_time_seconds),
    yellow_temp_c:            session.yellow_temp_c ?? '',
    yellow_time:              secToMSS(session.yellow_time_seconds),
    first_crack_temp_c:       session.first_crack_temp_c ?? '',
    first_crack_time:         secToMSS(session.first_crack_time_seconds),
    ror_first_crack:          session.ror_first_crack ?? '',
    eject_temp_c:             session.eject_temp_c ?? '',
    eject_time:               secToMSS(session.total_time_seconds),
    ror_eject:                session.ror_eject || '',
    dev_time:                 secToMSS(session.development_time_seconds),
    roasted_weight_out_g:     session.roasted_weight_out_g != null ? (session.roasted_weight_out_g / 1000).toFixed(3) : '',
    decision_notes:           session.decision_notes || '',
  };
}

export default function RoastDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [session,       setSession]       = useState(null);
  const [notes,         setNotes]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [confirming,    setConfirming]    = useState(null);
  const [saving,        setSaving]        = useState(false);
  const [anomalyData,   setAnomalyData]   = useState(null);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [anomalyError,  setAnomalyError]  = useState('');

  // Inline title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal,     setTitleVal]     = useState('');
  const [titleSaving,  setTitleSaving]  = useState(false);
  const [titleError,   setTitleError]   = useState('');
  const titleInputRef = useRef(null);

  // Curve data editing
  const [editingData,   setEditingData]   = useState(false);
  const [editForm,      setEditForm]      = useState({});
  const [editCurve,     setEditCurve]     = useState([]);
  const [dataSaving,    setDataSaving]    = useState(false);
  const [dataError,     setDataError]     = useState('');

  // Machine import modal
  const [importOpen,    setImportOpen]    = useState(false);
  const [importTab,     setImportTab]     = useState('json');
  const [importRaw,     setImportRaw]     = useState('');
  const [importParsed,  setImportParsed]  = useState(null);
  const [importError,   setImportError]   = useState('');
  const fileRef = useRef(null);

  const canEdit = ['admin', 'roaster'].includes(user?.role);

  function load() {
    setLoading(true);
    api.get(`/roast-sessions/${id}`)
      .then(r => r.json())
      .then(d => {
        setSession(d.session);
        setNotes(d.notes || []);
        setEditForm(initEditForm(d.session));
        setEditCurve(Array.isArray(d.session.temperature_curve) ? d.session.temperature_curve : []);
      })
      .finally(() => setLoading(false));
  }
  useEffect(load, [id]);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) titleInputRef.current.focus();
  }, [editingTitle]);

  // ── Title editing ──────────────────────────────────────────────────────────
  function startEditTitle() {
    setTitleVal(session.batch_code);
    setTitleError('');
    setEditingTitle(true);
  }
  async function saveTitle() {
    if (!titleVal.trim() || titleVal.trim() === session.batch_code) {
      setEditingTitle(false); return;
    }
    setTitleSaving(true); setTitleError('');
    const res = await api.patch(`/roast-sessions/${id}/rename`, { batch_code: titleVal.trim() });
    const d   = await res.json();
    if (res.ok) { setSession(d.session); setEditingTitle(false); }
    else { setTitleError(d.error || 'Failed to rename.'); }
    setTitleSaving(false);
  }
  function cancelTitle() { setEditingTitle(false); setTitleError(''); }

  // ── Status update ──────────────────────────────────────────────────────────
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
    } catch { setAnomalyError('Network error.'); }
    finally { setAnomalyLoading(false); }
  }

  // ── Curve data editing ─────────────────────────────────────────────────────
  function setF(key, val) { setEditForm(p => ({ ...p, [key]: val })); }

  async function saveData() {
    setDataSaving(true); setDataError('');
    const body = {
      estate:                   editForm.estate             || null,
      process_description:      editForm.process_description || null,
      moisture_pct:             editForm.moisture_pct !== '' ? parseFloat(editForm.moisture_pct) : null,
      charge_temp_c:            editForm.charge_temp_c !== '' ? parseFloat(editForm.charge_temp_c) : null,
      tp_temp_c:                editForm.tp_temp_c !== '' ? parseFloat(editForm.tp_temp_c) : null,
      tp_time_seconds:          parseMSS(editForm.tp_time),
      yellow_temp_c:            editForm.yellow_temp_c !== '' ? parseFloat(editForm.yellow_temp_c) : null,
      yellow_time_seconds:      parseMSS(editForm.yellow_time),
      first_crack_temp_c:       editForm.first_crack_temp_c !== '' ? parseFloat(editForm.first_crack_temp_c) : null,
      first_crack_time_seconds: parseMSS(editForm.first_crack_time),
      ror_first_crack:          editForm.ror_first_crack !== '' ? parseFloat(editForm.ror_first_crack) : null,
      eject_temp_c:             editForm.eject_temp_c !== '' ? parseFloat(editForm.eject_temp_c) : null,
      total_time_seconds:       parseMSS(editForm.eject_time),
      ror_eject:                editForm.ror_eject || null,
      development_time_seconds: parseMSS(editForm.dev_time),
      temperature_curve:        editCurve.length > 0 ? editCurve : null,
      decision_notes:           editForm.decision_notes || null,
      roasted_weight_out_g:     editForm.roasted_weight_out_g !== '' ? Math.round(parseFloat(editForm.roasted_weight_out_g) * 1000) : null,
    };
    const res = await api.patch(`/roast-sessions/${id}/data`, body);
    const d   = await res.json();
    if (res.ok) {
      setSession(d.session);
      setEditForm(initEditForm(d.session));
      setEditCurve(Array.isArray(d.session.temperature_curve) ? d.session.temperature_curve : []);
      setEditingData(false);
    } else {
      setDataError(d.error || 'Failed to save.');
    }
    setDataSaving(false);
  }

  function cancelData() {
    setEditForm(initEditForm(session));
    setEditCurve(Array.isArray(session.temperature_curve) ? session.temperature_curve : []);
    setEditingData(false);
    setDataError('');
  }

  // ── Machine import ─────────────────────────────────────────────────────────
  function tryParseImport(raw, tab) {
    try {
      const parsed = tab === 'json' ? parseMachineJSON(raw) : parseMachineCSV(raw);
      setImportParsed(parsed);
      setImportError('');
    } catch (e) {
      setImportParsed(null);
      setImportError(`Parse error: ${e.message}`);
    }
  }

  function onImportRawChange(val) {
    setImportRaw(val);
    if (val.trim()) tryParseImport(val, importTab);
    else { setImportParsed(null); setImportError(''); }
  }

  function onImportTabChange(tab) {
    setImportTab(tab);
    setImportRaw(''); setImportParsed(null); setImportError('');
  }

  function onFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const raw = ev.target.result;
      setImportRaw(raw);
      tryParseImport(raw, file.name.endsWith('.json') ? 'json' : 'csv');
    };
    reader.readAsText(file);
  }

  function applyImport() {
    if (!importParsed) return;
    const p = importParsed;
    setEditForm(prev => ({
      ...prev,
      ...(p.estate            != null ? { estate: p.estate }                                      : {}),
      ...(p.process_description != null ? { process_description: p.process_description }          : {}),
      ...(p.moisture_pct      != null ? { moisture_pct: p.moisture_pct }                          : {}),
      ...(p.charge_temp_c     != null ? { charge_temp_c: p.charge_temp_c }                        : {}),
      ...(p.tp_temp_c         != null ? { tp_temp_c: p.tp_temp_c }                                : {}),
      ...(p.tp_time_seconds   != null ? { tp_time: secToMSS(p.tp_time_seconds) }                  : {}),
      ...(p.yellow_temp_c     != null ? { yellow_temp_c: p.yellow_temp_c }                        : {}),
      ...(p.yellow_time_seconds != null ? { yellow_time: secToMSS(p.yellow_time_seconds) }        : {}),
      ...(p.first_crack_temp_c  != null ? { first_crack_temp_c: p.first_crack_temp_c }            : {}),
      ...(p.first_crack_time_seconds != null ? { first_crack_time: secToMSS(p.first_crack_time_seconds) } : {}),
      ...(p.ror_first_crack   != null ? { ror_first_crack: p.ror_first_crack }                    : {}),
      ...(p.eject_temp_c      != null ? { eject_temp_c: p.eject_temp_c }                          : {}),
      ...(p.total_time_seconds != null ? { eject_time: secToMSS(p.total_time_seconds) }           : {}),
      ...(p.ror_eject         != null ? { ror_eject: p.ror_eject }                                : {}),
      ...(p.development_time_seconds != null ? { dev_time: secToMSS(p.development_time_seconds) } : {}),
      ...(p.roasted_weight_out_g != null ? { roasted_weight_out_g: (p.roasted_weight_out_g / 1000).toFixed(3) } : {}),
    }));
    if (p.temperature_curve?.length) setEditCurve(p.temperature_curve);
    setEditingData(true);
    setImportOpen(false);
    setImportRaw(''); setImportParsed(null);
  }

  if (loading) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;
  if (!session) return <Layout><div className="px-6 py-6 text-sm" style={{ color: '#A32D2D' }}>Session not found.</div></Layout>;

  const roastLossPct = session.roasted_weight_out_g
    ? (((session.green_weight_in_g - session.roasted_weight_out_g) / session.green_weight_in_g) * 100).toFixed(1)
    : null;

  const durationSec = session.ended_at && session.started_at
    ? Math.floor((new Date(session.ended_at) - new Date(session.started_at)) / 1000)
    : null;

  const curve = editingData ? editCurve : (Array.isArray(session.temperature_curve) ? session.temperature_curve : []);
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
      editFields: [
        { key: 'estate',              label: 'Estate',   type: 'text' },
        { key: 'process_description', label: 'Process',  type: 'text' },
        { key: 'moisture_pct',        label: 'Moisture %', type: 'number', step: '0.1' },
      ],
    },
    {
      label: 'Charge & Turning Point',
      rows: [
        ['Charge',   session.charge_temp_c != null ? `${parseFloat(session.charge_temp_c).toFixed(1)}°C` : '—'],
        ['TP Temp',  session.tp_temp_c     != null ? `${parseFloat(session.tp_temp_c).toFixed(1)}°C`     : '—'],
        ['TP Time',  session.tp_time_seconds  ? fmtMSS(session.tp_time_seconds)  : '—'],
      ],
      editFields: [
        { key: 'charge_temp_c', label: 'Charge °C',  type: 'number', step: '0.1' },
        { key: 'tp_temp_c',     label: 'TP Temp °C', type: 'number', step: '0.1' },
        { key: 'tp_time',       label: 'TP Time MM:SS', type: 'text', placeholder: '02:30' },
      ],
    },
    {
      label: 'Yellowing',
      rows: [
        ['Yellow Temp', session.yellow_temp_c       != null ? `${parseFloat(session.yellow_temp_c).toFixed(1)}°C` : '—'],
        ['Yellow Time', session.yellow_time_seconds ? fmtMSS(session.yellow_time_seconds) : '—'],
      ],
      editFields: [
        { key: 'yellow_temp_c', label: 'Yellow Temp °C',    type: 'number', step: '0.1' },
        { key: 'yellow_time',   label: 'Yellow Time MM:SS', type: 'text',   placeholder: '05:00' },
      ],
    },
    {
      label: '1st Crack',
      rows: [
        ['1C Temp',    session.first_crack_temp_c       != null ? `${parseFloat(session.first_crack_temp_c).toFixed(1)}°C` : '—'],
        ['1C Time',    session.first_crack_time_seconds ? fmtMSS(session.first_crack_time_seconds) : '—'],
        ['ROR at 1C',  session.ror_first_crack != null  ? `${session.ror_first_crack}°C/min` : '—'],
      ],
      editFields: [
        { key: 'first_crack_temp_c', label: '1C Temp °C',   type: 'number', step: '0.1' },
        { key: 'first_crack_time',   label: '1C Time MM:SS', type: 'text',   placeholder: '07:30' },
        { key: 'ror_first_crack',    label: 'ROR at 1C',    type: 'number', step: '0.1' },
      ],
    },
    {
      label: 'Eject',
      rows: [
        ['Eject Temp', session.eject_temp_c  != null ? `${parseFloat(session.eject_temp_c).toFixed(1)}°C` : '—'],
        ['Eject Time', session.total_time_seconds ? fmtMSS(session.total_time_seconds) : '—'],
        ['ROR Eject',  session.ror_eject || '—'],
      ],
      editFields: [
        { key: 'eject_temp_c', label: 'Eject Temp °C',    type: 'number', step: '0.1' },
        { key: 'eject_time',   label: 'Eject Time MM:SS', type: 'text',   placeholder: '09:30' },
        { key: 'ror_eject',    label: 'ROR Eject',        type: 'number', step: '0.1' },
      ],
    },
    {
      label: 'Development',
      rows: [
        ['Dev Time', session.development_time_seconds ? fmtMSS(session.development_time_seconds) : '—'],
        ['DTR',      session.dtr ? `${session.dtr}%` : '—'],
      ],
      editFields: [
        { key: 'dev_time',            label: 'Dev Time MM:SS', type: 'text', placeholder: '01:30' },
        { key: 'roasted_weight_out_g', label: 'Roasted Out (kg)', type: 'number', step: '0.001' },
      ],
    },
  ] : null;

  const importCurve = importParsed?.temperature_curve ?? [];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* Header with inline-editable title */}
        <div className="flex items-start gap-3 flex-wrap">
          {editingTitle ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                ref={titleInputRef}
                value={titleVal}
                onChange={e => setTitleVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') cancelTitle(); }}
                className="font-mono text-2xl text-coffee-900 border-b-2 border-coffee-400 bg-transparent outline-none flex-1 min-w-0"
                style={{ fontWeight: 500 }}
              />
              <button onClick={saveTitle} disabled={titleSaving}
                className="text-coffee-400 hover:text-coffee-700 transition-colors disabled:opacity-40">
                <Check size={18} />
              </button>
              <button onClick={cancelTitle}
                className="text-coffee-300 hover:text-coffee-500 transition-colors">
                <X size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl text-coffee-900" style={{ fontWeight: 500 }}>
                {session.batch_code}
              </span>
              {canEdit && (
                <button onClick={startEditTitle}
                  className="text-coffee-300 hover:text-coffee-600 transition-colors mt-1">
                  <Pencil size={14} />
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
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
        </div>
        {titleError && <p className="text-xs" style={{ color: '#A32D2D' }}>{titleError}</p>}

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
            <div className="flex items-center justify-between">
              <p className="text-xs text-coffee-400 uppercase tracking-wide">Roast Curve Data</p>
              {canEdit && (
                <div className="flex gap-2">
                  {!editingData && (
                    <button
                      onClick={() => setImportOpen(true)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
                      style={{ borderColor: '#E0D0BC', color: '#8B6A47' }}
                    >
                      <Upload size={12} /> Import Machine Data
                    </button>
                  )}
                  {editingData ? (
                    <div className="flex gap-2">
                      <button
                        onClick={saveData} disabled={dataSaving}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg text-white transition-colors disabled:opacity-40"
                        style={{ background: '#3B6D11' }}
                      >
                        <Check size={12} /> {dataSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        onClick={cancelData}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border transition-colors"
                        style={{ borderColor: '#E0D0BC', color: '#8B6A47' }}
                      >
                        <X size={12} /> Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingData(true)}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
                      style={{ borderColor: '#E0D0BC', color: '#8B6A47' }}
                    >
                      <Pencil size={12} /> Edit
                    </button>
                  )}
                </div>
              )}
            </div>

            {dataError && <p className="text-xs" style={{ color: '#A32D2D' }}>{dataError}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {devPhases.map(phase => (
                <div key={phase.label}>
                  <p className="text-xs font-medium text-coffee-500 uppercase tracking-wide mb-2">
                    {phase.label}
                  </p>
                  {editingData ? (
                    <div className="space-y-2">
                      {phase.editFields.map(field => (
                        <div key={field.key} className="flex items-center gap-2">
                          <label className="text-xs text-coffee-400 w-28 flex-shrink-0">{field.label}</label>
                          <input
                            type={field.type}
                            step={field.step}
                            placeholder={field.placeholder || ''}
                            value={editForm[field.key] ?? ''}
                            onChange={e => setF(field.key, e.target.value)}
                            className="flex-1 h-7 px-2 text-xs border border-coffee-200 rounded-lg font-mono bg-white"
                            style={{ color: '#533A24' }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {phase.rows.map(([label, value]) => (
                        <div key={label} className="flex justify-between text-sm">
                          <span className="text-coffee-400">{label}</span>
                          <span className="font-mono text-coffee-800">{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Decision notes */}
            {editingData ? (
              <div className="pt-3 border-t border-coffee-100">
                <p className="text-xs font-medium text-coffee-500 uppercase tracking-wide mb-2">Decision &amp; Notes</p>
                <textarea
                  value={editForm.decision_notes}
                  onChange={e => setF('decision_notes', e.target.value)}
                  rows={3}
                  placeholder="Decision notes…"
                  className="w-full px-3 py-2 text-sm border border-coffee-200 rounded-lg resize-none"
                  style={{ color: '#533A24' }}
                />
              </div>
            ) : session.decision_notes ? (
              <div className="pt-3 border-t border-coffee-100">
                <p className="text-xs font-medium text-coffee-500 uppercase tracking-wide mb-2">Decision &amp; Notes</p>
                <p className="text-sm text-coffee-700 leading-relaxed">{session.decision_notes}</p>
              </div>
            ) : null}

            {/* Editable curve preview (when in edit mode with imported data) */}
            {editingData && editCurve.length > 0 && (
              <div className="pt-3 border-t border-coffee-100">
                <p className="text-xs font-medium text-coffee-500 uppercase tracking-wide mb-2">
                  Temperature Curve Preview ({editCurve.length} points)
                </p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={editCurve} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="0" stroke="#F2EAE0" />
                    <XAxis dataKey="t" tickFormatter={fmtMSS} tick={{ fontSize: 10, fill: '#A8896A' }} axisLine={{ stroke: '#E0D0BC' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#A8896A' }} axisLine={false} tickLine={false} unit="°" width={32} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="temp" stroke="#EF9F27" dot={false} strokeWidth={2} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Curve chart (saved data) */}
        {!editingData && curve.length > 0 && (
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
                <XAxis dataKey="t" tickFormatter={fmtMSS} tick={{ fontSize: 11, fill: '#A8896A' }} axisLine={{ stroke: '#E0D0BC' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#A8896A' }} axisLine={false} tickLine={false} unit="°" width={36} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="temp" stroke="#EF9F27" dot={false} strokeWidth={2} isAnimationActive={false} />
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
              <Button variant="primary" onClick={() => setConfirming('approve')} style={{ background: '#3B6D11' }}>
                Approve for Bagging
              </Button>
              <Button variant="destructive" onClick={() => setConfirming('reject')}>Reject</Button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(34,21,8,0.2)' }}>
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
                disabled={saving} className="flex-1 justify-center"
                style={confirming === 'approve' ? { background: '#3B6D11', color: '#fff' } : {}}
                variant={confirming === 'approve' ? 'primary' : 'destructive'}
              >
                {saving ? 'Saving…' : 'Confirm'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Machine import modal */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(34,21,8,0.25)' }}>
          <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>Import Machine Data</h2>
              <button onClick={() => { setImportOpen(false); setImportRaw(''); setImportParsed(null); setImportError(''); }}
                className="text-coffee-300 hover:text-coffee-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #E0D0BC' }}>
              {[['json', 'Paste JSON'], ['csv', 'Paste CSV']].map(([tab, label]) => (
                <button key={tab} type="button" onClick={() => onImportTabChange(tab)}
                  className="flex-1 py-2 text-sm transition-colors"
                  style={{
                    background: importTab === tab ? '#533A24' : '#fff',
                    color:      importTab === tab ? '#fff' : '#8B6A47',
                    fontWeight: importTab === tab ? 500 : 400,
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {importTab === 'json' && (
              <p className="text-xs text-coffee-400">
                Expected keys: <code className="font-mono">charge</code>, <code className="font-mono">tp_temp</code>, <code className="font-mono">tp_time</code>, <code className="font-mono">yellow_temp</code>, <code className="font-mono">yellow_time</code>, <code className="font-mono">1c_temp</code>, <code className="font-mono">1c_time</code>, <code className="font-mono">ror_1c</code>, <code className="font-mono">eject_temp</code>, <code className="font-mono">eject_time</code>, <code className="font-mono">dev_time</code>, <code className="font-mono">dtr</code>, <code className="font-mono">curve</code> (array of {'{t, temp}'}).
              </p>
            )}
            {importTab === 'csv' && (
              <p className="text-xs text-coffee-400">
                Two columns: <code className="font-mono">time_s, temp_c</code> (one row per second). Optional header row is skipped automatically.
              </p>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="text-xs px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5"
                style={{ borderColor: '#E0D0BC', color: '#8B6A47' }}
              >
                <Upload size={12} /> Upload file
              </button>
              <span className="text-xs text-coffee-300">or paste below</span>
              <input ref={fileRef} type="file" accept=".json,.csv,.txt" className="hidden" onChange={onFileUpload} />
            </div>

            <textarea
              value={importRaw}
              onChange={e => onImportRawChange(e.target.value)}
              rows={8}
              placeholder={importTab === 'json'
                ? '{\n  "charge": 200.0,\n  "eject_temp": 207.0,\n  "eject_time": "09:30",\n  "dev_time": "01:50",\n  "curve": [{"t": 0, "temp": 200.0}, ...]\n}'
                : 'time_s,temp_c\n0,200.0\n5,165.3\n10,158.2\n...'
              }
              className="w-full px-3 py-2 text-xs font-mono border border-coffee-200 rounded-lg resize-none"
              style={{ color: '#533A24' }}
            />

            {importError && <p className="text-xs" style={{ color: '#A32D2D' }}>{importError}</p>}

            {/* Preview */}
            {importParsed && (
              <div className="space-y-3">
                <p className="text-xs font-medium text-coffee-500 uppercase tracking-wide">Preview</p>
                {importCurve.length > 0 && (
                  <div>
                    <p className="text-xs text-coffee-400 mb-2">Temperature Curve — {importCurve.length} data points</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <LineChart data={importCurve} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="0" stroke="#F2EAE0" />
                        <XAxis dataKey="t" tickFormatter={fmtMSS} tick={{ fontSize: 10, fill: '#A8896A' }} axisLine={{ stroke: '#E0D0BC' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#A8896A' }} axisLine={false} tickLine={false} unit="°" width={32} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="temp" stroke="#EF9F27" dot={false} strokeWidth={2} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {[
                    ['Charge', importParsed.charge_temp_c != null ? `${importParsed.charge_temp_c}°C` : null],
                    ['Eject',  importParsed.eject_temp_c  != null ? `${importParsed.eject_temp_c}°C`  : null],
                    ['Eject Time', importParsed.total_time_seconds ? secToMSS(importParsed.total_time_seconds) : null],
                    ['Dev Time',   importParsed.development_time_seconds ? secToMSS(importParsed.development_time_seconds) : null],
                    ['TP Temp', importParsed.tp_temp_c != null ? `${importParsed.tp_temp_c}°C` : null],
                    ['1C Temp', importParsed.first_crack_temp_c != null ? `${importParsed.first_crack_temp_c}°C` : null],
                  ].filter(([, v]) => v != null).map(([label, val]) => (
                    <div key={label} className="rounded-lg p-2" style={{ background: '#F2EAE0' }}>
                      <p className="text-coffee-400 mb-0.5">{label}</p>
                      <p className="font-mono text-coffee-800" style={{ fontWeight: 500 }}>{val}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={applyImport} disabled={!importParsed}
                className="flex-1 py-2.5 text-sm rounded-xl text-white transition-colors disabled:opacity-40"
                style={{ background: '#3B6D11' }}
              >
                Apply &amp; Edit Fields
              </button>
              <button
                onClick={() => { setImportOpen(false); setImportRaw(''); setImportParsed(null); setImportError(''); }}
                className="px-5 py-2.5 text-sm rounded-xl border transition-colors"
                style={{ borderColor: '#E0D0BC', color: '#8B6A47' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
