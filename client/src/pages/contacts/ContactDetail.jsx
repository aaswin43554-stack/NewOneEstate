import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { Button, StatusBadge, ProcessBadge, PanelField } from '../../components/ui';

const TZ = 'Asia/Vientiane';

const STATUS_MAP = {
  prospect:      { status: 'draft',        label: 'Prospect' },
  active_buyer:  { status: 'active',       label: 'Active Buyer' },
  private_list:  { status: 'published',    label: 'Private List' },
  trade_account: { status: 'under_review', label: 'Trade Account' },
};

const SEGMENT_COLORS = {
  Laos:      { bg: '#F2EAE0', color: '#8B6A47' },
  Thailand:  { bg: '#FAEEDA', color: '#BA7517' },
  Malaysia:  { bg: '#EAF3DE', color: '#3B6D11' },
  Singapore: { bg: '#E6F1FB', color: '#185FA5' },
  Other:     { bg: '#F1EFE8', color: '#888780' },
};

const REQUEST_STATUS_META = {
  pending:   { cls: 'badge-draft',        label: 'Pending' },
  confirmed: { cls: 'badge-published',    label: 'Confirmed' },
  fulfilled: { cls: 'badge-under-review', label: 'Fulfilled' },
};

function fmtRate(r) {
  if (r == null) return '—';
  const pct = r <= 1 ? Math.round(r * 100) : Math.round(r);
  return `${pct}%`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: TZ });
}

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [contact,     setContact]     = useState(null);
  const [history,     setHistory]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [linkModal,   setLinkModal]   = useState(false);
  const [allRequests, setAllRequests] = useState([]);
  const [reqSearch,   setReqSearch]   = useState('');
  const [selectedReqId, setSelectedReqId] = useState('');
  const [linkSaving,  setLinkSaving]  = useState(false);
  const [linkError,   setLinkError]   = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/contacts/${id}`)
      .then(r => r.json())
      .then(d => {
        setContact(d.contact);
        setHistory(d.purchase_history || []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  async function openLinkModal() {
    setReqSearch('');
    setSelectedReqId('');
    setLinkError('');
    const res = await api.get('/allocation-requests');
    const d = await res.json();
    setAllRequests(d.requests || []);
    setLinkModal(true);
  }

  async function submitLink(e) {
    e.preventDefault();
    if (!selectedReqId) { setLinkError('Select a request.'); return; }
    setLinkSaving(true);
    setLinkError('');
    const res = await api.post(`/contacts/${id}/link-request`, { allocation_request_id: selectedReqId });
    if (res.ok) {
      setLinkModal(false);
      load();
    } else {
      const d = await res.json();
      setLinkError(d.error || 'Failed.');
    }
    setLinkSaving(false);
  }

  const filteredRequests = allRequests.filter(r => {
    if (!reqSearch) return true;
    const q = reqSearch.toLowerCase();
    return (
      (r.allocation_code || '').toLowerCase().includes(q) ||
      (r.contact_name || '').toLowerCase().includes(q) ||
      fmtDate(r.created_at).includes(q)
    );
  });

  if (loading) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;
  if (!contact) return <Layout><div className="px-6 py-6 text-sm" style={{ color: '#A32D2D' }}>Contact not found.</div></Layout>;

  const badgeMeta = STATUS_MAP[contact.status] || STATUS_MAP.prospect;
  const segStyle  = SEGMENT_COLORS[contact.market_segment] || SEGMENT_COLORS.Other;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl text-coffee-900" style={{ fontWeight: 500 }}>{contact.name}</h1>
          <StatusBadge status={badgeMeta.status} label={badgeMeta.label} />
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: segStyle.bg, color: segStyle.color }}
          >
            {contact.market_segment}
          </span>
        </div>

        {/* Contact Info */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-coffee-400 uppercase tracking-wide">Contact Info</p>
            <Button variant="ghost" size="sm" onClick={() => navigate(`/contacts/${id}/edit`)}>
              Edit
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PanelField label="Primary Contact Method" value={contact.primary_contact_method} />
            {contact.preferred_channel && (
              <PanelField label="Preferred Channel" value={contact.preferred_channel} />
            )}
            {contact.location && (
              <PanelField label="Location" value={contact.location} />
            )}
          </div>
        </div>

        {/* Personal Notes */}
        {contact.personal_notes && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5">
            <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Personal Notes</p>
            <p className="text-sm text-coffee-700 whitespace-pre-wrap leading-relaxed">{contact.personal_notes}</p>
          </div>
        )}

        {/* Purchase History */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-coffee-400 uppercase tracking-wide">Purchase History</p>
            <Button variant="secondary" size="sm" onClick={openLinkModal}>
              Link Request
            </Button>
          </div>

          <p className="text-xs text-coffee-400 mb-4">
            Participated in{' '}
            <span className="text-coffee-800" style={{ fontWeight: 500 }}>
              {contact.total_allocations_participated ?? 0}
            </span>{' '}
            allocations · Return rate:{' '}
            <span className="text-coffee-800" style={{ fontWeight: 500 }}>
              {fmtRate(contact.return_rate)}
            </span>
          </p>

          {history.length === 0 ? (
            <p className="text-sm text-coffee-300">No purchase history yet.</p>
          ) : (
            <ul className="space-y-3">
              {history.map((h, i) => {
                const reqMeta = REQUEST_STATUS_META[h.status] || { cls: 'badge-draft', label: h.status };
                return (
                  <li key={h.id || i} className="flex items-start gap-3 pb-3 last:pb-0" style={{ borderBottom: '1px solid #F2EAE0' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="font-mono text-sm text-coffee-900" style={{ fontWeight: 500 }}>
                          {h.allocation_code}
                        </span>
                        <ProcessBadge process={h.process} />
                        <span className="text-xs text-coffee-400">{h.harvest_year}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-coffee-500">
                        <span>{h.quantity_bags} bag{h.quantity_bags !== 1 ? 's' : ''}</span>
                        <span className="text-coffee-200">·</span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full capitalize ${reqMeta.cls}`}>
                          {reqMeta.label}
                        </span>
                        <span className="text-coffee-200">·</span>
                        <span>{fmtDate(h.created_at)}</span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Link request modal */}
      {linkModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(34,21,8,0.2)' }}
        >
          <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-md p-6">
            <h2 className="text-base text-coffee-900 mb-4" style={{ fontWeight: 500 }}>
              Link Allocation Request
            </h2>

            <input
              type="text"
              placeholder="Search by allocation code or contact…"
              value={reqSearch}
              onChange={e => setReqSearch(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg mb-3 focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100"
              autoFocus
            />

            <div
              className="max-h-52 overflow-y-auto rounded-xl border border-coffee-200 mb-4"
            >
              {filteredRequests.length === 0 ? (
                <p className="text-sm text-coffee-300 p-3">No requests found.</p>
              ) : (
                filteredRequests.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReqId(r.id)}
                    className="w-full text-left px-3 py-2 text-sm transition-colors"
                    style={{
                      borderBottom: '1px solid #F2EAE0',
                      background: selectedReqId === r.id ? '#533A24' : undefined,
                      color:      selectedReqId === r.id ? '#fff' : '#3A2616',
                    }}
                  >
                    <span className="font-mono" style={{ fontWeight: 500 }}>{r.allocation_code}</span>
                    <span className="text-xs ml-2" style={{ color: selectedReqId === r.id ? '#C9B49A' : '#A8896A' }}>
                      {r.contact_name} · {fmtDate(r.created_at)}
                    </span>
                  </button>
                ))
              )}
            </div>

            {linkError && (
              <p className="text-xs mb-3" style={{ color: '#A32D2D' }}>{linkError}</p>
            )}

            <form onSubmit={submitLink} className="flex gap-3">
              <Button type="submit" disabled={linkSaving || !selectedReqId} className="flex-1 justify-center">
                {linkSaving ? 'Linking…' : 'Link Request'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setLinkModal(false)}>
                Cancel
              </Button>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
