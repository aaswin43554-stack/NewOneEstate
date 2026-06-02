import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Layout from '../../components/Layout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, StatusBadge, ProcessBadge, FormInput } from '../../components/ui';

const TZ = 'Asia/Vientiane';

const JOURNAL_DOC_TYPES  = ['field_notes', 'roast_log', 'cupping_record', 'allocation_record'];
const JOURNAL_DOC_LABELS = {
  field_notes: 'Field Notes', roast_log: 'Roast Log',
  cupping_record: 'Cupping Record', allocation_record: 'Allocation Record',
};
const JOURNAL_STATUS_MAP = {
  draft:        { status: 'draft',        label: 'Draft' },
  under_review: { status: 'under_review', label: 'Under Review' },
  published:    { status: 'published',    label: 'Published' },
  missing:      { status: 'missing',      label: 'Missing' },
};

const STATE_LABELS = {
  upcoming: 'Upcoming', open_for_requests: 'Open for Requests', closed: 'Closed',
  roasting_in_progress: 'Roasting', resting: 'Resting',
  dispatched: 'Dispatched', archived: 'Archived',
};
const NEXT_LABELS = {
  upcoming: 'Open for Requests', open_for_requests: 'Close', closed: 'Start Roasting',
  roasting_in_progress: 'Move to Resting', resting: 'Dispatch', dispatched: 'Archive',
};
const REQUEST_STATUS_MAP = {
  pending:   { cls: 'badge-draft',        label: 'Pending' },
  confirmed: { cls: 'badge-published',    label: 'Confirmed' },
  fulfilled: { cls: 'badge-under-review', label: 'Fulfilled' },
};
const REST_DAYS_MAP = { Washed: 4, Honey: 5, Natural: 7, Anaerobic: 7 };

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });
}

