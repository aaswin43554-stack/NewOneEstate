import { useState, useEffect, useRef, Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, FormInput } from '../../components/ui';
import { Printer, Save, Upload, ArrowLeft, Trash2 } from 'lucide-react';

const PROCESS_LABEL = {
  Washed:    'Washed Process',
  Honey:     'Honey Process',
  Natural:   'Natural Process',
  Anaerobic: 'Anaerobic Process',
};

function fmtRoastDates(start, end) {
  if (!start) return null;
  const s = new Date(start);
  const sDay = s.getUTCDate();
  const sMon = String(s.getUTCMonth() + 1).padStart(2, '0');
  if (!end || start === end) return `${sDay}/${sMon}`;
  const e = new Date(end);
  const eDay = e.getUTCDate();
  const eMon = String(e.getUTCMonth() + 1).padStart(2, '0');
  return sMon === eMon ? `${sDay}-${eDay}/${eMon}` : `${sDay}/${sMon}-${eDay}/${eMon}`;
}

function LabelCard({ label, form }) {
  const d = { ...label, ...form };

  const qrSrc = d.label_image
    ? d.label_image
    : d.qr_code_base64
      ? `data:image/png;base64,${d.qr_code_base64}`
      : null;

  const flavours = d.flavour_notes
    ? d.flavour_notes.split(/[/\n]/).map(f => f.trim()).filter(Boolean)
    : [];

  const roastStr = fmtRoastDates(d.roast_date_start, d.roast_date_end);

  // Match the printed OEC label: classic serif throughout, ruled-grid rows.
  const serif = "'Times New Roman', Georgia, 'Liberation Serif', serif";
  const ink   = '#241308';   // near-black brown for primary text
  const muted = '#8A6E4E';   // grey-brown for labels
  const line  = '#D9C7AC';   // hairline rules

  const cellLabel = {
    fontFamily: serif, fontSize: 12.5, color: muted,
    padding: '11px 12px 11px 28px',
    borderBottom: `1px solid ${line}`, borderRight: `1px solid ${line}`,
  };
  const cellValue = {
    fontFamily: serif, fontSize: 13.5, color: ink,
    padding: '11px 28px 11px 16px',
    borderBottom: `1px solid ${line}`,
  };

  return (
    <div
      className="label-card overflow-hidden shadow-sm"
      style={{ border: `1px solid ${line}`, borderRadius: 6, background: '#FFFDF9', maxWidth: 380, width: '100%' }}
    >
      {/* Brand header */}
      <div style={{ borderBottom: `1px solid ${line}`, padding: '26px 28px 18px', textAlign: 'center' }}>
        <div style={{ fontFamily: serif, fontSize: 29, fontWeight: 400, letterSpacing: '0.11em', color: ink, lineHeight: 1 }}>
          ONE ESTATE
        </div>
        <div style={{ fontFamily: serif, fontSize: 9, letterSpacing: '0.26em', color: muted, marginTop: 7 }}>
          SINGLE-ESTATE SPECIALTY COFFEE
        </div>
      </div>

      {/* Allocation code */}
      <div style={{ borderBottom: `1px solid ${line}`, padding: '14px 28px 16px' }}>
        <div style={{ fontFamily: serif, fontSize: 11, color: muted }}>Allocation</div>
        <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, color: ink, letterSpacing: '0.02em', lineHeight: 1.15 }}>
          {d.allocation_code || '—'}
        </div>
      </div>

      {/* Estate + process */}
      <div style={{ borderBottom: `1px solid ${line}`, padding: '15px 28px 16px' }}>
        <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 400, color: ink, lineHeight: 1.2 }}>
          {d.estate_location || '—'}
        </div>
        <div style={{ fontFamily: serif, fontSize: 12, color: muted, marginTop: 4 }}>
          {PROCESS_LABEL[d.process] || d.process || ''}
        </div>
      </div>

      {/* Detail grid — ruled rows with a continuous vertical divider */}
      <div style={{ display: 'grid', gridTemplateColumns: '33% 1fr' }}>
        {[
          ['Harvest', d.harvest_year || '—'],
          ['Variety', d.variety      || '—'],
          ['Roast',   d.roast_level  || '—'],
        ].map(([k, v]) => (
          <Fragment key={k}>
            <div style={cellLabel}>{k}</div>
            <div style={cellValue}>{v}</div>
          </Fragment>
        ))}

        {/* Profile row (multi-line + QR) */}
        <div style={cellLabel}>Profile</div>
        <div style={{ ...cellValue, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div>
            {flavours.length > 0
              ? flavours.map((f, i) => (
                  <div key={i} style={{ lineHeight: 1.5 }}>{f}</div>
                ))
              : '—'}
          </div>
          {qrSrc && (
            <img src={qrSrc} alt="QR" style={{ width: 62, height: 62, flexShrink: 0 }} />
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '12px 28px 14px', fontFamily: serif }}>
        <span style={{ fontSize: 11, color: muted }}>Net Wt. {d.net_weight_g || 200}g</span>
        {roastStr && (
          <>
            <span style={{ fontSize: 11, color: line, margin: '0 9px' }}>•</span>
            <span style={{ fontSize: 11, color: muted }}>Roasted {roastStr}</span>
          </>
        )}
      </div>
    </div>
  );
}

