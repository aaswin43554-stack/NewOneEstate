import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const PROCESS_COLORS = {
  Washed:    { bg: '#EBF3FF', text: '#1E4DA1' },
  Honey:     { bg: '#FEF3C7', text: '#92400E' },
  Natural:   { bg: '#DCFCE7', text: '#166534' },
  Anaerobic: { bg: '#F3E8FF', text: '#6B21A8' },
};

const DOC_LABELS = {
  field_notes:       'Field Notes',
  roast_log:         'Roast Log',
  cupping_record:    'Cupping Record',
  allocation_record: 'Allocation Record',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ProcessBadge({ process }) {
  const c = PROCESS_COLORS[process] || { bg: '#F3F4F6', text: '#374151' };
  return (
    <span
      style={{ background: c.bg, color: c.text, fontWeight: 500, fontSize: 12, padding: '2px 10px', borderRadius: 99, display: 'inline-block' }}
    >
      {process}
    </span>
  );
}

function DateCard({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#A8896A', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 500, color: '#221508' }}>{value}</p>
    </div>
  );
}

export default function PublicJournal() {
  const { code } = useParams();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    fetch(`/api/public/journal/${encodeURIComponent(code)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => setData(d))
      .catch(() => setError('This coffee\'s story could not be found.'))
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#FDFAF6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#A8896A', fontSize: 14 }}>Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: '#FDFAF6', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#6F5035', fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Not Found</p>
          <p style={{ color: '#A8896A', fontSize: 14 }}>{error || 'Journal not found.'}</p>
        </div>
      </div>
    );
  }

  const { allocation, label, journal } = data;

  return (
    <div style={{ minHeight: '100vh', background: '#FDFAF6', fontFamily: 'Inter, sans-serif' }}>

      {/* Top bar */}
      <div style={{ background: '#533A24', padding: '12px 24px', textAlign: 'center' }}>
        <p style={{ color: '#FAF6F0', fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 500, margin: 0 }}>
          One Estate Coffee
        </p>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 64px' }}>

        {/* Allocation header */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <h1 style={{ fontSize: 32, fontWeight: 600, color: '#221508', margin: 0, fontFamily: 'monospace' }}>
              {allocation.allocation_code}
            </h1>
            <ProcessBadge process={allocation.process} />
          </div>
          {allocation.estate && (
            <p style={{ color: '#A8896A', fontSize: 14, margin: 0 }}>{allocation.estate}</p>
          )}
          {allocation.harvest_year && (
            <p style={{ color: '#A8896A', fontSize: 13, margin: '2px 0 0' }}>{allocation.harvest_year} Harvest</p>
          )}
        </div>

        {/* Dates */}
        {label && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E0D0BC', borderRadius: 14, padding: '20px 24px', marginBottom: 20 }}>
            <p style={{ fontSize: 11, color: '#A8896A', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16, fontWeight: 500 }}>
              Dates
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <DateCard
                label="Roasted"
                value={
                  label.roast_date_start
                    ? label.roast_date_start === label.roast_date_end
                      ? fmtDate(label.roast_date_start)
                      : `${fmtDate(label.roast_date_start)} – ${fmtDate(label.roast_date_end)}`
                    : '—'
                }
              />
              <DateCard label="Ready to Brew" value={fmtDate(label.ready_to_brew_date)} />
              <DateCard label="Best Before"   value={fmtDate(label.best_consumed_by_date)} />
            </div>
          </div>
        )}

        {/* Journal entries */}
        {journal.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 11, color: '#A8896A', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500, margin: 0 }}>
              The Story of This Coffee
            </p>
            {journal.map(entry => (
              <div
                key={entry.document_type}
                style={{ background: '#FFFFFF', border: '1px solid #E0D0BC', borderRadius: 14, overflow: 'hidden' }}
              >
                <div style={{ padding: '12px 20px', borderBottom: '1px solid #F2EAE0', background: '#FAF6F0' }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#533A24' }}>
                    {DOC_LABELS[entry.document_type] || entry.document_type}
                  </p>
                </div>
                <pre
                  style={{
                    margin: 0, padding: '16px 20px',
                    fontSize: 13, lineHeight: 1.7, color: '#3D2B1A',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    fontFamily: 'Inter, sans-serif',
                  }}
                >
                  {entry.published_content}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: '#FFFFFF', border: '1px solid #E0D0BC', borderRadius: 14, padding: 40, textAlign: 'center' }}>
            <p style={{ color: '#A8896A', fontSize: 14, margin: 0 }}>
              Documentation for this coffee is being prepared.
            </p>
          </div>
        )}

        <p style={{ textAlign: 'center', color: '#C4AD96', fontSize: 12, marginTop: 40 }}>
          One Estate Coffee · Ops Platform
        </p>
      </div>
    </div>
  );
}
