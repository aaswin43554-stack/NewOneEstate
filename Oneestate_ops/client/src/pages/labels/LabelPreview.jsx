import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const TZ = 'Asia/Vientiane';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ });
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
}

export default function LabelPreview() {
  const { allocation_id } = useParams();
  const [label,   setLabel]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound,setNotFound]= useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    setNotFound(false);
    api.get(`/labels/${allocation_id}`)
      .then(r => { if (r.status === 404) { setNotFound(true); return null; } return r.json(); })
      .then(d => { if (d?.label) setLabel(d.label); })
      .finally(() => setLoading(false));
  }
  useEffect(load, [allocation_id]);

  async function generate() {
    setGenerating(true); setError('');
    const res = await api.post('/labels/generate', { allocation_id });
    const d = await res.json();
    if (res.ok) { setLabel(d.label); setNotFound(false); }
    else { setError(d.error || 'Failed to generate label.'); }
    setGenerating(false);
    setConfirmRegen(false);
  }

  if (loading) return <Layout><div className="p-6 text-coffee-600">Loading…</div></Layout>;

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-4">
        <h1 className="text-2xl font-bold text-coffee-900 mb-5">Bag Label</h1>

        {notFound && !label && (
          <div className="text-center py-12">
            <p className="text-coffee-500 mb-4">No label generated for this allocation yet.</p>
            <button onClick={generate} disabled={generating}
              className="px-6 py-3 bg-coffee-700 text-white rounded-md font-semibold hover:bg-coffee-800 disabled:opacity-50">
              {generating ? 'Generating…' : 'Generate Label'}
            </button>
            {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
          </div>
        )}

        {label && (
          <>
            {/* Label card */}
            <div className="label-card bg-white border-2 border-coffee-900 rounded-lg overflow-hidden w-full max-w-xl mx-auto mb-5"
              style={{ fontFamily: 'Georgia, serif' }}>
              {/* Top strip */}
              <div className="bg-coffee-900 text-white text-center py-2 tracking-widest text-xs font-bold uppercase">
                One Estate Coffee
              </div>
              <div className="flex p-5 gap-4 items-start">
                {/* Left: text info */}
                <div className="flex-1 space-y-1">
                  <div className="text-3xl font-bold text-coffee-900">{label.allocation_code || '—'}</div>
                  <div className="text-base text-coffee-700">{label.process || '—'}</div>
                  <div className="text-sm text-coffee-600">{label.harvest_year ? `${label.harvest_year} Harvest` : ''}</div>
                  <div className="text-xs text-coffee-500 italic">Suan Saket Estate · Doi Saket, Chiang Mai</div>
                  <div className="pt-2 space-y-0.5">
                    <div className="text-xs text-coffee-700">
                      Roasted: {fmtDate(label.roast_date_start)}
                      {label.roast_date_end !== label.roast_date_start ? ` – ${fmtDate(label.roast_date_end)}` : ''}
                    </div>
                    <div className="text-xs text-coffee-700">Ready to brew: {fmtDate(label.ready_to_brew_date)}</div>
                    <div className="text-xs text-coffee-700">Best before: {fmtDate(label.best_consumed_by_date)}</div>
                  </div>
                </div>
                {/* Right: QR code */}
                {label.qr_code_base64 && (
                  <div className="flex-shrink-0">
                    <img
                      src={`data:image/png;base64,${label.qr_code_base64}`}
                      alt="QR code"
                      className="w-28 h-28"
                    />
                  </div>
                )}
              </div>
              {/* Bottom strip */}
              <div className="bg-coffee-50 border-t border-coffee-200 text-center py-1.5 text-xs text-coffee-400">
                Template {label.template_version} · Lot traceability: {label.allocation_code}
              </div>
            </div>

            {/* Meta info */}
            <div className="text-sm text-coffee-500 text-center mb-4">
              Generated: {fmtDateTime(label.generated_at)} · Template: {label.template_version}
            </div>

            {/* Actions */}
            <div className="flex justify-center gap-3">
              <button onClick={() => window.print()}
                className="px-6 py-2 bg-coffee-700 text-white rounded-md font-semibold hover:bg-coffee-800">
                Print Label
              </button>
              <button onClick={() => setConfirmRegen(true)}
                className="px-6 py-2 border border-coffee-300 text-coffee-700 rounded-md font-semibold hover:bg-coffee-50">
                Regenerate
              </button>
            </div>
            {error && <p className="text-red-600 text-sm text-center mt-3">{error}</p>}
          </>
        )}

        {/* Regenerate confirm */}
        {confirmRegen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
              <h2 className="text-lg font-bold text-coffee-900 mb-2">Regenerate Label?</h2>
              <p className="text-sm text-coffee-700 mb-5">Regenerate with current session data?</p>
              <div className="flex gap-3">
                <button onClick={generate} disabled={generating}
                  className="flex-1 py-2 bg-coffee-700 text-white rounded font-semibold text-sm disabled:opacity-50">
                  {generating ? 'Generating…' : 'Regenerate'}
                </button>
                <button onClick={() => setConfirmRegen(false)} className="px-4 py-2 bg-gray-200 rounded font-semibold text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Print CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .label-card, .label-card * { visibility: visible !important; }
          .label-card {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            border: none !important;
          }
        }
      `}</style>
    </Layout>
  );
}
