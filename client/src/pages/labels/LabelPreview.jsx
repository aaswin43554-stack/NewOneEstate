import { useState, useEffect, useRef } from 'react';
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

function LabelCard({ label, form }) {
  const d = { ...label, ...form };

  if (d.label_image) {
    return (
      <div
        className="label-card rounded-2xl overflow-hidden shadow-sm"
        style={{ border: '1px solid #C8A87A', maxWidth: 380, width: '100%' }}
      >
        <img
          src={d.label_image}
          alt="Label"
          style={{ width: '100%', display: 'block' }}
        />
      </div>
    );
  }

  return (
    <div
      className="label-card rounded-2xl overflow-hidden shadow-sm"
      style={{ border: '1px solid #C8A87A', background: '#FDFAF6', maxWidth: 380, width: '100%' }}
    >
      <div className="px-5 py-8 text-center">
        <p style={{ fontSize: 12, color: '#A8896A' }}>Upload a label image to preview</p>
      </div>
    </div>
  );
}

function LabelRow({ label, value }) {
  return (
    <div className="flex gap-2">
      <span style={{ color: '#A8896A', minWidth: 52 }}>{label}</span>
      <span style={{ color: '#2A1A0C', fontWeight: 500 }}>{value}</span>
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

      {/* Image upload */}
      <div>
        <label className="text-xs text-coffee-500 block mb-2">Label Image (optional)</label>
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