export default function AllocationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data,             setData]             = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [transitionModal,  setTransitionModal]  = useState(false);
  const [transitionChecks, setTransitionChecks] = useState(null);
  const [transNotes,       setTransNotes]       = useState('');
  const [transSaving,      setTransSaving]      = useState(false);
  const [transError,       setTransError]       = useState('');
  const [reqForm, setReqForm] = useState({
    contact_name: '', contact_method: '', channel: 'WhatsApp', quantity_bags: 1, notes: '',
  });
  const [reqOpen,   setReqOpen]   = useState(false);
  const [reqSaving, setReqSaving] = useState(false);
  const [reqError,  setReqError]  = useState('');
  const [rowErrors,    setRowErrors]    = useState({});
  const [rowActioning, setRowActioning] = useState({});
  const [editingReq,   setEditingReq]   = useState(null); // { id, quantity_bags }
  const [editReqSaving, setEditReqSaving] = useState(false);
  const [journalDocs,       setJournalDocs]       = useState(null);
  const [journalLoading,    setJournalLoading]    = useState(false);
  const [journalGenerating, setJournalGenerating] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setRowErrors({});   // clear stale per-row errors on every reload
    api.get(`/allocations/${id}`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(load, [load]);

  const loadJournal = useCallback(() => {
    setJournalLoading(true);
    api.get(`/journal/${id}`)
      .then(r => r.json())
      .then(d => setJournalDocs(d.documents || null))
      .catch(() => setJournalDocs(null))
      .finally(() => setJournalLoading(false));
  }, [id]);

  useEffect(loadJournal, [loadJournal]);

  async function generateJournalDrafts() {
    setJournalGenerating(true);
    await api.post(`/journal/generate/${id}`, {});
    setJournalGenerating(false);
    loadJournal();
  }

  async function openTransitionModal() {
    const res = await api.get(`/allocations/${id}/transition-check`);
    const d = await res.json();
    setTransitionChecks(d);
    setTransitionModal(true);
  }

  async function confirmTransition() {
    setTransSaving(true);
    setTransError('');
    const res = await api.put(`/allocations/${id}/transition`, { notes: transNotes || undefined });
    const d = await res.json();
    if (res.ok) { setTransitionModal(false); setTransNotes(''); load(); }
    else { setTransError(d.error || 'Failed.'); }
    setTransSaving(false);
  }

  async function addRequest(e) {
    e.preventDefault();
    setReqSaving(true); setReqError('');
    const res = await api.post(`/allocations/${id}/requests`, reqForm);
    const d = await res.json();
    if (res.ok) {
      setReqOpen(false);
      setReqForm({ contact_name: '', contact_method: '', channel: 'WhatsApp', quantity_bags: 1, notes: '' });
      load();
    } else { setReqError(d.error || 'Failed.'); }
    setReqSaving(false);
  }

  async function updateReqStatus(reqId, status) {
    setRowActioning(p => ({ ...p, [reqId]: true }));
    setRowErrors(p => ({ ...p, [reqId]: null }));
    const res = await api.put(`/allocations/${id}/requests/${reqId}`, { status });
    const d = await res.json();
    if (res.ok) { load(); }
    else { setRowErrors(p => ({ ...p, [reqId]: d.error })); }
    setRowActioning(p => ({ ...p, [reqId]: false }));
  }

  async function saveReqEdit(reqId) {
    setEditReqSaving(true);
    const res = await api.put(`/allocations/${id}/requests/${reqId}`, {
      quantity_bags: parseInt(editingReq.quantity_bags),
    });
    const d = await res.json();
    if (res.ok) { setEditingReq(null); load(); }
    else { setRowErrors(p => ({ ...p, [reqId]: d.error })); }
    setEditReqSaving(false);
  }

  if (loading) return <Layout><div className="px-6 py-6 text-sm text-coffee-400">Loading…</div></Layout>;
  if (!data)   return <Layout><div className="px-6 py-6 text-sm" style={{ color: '#A32D2D' }}>Allocation not found.</div></Layout>;

  const { allocation: a, lot, requests, state_log, roast_sessions, dispatch_date, projected_bags, confirmed_bags } = data;
  const isArchived = a.state === 'archived';
  const isAdmin    = ['admin', 'roaster'].includes(user?.role);
  const bagPct     = projected_bags > 0 ? Math.min(100, Math.round((confirmed_bags / projected_bags) * 100)) : 0;
  const bagBarColor = bagPct >= 100 ? '#A32D2D' : bagPct >= 90 ? '#BA7517' : '#3B6D11';
  const allChecksPassed = transitionChecks?.checks?.every(c => c.passed);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl text-coffee-900" style={{ fontWeight: 500 }}>{a.allocation_code}</h1>
          <ProcessBadge process={a.process} />
          <span className="text-sm text-coffee-400">{a.harvest_year}</span>
          <StatusBadge
            status={a.state === 'archived' ? 'archived' : a.state === 'dispatched' ? 'published' : 'draft'}
            label={STATE_LABELS[a.state] || a.state}
          />
        </div>

        {/* State transition */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-coffee-800" style={{ fontWeight: 500 }}>
                {STATE_LABELS[a.state] || a.state}
              </p>
              {state_log.length > 0 && (
                <p className="text-xs text-coffee-400 mt-0.5">
                  by {state_log[state_log.length - 1].transitioned_by_name}
                  {' · '}{fmtDate(state_log[state_log.length - 1].transitioned_at)}
                </p>
              )}
            </div>
            {!isArchived && NEXT_LABELS[a.state] && isAdmin && (
              <Button onClick={openTransitionModal}>
                Move to: {NEXT_LABELS[a.state]}
              </Button>
            )}
            {isArchived && <p className="text-xs text-coffee-400">This allocation is sealed.</p>}
          </div>
        </div>

        {/* Requests */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-coffee-400 uppercase tracking-wide">Requests</p>
            <div className="flex gap-2">
              {!isArchived && isAdmin && (a.state === 'open_for_requests' || a.state === 'closed') && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setReqOpen(p => !p)}>
                    + Add Request
                  </Button>
                  <Link to={`/allocations/${id}/add-request`}>
                    <Button variant="ghost" size="sm">Quick Add</Button>
                  </Link>
                  {a.state === 'closed' && (
                    <span className="text-xs text-coffee-400 italic" title="Adding requests after close is an admin-only action">
                      Adding to closed allocation
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Inline request form */}
          {reqOpen && (
            <form onSubmit={addRequest} className="rounded-xl p-4 mb-4 space-y-3" style={{ background: '#FAF6F0', border: '1px solid #F2EAE0' }}>
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={reqForm.contact_name}
                  placeholder="Contact name *"
                  onChange={e => setReqForm(p => ({ ...p, contact_name: e.target.value }))}
                  className="h-9 px-3 text-sm border border-coffee-200 rounded-lg"
                  required
                />
                <input
                  value={reqForm.contact_method}
                  placeholder="WhatsApp / @handle / email *"
                  onChange={e => setReqForm(p => ({ ...p, contact_method: e.target.value }))}
                  className="h-9 px-3 text-sm border border-coffee-200 rounded-lg"
                  required
                />
                <select
                  value={reqForm.channel}
                  onChange={e => setReqForm(p => ({ ...p, channel: e.target.value }))}
                  className="h-9 px-3 text-sm border border-coffee-200 rounded-lg bg-white"
                >
                  {['WhatsApp', 'Instagram', 'Website', 'In_Person', 'Other'].map(c => <option key={c}>{c}</option>)}
                </select>
                <input
                  type="number"
                  min={1}
                  value={reqForm.quantity_bags}
                  placeholder="# bags *"
                  onChange={e => setReqForm(p => ({ ...p, quantity_bags: parseInt(e.target.value) }))}
                  className="h-9 px-3 text-sm border border-coffee-200 rounded-lg"
                  required
                />
              </div>
              <input
                value={reqForm.notes}
                placeholder="Notes (optional)"
                onChange={e => setReqForm(p => ({ ...p, notes: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-coffee-200 rounded-lg"
              />
              {reqError && <p className="text-xs" style={{ color: '#A32D2D' }}>{reqError}</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={reqSaving} size="sm">
                  {reqSaving ? 'Saving…' : 'Add'}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setReqOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}

          {/* Bag progress bar */}
          <div className="mb-4">
            <p className="text-xs text-coffee-400 mb-1.5">
              {confirmed_bags} bags confirmed of {projected_bags} projected
            </p>
            <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#F2EAE0' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${bagPct}%`, background: bagBarColor }}
              />
            </div>
          </div>

          {requests.length === 0 ? (
            <p className="text-sm text-coffee-300">No requests yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid #F2EAE0' }}>
                  <th className="text-left py-2 text-coffee-400 uppercase tracking-wide">Contact</th>
                  <th className="text-left py-2 text-coffee-400 uppercase tracking-wide">Channel</th>
                  <th className="text-right py-2 text-coffee-400 uppercase tracking-wide">Bags</th>
                  <th className="text-left py-2 pl-3 text-coffee-400 uppercase tracking-wide">Status</th>
                  {isAdmin && !isArchived && <th />}
                </tr>
              </thead>
              <tbody>
                {requests.map(r => {
                  const reqMeta = REQUEST_STATUS_MAP[r.status] || { cls: 'badge-draft', label: r.status };
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #F2EAE0' }}>
                      <td className="py-2 text-coffee-700">{r.contact_name}</td>
                      <td className="py-2">
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full"
                          style={{ background: '#F2EAE0', color: '#8B6A47' }}
                        >
                          {r.channel.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        {isAdmin && !isArchived && editingReq?.id === r.id ? (
                          <input
                            type="number"
                            min={1}
                            value={editingReq.quantity_bags}
                            onChange={e => setEditingReq(p => ({ ...p, quantity_bags: e.target.value }))}
                            className="w-16 h-7 px-2 text-sm text-right border border-coffee-400 rounded-lg"
                            autoFocus
                          />
                        ) : (
                          <span className="text-coffee-900" style={{ fontWeight: 500 }}>{r.quantity_bags}</span>
                        )}
                      </td>
                      <td className="py-2 pl-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full capitalize ${reqMeta.cls}`}>
                          {reqMeta.label}
                        </span>
                        {rowErrors[r.id] && (
                          <p className="text-xs mt-0.5" style={{ color: '#A32D2D' }}>{rowErrors[r.id]}</p>
                        )}
                      </td>
                      {isAdmin && !isArchived && (
                        <td className="py-2 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-3">
                            {editingReq?.id === r.id ? (
                              <>
                                <button
                                  onClick={() => saveReqEdit(r.id)}
                                  disabled={editReqSaving}
                                  className="text-xs disabled:opacity-40"
                                  style={{ color: '#3B6D11' }}
                                >
                                  {editReqSaving ? '…' : 'Save'}
                                </button>
                                <button
                                  onClick={() => setEditingReq(null)}
                                  className="text-xs text-coffee-400"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setEditingReq({ id: r.id, quantity_bags: r.quantity_bags })}
                                  className="text-xs text-coffee-400 hover:text-coffee-700 transition-colors"
                                  title="Edit bags"
                                >
                                  Edit
                                </button>
                                {r.status === 'pending' && (
                                  <button
                                    onClick={() => updateReqStatus(r.id, 'confirmed')}
                                    disabled={!!rowActioning[r.id]}
                                    className="text-xs transition-colors disabled:opacity-40"
                                    style={{ color: '#3B6D11' }}
                                  >
                                    {rowActioning[r.id] ? '…' : 'Confirm'}
                                  </button>
                                )}
                                {r.status === 'confirmed' && (
                                  <button
                                    onClick={() => updateReqStatus(r.id, 'fulfilled')}
                                    disabled={!!rowActioning[r.id]}
                                    className="text-xs transition-colors disabled:opacity-40"
                                    style={{ color: '#185FA5' }}
                                  >
                                    {rowActioning[r.id] ? '…' : 'Fulfil'}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Production Roast Sessions */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-coffee-400 uppercase tracking-wide">Production Roast Sessions</p>
            {a.state === 'roasting_in_progress' && isAdmin && (
              <Link to={`/roast/new?allocation_id=${a.id}`}>
                <Button size="sm">+ Start Production Roast</Button>
              </Link>
            )}
          </div>
          {roast_sessions.length === 0 ? (
            <p className="text-sm text-coffee-300">No production roast sessions logged yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid #F2EAE0' }}>
                  <th className="text-left py-2 text-coffee-400 uppercase tracking-wide">Batch</th>
                  <th className="text-left py-2 text-coffee-400 uppercase tracking-wide">Status</th>
                  <th className="text-right py-2 text-coffee-400 uppercase tracking-wide">Eject °C</th>
                  <th className="text-right py-2 text-coffee-400 uppercase tracking-wide">DTR%</th>
                  <th className="text-center py-2 text-coffee-400">⚠</th>
                </tr>
              </thead>
              <tbody>
                {roast_sessions.map(s => (
                  <tr
                    key={s.batch_code}
                    className="cursor-pointer"
                    style={{ borderBottom: '1px solid #F2EAE0' }}
                    onClick={() => navigate(`/roast/${s.id}`)}
                  >
                    <td className="py-2 font-mono text-coffee-800">{s.batch_code}</td>
                    <td className="py-2">
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full"
                        style={{ background: '#F2EAE0', color: '#8B6A47' }}
                      >
                        {s.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2 text-right text-coffee-700">{s.eject_temp_c || '—'}</td>
                    <td className="py-2 text-right text-coffee-700">{s.dtr ? `${s.dtr}%` : '—'}</td>
                    <td className="py-2 text-center" style={{ color: s.variance_flagged ? '#BA7517' : 'transparent' }}>
                      ⚠
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Dispatch date */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <p className="text-xs text-coffee-400 uppercase tracking-wide mb-2">Dispatch Date</p>
          {dispatch_date ? (
            <p className="text-sm text-coffee-700">
              Earliest: <span style={{ fontWeight: 500 }}>{dispatch_date}</span>
              <span className="text-coffee-400 ml-1">
                ({REST_DAYS_MAP[a.process] || 7} days rest for {a.process})
              </span>
            </p>
          ) : (
            <p className="text-sm text-coffee-300">Calculated once roast sessions are complete.</p>
          )}
        </div>

        {/* Label link */}
        {['resting', 'dispatched'].includes(a.state) && (
          <div className="bg-white border border-coffee-200 rounded-xl p-5 flex items-center justify-between">
            <p className="text-sm text-coffee-700">Bag Label</p>
            <Link to={`/labels/${a.id}`}>
              <Button variant="secondary" size="sm">View Label</Button>
            </Link>
          </div>
        )}

        {/* State history */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">State History</p>
          {state_log.length === 0 ? (
            <p className="text-sm text-coffee-300">No transitions yet.</p>
          ) : (
            <ul className="space-y-2">
              {state_log.map(entry => (
                <li key={entry.id} className="text-xs text-coffee-500">
                  <span className="text-coffee-700" style={{ fontWeight: 500 }}>
                    {(entry.from_state || '—').replace(/_/g, ' ')}
                  </span>
                  {' → '}
                  <span className="text-coffee-700" style={{ fontWeight: 500 }}>
                    {entry.to_state.replace(/_/g, ' ')}
                  </span>
                  {' · '}{entry.transitioned_by_name}
                  {' · '}{fmtDate(entry.transitioned_at)}
                  {entry.notes && <span className="text-coffee-400"> · {entry.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Journal Entries */}
        <div className="bg-white border border-coffee-200 rounded-xl p-5">
          <p className="text-xs text-coffee-400 uppercase tracking-wide mb-3">Journal Entries</p>
          {journalLoading ? (
            <p className="text-sm text-coffee-400">Loading…</p>
          ) : (
            <>
              {JOURNAL_DOC_TYPES.map(t => {
                const doc    = journalDocs?.[t];
                const status = doc?.status || 'missing';
                const meta   = JOURNAL_STATUS_MAP[status] || JOURNAL_STATUS_MAP.missing;
                return (
                  <div
                    key={t}
                    className="flex items-center justify-between py-2.5"
                    style={{ borderBottom: '1px solid #F2EAE0' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-coffee-700">{JOURNAL_DOC_LABELS[t]}</span>
                      <StatusBadge status={meta.status} label={meta.label} />
                    </div>
                    {doc?.id ? (
                      <Link to={`/journal/${id}/${t}`}>
                        <Button variant="ghost" size="sm">Open</Button>
                      </Link>
                    ) : (
                      <span className="text-xs text-coffee-300">—</span>
                    )}
                  </div>
                );
              })}
              {JOURNAL_DOC_TYPES.every(t => !journalDocs?.[t]?.id) && (
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={generateJournalDrafts}
                    disabled={journalGenerating}
                  >
                    {journalGenerating ? 'Generating…' : 'Generate journal drafts'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Transition modal */}
      {transitionModal && transitionChecks && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(34,21,8,0.2)' }}
        >
          <div className="bg-white rounded-2xl border border-coffee-200 w-full max-w-md p-6">
            {/* Header */}
            <div className="mb-4">
              <p className="text-xs text-coffee-400 uppercase tracking-wide mb-1">State Transition</p>
              <h2 className="text-base text-coffee-900" style={{ fontWeight: 500 }}>
                Move to: {STATE_LABELS[transitionChecks.next_state] || transitionChecks.next_state}
              </h2>
            </div>

            {/* Checks */}
            {transitionChecks.checks.length > 0 && (
              <ul className="space-y-3 mb-5">
                {transitionChecks.checks.map((c, i) => {
                  // Map failing checks to a direct fix link
                  const fixLink = !c.passed ? {
                    'Approved roast profile': { to: '/profiles', label: `Create a ${a.process} profile` },
                    'Confirmed requests':     null,
                    'Green stock reserved':   lot ? { to: `/inventory/${lot.id}`, label: 'Go to lot inventory' } : null,
                    'All sessions approved for bagging': { to: '/roast', label: 'Go to Roast Sessions' },
                    'Bag count within yield': null,
                  }[c.label] : null;

                  return (
                    <li
                      key={i}
                      className="rounded-lg px-3 py-2.5 flex items-start gap-3"
                      style={{
                        background: c.passed ? '#F2FAF0' : '#FDF4F4',
                        border: `1px solid ${c.passed ? '#C8E6C0' : '#F3C0C0'}`,
                      }}
                    >
                      <span
                        className="mt-0.5 text-xs"
                        style={{
                          color: c.passed ? '#3B6D11' : '#A32D2D',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        {c.passed ? '✓' : '✗'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm"
                          style={{
                            color: c.passed ? '#3B6D11' : '#7A1A1A',
                            fontWeight: 500,
                          }}
                        >
                          {c.label}
                        </p>
                        {!c.passed && c.reason && (
                          <p className="text-xs mt-0.5" style={{ color: '#A32D2D', lineHeight: 1.5 }}>
                            {c.reason}
                          </p>
                        )}
                        {fixLink && (
                          <Link
                            to={fixLink.to}
                            onClick={() => setTransitionModal(false)}
                            className="inline-flex items-center gap-1 text-xs mt-1.5 underline underline-offset-2 transition-opacity hover:opacity-70"
                            style={{ color: '#A32D2D', fontWeight: 500 }}
                          >
                            {fixLink.label} →
                          </Link>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Notes field — only shown when all checks pass */}
            {allChecksPassed && (
              <textarea
                value={transNotes}
                onChange={e => setTransNotes(e.target.value)}
                placeholder="Notes (optional)…"
                rows={2}
                className="w-full px-3 py-2 text-sm border border-coffee-200 rounded-lg mb-4 focus:border-coffee-500 focus:ring-2 focus:ring-coffee-100 resize-none"
              />
            )}

            {transError && (
              <p className="text-xs mb-3" style={{ color: '#A32D2D' }}>{transError}</p>
            )}

            <div className="flex gap-3">
              <Button
                onClick={confirmTransition}
                disabled={!allChecksPassed || transSaving}
                className="flex-1 justify-center"
                style={allChecksPassed ? { background: '#3B6D11', color: '#fff' } : {}}
              >
                {transSaving ? 'Moving…' : 'Confirm Transition'}
              </Button>
              <Button variant="secondary" onClick={() => setTransitionModal(false)}>
                Cancel
              </Button>
            </div>

            {!allChecksPassed && (
              <p className="text-xs text-center mt-3 text-coffee-400">
                Resolve the items above, then return to proceed.
              </p>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