const INIT_FORM = {
  estate_location: '',
  variety:         '',
  roast_level:     '',
  flavour_notes:   '',
  net_weight_g:    200,
  label_image:     '',
};

export default function LabelPreview() {
  const { allocation_id } = useParams();
  const navigate          = useNavigate();
  const fileRef           = useRef(null);
  const { user }          = useAuth();
  const isAdmin           = user?.role === 'admin';

  const [label,      setLabel]      = useState(null);
  const [alloc,      setAlloc]      = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [notFound,   setNotFound]   = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [error,      setError]      = useState('');
  const [form,       setForm]       = useState(INIT_FORM);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  function syncForm(lbl) {
    setForm({
      estate_location: lbl.estate_location || '',
      variety:         lbl.variety         || '',
      roast_level:     lbl.roast_level     || '',
      flavour_notes:   lbl.flavour_notes   || '',
      net_weight_g:    lbl.net_weight_g    ?? 200,
      label_image:     lbl.label_image     || '',
    });
  }

  function load() {
    setLoading(true); setNotFound(false);
    api.get(`/labels/${allocation_id}`)
      .then(r => {
        if (r.status === 404) {
          setNotFound(true);
          return api.get(`/allocations/${allocation_id}`).then(r2 => r2.json()).then(d2 => {
            if (d2?.allocation) setAlloc(d2.allocation);
          });
        }
        return r.json().then(d => {
          if (d?.label) { setLabel(d.label); syncForm(d.label); }
        });
      })
      .finally(() => setLoading(false));
  }
  useEffect(load, [allocation_id]);

  async function generate() {
    setGenerating(true); setError('');
    const res = await api.post('/labels/generate', { allocation_id, ...formPayload() });
    const d   = await res.json();
    if (res.ok) { setLabel(d.label); syncForm(d.label); setNotFound(false); }
    else        { setError(d.error || 'Failed to generate label.'); }
    setGenerating(false);
  }

  function formPayload() {
    return {
      estate_location: form.estate_location || null,
      variety:         form.variety         || null,
      roast_level:     form.roast_level     || null,
      flavour_notes:   form.flavour_notes   || null,
      net_weight_g:    form.net_weight_g    || null,
      label_image:     form.label_image     || null,
    };
  }

  async function save() {
    if (!label) return;
    setSaving(true); setError(''); setSaved(false);
    const res = await api.put(`/labels/${label.id}`, formPayload());
    const d   = await res.json();
    if (res.ok) { setLabel(d.label); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    else        { setError(d.error || 'Failed to save.'); }
    setSaving(false);
  }

  async function confirmDelete() {
    if (!label) return;
    setDeleting(true); setError('');
    const res = await api.delete(`/labels/${label.id}`);
    if (res.ok) { navigate('/labels'); }
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || 'Failed to delete label.');
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setForm(f => ({ ...f, label_image: ev.target.result }));
    reader.readAsDataURL(file);
  }

  const set = k => v => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/labels')}
            className="flex items-center gap-1.5 text-coffee-400 hover:text-coffee-700 transition-colors text-sm"
          >
            <ArrowLeft size={14} /> Labels
          </button>
          {label && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer size={13} /> Print
              </Button>
              <Button variant="primary" onClick={save} disabled={saving}>
                <Save size={13} /> {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
              </Button>
              {isAdmin && (
                <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 size={13} /> Delete
                </Button>
              )}
            </div>
          )}
        </div>

        {notFound && !label ? (
          /* ── No label yet ── */
          <div className="grid md:grid-cols-[1fr_360px] gap-8 items-start">
            <div className="flex flex-col items-center gap-5">
              {/* Preview with form data */}
              <p className="text-xs text-coffee-400 uppercase tracking-wide self-start">Preview</p>
              <LabelCard
                label={alloc || { allocation_code: '', process: '' }}
                form={form}
              />
            </div>
            <FieldsForm
              form={form} set={set} fileRef={fileRef}
              onImageUpload={handleImageUpload}
              footer={
                <Button
                  variant="primary"
                  onClick={generate}
                  disabled={generating}
                  className="w-full justify-center"
                >
                  {generating ? 'Creating…' : 'Create Label'}
                </Button>
              }
            />
          </div>
        ) : label ? (
          /* ── Label exists ── */
          <div className="grid md:grid-cols-[1fr_360px] gap-8 items-start">
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs text-coffee-400 uppercase tracking-wide self-start">Label Preview</p>
              <LabelCard label={label} form={form} />
            </div>
            <FieldsForm
              form={form} set={set} fileRef={fileRef}
              onImageUpload={handleImageUpload}
              footer={
                <Button
                  variant="primary"
                  onClick={save}
                  disabled={saving}
                  className="w-full justify-center"
                >
                  <Save size={13} /> {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
                </Button>
              }
            />
          </div>
        ) : null}

        {error && (
          <p className="text-xs mt-4 text-center" style={{ color: '#A32D2D' }}>{error}</p>
        )}
      </div>

      {/* Delete label modal */}
      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(34,21,8,0.2)' }}>
          <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-sm p-6">
            <h3 className="text-base text-coffee-900 mb-2" style={{ fontWeight: 500 }}>Delete Label</h3>
            <p className="text-sm text-coffee-600 mb-5">
              This will remove the label for this allocation. You can recreate it at any time.
            </p>
            <div className="flex gap-3">
              <Button onClick={confirmDelete} disabled={deleting} className="flex-1 justify-center" variant="destructive">
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Print CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .label-card, .label-card * { visibility: visible !important; }
          .label-card {
            position: fixed !important;
            top: 0 !important; left: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </Layout>
  );
}

function FieldsForm({ form, set, fileRef, onImageUpload, footer }) {
  return (
    <div className="bg-white border border-coffee-200 rounded-xl p-5 space-y-4">
      <p className="text-xs text-coffee-400 uppercase tracking-wide">Label Fields</p>

      <div>
        <label className="text-xs text-coffee-500 block mb-1">Estate / Location</label>
        <FormInput
          value={form.estate_location}
          onChange={e => set('estate_location')(e.target.value)}
          placeholder="e.g. Suan Saket, Doi Saket"
        />
      </div>

      <div>
        <label className="text-xs text-coffee-500 block mb-1">Variety</label>
        <FormInput
          value={form.variety}
          onChange={e => set('variety')(e.target.value)}
          placeholder="e.g. Field Blend"
        />
      </div>

      <div>
        <label className="text-xs text-coffee-500 block mb-1">Roast</label>
        <FormInput
          value={form.roast_level}
          onChange={e => set('roast_level')(e.target.value)}
          placeholder="e.g. Omni"
        />
      </div>

      <div>
        <label className="text-xs text-coffee-500 block mb-1">Flavour / Profile</label>
        <FormInput
          value={form.flavour_notes}
          onChange={e => set('flavour_notes')(e.target.value)}
          placeholder="e.g. Floral / Apricot / Clean"
        />
      </div>

      <div>
        <label className="text-xs text-coffee-500 block mb-1">Net Weight (g)</label>
        <FormInput
          type="number"
          value={form.net_weight_g}
          onChange={e => set('net_weight_g')(parseInt(e.target.value) || '')}
          placeholder="200"
        />
      </div>

      {/* QR code upload */}
      <div>
        <label className="text-xs text-coffee-500 block mb-2">QR Code (optional — replaces auto-generated)</label>
        <input
          type="file"
          accept="image/*"
          ref={fileRef}
          onChange={onImageUpload}
          style={{ display: 'none' }}
        />
        {form.label_image ? (
          <div className="space-y-2">
            <img
              src={form.label_image}
              alt="Preview"
              className="w-full rounded-lg object-cover"
              style={{ maxHeight: 100, border: '1px solid #E0D0BC' }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                className="text-xs text-coffee-500 hover:text-coffee-700"
              >
                Replace image
              </button>
              <span className="text-coffee-300">·</span>
              <button
                onClick={() => set('label_image')('')}
                className="text-xs hover:text-coffee-700"
                style={{ color: '#A32D2D' }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-4 py-3 w-full rounded-xl text-sm text-coffee-400 hover:text-coffee-700 hover:bg-coffee-50 transition-colors"
            style={{ border: '1px dashed #D4C4AC' }}
          >
            <Upload size={14} />
            Upload image
          </button>
        )}
      </div>

      <div className="pt-1">{footer}</div>
    </div>
  );
}
