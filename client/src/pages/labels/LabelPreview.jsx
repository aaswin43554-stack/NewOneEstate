import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, ProcessBadge, StatCard } from '../../components/ui';
import { Printer, RefreshCw } from 'lucide-react';

const TZ = 'Asia/Vientiane';

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
}

function LabelCard({ label }) {
  return (
    <div
      className="label-card bg-white border border-coffee-200 rounded-xl overflow-hidden"
      style={{ maxWidth: 480, margin: '0 auto' }}
    >
      {/* Top bar */}
      <div
        className="text-center py-2 text-xs uppercase tracking-[0.2em]"
        style={{ background: '#533A24', color: '#FAF6F0', fontWeight: 500 }}
      >
        One Estate Coffee
      </div>

      <div className="p-6">
        {/* Allocation + QR row */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <p
              className="font-mono text-coffee-900 mb-1"
              style={{ fontSize: 32, fontWeight: 500, lineHeight: 1 }}
            >
              {label.allocation_code}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <ProcessBadge process={label.process} />
              {label.harvest_year && (
                <span className="text-xs text-coffee-400">{label.harvest_year} Harvest</span>
              )}
            </div>
          </div>
          {label.qr_code_base64 && (
            <div className="flex-shrink-0 p-2 border border-coffee-100 rounded-lg">
              <img
                src={`data:image/png;base64,${label.qr_code_base64}`}
                alt="QR code"
                style={{ width: 80, height: 80 }}
              />
            </div>
          )}
        </div>

        {/* Estate */}
        <p className="text-xs text-coffee-400 mb-4">
          Suan Saket Estate · Doi Saket, Chiang Mai, Thailand
        </p>

        {/* Dates grid */}
        <div
          className="grid grid-cols-3 gap-4 pt-4"
          style={{ borderTop: '1px solid #F2EAE0' }}
        >
          <div>
            <p className="text-xs text-coffee-300 uppercase tracking-wide mb-0.5">Roasted</p>
            <p className="text-xs text-coffee-700">
              {fmtDate(label.roast_date_start)}
              {label.roast_date_end !== label.roast_date_start && (
                <> – {fmtDate(label.roast_date_end)}</>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-coffee-300 uppercase tracking-wide mb-0.5">Ready</p>
            <p className="text-xs text-coffee-700">{fmtDate(label.ready_to_brew_date)}</p>
          </div>
          <div>
            <p className="text-xs text-coffee-300 uppercase tracking-wide mb-0.5">Best Before</p>
            <p className="text-xs text-coffee-700">{fmtDate(label.best_consumed_by_date)}</p>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="text-center py-1.5 text-xs text-coffee-300"
        style={{ background: '#FAF6F0', borderTop: '1px solid #F2EAE0' }}
      >
        Template {label.template_version}
      </div>
    </div>
  );
}

export default function LabelPreview() {
  const { allocation_id } = useParams();
  const navigate = useNavigate();
  const [label,        setLabel]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [notFound,     setNotFound]     = useState(false);
  const [generating,   setGenerating]   = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [error,        setError]        = useState('');

  function load() {
    setLoading(true);
    setNotFound(false);
    api.get(`/labels/${allocation_id}`)
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then(d => { if (d?.label) setLabel(d.label); })
      .finally(() => setLoading(false));
  }
  useEffect(load, [allocation_id]);

  async function generate() {
    setGenerating(true); setError('');
    const res = await api.post('/labels/generate', { allocation_id });
    const d   = await res.json();
    if (res.ok) { setLabel(d.label); setNotFound(false); }
    else { setError(d.error || 'Failed to generate label.'); }
    setGenerating(false);
    setConfirmRegen(false);
  }

  if (loading) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl text-coffee-900" style={{ fontWeight: 500 }}>
              Bag Label
            </h1>
            {label && (
              <p className="text-xs text-coffee-400 mt-0.5">
                Generated {fmtDateTime(label.generated_at)}
              </p>
            )}
          </div>
          {label && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setConfirmRegen(true)}
              >
                <RefreshCw size={13} /> Regenerate
              </Button>
              <Button
                variant="primary"
                onClick={() => window.print()}
              >
                <Printer size={13} /> Print Label
              </Button>
            </div>
          )}
        </div>

        {notFound && !label ? (
          <div
            className="flex flex-col items-center justify-center py-20 bg-white border border-coffee-200 rounded-xl"
          >
            <p className="text-sm text-coffee-400 mb-4">
              No label generated for this allocation yet.
            </p>
            <Button variant="primary" onClick={generate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate Label'}
            </Button>
            {error && (
              <p className="text-xs mt-3" style={{ color: '#A32D2D' }}>{error}</p>
            )}
          </div>
        ) : label ? (
          <div className="grid md:grid-cols-[1fr_320px] gap-6">
            {/* Label preview */}
            <LabelCard label={label} />

            {/* Metadata panel */}
            <div className="space-y-4">
              <div className="bg-white border border-coffee-200 rounded-xl p-5">
                <p className="text-xs text-coffee-400 uppercase tracking-wide mb-4">Label Details</p>
                <div className="space-y-3">
                  {[
                    { label: 'Allocation',   value: label.allocation_code },
                    { label: 'Process',      value: <ProcessBadge process={label.process} /> },
                    { label: 'Harvest Year', value: label.harvest_year },
                    { label: 'Template',     value: label.template_version },
                    { label: 'Generated',    value: fmtDateTime(label.generated_at) },
                  ].map(({ label: l, value }) => (
                    <div key={l}>
                      <p className="text-xs text-coffee-300 uppercase tracking-wide mb-0.5">{l}</p>
                      <p className="text-sm text-coffee-700">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-coffee-200 rounded-xl p-5">
                <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Dates</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-coffee-400">Roasted</span>
                    <span className="text-coffee-700">{fmtDate(label.roast_date_start)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-coffee-400">Ready to Brew</span>
                    <span className="text-coffee-700">{fmtDate(label.ready_to_brew_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-coffee-400">Best Before</span>
                    <span className="text-coffee-700">{fmtDate(label.best_consumed_by_date)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {error && label && (
          <p className="text-xs mt-3 text-center" style={{ color: '#A32D2D' }}>{error}</p>
        )}
      </div>

      {/* Regenerate confirm */}
      {confirmRegen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(34,21,8,0.2)' }}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 border border-coffee-200">
            <h2 className="text-base text-coffee-900 mb-2" style={{ fontWeight: 500 }}>
              Regenerate Label?
            </h2>
            <p className="text-sm text-coffee-500 mb-5">
              Regenerate with current session data?
            </p>
            <div className="flex gap-3">
              <Button
                variant="primary"
                onClick={generate}
                disabled={generating}
                className="flex-1 justify-center"
              >
                {generating ? 'Generating…' : 'Regenerate'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmRegen(false)}>
                Cancel
              </Button>
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
          }
        }
      `}</style>
    </Layout>
  );
}
