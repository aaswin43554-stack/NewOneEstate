import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';

const TZ = 'Asia/Vientiane';

const STATUS_COLORS = {
  prospect:      'bg-gray-100 text-gray-600',
  active_buyer:  'bg-green-100 text-green-700',
  private_list:  'bg-purple-100 text-purple-700',
  trade_account: 'bg-blue-100 text-blue-700',
};
const REQUEST_STATUS_COLORS = {
  pending:   'bg-gray-100 text-gray-700',
  confirmed: 'bg-green-100 text-green-700',
  fulfilled: 'bg-blue-100 text-blue-700',
};
const SEGMENT_COLORS = {
  Laos:      'bg-coffee-100 text-coffee-700',
  Thailand:  'bg-amber-100 text-amber-700',
  Malaysia:  'bg-green-100 text-green-700',
  Singapore: 'bg-blue-100 text-blue-700',
  Other:     'bg-gray-100 text-gray-600',
};
const PROCESS_COLORS = {
  Washed:    'bg-blue-100 text-blue-700',
  Honey:     'bg-amber-100 text-amber-700',
  Natural:   'bg-green-100 text-green-700',
  Anaerobic: 'bg-purple-100 text-purple-700',
};

function statusLabel(s) {
  return (
    { prospect: 'Prospect', active_buyer: 'Active Buyer', private_list: 'Private List', trade_account: 'Trade Account' }[s] || s
  );
}

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

  const [contact, setContact] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [linkModal, setLinkModal] = useState(false);
  const [allRequests, setAllRequests] = useState([]);
  const [reqSearch, setReqSearch] = useState('');
  const [selectedReqId, setSelectedReqId] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState('');

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

  if (loading) return <Layout><div className="p-6 text-coffee-600">Loading…</div></Layout>;
  if (!contact) return <Layout><div className="p-6 text-red-600">Contact not found.</div></Layout>;

  return (
    <Layout>
      <div className="max-w-3xl mx-auto p-4 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-coffee-900">{contact.name}</h1>
          <span className={`text-xs px-2 py-1 rounded font-semibold ${STATUS_COLORS[contact.status] || ''}`}>
            {statusLabel(contact.status)}
          </span>
          <span className={`text-xs px-2 py-1 rounded font-semibold ${SEGMENT_COLORS[contact.market_segment] || 'bg-gray-100 text-gray-600'}`}>
            {contact.market_segment}
          </span>
        </div>

        {/* Contact info */}
        <div className="bg-white border border-coffee-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-coffee-800">Contact Info</h2>
            <button
              onClick={() => navigate(`/contacts/${id}/edit`)}
              className="px-3 py-1.5 border border-coffee-300 text-coffee-700 rounded text-xs font-semibold hover:bg-coffee-50"
            >
              Edit
            </button>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-coffee-500 mb-0.5">Primary Contact Method</dt>
              <dd className="text-coffee-900 font-medium">{contact.primary_contact_method || '—'}</dd>
            </div>
            {contact.preferred_channel && (
              <div>
                <dt className="text-xs text-coffee-500 mb-0.5">Preferred Channel</dt>
                <dd className="text-coffee-900">{contact.preferred_channel}</dd>
              </div>
            )}
            {contact.location && (
              <div>
                <dt className="text-xs text-coffee-500 mb-0.5">Location</dt>
                <dd className="text-coffee-900">{contact.location}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Personal Notes */}
        {contact.personal_notes && (
          <div className="bg-white border border-coffee-200 rounded-lg p-4">
            <h2 className="text-sm font-semibold text-coffee-800 mb-2">Personal Notes</h2>
            <p className="text-sm text-coffee-700 whitespace-pre-wrap leading-relaxed">{contact.personal_notes}</p>
          </div>
        )}

        {/* Purchase History */}
        <div className="bg-white border border-coffee-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-coffee-800">Purchase History</h2>
            <button
              onClick={openLinkModal}
              className="px-3 py-1.5 bg-coffee-700 text-white rounded text-xs font-semibold hover:bg-coffee-800"
            >
              Link to allocation request
            </button>
          </div>

          <p className="text-xs text-coffee-500 mb-4">
            Participated in{' '}
            <strong className="text-coffee-800">{contact.total_allocations_participated ?? 0}</strong>
            {' '}allocations · Return rate:{' '}
            <strong className="text-coffee-800">{fmtRate(contact.return_rate)}</strong>
          </p>

          {history.length === 0 ? (
            <p className="text-sm text-coffee-400">No purchase history yet.</p>
          ) : (
            <ul className="space-y-3">
              {history.map((h, i) => (
                <li key={h.id || i} className="flex items-start gap-3 border-b border-coffee-50 pb-3 last:border-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span className="font-mono text-sm font-semibold text-coffee-900">{h.allocation_code}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${PROCESS_COLORS[h.process] || 'bg-gray-100 text-gray-600'}`}>
                        {h.process}
                      </span>
                      <span className="text-xs text-coffee-500">{h.harvest_year}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-coffee-600">
                      <span>{h.quantity_bags} bag{h.quantity_bags !== 1 ? 's' : ''}</span>
                      <span className="text-coffee-300">·</span>
                      <span className={`px-1.5 py-0.5 rounded font-medium capitalize ${REQUEST_STATUS_COLORS[h.status] || ''}`}>
                        {h.status}
                      </span>
                      <span className="text-coffee-300">·</span>
                      <span>{fmtDate(h.created_at)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Link request modal */}
      {linkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-coffee-900 mb-4">Link Allocation Request</h2>

            <input
              type="text"
              placeholder="Search by allocation code or contact…"
              value={reqSearch}
              onChange={e => setReqSearch(e.target.value)}
              className="w-full border border-coffee-300 rounded-md px-3 py-2 text-sm mb-3"
              autoFocus
            />

            <div className="max-h-52 overflow-y-auto border border-coffee-200 rounded-md mb-4">
              {filteredRequests.length === 0 ? (
                <p className="text-sm text-coffee-400 p-3">No requests found.</p>
              ) : (
                filteredRequests.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReqId(r.id)}
                    className={`w-full text-left px-3 py-2 text-sm border-b border-coffee-50 last:border-0 transition-colors ${
                      selectedReqId === r.id
                        ? 'bg-coffee-700 text-white'
                        : 'hover:bg-coffee-50 text-coffee-800'
                    }`}
                  >
                    <span className="font-mono font-semibold">{r.allocation_code}</span>
                    <span className={`text-xs ml-2 ${selectedReqId === r.id ? 'text-coffee-200' : 'text-coffee-500'}`}>
                      {r.contact_name} · {fmtDate(r.created_at)}
                    </span>
                  </button>
                ))
              )}
            </div>

            {linkError && <p className="text-red-600 text-sm mb-3">{linkError}</p>}

            <form onSubmit={submitLink} className="flex gap-3">
              <button
                type="submit"
                disabled={linkSaving || !selectedReqId}
                className="flex-1 py-2 bg-coffee-700 text-white rounded font-semibold text-sm disabled:opacity-40"
              >
                {linkSaving ? 'Linking…' : 'Link Request'}
              </button>
              <button
                type="button"
                onClick={() => setLinkModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded font-semibold text-sm"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
